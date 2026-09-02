"use client";

import { ChangeEvent, DragEvent, FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { categories, type Expense } from "@/lib/expenses";
import { createClient } from "@/lib/supabase/client";

type User = { id: string; email?: string };

type PendingFile = {
  id: string;
  file: File;
  status: "pronto" | "enviando" | "lendo" | "concluido" | "erro";
  error?: string;
};

const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const supabase = createClient();

function money(value: number | null, currency: string) {
  if (value === null) return "";
  try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(value); }
  catch { return value.toFixed(2).replace(".", ","); }
}

function safeFileName(name: string) {
  const extension = name.includes(".") ? `.${name.split(".").pop()}` : "";
  const base = name.slice(0, extension ? -extension.length : undefined)
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "-").slice(0, 80);
  return `${base || "comprovante"}${extension.toLowerCase()}`;
}

type ExpenseRow = {
  id: string;
  receipt_id: string;
  supplier: string;
  expense_date: string | null;
  amount: number | string | null;
  currency: string;
  category: string;
  description: string;
  confidence: "alta" | "media" | "baixa";
  notes: string;
  created_at: string;
  vexpenses_status?: "not_sent" | "sending" | "sent" | "error";
  vexpenses_expense_id?: number | null;
  vexpenses_report_id?: number | null;
  vexpenses_error?: string | null;
  vexpenses_sent_at?: string | null;
  receipts?: ReceiptSummary;
};

type ReceiptSummary = { file_name: string; storage_path: string };
type VexpensesContext = {
  configured: boolean;
  member: { id: number; companyId: number; name: string; email: string };
  expenseTypes: { id: number; description: string; active: boolean }[];
  reports: { id: number; description: string; status: string; userId: number }[];
};

function mapExpense(row: ExpenseRow, receipt: ReceiptSummary): Expense {
  return {
    id: row.id,
    receiptId: row.receipt_id,
    sourceFile: receipt.file_name,
    storagePath: receipt.storage_path,
    supplier: row.supplier || "",
    date: row.expense_date || "",
    amount: row.amount === null ? null : Number(row.amount),
    currency: row.currency || "BRL",
    category: row.category || "Outros",
    description: row.description || "",
    confidence: row.confidence || "baixa",
    notes: row.notes || "",
    createdAt: row.created_at,
    vexpensesStatus: row.vexpenses_status || "not_sent",
    vexpensesExpenseId: row.vexpenses_expense_id ?? null,
    vexpensesReportId: row.vexpenses_report_id ?? null,
    vexpensesError: row.vexpenses_error || "",
    vexpensesSentAt: row.vexpenses_sent_at || null,
  };
}

export default function Home() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [user, setUser] = useState<User | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authMode, setAuthMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [notice, setNotice] = useState("");
  const [vexpensesContext, setVexpensesContext] = useState<VexpensesContext | null>(null);
  const [vexpensesLoading, setVexpensesLoading] = useState(false);
  const [vexpensesMessage, setVexpensesMessage] = useState("");
  const [sendExpense, setSendExpense] = useState<Expense | null>(null);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [selectedExpenseTypeId, setSelectedExpenseTypeId] = useState("");
  const [manualReportName, setManualReportName] = useState("");
  const [defaultCostCenter, setDefaultCostCenter] = useState("Comercial");
  const [defaultPaymentMethod, setDefaultPaymentMethod] = useState("Cartão Pessoal");
  const [sendingToVexpenses, setSendingToVexpenses] = useState(false);

  const selectedReport = useMemo(() => vexpensesContext?.reports.find((report) => report.id.toString() === selectedReportId), [selectedReportId, vexpensesContext]);
  const selectedExpenseType = useMemo(() => vexpensesContext?.expenseTypes.find((type) => type.id.toString() === selectedExpenseTypeId), [selectedExpenseTypeId, vexpensesContext]);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUser(data.user);
      setAuthLoading(false);
      if (data.user) { loadHistory(); loadVexpensesContext(); }
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => listener.subscription.unsubscribe();
  // A carga inicial deve acontecer uma única vez; as funções usam o cliente singleton.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const total = useMemo(() => expenses.reduce((sum, row) => sum + (row.amount || 0), 0), [expenses]);

  async function loadHistory() {
    setHistoryLoading(true);
    const { data, error } = await supabase
      .from("expenses")
      .select("*, receipts!inner(file_name, storage_path)")
      .order("created_at", { ascending: false });
    if (error) setNotice("Não foi possível carregar o histórico.");
    else setExpenses(((data || []) as ExpenseRow[]).map((row) => mapExpense(row, row.receipts!)));
    setHistoryLoading(false);
  }

  async function handleAuth(event: FormEvent) {
    event.preventDefault();
    setAuthBusy(true);
    setNotice("");
    if (authMode === "login") {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setNotice(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
      else if (data.user) { setUser(data.user); await Promise.all([loadHistory(), loadVexpensesContext()]); }
    } else {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      if (error) setNotice(error.message);
      else if (data.session && data.user) { setUser(data.user); await Promise.all([loadHistory(), loadVexpensesContext()]); }
      else setNotice("Cadastro realizado. Confira seu e-mail para confirmar a conta e depois entre no sistema.");
    }
    setAuthBusy(false);
  }

  async function signOut() {
    await supabase.auth.signOut();
    setUser(null);
    setExpenses([]);
    setFiles([]);
    setVexpensesContext(null);
    setVexpensesMessage("");
  }

  async function authenticatedFetch(url: string, init?: RequestInit) {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
    return fetch(url, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers } });
  }

  async function loadVexpensesContext() {
    setVexpensesLoading(true);
    try {
      const response = await authenticatedFetch("/api/vexpenses/context");
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível conectar à VExpenses.");
      setVexpensesContext(payload);
      setVexpensesMessage(`Conectado como ${payload.member.name || payload.member.email}.`);
    } catch (error) {
      setVexpensesContext(null);
      setVexpensesMessage(error instanceof Error ? error.message : "Não foi possível conectar à VExpenses.");
    } finally { setVexpensesLoading(false); }
  }

  function openSendModal(row: Expense) {
    setSendExpense(row);
    const firstReport = vexpensesContext?.reports[0];
    setSelectedReportId(firstReport?.id?.toString() || "");
    setManualReportName(firstReport?.description || "");
    const matchingType = vexpensesContext?.expenseTypes.find((type) => type.description.toLocaleLowerCase("pt-BR").includes(row.category.toLocaleLowerCase("pt-BR")));
    setSelectedExpenseTypeId((matchingType?.id || vexpensesContext?.expenseTypes[0]?.id || "").toString());
  }

  function formatExpenseForVexpenses(row: Expense) {
    return [
      `Arquivo: ${row.sourceFile}`,
      `Fornecedor: ${row.supplier || ""}`,
      `Data: ${row.date || ""}`,
      `Valor: ${row.amount === null ? "" : row.amount.toFixed(2).replace(".", ",")}`,
      `Categoria COMPROVA: ${row.category || ""}`,
      `Categoria VExpenses: ${selectedExpenseType?.description || ""}`,
      `Relatório VExpenses: ${manualReportName || selectedReport?.description || ""}`,
      `Centro de custos: ${defaultCostCenter}`,
      `Forma de pagamento: ${defaultPaymentMethod}`,
      `Reembolsável: Sim`,
      `Descrição: ${row.description || ""}`,
      `Observações: ${row.notes || ""}`,
    ].join("\n");
  }

  function guessVexpensesTypeName(row: Expense) {
    const fromSelected = selectedExpenseType?.description;
    if (sendExpense?.id === row.id && fromSelected) return fromSelected;
    const matchingType = vexpensesContext?.expenseTypes.find((type) => type.description.toLocaleLowerCase("pt-BR").includes(row.category.toLocaleLowerCase("pt-BR")));
    return matchingType?.description || row.category || "Outros";
  }

  async function buildLaunchItem(row: Expense) {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(row.storagePath, 60 * 60);
    if (error || !data) throw new Error(`Não foi possível gerar link do comprovante ${row.sourceFile}.`);
    return {
      id: row.id,
      arquivo: row.sourceFile,
      comprovante_url_temporaria: data.signedUrl,
      fornecedor: row.supplier || "",
      data: row.date || "",
      valor: row.amount,
      moeda: row.currency || "BRL",
      categoria_comprova: row.category || "",
      tipo_vexpenses: guessVexpensesTypeName(row),
      relatorio_vexpenses: manualReportName || selectedReport?.description || "",
      centro_de_custos: defaultCostCenter,
      forma_de_pagamento: defaultPaymentMethod,
      reembolsavel: true,
      descricao: row.description || row.supplier || row.sourceFile,
      observacoes: row.notes || "",
      confianca_leitura: row.confidence,
    };
  }

  async function copyRobotPackage(rows: Expense[] = expenses) {
    if (!rows.length) return;
    try {
      const items = await Promise.all(rows.map(buildLaunchItem));
      const payload = {
        origem: "COMPROVA",
        destino: "VExpenses",
        instrucao: "Abrir o relatório informado na VExpenses, adicionar cada item como Despesa manual, anexar comprovante_url_temporaria e criar a despesa. Não enviar o relatório para aprovação.",
        gerado_em: new Date().toISOString(),
        total_despesas: items.length,
        despesas: items,
      };
      await navigator.clipboard.writeText(JSON.stringify(payload, null, 2));
      setNotice(`Pacote do robô copiado com ${items.length} despesa(s). Os links dos comprovantes valem por 1 hora.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível copiar o pacote do robô.");
    }
  }

  async function copyExpenseForVexpenses(row: Expense) {
    await navigator.clipboard.writeText(formatExpenseForVexpenses(row));
    setNotice("Dados da despesa copiados para lançamento na VExpenses.");
  }

  function openVexpenses() {
    window.open("https://app.vexpenses.com/", "_blank", "noopener,noreferrer");
  }

  async function prepareAssistedLaunch() {
    if (!sendExpense) return;
    setSendingToVexpenses(true);
    try {
      await saveExpense(sendExpense);
      await copyExpenseForVexpenses(sendExpense);
      openVexpenses();
      setNotice("Dados copiados e VExpenses aberta. Anexe o comprovante original pela plataforma.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível preparar o lançamento.";
      setNotice(message);
    } finally { setSendingToVexpenses(false); }
  }

  function addFiles(list: FileList | File[]) {
    const incoming = Array.from(list);
    const valid = incoming.filter((file) => acceptedTypes.includes(file.type) && file.size <= 20 * 1024 * 1024);
    const invalidCount = incoming.length - valid.length;
    setFiles((current) => [...current, ...valid.map((file) => ({ id: crypto.randomUUID(), file, status: "pronto" as const }))]);
    if (invalidCount) setNotice(`${invalidCount} arquivo(s) ignorado(s). Use JPG, PNG, WEBP ou PDF de até 20 MB.`);
  }

  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    addFiles(event.dataTransfer.files);
  }

  async function analyze() {
    if (!user) return;
    const queue = files.filter((item) => item.status === "pronto" || item.status === "erro");
    if (!queue.length) return;
    setProcessing(true);
    setNotice("");

    for (const item of queue) {
      let receiptId = "";
      let storagePath = "";
      setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "enviando", error: undefined } : entry));
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const token = sessionData.session?.access_token;
        if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
        storagePath = `${user.id}/${crypto.randomUUID()}-${safeFileName(item.file.name)}`;
        const { error: uploadError } = await supabase.storage.from("receipts").upload(storagePath, item.file, { contentType: item.file.type, upsert: false });
        if (uploadError) throw new Error("Não foi possível armazenar o comprovante.");
        const { data: receipt, error: receiptError } = await supabase.from("receipts").insert({
          user_id: user.id,
          file_name: item.file.name,
          storage_path: storagePath,
          mime_type: item.file.type,
          size_bytes: item.file.size,
        }).select().single();
        if (receiptError || !receipt) throw new Error("Não foi possível registrar o comprovante.");
        receiptId = receipt.id;
        setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "lendo" } : entry));

        const response = await fetch("/api/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({ receiptId }),
        });
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "A leitura falhou.");
        const rows = (payload.expenses as ExpenseRow[]).map((row) => mapExpense(row, receipt));
        setExpenses((current) => [...rows, ...current]);
        setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "concluido" } : entry));
      } catch (error) {
        const message = error instanceof Error ? error.message : "Erro inesperado.";
        if (storagePath && !receiptId) await supabase.storage.from("receipts").remove([storagePath]);
        setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "erro", error: message } : entry));
      }
    }
    setProcessing(false);
  }

  async function openReceipt(row: Expense) {
    const { data, error } = await supabase.storage.from("receipts").createSignedUrl(row.storagePath, 60);
    if (error || !data) setNotice("Não foi possível abrir o comprovante.");
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function updateExpense(id: string, field: keyof Expense, value: string) {
    setExpenses((current) => current.map((row) => row.id === id ? {
      ...row,
      [field]: field === "amount" ? (value === "" ? null : Number(value.replace(",", "."))) : value,
    } : row));
  }

  async function saveExpense(row: Expense) {
    const { error } = await supabase.from("expenses").update({
      supplier: row.supplier,
      expense_date: row.date || null,
      amount: row.amount,
      currency: row.currency,
      category: row.category,
      description: row.description,
      notes: row.notes,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id);
    setNotice(error ? "Não foi possível salvar a alteração." : "Alteração salva no histórico.");
  }

  async function deleteExpense(row: Expense) {
    const sameReceipt = expenses.filter((item) => item.receiptId === row.receiptId).length;
    const { error } = await supabase.from("expenses").delete().eq("id", row.id);
    if (error) { setNotice("Não foi possível excluir esta despesa."); return; }
    setExpenses((current) => current.filter((item) => item.id !== row.id));
    if (sameReceipt === 1) {
      await supabase.storage.from("receipts").remove([row.storagePath]);
      await supabase.from("receipts").delete().eq("id", row.receiptId);
    }
  }

  function copyTable() {
    const headers = ["Arquivo", "Fornecedor", "Data", "Valor", "Moeda", "Categoria", "Descrição", "Confiança", "Observações"];
    const rows = expenses.map((row) => [row.sourceFile, row.supplier, row.date, row.amount?.toFixed(2).replace(".", ",") || "", row.currency, row.category, row.description, row.confidence, row.notes]);
    navigator.clipboard.writeText([headers, ...rows].map((row) => row.join("\t")).join("\n"));
    setNotice("Tabela copiada. Agora é só colar no Excel ou em outro sistema.");
  }

  function exportCsv() {
    const rows = [
      ["Arquivo", "Fornecedor", "Data", "Valor", "Moeda", "Categoria", "Descrição", "Confiança", "Observações"],
      ...expenses.map((row) => [row.sourceFile, row.supplier, row.date, row.amount?.toFixed(2) || "", row.currency, row.category, row.description, row.confidence, row.notes]),
    ];
    const csv = "\uFEFF" + rows.map((row) => row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `reembolsos-${new Date().toLocaleDateString("pt-BR").replaceAll("/", "-")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  if (authLoading) return <main className="authShell"><div className="authCard"><span className="brand"><span className="brandMark">C</span><span>comprova</span></span><p>Carregando acesso seguro…</p></div></main>;

  if (!user) return (
    <main className="authShell">
      <section className="authIntro">
        <div className="eyebrow">Leitura inteligente de comprovantes</div>
        <h1>Seus reembolsos,<br /><em>organizados.</em></h1>
        <p>Entre para processar novos comprovantes e consultar todo o seu histórico com segurança.</p>
      </section>
      <form className="authCard" onSubmit={handleAuth}>
        <span className="brand"><span className="brandMark">C</span><span>comprova</span></span>
        <h2>{authMode === "login" ? "Entrar no sistema" : "Criar minha conta"}</h2>
        <p>{authMode === "login" ? "Use seu e-mail e senha para continuar." : "Seu histórico ficará vinculado a esta conta."}</p>
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        <label htmlFor="password">Senha</label>
        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={authMode === "login" ? "current-password" : "new-password"} />
        <button className="primary" disabled={authBusy}>{authBusy ? "Aguarde…" : authMode === "login" ? "Entrar" : "Criar conta"}<span>→</span></button>
        {notice && <div className="authNotice" role="status">{notice}</div>}
        <button type="button" className="authSwitch" onClick={() => { setAuthMode(authMode === "login" ? "signup" : "login"); setNotice(""); }}>
          {authMode === "login" ? "Primeiro acesso? Criar uma conta" : "Já tenho conta — entrar"}
        </button>
      </form>
    </main>
  );

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#inicio" aria-label="Comprova início"><span className="brandMark">C</span><span>comprova</span></a>
        <div className="topActions"><span className="privacy"><span className="privacyDot" /> Arquivos privados e histórico protegido</span><span className="userEmail">{user.email}</span><button className="settingsButton" onClick={signOut}>Sair</button></div>
      </header>

      <section className="hero" id="inicio">
        <div className="eyebrow">Leitura inteligente de comprovantes</div>
        <h1>De comprovantes<br />para uma tabela, <em>em minutos.</em></h1>
        <p>Envie fotos, prints e PDFs de uma só vez. A IA organiza cada despesa e salva tudo no seu histórico.</p>
      </section>

      <section className="workspace" aria-label="Importação de comprovantes">
        <div className={`integrationBanner ${vexpensesContext ? "connected" : ""}`}>
          <span>{vexpensesContext ? "✓" : "V"}</span>
          <div><strong>{vexpensesContext ? "VExpenses conectada" : "Lançamento assistido na VExpenses"}</strong><small>{vexpensesLoading ? "Consultando sua conta…" : vexpensesMessage || "Use a leitura em lote para copiar os dados e cadastrar o comprovante na VExpenses."}</small></div>
          <button onClick={loadVexpensesContext} disabled={vexpensesLoading}>{vexpensesLoading ? "Aguarde…" : vexpensesContext ? "Atualizar" : "Conectar"}</button>
        </div>
        <div className="robotConfig" aria-label="Configuração do lançamento assistido">
          <label htmlFor="robot-report">Relatório VExpenses<input id="robot-report" value={manualReportName} onChange={(event) => setManualReportName(event.target.value)} placeholder="Nome exato do relatório, ex.: Teste" /></label>
          <label htmlFor="robot-cost-center">Centro de custos<input id="robot-cost-center" value={defaultCostCenter} onChange={(event) => setDefaultCostCenter(event.target.value)} /></label>
          <label htmlFor="robot-payment">Forma de pagamento<input id="robot-payment" value={defaultPaymentMethod} onChange={(event) => setDefaultPaymentMethod(event.target.value)} /></label>
        </div>
        <div className={`dropzone ${dragging ? "dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop} onClick={() => inputRef.current?.click()} role="button" tabIndex={0} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") inputRef.current?.click(); }}>
          <input ref={inputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event: ChangeEvent<HTMLInputElement>) => event.target.files && addFiles(event.target.files)} />
          <div className="uploadIcon">↑</div><h2>Solte seus comprovantes aqui</h2><p>ou <span>escolha os arquivos</span> no seu computador</p><small>JPG, PNG, WEBP ou PDF · até 20 MB por arquivo</small>
        </div>
        {files.length > 0 && <div className="filePanel">
          <div className="filePanelHeader"><strong>{files.length} arquivo(s) no lote</strong><button onClick={() => setFiles([])} disabled={processing}>Limpar lote</button></div>
          <div className="fileList">{files.map((item) => <div className="fileItem" key={item.id}>
            <span className={`fileType ${item.file.type === "application/pdf" ? "pdf" : "image"}`}>{item.file.type === "application/pdf" ? "PDF" : "IMG"}</span>
            <span className="fileName"><strong>{item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(1)} MB{item.error ? ` · ${item.error}` : ""}</small></span>
            <span className={`status ${item.status}`}>{item.status === "enviando" ? "Enviando…" : item.status === "lendo" ? "Lendo…" : item.status === "concluido" ? "Salvo" : item.status === "erro" ? "Tentar novamente" : "Na fila"}</span>
          </div>)}</div>
          <button className="primary" onClick={analyze} disabled={processing}>{processing ? "Analisando o lote…" : "Ler e salvar comprovantes"}<span>→</span></button>
        </div>}
      </section>

      {notice && <div className="notice" role="status">{notice}</div>}

      <section className="results">
        <div className="resultsHeader"><div><span className="sectionNumber">Histórico</span><h2>Seus comprovantes</h2><p>{historyLoading ? "Carregando…" : expenses.length ? "Edite um campo e clique em salvar." : "As próximas leituras aparecerão aqui."}</p></div>
          {expenses.length > 0 && <div className="actions"><button onClick={copyTable}>Copiar tabela</button><button onClick={() => copyRobotPackage()}>Copiar pacote VExpenses</button><button className="dark" onClick={exportCsv}>Baixar Excel (CSV)</button></div>}
        </div>
        {expenses.length > 0 ? <><div className="tableWrap"><table>
          <thead><tr><th>Arquivo</th><th>Fornecedor</th><th>Data</th><th>Valor</th><th>Categoria</th><th>Descrição</th><th>Leitura</th><th>Lançamento</th><th>Ações</th></tr></thead>
          <tbody>{expenses.map((row) => <tr key={row.id} className={row.confidence === "baixa" ? "needsReview" : ""}>
            <td className="source" title={row.sourceFile}><button className="sourceLink" onClick={() => openReceipt(row)}>{row.sourceFile}<span aria-hidden="true">↗</span></button></td>
            <td><input value={row.supplier} onChange={(e) => updateExpense(row.id, "supplier", e.target.value)} /></td>
            <td><input type="date" value={row.date} onChange={(e) => updateExpense(row.id, "date", e.target.value)} /></td>
            <td><div className="moneyInput"><span>{row.currency === "BRL" ? "R$" : row.currency}</span><input inputMode="decimal" value={row.amount ?? ""} onChange={(e) => updateExpense(row.id, "amount", e.target.value)} /></div></td>
            <td><select value={row.category} onChange={(e) => updateExpense(row.id, "category", e.target.value)}>{categories.map((category) => <option key={category}>{category}</option>)}</select></td>
            <td><input value={row.description} onChange={(e) => updateExpense(row.id, "description", e.target.value)} /></td>
            <td><span className={`confidence ${row.confidence}`}>{row.confidence === "alta" ? "Alta" : row.confidence === "media" ? "Revisar" : "Baixa"}</span></td>
            <td><button className="sendButton" onClick={() => openSendModal(row)}>Assistir</button></td>
            <td><div className="rowActions"><button onClick={() => saveExpense(row)}>Salvar</button><button className="delete" onClick={() => deleteExpense(row)} aria-label={`Excluir ${row.sourceFile}`}>×</button></div></td>
          </tr>)}</tbody>
          <tfoot><tr><td colSpan={3}>{expenses.length} despesa(s)</td><td>{money(total, "BRL")}</td><td colSpan={5} /></tr></tfoot>
        </table></div><p className="hint"><span>!</span> Linhas destacadas merecem conferência. Clique no nome do arquivo para abrir o comprovante original.</p></> : <div className="emptyHistory"><span>⌁</span><h3>Nenhum comprovante salvo</h3><p>Envie o primeiro lote acima para iniciar seu histórico.</p></div>}
      </section>
      {sendExpense && <div className="modalBackdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !sendingToVexpenses) setSendExpense(null); }}>
        <section className="modal assistedModal" role="dialog" aria-modal="true" aria-labelledby="send-title">
          <button className="modalClose" onClick={() => setSendExpense(null)} disabled={sendingToVexpenses} aria-label="Fechar">×</button>
          <span className="modalEyebrow">Lançamento assistido</span><h2 id="send-title">Preparar na VExpenses</h2>
          <p><strong>{sendExpense.sourceFile}</strong><br />{sendExpense.supplier || "Fornecedor não identificado"} · {money(sendExpense.amount, sendExpense.currency)}</p>
          {vexpensesContext && <>
            <label htmlFor="vexpenses-report">Relatório</label><select id="vexpenses-report" value={selectedReportId} onChange={(event) => { const nextId = event.target.value; setSelectedReportId(nextId); setManualReportName(vexpensesContext.reports.find((report) => report.id.toString() === nextId)?.description || ""); }}>{vexpensesContext.reports.length ? vexpensesContext.reports.map((report) => <option key={report.id} value={report.id}>{report.description || `Relatório ${report.id}`} · {report.status}</option>) : <option value="">Nenhum relatório aberto</option>}</select>
            <label htmlFor="vexpenses-type">Categoria na VExpenses</label><select id="vexpenses-type" value={selectedExpenseTypeId} onChange={(event) => setSelectedExpenseTypeId(event.target.value)}>{vexpensesContext.expenseTypes.map((type) => <option key={type.id} value={type.id}>{type.description}</option>)}</select>
          </>}
          <label htmlFor="manual-report-name">Nome exato do relatório na VExpenses</label>
          <input id="manual-report-name" value={manualReportName} onChange={(event) => setManualReportName(event.target.value)} placeholder="Ex.: Teste" />
          <div className="modalColumns">
            <label htmlFor="default-cost-center">Centro de custos<input id="default-cost-center" value={defaultCostCenter} onChange={(event) => setDefaultCostCenter(event.target.value)} /></label>
            <label htmlFor="default-payment-method">Forma de pagamento<input id="default-payment-method" value={defaultPaymentMethod} onChange={(event) => setDefaultPaymentMethod(event.target.value)} /></label>
          </div>
          <div className="assistGrid">
            <button onClick={() => copyExpenseForVexpenses(sendExpense)}>Copiar dados</button>
            <button onClick={() => openReceipt(sendExpense)}>Abrir comprovante</button>
            <button onClick={() => copyRobotPackage([sendExpense])}>Copiar pacote robô</button>
            <button onClick={openVexpenses}>Abrir VExpenses</button>
          </div>
          <div className="keySafety"><span>!</span><p>A API da VExpenses não aceita anexar comprovante. Este modo prepara os dados e abre a plataforma para você anexar o arquivo original.</p></div>
          <button className="primary modalPrimary" onClick={prepareAssistedLaunch} disabled={sendingToVexpenses}>{sendingToVexpenses ? "Preparando…" : "Copiar dados e abrir VExpenses"}<span>→</span></button>
        </section>
      </div>}
      <footer><span>Comprova</span><p>Organize. Confira. Reembolse.</p></footer>
    </main>
  );
}
