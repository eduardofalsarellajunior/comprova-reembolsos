"use client";

import { type ChangeEvent, type DragEvent, useMemo, useRef, useState } from "react";
import { categories, type Expense } from "@/lib/expenses";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/config";
import { api, supabase } from "@/lib/workspace-browser";
import styles from "./receipt-workspace.module.css";

type PendingFile = {
  id: string;
  file: File;
  status: "pronto" | "enviando" | "lendo" | "concluido" | "erro";
  error?: string;
  receipt?: { id: string; file_name: string; storage_path: string };
};

const acceptedTypes = ["image/jpeg", "image/png", "image/webp", "application/pdf"];

function money(value: number | null, currency: string) {
  if (value === null) return "";
  try { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: currency || "BRL" }).format(value); }
  catch { return value.toFixed(2).replace(".", ","); }
}

function safeFileName(name: string) {
  const extension = name.match(/\.(?:jpe?g|png|webp|pdf)$/i)?.[0] || "";
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

function parseReceiptAmount(value: string): number | null {
  if (!/^\d+(?:[.,]\d{1,2})?$/.test(value.trim())) return null;
  const amount = Number(value.trim().replace(",", "."));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

type ReceiptWorkspaceProps = {
  reportId: string;
  reportName: string;
  currency: string;
  userId: string;
  knownLinkedIds: ReadonlySet<string>;
  disabled: boolean;
  initialOpen?: boolean;
  onBusyChange: (busy: boolean) => void;
  onRefresh: () => Promise<void>;
};

export default function ReceiptWorkspace({ reportId, reportName, currency, userId, knownLinkedIds, disabled, initialOpen, onBusyChange, onRefresh }: ReceiptWorkspaceProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<PendingFile[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [amountDrafts, setAmountDrafts] = useState<Record<string, string>>({});
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [attachedIds, setAttachedIds] = useState<string[]>([]);
  const [dragging, setDragging] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
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

  const total = useMemo(() => expenses.reduce((sum, row) => sum + (row.amount || 0), 0), [expenses]);
  const batch = new Set(batchIds);
  const justRead = expenses.filter((row) => batch.has(row.id));
  const isLinked = (row: Expense) => knownLinkedIds.has(row.id) || attachedIds.includes(row.id);
  const selected = justRead.filter((row) => selectedIds.includes(row.id) && !isLinked(row) && row.currency === currency);

  async function loadHistory() {
    setHistoryLoading(true);
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("*, receipts!inner(file_name, storage_path)")
        .eq("user_id", userId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const history = ((data || []) as ExpenseRow[]).map((row) => mapExpense(row, row.receipts!));
      setExpenses((current) => {
        const drafts = new Map(current.map((row) => [row.id, row]));
        return history.map((row) => drafts.get(row.id) ?? row);
      });
    } catch {
      setNotice("Não foi possível carregar o histórico.");
    } finally {
      setHistoryLoading(false);
    }
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
      `Categoria INEPAD Reembolso: ${row.category || ""}`,
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
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(row.storagePath, 60 * 60);
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

  async function downloadReceipts(rows: Expense[] = expenses) {
    if (!rows.length) return;
    try {
      setNotice("Preparando os comprovantes para download…");
      for (const row of rows) {
        const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(row.storagePath, 60 * 60);
        if (error || !data?.signedUrl) throw new Error(`Não foi possível preparar ${row.sourceFile}.`);
        const link = document.createElement("a");
        link.href = data.signedUrl;
        link.download = row.sourceFile;
        link.target = "_blank";
        document.body.appendChild(link);
        link.click();
        link.remove();
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      setNotice(`${rows.length} comprovante(s) enviado(s) para download. Aguarde a conclusão antes de anexar no VExpenses.`);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível baixar os comprovantes.");
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
    if (disabled || processing || historyLoading) return;
    const incoming = Array.from(list);
    const valid = incoming.filter((file) => acceptedTypes.includes(file.type) && file.size > 0 && file.size <= 20 * 1024 * 1024);
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
    if (disabled || processing || historyLoading) return;
    const queue = files.filter((item) => item.status === "pronto" || item.status === "erro");
    if (!queue.length) return;
    setProcessing(true);
    onBusyChange(true);
    setNotice("");
    let processed = 0;
    let failures = 0;
    let rowsRead = 0;

    try {
      for (const item of queue) {
        let receipt = item.receipt;
        let storagePath = "";
        setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: receipt ? "lendo" : "enviando", error: undefined } : entry));
        try {
          let storedRows: ExpenseRow[] | undefined;
          if (receipt) {
            const [previous, receiptState] = await Promise.all([
              supabase.from("expenses").select("*").eq("receipt_id", receipt.id).eq("user_id", userId),
              supabase.from("receipts").select("status").eq("id", receipt.id).eq("user_id", userId).single(),
            ]);
            if (previous.error || receiptState.error || !receiptState.data) throw new Error("Não foi possível confirmar o estado da leitura anterior.");
            if (previous.data?.length || receiptState.data.status === "completed") storedRows = (previous.data || []) as ExpenseRow[];
            else if (receiptState.data.status === "processing") throw new Error("A leitura anterior ainda pode estar em andamento. Aguarde antes de tentar novamente.");
          } else {
            storagePath = `${userId}/${crypto.randomUUID()}-${safeFileName(item.file.name)}`;
            const { error: uploadError } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(storagePath, item.file, { contentType: item.file.type, upsert: false });
            if (uploadError) throw new Error("Não foi possível armazenar o comprovante.");
            const { data, error: receiptError } = await supabase.from("receipts").insert({
              user_id: userId,
              file_name: item.file.name,
              storage_path: storagePath,
              mime_type: item.file.type,
              size_bytes: item.file.size,
            }).select("id,file_name,storage_path").single();
            if (receiptError || !data) throw new Error("Não foi possível registrar o comprovante.");
            receipt = data as NonNullable<PendingFile["receipt"]>;
            const savedReceipt = receipt;
            setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, receipt: savedReceipt, status: "lendo" } : entry));
          }
          const savedReceipt = receipt;
          const response = storedRows ?? (await api<{ expenses: ExpenseRow[] }>("/api/analyze", {
            method: "POST",
            body: JSON.stringify({ receiptId: savedReceipt.id }),
          })).expenses;
          const rows = (response || []).map((row) => mapExpense(row, savedReceipt));
          const ids = rows.map((row) => row.id);
          setExpenses((current) => [...rows.filter((row) => !current.some((entry) => entry.id === row.id)), ...current]);
          setBatchIds((current) => Array.from(new Set([...current, ...ids])));
          setSelectedIds((current) => Array.from(new Set([...current, ...ids])));
          setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "concluido", error: rows.length ? undefined : "Nenhuma despesa identificada" } : entry));
          processed++;
          rowsRead += rows.length;
        } catch (error) {
          const message = error instanceof Error ? error.message : "Erro inesperado.";
          if (storagePath && !receipt) await supabase.storage.from(DOCUMENTS_BUCKET).remove([storagePath]).catch(() => {});
          setFiles((current) => current.map((entry) => entry.id === item.id ? { ...entry, status: "erro", error: message } : entry));
          failures++;
        }
      }
      const summary = `${processed} arquivo(s) lido(s), ${rowsRead} despesa(s) encontrada(s)${failures ? `; ${failures} falha(s)` : ""}.`;
      const refreshed = !rowsRead || await onRefresh().then(() => true, () => false);
      setNotice(`${summary}${rowsRead ? " Confira os dados antes de vinculá-los." : ""}${refreshed ? "" : " Não foi possível atualizar a lista de despesas disponíveis."}`);
    } finally {
      setProcessing(false);
      onBusyChange(false);
    }
  }

  async function attachReadExpenses() {
    if (disabled || processing || historyLoading || !selected.length) return;
    const rows = selected.map((row) => ({
      ...row,
      supplier: row.supplier.trim(),
      amount: parseReceiptAmount(amountDrafts[row.id] ?? String(row.amount ?? "")),
    }));
    const invalid = rows.find((row) => !row.supplier || !row.date || !row.category || row.amount === null);
    if (invalid) {
      setNotice(`Confira fornecedor, data, categoria e valor de “${invalid.sourceFile}”, ou desmarque a despesa.`);
      return;
    }
    setProcessing(true);
    onBusyChange(true);
    setNotice("");
    try {
      for (const row of rows) await persistExpense(row);
      const savedRows = new Map(rows.map((row) => [row.id, row]));
      setExpenses((current) => current.map((row) => savedRows.get(row.id) ?? row));
      await api(`/api/reports/${encodeURIComponent(reportId)}/expenses`, {
        method: "POST",
        body: JSON.stringify({ expenseIds: rows.map((row) => row.id) }),
      });
      const ids = new Set(rows.map((row) => row.id));
      setAttachedIds((current) => [...current, ...ids]);
      setSelectedIds((current) => current.filter((id) => !ids.has(id)));
      setNotice(`${rows.length} despesa(s) vinculada(s) a “${reportName}”. O relatório não foi enviado para aprovação.`);
      try { await onRefresh(); } catch {
        setNotice("Despesas vinculadas. Atualize a página para vê-las no relatório.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível vincular as despesas.");
    } finally {
      setProcessing(false);
      onBusyChange(false);
    }
  }

  async function openReceipt(row: Expense) {
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(row.storagePath, 60);
    if (error || !data) setNotice("Não foi possível abrir o comprovante.");
    else window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function updateExpense(id: string, field: keyof Expense, value: string) {
    setExpenses((current) => current.map((row) => row.id === id ? {
      ...row,
      [field]: field === "amount" ? (value === "" ? null : Number(value.replace(",", "."))) : value,
    } : row));
  }

  async function persistExpense(row: Expense) {
    const { data, error } = await supabase.from("expenses").update({
      supplier: row.supplier,
      expense_date: row.date || null,
      amount: row.amount,
      currency: row.currency,
      category: row.category,
      description: row.description,
      notes: row.notes,
      updated_at: new Date().toISOString(),
    }).eq("id", row.id).eq("user_id", userId).select("id");
    if (error || !data?.length) throw new Error("Esta despesa está bloqueada por um relatório enviado ou não pôde ser salva.");
  }

  async function saveExpense(row: Expense) {
    try {
      await persistExpense(row);
      setNotice("Alteração salva no histórico.");
      await onRefresh();
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível salvar a despesa."); }
  }

  async function deleteExpense(row: Expense) {
    if (isLinked(row)) { setNotice("Retire a despesa do relatório antes de excluí-la."); return; }
    const sameReceipt = expenses.filter((item) => item.receiptId === row.receiptId).length;
    const { data, error } = await supabase.from("expenses").delete().eq("id", row.id).eq("user_id", userId).select("id");
    if (error || !data?.length) { setNotice("Retire a despesa do relatório antes de excluí-la."); return; }
    setExpenses((current) => current.filter((item) => item.id !== row.id));
    if (sameReceipt === 1) {
      await supabase.storage.from(DOCUMENTS_BUCKET).remove([row.storagePath]);
      await supabase.from("receipts").delete().eq("id", row.receiptId);
    }
    await onRefresh().catch(() => { setNotice("Despesa excluída. Atualize a página para ver a lista."); });
  }

  async function clearAllExpenses() {
    if (!expenses.length) return;
    const confirmed = window.confirm(`Excluir todos os ${expenses.length} comprovantes do seu histórico? Esta ação não poderá ser desfeita.`);
    if (!confirmed) return;

    setHistoryLoading(true);
    setNotice("");
    const expenseIds = expenses.map((row) => row.id);
    const receiptIds = Array.from(new Set(expenses.map((row) => row.receiptId)));
    const storagePaths = Array.from(new Set(expenses.map((row) => row.storagePath).filter(Boolean)));
    const { data: linked, error: linkedError } = await supabase.from("report_expenses").select("expense_id").in("expense_id", expenseIds);
    if (linkedError || linked?.length) {
      setNotice("Retire primeiro as despesas dos relatórios antes de limpar os comprovantes.");
      setHistoryLoading(false);
      return;
    }
    const { data: deleted, error } = await supabase.from("expenses").delete().eq("user_id", userId).in("id", expenseIds).select("id");
    if (error || deleted?.length !== expenseIds.length) {
      await loadHistory();
      setNotice("Nem todas as despesas puderam ser excluídas. O histórico foi atualizado.");
      setHistoryLoading(false);
      return;
    }
    if (storagePaths.length) await supabase.storage.from(DOCUMENTS_BUCKET).remove(storagePaths);
    if (receiptIds.length) await supabase.from("receipts").delete().in("id", receiptIds);
    setExpenses([]);
    setNotice("Todos os comprovantes foram removidos do histórico.");
    setHistoryLoading(false);
    await onRefresh().catch(() => { setNotice("Histórico limpo. Atualize a página para ver a lista."); });
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

  const locked = disabled || processing || historyLoading;
  const hasQueue = files.some((item) => item.status === "pronto" || item.status === "erro");

  return (
    <details className={styles.reader} open={initialOpen || undefined}>
      <summary>
        <span><strong>Ler comprovantes</strong><small>Extraia despesas de imagens ou PDFs para este relatório.</small></span>
      </summary>
      <div className={styles.body}>
      <div className={`${styles.dropzone} ${dragging ? styles.dragging : ""}`} onDragOver={(event) => { event.preventDefault(); if (!locked) setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={onDrop}>
        <input ref={inputRef} type="file" multiple hidden disabled={locked} accept={acceptedTypes.join(",")} onChange={(event: ChangeEvent<HTMLInputElement>) => { if (event.target.files) addFiles(event.target.files); event.target.value = ""; }} />
        <div><strong>Solte seus comprovantes aqui</strong><small>JPG, PNG, WebP ou PDF · até 20 MB por arquivo</small></div>
        <button type="button" onClick={() => inputRef.current?.click()} disabled={locked}>Escolher arquivos</button>
      </div>
      {files.length > 0 && <div className="filePanel">
        <div className="filePanelHeader"><strong>{files.length} arquivo(s) no lote</strong><button type="button" onClick={() => setFiles([])} disabled={locked}>Limpar fila</button></div>
        <div className="fileList">{files.map((item) => <div className="fileItem" key={item.id}>
          <span className={`fileType ${item.file.type === "application/pdf" ? "pdf" : "image"}`}>{item.file.type === "application/pdf" ? "PDF" : "IMG"}</span>
          <span className="fileName"><strong>{item.file.name}</strong><small>{(item.file.size / 1024 / 1024).toFixed(1)} MB{item.error ? ` · ${item.error}` : ""}</small></span>
          <span className={`status ${item.status}`}>{item.status === "enviando" ? "Enviando…" : item.status === "lendo" ? "Lendo…" : item.status === "concluido" ? "Lido" : item.status === "erro" ? "Falhou" : "Na fila"}</span>
        </div>)}</div>
        <button type="button" className="primary" onClick={analyze} disabled={locked || !hasQueue}>{processing ? "Processando…" : "Ler arquivos do lote"}<span aria-hidden="true">→</span></button>
      </div>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}
      {justRead.length > 0 && <section aria-label="Revisão das despesas lidas" className={styles.review}>
        <h4>Confira os dados antes de vincular</h4>
        <p className="muted">Revise fornecedor, data, valor e categoria e desmarque as despesas que não devem entrar neste relatório.</p>
        {justRead.map((row) => {
          const linked = isLinked(row);
          const unavailable = linked || row.currency !== currency;
          const amountText = amountDrafts[row.id] ?? String(row.amount ?? "");
          return <div key={row.id} className={styles.expense}>
            <div className={styles.expenseHeading}>
              <label><input type="checkbox" checked={linked || (!unavailable && selectedIds.includes(row.id))} disabled={locked || unavailable} onChange={(event) => {
                setSelectedIds((current) => event.target.checked ? [...current, row.id] : current.filter((id) => id !== row.id));
              }} />{linked ? "Já vinculada" : row.currency !== currency ? `Moeda diferente (${row.currency})` : "Incluir no relatório"}</label>
              <button type="button" className="fileLink" onClick={() => openReceipt(row)}>{row.sourceFile}</button>
              <span className={`confidence ${row.confidence}`}>{row.confidence === "alta" ? "Leitura alta" : "Revisar leitura"}</span>
            </div>
            <div className={styles.expenseFields}>
              <label>Fornecedor<input maxLength={160} value={row.supplier} disabled={locked || linked} onChange={(event) => updateExpense(row.id, "supplier", event.target.value)} /></label>
              <label>Data<input type="date" value={row.date} disabled={locked || linked} onChange={(event) => updateExpense(row.id, "date", event.target.value)} /></label>
              <label>Valor ({row.currency})<input inputMode="decimal" value={amountText} disabled={locked || linked} onChange={(event) => setAmountDrafts((current) => ({ ...current, [row.id]: event.target.value }))} /></label>
              <label>Categoria<select value={row.category} disabled={locked || linked} onChange={(event) => updateExpense(row.id, "category", event.target.value)}>{Array.from(new Set([...categories, row.category])).map((item) => <option key={item}>{item}</option>)}</select></label>
              <label className={styles.full}>Descrição<input maxLength={1000} value={row.description} disabled={locked || linked} onChange={(event) => updateExpense(row.id, "description", event.target.value)} /></label>
            </div>
            {row.notes && <p className="muted">{row.notes}</p>}
          </div>;
        })}
        <button type="button" className="primary" onClick={attachReadExpenses} disabled={locked || selected.length === 0}>Vincular {selected.length || ""} despesa(s) ao relatório</button>
      </section>}

      <button type="button" className={styles.historyToggle} aria-expanded={showHistory} disabled={locked} onClick={() => {
        if (!showHistory) void loadHistory();
        setShowHistory(!showHistory);
      }}>{showHistory ? "Fechar" : "Abrir"} histórico e exportação</button>
      {showHistory && <div className={styles.history}>
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
      <section aria-label="Histórico de comprovantes">
        <div className="resultsHeader"><div><span className="sectionNumber">Histórico</span><h2>Seus comprovantes</h2><p>{historyLoading ? "Carregando…" : expenses.length ? "Edite um campo e clique em salvar." : "As próximas leituras aparecerão aqui."}</p></div>
          {expenses.length > 0 && <div className="actions"><button onClick={copyTable}>Copiar tabela</button><button onClick={() => copyRobotPackage()}>Copiar pacote VExpenses</button><button onClick={() => downloadReceipts()}>Baixar comprovantes</button><button className="dark" onClick={exportCsv}>Baixar Excel (CSV)</button><button className="deleteAll" onClick={clearAllExpenses} disabled={historyLoading}>Limpar comprovantes</button></div>}
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
      </section></div>}
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
      </div>
    </details>
  );
}
