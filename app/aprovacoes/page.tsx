"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, Company, loadMyCompanies, Member, money, supabase } from "@/lib/workspace-browser";
import { DOCUMENTS_BUCKET } from "@/lib/supabase/config";

type Instance = { id: string; report_id: string; flow_id: string; current_step: number; attempt: number; status: string; created_at: string };
type Step = { id: string; flow_id: string; step_order: number; approver_user_id: string };
type Report = { id: string; company_id: string; owner_id: string; name: string; description: string; notes: string; status: string; total_amount: number | string; currency: string; period_start: string | null; period_end: string | null; rejection_reason: string | null; cost_centers?: { name: string } | null; projects?: { name: string } | null; payment_methods?: { name: string } | null; report_expenses: { expense_id: string }[] };
type Expense = { id: string; supplier: string; expense_date: string | null; amount: number | string | null; category: string; description: string; receipts: { file_name: string; storage_path: string } | null };
type Decision = { id: string; report_id: string; company_id: string; report_name: string; approver_user_id: string; step_order: number; attempt: number; decision: string; reason: string; decided_at: string };

export default function ApprovalsPage() {
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<{ company: Company; role: string }[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [instances, setInstances] = useState<Instance[]>([]);
  const [steps, setSteps] = useState<Step[]>([]);
  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [expenseDetail, setExpenseDetail] = useState<{ reportId: string; items: Expense[] } | null>(null);
  const [selectedId, setSelectedId] = useState("");
  const [tab, setTab] = useState<"mine" | "company" | "history">("mine");
  const [reason, setReason] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const currentRole = companies.find((entry) => entry.company.id === companyId)?.role || "employee";

  const pendingMine = useMemo(() => instances.filter((instance) => instance.status === "pending" && steps.some((step) => step.flow_id === instance.flow_id && step.step_order === instance.current_step && step.approver_user_id === userId) && reports.some((report) => report.id === instance.report_id && report.company_id === companyId)), [instances, steps, reports, userId, companyId]);
  const companyReports = reports.filter((report) => report.company_id === companyId && ["submitted", "approved", "rejected", "paid"].includes(report.status));
  const history = decisions.filter((decision) => decision.approver_user_id === userId && decision.company_id === companyId);
  const rows = tab === "mine" ? pendingMine.map((instance) => ({ report: reports.find((report) => report.id === instance.report_id), instance })) : companyReports.map((report) => ({ report, instance: instances.find((instance) => instance.report_id === report.id) }));
  const selected = tab !== "history" ? reports.find((report) => report.id === selectedId && report.company_id === companyId) : undefined;
  const selectedInstance = instances.find((instance) => instance.report_id === selectedId);
  const mayDecide = pendingMine.some((instance) => instance.id === selectedInstance?.id);
  const selectedExpenses = selected && expenseDetail?.reportId === selected.id ? expenseDetail.items : [];
  const allExpensesLoaded = !!selected?.report_expenses.length && selectedExpenses.length === selected.report_expenses.length;

  const refresh = useCallback(async (id: string) => {
    const [reportPayload, instanceResult, stepResult, decisionResult, memberResult] = await Promise.all([
      api<{ reports: Report[] }>("/api/reports"),
      supabase.from("approval_instances").select("id,report_id,flow_id,current_step,attempt,status,created_at"),
      supabase.from("approval_steps").select("id,flow_id,step_order,approver_user_id"),
      supabase.from("approval_decisions").select("*").eq("company_id", id).order("decided_at", { ascending: false }),
      supabase.from("company_members").select("*").eq("company_id", id),
    ]);
    if (instanceResult.error || stepResult.error || decisionResult.error || memberResult.error) throw new Error("Não foi possível carregar as aprovações.");
    setReports(reportPayload.reports || []);
    setInstances((instanceResult.data || []) as Instance[]);
    setSteps((stepResult.data || []) as Step[]);
    setDecisions((decisionResult.data || []) as Decision[]);
    setMembers((memberResult.data || []) as Member[]);
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (!data.user) return;
      setUserId(data.user.id);
      const entries = await loadMyCompanies(data.user.id);
      const id = entries[0]?.company.id || "";
      setCompanies(entries); setCompanyId(id);
      if (id) await refresh(id);
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Não foi possível carregar sua conta.")).finally(() => setLoading(false));
  }, [refresh]);
  function clearSelection() { setSelectedId(""); setExpenseDetail(null); setReason(""); }
  function selectTab(next: typeof tab) { clearSelection(); setTab(next); }
  async function switchCompany(id: string) {
    clearSelection(); setTab("mine"); setCompanyId(id); setBusy(true); setNotice("");
    try { await refresh(id); } catch (error) { setNotice(error instanceof Error ? error.message : "Erro ao carregar aprovações."); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    let cancelled = false;
    const ids = selected?.report_expenses.map((entry) => entry.expense_id) || [];
    if (selected && ids.length) {
      const reportId = selected.id;
      (async () => {
        const pages: Expense[] = [];
        for (let i = 0; i < ids.length; i += 100) {
          const { data, error } = await supabase.from("expenses").select("id,supplier,expense_date,amount,category,description,receipts(file_name,storage_path)").in("id", ids.slice(i, i + 100));
          if (error) throw new Error("Não foi possível carregar todas as despesas deste relatório.");
          pages.push(...((data || []) as Expense[]));
        }
        if (!cancelled) setExpenseDetail({ reportId, items: pages });
      })().catch((error) => { if (!cancelled) setNotice(error.message); });
    }
    return () => { cancelled = true; };
  }, [selected]);

  async function decide(decision: "approve" | "reject") {
    if (!selectedInstance || !selected || !allExpensesLoaded || !mayDecide) return;
    if (decision === "reject" && reason.trim().length < 3) { setNotice("Informe o motivo da rejeição."); return; }
    if (!window.confirm(decision === "approve" ? `Aprovar o relatório “${selected.name}”?` : `Rejeitar o relatório “${selected.name}” e devolvê-lo para ajuste?`)) return;
    setBusy(true); setNotice("");
    try {
      await api(`/api/approvals/${selectedInstance.id}/decision`, { method: "POST", body: JSON.stringify({ decision, reason: reason.trim(), attempt: selectedInstance.attempt, step: selectedInstance.current_step }) });
      await refresh(companyId); clearSelection(); setNotice(decision === "approve" ? "Sua etapa foi aprovada." : "Relatório devolvido para ajuste.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível registrar a decisão."); }
    finally { setBusy(false); }
  }

  async function openReceipt(expense: Expense) {
    if (!expense.receipts?.storage_path) return;
    const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrl(expense.receipts.storage_path, 300);
    if (error || !data?.signedUrl) { setNotice("Não foi possível abrir o comprovante."); return; }
    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  if (loading) return <main className="authShell"><div className="authCard">Carregando aprovações…</div></main>;
  if (!userId) return <main className="authShell"><div className="authCard"><h2>Entre no INEPAD Reembolso</h2><Link href="/login">Entrar na minha conta</Link></div></main>;
  return <main>
    <section className="results reportWorkspace"><div className="resultsHeader"><div><span className="sectionNumber">Gestão</span><h1>Aprovações</h1><p>Confira cada comprovante e decida com uma trilha de auditoria.</p></div></div>
      {notice && <p className="notice reportNotice" role="status">{notice}</p>}
      {!companies.length ? <section className="reportCard"><h2>Empresa não configurada</h2><Link href="/configuracoes?secao=dados-empresa">Abrir configurações</Link></section> : <>
        <label className="workspaceSelector">Empresa <select value={companyId} onChange={(event) => void switchCompany(event.target.value)} disabled={busy}>{companies.map(({ company }) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
        <div className="approvalTabs"><button className={tab === "mine" ? "selected" : ""} disabled={busy} onClick={() => selectTab("mine")}>Para minha aprovação ({pendingMine.length})</button>{["admin", "finance"].includes(currentRole) && <button className={tab === "company" ? "selected" : ""} disabled={busy} onClick={() => selectTab("company")}>{currentRole === "finance" ? "Aprovados e pagos" : "Todos da empresa"} ({companyReports.length})</button>}<button className={tab === "history" ? "selected" : ""} disabled={busy} onClick={() => selectTab("history")}>Minhas decisões ({history.length})</button></div>
        <div className="reportGrid"><section className="reportCard"><h2>{tab === "mine" ? "Aguardando sua decisão" : tab === "company" ? "Acompanhamento" : "Histórico de decisões"}</h2><div className="reportList">{tab === "history" ? history.map((decision) => <div key={decision.id} className="reportListItem"><span><strong>{decision.report_name}</strong><small>{decision.decision === "approve" ? "Aprovado" : "Rejeitado"} · etapa {decision.step_order} · envio {decision.attempt}</small><small>{new Date(decision.decided_at).toLocaleString("pt-BR")}</small>{decision.reason && <p>{decision.reason}</p>}</span></div>) : rows.map(({ report, instance }, index) => report && <button key={`${report.id}-${index}`} className={`reportListItem ${selectedId === report.id ? "selected" : ""}`} disabled={busy} onClick={() => { clearSelection(); setSelectedId(report.id); }}><span><strong>{report.name}</strong><small>{members.find((member) => member.user_id === report.owner_id)?.email || "Colaborador"} · {money(report.total_amount, report.currency)}</small><small>{report.status === "submitted" ? `Em aprovação · etapa ${instance?.current_step || 1}` : report.status}</small></span><b>›</b></button>)}{!(tab === "history" ? history.length : rows.length) && <p className="muted">Nenhum relatório neste grupo.</p>}</div></section>
        <section className="reportCard"><h2>Conferência</h2>{selected ? <><h3>{selected.name}</h3><p className="muted">{selected.description || "Sem descrição"}</p><p><strong>Total:</strong> {money(selected.total_amount, selected.currency)} · <strong>Status:</strong> {selected.status}</p>{selected.period_start && <p><strong>Período:</strong> {selected.period_start} a {selected.period_end || "—"}</p>}{selected.notes && <p><strong>Observações:</strong> {selected.notes}</p>}{selected.rejection_reason && <p className="warningBox">Última rejeição: {selected.rejection_reason}</p>}<p><strong>Centro de custo:</strong> {selected.cost_centers?.name || "—"} · <strong>Projeto:</strong> {selected.projects?.name || "—"} · <strong>Pagamento:</strong> {selected.payment_methods?.name || "—"}</p><h3>Despesas e comprovantes</h3><div className="reportExpenseList">{selectedExpenses.map((expense) => <div className="approvalExpense" key={expense.id}>{expense.receipts ? <button className="fileLink" onClick={() => openReceipt(expense)}>{expense.receipts.file_name}</button> : <small>Sem comprovante</small>}<strong>{expense.supplier || "Fornecedor não identificado"} · {money(expense.amount, selected.currency)}</strong><small>{expense.expense_date || "Sem data"} · {expense.category}</small><p>{expense.description}</p></div>)}{!selectedExpenses.length && <p className="muted">Nenhuma despesa visível.</p>}</div>{mayDecide && <div className="decisionPanel">{!allExpensesLoaded && <p className="muted">As despesas precisam estar todas visíveis antes da decisão.</p>}<label>Motivo da rejeição<textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Preencha somente se for rejeitar" /></label><div className="actions"><button onClick={() => decide("reject")} disabled={busy || !allExpensesLoaded}>Rejeitar e devolver</button><button className="dark" onClick={() => decide("approve")} disabled={busy || !allExpensesLoaded}>Aprovar esta etapa</button></div></div>}</> : <p className="muted">{tab === "history" ? "O histórico registra a decisão tomada em cada envio." : "Selecione um relatório à esquerda para conferir."}</p>}</section></div>
      </>}
    </section>
  </main>;
}
