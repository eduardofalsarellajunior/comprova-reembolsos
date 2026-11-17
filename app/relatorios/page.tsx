"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { api, CatalogItem, Company, Flow, loadMyCompanies, Member, money, supabase } from "@/lib/workspace-browser";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/config";
import { categories } from "@/lib/expenses";
import ReceiptWorkspace from "./receipt-workspace";

type Report = {
  id: string; company_id: string; owner_id: string; name: string; description: string; notes: string;
  status: string; total_amount: number | string; currency: string;
  period_start: string | null; period_end: string | null;
  cost_center_id: string | null; project_id: string | null; payment_method_id: string | null; approval_flow_id: string | null;
  rejection_reason: string | null; created_at: string; updated_at: string;
  report_code: string | null; submitted_at: string | null;
  report_expenses: { expense_id: string; position: number }[];
};
type Expense = {
  id: string; receipt_id: string | null; user_id: string; supplier: string; expense_date: string | null;
  entry_source: "manual" | "ocr";
  amount: number | string | null; currency: string; category: string; description: string;
  receipts: { file_name: string; storage_path: string } | null;
};
type Form = { name: string; description: string; notes: string; periodStart: string; periodEnd: string; costCenterId: string; projectId: string; paymentMethodId: string; approvalFlowId: string };
const emptyForm: Form = { name: "", description: "", notes: "", periodStart: "", periodEnd: "", costCenterId: "", projectId: "", paymentMethodId: "", approvalFlowId: "" };
const emptyManual = { supplier: "", date: "", amount: "", category: "", description: "" };
const statusLabels: Record<string, string> = { draft: "Rascunho", rejected: "Rejeitado", submitted: "Em aprovação", approved: "Aprovado", paid: "Pago", cancelled: "Cancelado" };
function formFromReport(report: Report): Form { return { name: report.name, description: report.description, notes: report.notes, periodStart: report.period_start || "", periodEnd: report.period_end || "", costCenterId: report.cost_center_id || "", projectId: report.project_id || "", paymentMethodId: report.payment_method_id || "", approvalFlowId: report.approval_flow_id || "" }; }

export default function ReportsPage() {
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<{ company: Company; role: string }[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [reports, setReports] = useState<Report[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [centers, setCenters] = useState<CatalogItem[]>([]);
  const [projects, setProjects] = useState<CatalogItem[]>([]);
  const [methods, setMethods] = useState<CatalogItem[]>([]);
  const [expenseCategories, setExpenseCategories] = useState<CatalogItem[]>([]);
  const [manual, setManual] = useState(emptyManual);
  const [manualFile, setManualFile] = useState<File | null>(null);
  const [editingExpenseId, setEditingExpenseId] = useState("");
  const [flows, setFlows] = useState<Flow[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [receiptPromptId, setReceiptPromptId] = useState("");
  const [newForm, setNewForm] = useState<Form>(emptyForm);
  const [editOverride, setEditOverride] = useState<{ reportId: string; form: Form } | null>(null);
  const [selectedExpenses, setSelectedExpenses] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const company = companies.find((entry) => entry.company.id === companyId)?.company;
  const activeReport = reports.find((report) => report.id === selectedId && report.company_id === companyId);
  const savedForm = activeReport ? formFromReport(activeReport) : emptyForm;
  const editForm = editOverride?.reportId === activeReport?.id ? editOverride?.form || savedForm : savedForm;
  const visibleReports = useMemo(() => reports.filter((report) => report.company_id === companyId && (statusFilter === "all" || report.status === statusFilter) && report.name.toLowerCase().includes(search.toLowerCase())), [reports, companyId, statusFilter, search]);
  const linkedIds = new Set(reports.flatMap((report) => report.report_expenses || []).map((item) => item.expense_id));
  const available = expenses.filter((expense) => expense.user_id === userId && !linkedIds.has(expense.id) && (expense.currency || "BRL") === activeReport?.currency);
  const reportExpenses = (activeReport?.report_expenses || []).map((item) => expenses.find((expense) => expense.id === item.expense_id)).filter((item): item is Expense => Boolean(item));
  const editable = !!activeReport && activeReport.owner_id === userId && ["draft", "rejected"].includes(activeReport.status);
  const isDirty = !!activeReport && JSON.stringify(editForm) !== JSON.stringify(savedForm);
  const allExpensesLoaded = !!activeReport?.report_expenses.length && reportExpenses.length === activeReport.report_expenses.length;
  const canMarkPaid = !!activeReport && activeReport.status === "approved" && ["admin", "finance"].includes(companies.find((entry) => entry.company.id === companyId)?.role || "");
  function assignedFlow(form: Form) { return centers.find((center) => center.id === form.costCenterId)?.approval_flow_id || company?.default_approval_flow_id || ""; }
  function resolvedFlow(form: Form) { return assignedFlow(form) || form.approvalFlowId; }

  const refreshData = useCallback(async (id: string) => {
    const [reportPayload, expenseResult, memberResult, centerResult, projectResult, methodResult, categoryResult, flowPayload] = await Promise.all([
      api<{ reports: Report[] }>("/api/reports"),
      supabase.from("expenses").select("id,receipt_id,user_id,supplier,expense_date,amount,currency,category,description,entry_source,receipts(file_name,storage_path)").order("expense_date", { ascending: false }),
      supabase.from("company_members").select("*").eq("company_id", id),
      supabase.from("cost_centers").select("*").eq("company_id", id).eq("active", true).order("name"),
      supabase.from("projects").select("*").eq("company_id", id).eq("active", true).order("name"),
      supabase.from("payment_methods").select("*").eq("company_id", id).eq("active", true).order("name"),
      supabase.from("expense_categories").select("*").eq("company_id", id).eq("active", true).order("name"),
      api<{ flows: Flow[] }>(`/api/approval-flows?companyId=${encodeURIComponent(id)}`),
    ]);
    if (expenseResult.error || memberResult.error || centerResult.error || projectResult.error || methodResult.error || categoryResult.error) throw new Error("Não foi possível carregar os dados do relatório.");
    setReports(reportPayload.reports || []);
    const linkedExpenseIds = new Set((reportPayload.reports || []).flatMap((report) => report.report_expenses || []).map((row) => row.expense_id));
    setSelectedExpenses((current) => current.filter((expenseId) => !linkedExpenseIds.has(expenseId)));
    setExpenses((expenseResult.data || []) as Expense[]);
    setMembers((memberResult.data || []) as Member[]);
    setCenters((centerResult.data || []) as CatalogItem[]);
    setProjects((projectResult.data || []) as CatalogItem[]);
    setMethods((methodResult.data || []) as CatalogItem[]);
    setExpenseCategories((categoryResult.data || []) as CatalogItem[]);
    setFlows(flowPayload.flows || []);
    setSelectedId((current) => (reportPayload.reports || []).some((report) => report.id === current && report.company_id === id) ? current : reportPayload.reports.find((report) => report.company_id === id)?.id || "");
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const entries = await loadMyCompanies(data.user.id);
      const id = entries[0]?.company.id || "";
      setCompanies(entries); setCompanyId(id);
      if (id) await refreshData(id);
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Não foi possível carregar sua conta.")).finally(() => setLoading(false));
  }, [refreshData]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setNotice("");
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  }

  function selectReport(id: string) {
    setSelectedId(id);
    setReceiptPromptId("");
    setEditOverride(null);
    setSelectedExpenses([]);
    resetManual();
  }
  function resetManual() { setManual(emptyManual); setManualFile(null); setEditingExpenseId(""); }

  function switchCompany(id: string) {
    setCompanyId(id);
    selectReport("");
    setNewForm(emptyForm);
    setMembers([]);
    setCenters([]);
    setProjects([]);
    setMethods([]);
    setExpenseCategories([]);
    setFlows([]);
    void run(() => refreshData(id));
  }

  function setEditForm(form: Form) {
    if (activeReport) setEditOverride({ reportId: activeReport.id, form });
  }

  function payload(form: Form) { return { name: form.name.trim(), description: form.description.trim(), notes: form.notes.trim(), periodStart: form.periodStart || null, periodEnd: form.periodEnd || null, costCenterId: form.costCenterId || null, projectId: form.projectId || null, paymentMethodId: form.paymentMethodId || null, approvalFlowId: form.approvalFlowId || null }; }

  async function createReport() {
    await run(async () => {
      const result = await api<{ report: Report }>("/api/reports", { method: "POST", body: JSON.stringify({ companyId, ...payload(newForm) }) });
      setNewForm(emptyForm); await refreshData(companyId); selectReport(result.report.id); setReceiptPromptId(result.report.id); setNotice("Rascunho criado. Você já pode ler comprovantes ou lançar despesas manualmente.");
    });
  }
  async function saveReport() {
    if (!activeReport) return;
    await run(async () => { await api(`/api/reports/${activeReport.id}`, { method: "PATCH", body: JSON.stringify(payload(editForm)) }); await refreshData(companyId); setEditOverride(null); setNotice("Relatório atualizado."); });
  }
  async function attachExpenses() {
    if (!activeReport || !editable) return;
    const expenseIds = selectedExpenses.filter((id) => available.some((expense) => expense.id === id));
    if (!expenseIds.length) return;
    await run(async () => { await api(`/api/reports/${activeReport.id}/expenses`, { method: "POST", body: JSON.stringify({ expenseIds }) }); setSelectedExpenses([]); await refreshData(companyId); setNotice("Despesas adicionadas ao relatório."); });
  }
  async function removeExpense(expenseId: string) {
    if (!activeReport) return;
    await run(async () => { await api(`/api/reports/${activeReport.id}/expenses`, { method: "DELETE", body: JSON.stringify({ expenseId }) }); await refreshData(companyId); setNotice("Despesa retirada do relatório."); });
  }
  async function submitReport() {
    if (!activeReport || !editable || isDirty || !allExpensesLoaded) return;
    if (!window.confirm("Enviar este relatório para aprovação? Ele ficará bloqueado para edição até ser rejeitado ou aprovado.")) return;
    await run(async () => { await api(`/api/reports/${activeReport.id}/submit`, { method: "POST" }); await refreshData(companyId); setNotice("Relatório enviado para aprovação."); });
  }
  async function markPaid() {
    if (!activeReport || !window.confirm("Confirmar que o pagamento foi feito? Esta ação apenas registra o status; não transfere dinheiro.")) return;
    await run(async () => { await api(`/api/reports/${activeReport.id}/paid`, { method: "POST" }); await refreshData(companyId); setNotice("Pagamento registrado no relatório."); });
  }
  async function withdrawReport() {
    if (!activeReport || !window.confirm("Retirar o relatório da aprovação? Um novo envio começará novamente pela primeira etapa.")) return;
    await run(async () => {
      const { error } = await supabase.rpc("withdraw_report", { p_report_id: activeReport.id });
      if (error) throw new Error(error.message);
      await refreshData(companyId); setNotice("Relatório retirado da aprovação. Você já pode editá-lo.");
    });
  }
  function editManualExpense(expense: Expense) {
    setEditingExpenseId(expense.id);
    setManual({ supplier: expense.supplier, date: expense.expense_date || "", amount: String(expense.amount ?? ""), category: expense.category, description: expense.description });
    setManualFile(null);
  }
  async function saveManualExpense() {
    if (!activeReport || !editable) return;
    await run(async () => {
      const amount = Number(manual.amount.replace(",", "."));
      if (!manual.supplier.trim() || !manual.date || !manual.category || !Number.isFinite(amount) || amount <= 0) throw new Error("Confira fornecedor, data, valor e categoria.");
      if (editingExpenseId) {
        const { data, error } = await supabase.from("expenses").update({
          supplier: manual.supplier.trim(), expense_date: manual.date, amount, category: manual.category, description: manual.description.trim(), updated_at: new Date().toISOString(),
        }).eq("id", editingExpenseId).eq("user_id", userId).eq("entry_source", "manual").select("id").maybeSingle();
        if (error || !data) throw new Error("Não foi possível atualizar a despesa manual.");
      } else {
        let receiptId: string | null = null;
        let path = "";
        if (company?.require_receipt && !manualFile) throw new Error("Sua empresa exige um comprovante.");
        if (manualFile) {
          if (!["image/jpeg", "image/png", "image/webp", "application/pdf"].includes(manualFile.type) || !manualFile.size || manualFile.size > 20 * 1024 * 1024) throw new Error("Use uma imagem JPG, PNG, WebP ou PDF de até 20 MB.");
          const fileName = manualFile.name.replace(/[^a-zA-Z0-9._-]/g, "-");
          path = `${userId}/${crypto.randomUUID()}-${fileName}`;
          const { error } = await supabase.storage.from(DOCUMENTS_BUCKET).upload(path, manualFile, { contentType: manualFile.type, upsert: false });
          if (error) throw new Error("Não foi possível armazenar o comprovante.");
          const { data, error: receiptError } = await supabase.from("receipts").insert({
            user_id: userId, file_name: manualFile.name, storage_path: path, mime_type: manualFile.type, size_bytes: manualFile.size, status: "completed",
          }).select("id").single();
          if (receiptError || !data) {
            await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
            throw new Error("Não foi possível registrar o comprovante.");
          }
          receiptId = data.id;
        }
        const { error } = await supabase.rpc("add_manual_report_expense", {
          p_report_id: activeReport.id, p_supplier: manual.supplier, p_date: manual.date,
          p_amount: amount, p_category: manual.category, p_description: manual.description, p_receipt_id: receiptId,
        });
        if (error) {
          if (receiptId) {
            const { data: removed } = await supabase.from("receipts").delete().eq("id", receiptId).select("id");
            if (removed?.length) await supabase.storage.from(DOCUMENTS_BUCKET).remove([path]);
          }
          throw new Error(error.message);
        }
      }
      resetManual(); await refreshData(companyId); setNotice("Despesa manual salva.");
    });
  }
  async function deleteReport() {
    if (!activeReport || !window.confirm(`Excluir o relatório “${activeReport.name}”? As despesas voltarão a ficar disponíveis.`)) return;
    await run(async () => { await api(`/api/reports/${activeReport.id}`, { method: "DELETE" }); selectReport(""); await refreshData(companyId); setNotice("Relatório excluído. As despesas continuam salvas."); });
  }
  async function openReceipt(expense: Expense) {
    if (!expense.receipts?.storage_path) return;
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(expense.receipts.storage_path, 300);
    if (error || !data?.signedUrl) { setNotice("Não foi possível abrir o comprovante."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  function reportFields(form: Form, setForm: (form: Form) => void, disabled = false) {
    return <div className="settingsGrid">
      <label>Nome do relatório<input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} disabled={disabled} placeholder="Ex.: Visita ao cliente — novembro" /></label>
      <label>Descrição<input value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} disabled={disabled} placeholder="Finalidade da viagem ou evento" /></label>
      <label>Início do período<input type="date" value={form.periodStart} onChange={(event) => setForm({ ...form, periodStart: event.target.value })} disabled={disabled} /></label>
      <label>Fim do período<input type="date" value={form.periodEnd} onChange={(event) => setForm({ ...form, periodEnd: event.target.value })} disabled={disabled} /></label>
      <label>Centro de custo<select value={form.costCenterId} onChange={(event) => setForm({ ...form, costCenterId: event.target.value })} disabled={disabled}><option value="">Selecione</option>{centers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Projeto<select value={form.projectId} onChange={(event) => setForm({ ...form, projectId: event.target.value })} disabled={disabled}><option value="">Sem projeto</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Forma de pagamento<select value={form.paymentMethodId} onChange={(event) => setForm({ ...form, paymentMethodId: event.target.value })} disabled={disabled}><option value="">Não informada</option>{methods.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <label>Fluxo de aprovação<select value={disabled ? form.approvalFlowId : resolvedFlow(form)} onChange={(event) => setForm({ ...form, approvalFlowId: event.target.value })} disabled={disabled || !!assignedFlow(form)}><option value="">Selecione</option>{flows.map((flow) => <option key={flow.id} value={flow.id} disabled={!flow.active}>{flow.name}{flow.active ? "" : " (inativo)"}</option>)}</select>{!disabled && !!assignedFlow(form) && <small>Definido pela empresa.</small>}</label>
      <label className="wideField">Observações<textarea value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} disabled={disabled} placeholder="Informações úteis para quem vai aprovar" /></label>
    </div>;
  }

  if (loading) return <main className="authShell"><div className="authCard">Carregando relatórios…</div></main>;
  if (!userId) return <main className="authShell"><div className="authCard"><h2>Entre no INEPAD Reembolso</h2><p>Entre na sua conta para criar e acompanhar relatórios.</p><Link className="primary" href="/login">Ir para o login</Link></div></main>;
  return <main style={{ "--company-accent": company?.brand_color || "#174f84" } as CSSProperties}>
    <section className="results reportWorkspace"><div className="resultsHeader"><div><span className="sectionNumber">Prestação de contas</span><h1>Relatórios de reembolso</h1><p>Organize despesas, personalize o relatório e acompanhe cada etapa.</p></div><Link className="settingsButton" href="/configuracoes?secao=dados-empresa">Configurar empresa →</Link></div>
      {notice && <p className="notice reportNotice" role="status">{notice}</p>}
      {!companies.length ? <section className="reportCard"><h2>Configure sua empresa primeiro</h2><p className="muted">É preciso cadastrar a empresa e o fluxo de aprovação para começar.</p><Link className="primary" href="/configuracoes?secao=dados-empresa">Abrir configurações <span>→</span></Link></section> : <>
        <label className="workspaceSelector">Empresa <select value={companyId} onChange={(event) => switchCompany(event.target.value)} disabled={busy}>{companies.map(({ company: item }) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <div className="reportGrid"><section className="reportCard"><h2>Novo relatório</h2>{reportFields(newForm, setNewForm)}<button className="dark" onClick={createReport} disabled={busy || !newForm.name.trim() || (!!company?.require_cost_center && !newForm.costCenterId)}>Criar rascunho</button></section>
        <section className="reportCard"><h2>Seus relatórios</h2><div className="reportFilters"><input aria-label="Buscar relatório" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nome" /><select aria-label="Filtrar por status" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}><option value="all">Todos os status</option>{Object.entries(statusLabels).map(([value, label]) => <option value={value} key={value}>{label}</option>)}</select></div><div className="reportList">{visibleReports.map((report) => <button key={report.id} className={`reportListItem ${selectedId === report.id ? "selected" : ""}`} onClick={() => selectReport(report.id)} disabled={busy}><span><strong>{report.name}</strong><small>{report.report_code && `${report.report_code} · `}{statusLabels[report.status] || report.status} · {money(report.total_amount, report.currency)} · {report.report_expenses?.length || 0} despesa(s)</small><small>{members.find((member) => member.user_id === report.owner_id)?.email || "Colaborador"}</small></span><b>›</b></button>)}{!visibleReports.length && <p className="muted">Nenhum relatório neste filtro.</p>}</div></section></div>
        {activeReport && <section className="reportCard reportDetail"><div className="reportDetailHeader"><div><span className={`statusBadge status-${activeReport.status}`}>{statusLabels[activeReport.status] || activeReport.status}</span><h2>{activeReport.name}</h2>{activeReport.report_code && <p>{activeReport.report_code}</p>}<p>{reportExpenses.length} despesa(s) · Total <strong>{money(activeReport.total_amount, activeReport.currency)}</strong></p></div><div className="actions">{editable && <>{activeReport.status === "draft" && !activeReport.submitted_at && <button onClick={deleteReport} disabled={busy}>Excluir rascunho</button>}<button className="dark" onClick={submitReport} disabled={busy || isDirty || !allExpensesLoaded || !resolvedFlow(editForm)}>Enviar para aprovação</button></>}{activeReport.status === "submitted" && (activeReport.owner_id === userId || companies.find((item) => item.company.id === companyId)?.role === "admin") && <button onClick={withdrawReport} disabled={busy}>Retirar da aprovação</button>}{canMarkPaid && <button className="dark" onClick={markPaid} disabled={busy}>Marcar como pago</button>}</div></div>
          {editable && isDirty && <p className="muted">Salve as alterações antes de enviar para aprovação.</p>}
          {activeReport.rejection_reason && <p className="warningBox"><strong>Motivo da rejeição:</strong> {activeReport.rejection_reason}</p>}
          <h3>Detalhes do relatório</h3>{reportFields(editForm, setEditForm, !editable)}{editable && <button onClick={saveReport} disabled={busy || !editForm.name.trim()}>Salvar alterações</button>}
          <h3>Despesas vinculadas</h3>{reportExpenses.length ? <div className="reportExpenseList">{reportExpenses.map((expense) => <div className="reportExpenseRow" key={expense.id}>{expense.receipts ? <button className="fileLink" onClick={() => openReceipt(expense)}>{expense.receipts.file_name}</button> : <span>Sem comprovante</span>}<span>{expense.supplier || "Fornecedor não identificado"}</span><span>{expense.expense_date || "Sem data"}</span><span>{expense.category}</span><strong>{money(expense.amount, activeReport.currency)}</strong>{editable && <div className="rowActions">{expense.entry_source === "manual" && <button onClick={() => editManualExpense(expense)} disabled={busy}>Editar</button>}<button onClick={() => removeExpense(expense.id)} disabled={busy}>Retirar</button></div>}</div>)}</div> : <p className="muted">Nenhuma despesa neste relatório.</p>}
          {editable && <ReceiptWorkspace key={activeReport.id} reportId={activeReport.id} reportName={activeReport.name} currency={activeReport.currency} userId={userId}
            knownLinkedIds={linkedIds} disabled={busy} initialOpen={receiptPromptId === activeReport.id}
            onBusyChange={setBusy} onRefresh={() => refreshData(companyId)} />}
          {editable && <form className="manualExpenseForm" onSubmit={(event) => { event.preventDefault(); void saveManualExpense(); }}>
            <h3>{editingExpenseId ? "Editar despesa manual" : "Lançar despesa manual"}</h3>
            <div className="settingsGrid">
              <label>Fornecedor<input required maxLength={160} value={manual.supplier} onChange={(event) => setManual({ ...manual, supplier: event.target.value })} /></label>
              <label>Data<input required type="date" value={manual.date} onChange={(event) => setManual({ ...manual, date: event.target.value })} /></label>
              <label>Valor ({activeReport.currency})<input required inputMode="decimal" value={manual.amount} onChange={(event) => setManual({ ...manual, amount: event.target.value })} placeholder="0,00" /></label>
              <label>Categoria<select required value={manual.category} onChange={(event) => setManual({ ...manual, category: event.target.value })}><option value="">Selecione</option>{Array.from(new Set([...(expenseCategories.length ? expenseCategories.map((item) => item.name) : categories), ...(editingExpenseId && manual.category ? [manual.category] : [])])).map((name) => <option key={name}>{name}</option>)}</select></label>
              <label className="wideField">Descrição<input maxLength={1000} value={manual.description} onChange={(event) => setManual({ ...manual, description: event.target.value })} /></label>
              {!editingExpenseId && <label className="wideField">Comprovante ({company?.require_receipt ? "obrigatório" : "opcional"})<input key={activeReport.id} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => { setManualFile(event.target.files?.[0] || null); event.target.value = ""; }} />{manualFile?.name}</label>}
            </div>
            <div className="actions">{editingExpenseId && <button type="button" onClick={resetManual} disabled={busy}>Cancelar edição</button>}<button type="submit" className="dark" disabled={busy}>{editingExpenseId ? "Salvar despesa" : "Adicionar despesa manual"}</button></div>
          </form>}
          {editable && <><h3>Adicionar despesas da sua caixa de entrada</h3>{available.length ? <><div className="selectExpenseList">{available.map((expense) => <label className="selectExpense" key={expense.id}><input type="checkbox" checked={selectedExpenses.includes(expense.id)} disabled={busy} onChange={(event) => setSelectedExpenses((current) => event.target.checked ? [...current, expense.id] : current.filter((id) => id !== expense.id))} /><span><strong>{expense.receipts?.file_name || "Comprovante"}</strong><small>{expense.supplier || "Fornecedor não identificado"} · {expense.expense_date || "Sem data"} · {money(expense.amount)}</small></span></label>)}</div><button className="primary" onClick={attachExpenses} disabled={busy || !selectedExpenses.length}>Adicionar {selectedExpenses.length || ""} despesa(s) <span>→</span></button></> : <p className="muted">Sem despesas disponíveis. Use “Ler comprovantes” acima ou lance uma despesa manual.</p>}</>}
        </section>}
      </>}
    </section>
  </main>;
}
