"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Report = { id: string; name: string; status: string; total_amount: number | string; period_start: string | null; period_end: string | null; report_expenses?: { expense_id: string; position: number }[] };
type Expense = { id: string; supplier: string; expense_date: string | null; amount: number | string | null; category: string; description: string; receipts?: { file_name: string } };
type Policy = { id: string; name: string; category: string | null; max_amount: number | string | null; requires_receipt: boolean; max_days_after_expense: number | null; active: boolean };
type ContaAzulConnection = { id: string; status: string; company_name: string; last_sync_at: string | null; last_error: string | null };
type Mapping = { id: string; mapping_kind: string; local_key: string; local_label: string; external_id: string; external_label: string; active: boolean };
const supabase = createClient();

function money(value: number | string | null) { return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(value || 0)); }

export default function ReportsPage() {
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [selectedReportId, setSelectedReportId] = useState("");
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [policyName, setPolicyName] = useState("");
  const [policyCategory, setPolicyCategory] = useState("");
  const [policyMaxAmount, setPolicyMaxAmount] = useState("");
  const [policyMaxDays, setPolicyMaxDays] = useState("");
  const [contaAzulConnection, setContaAzulConnection] = useState<ContaAzulConnection | null>(null);
  const [mappings, setMappings] = useState<Mapping[]>([]);
  const [mappingKind, setMappingKind] = useState("category");
  const [mappingLocalKey, setMappingLocalKey] = useState("");
  const [mappingLocalLabel, setMappingLocalLabel] = useState("");
  const [mappingExternalId, setMappingExternalId] = useState("");
  const [mappingExternalLabel, setMappingExternalLabel] = useState("");

  async function token() {
    const { data } = await supabase.auth.getSession();
    if (!data.session?.access_token) throw new Error("Entre novamente no sistema.");
    return data.session.access_token;
  }

  async function api(path: string, init?: RequestInit) {
    const bearer = await token();
    const response = await fetch(path, { ...init, headers: { "Content-Type": "application/json", Authorization: `Bearer ${bearer}`, ...init?.headers } });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || "Operação não concluída.");
    return payload;
  }

  async function load() {
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    if (!data.user) return;
    const [reportPayload, expensePayload, linkedPayload, policyPayload, contaAzulPayload] = await Promise.all([
      api("/api/reports"),
      supabase.from("expenses").select("id,supplier,expense_date,amount,category,description,receipts!inner(file_name)").order("expense_date", { ascending: false }),
      supabase.from("report_expenses").select("expense_id"),
      api("/api/policies"),
      api("/api/integrations/conta-azul/status"),
    ]);
    const linked = new Set((linkedPayload.data || []).map((row: { expense_id: string }) => row.expense_id));
    setReports(reportPayload.reports || []);
    setPolicies(policyPayload.policies || []);
    setContaAzulConnection(contaAzulPayload.connection || null);
    setMappings(contaAzulPayload.mappings || []);
    setExpenses(((expensePayload.data || []) as Expense[]).filter((row) => !linked.has(row.id)));
    if (!selectedReportId && reportPayload.reports?.[0]) setSelectedReportId(reportPayload.reports[0].id);
  }

  useEffect(() => { load().catch((error) => setNotice(error instanceof Error ? error.message : "Não foi possível carregar os relatórios.")); }, []);

  const activeReport = useMemo(() => reports.find((report) => report.id === selectedReportId), [reports, selectedReportId]);

  async function createReport() {
    if (!name.trim()) return;
    setBusy(true); setNotice("");
    try { const payload = await api("/api/reports", { method: "POST", body: JSON.stringify({ name, description }) }); setReports((current) => [payload.report, ...current]); setSelectedReportId(payload.report.id); setName(""); setDescription(""); setNotice("Relatório criado."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível criar o relatório."); }
    finally { setBusy(false); }
  }

  async function attachExpenses() {
    if (!selectedReportId || !selectedExpenseIds.length) return;
    setBusy(true); setNotice("");
    try { await api(`/api/reports/${selectedReportId}/expenses`, { method: "POST", body: JSON.stringify({ expenseIds: selectedExpenseIds }) }); setExpenses((current) => current.filter((row) => !selectedExpenseIds.includes(row.id))); setSelectedExpenseIds([]); await load(); setNotice("Despesas vinculadas ao relatório."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível vincular as despesas."); }
    finally { setBusy(false); }
  }

  async function createDefaultFlow() {
    setBusy(true); setNotice("");
    try { await api("/api/approval-flows", { method: "POST", body: JSON.stringify({ name: "Aprovação padrão" }) }); setNotice("Fluxo de aprovação padrão criado."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível criar o fluxo."); }
    finally { setBusy(false); }
  }

  async function connectContaAzul() {
    setBusy(true); setNotice("");
    try { const payload = await api("/api/integrations/conta-azul/start"); window.location.assign(payload.authorizationUrl); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível iniciar a conexão Conta Azul."); setBusy(false); }
  }

  async function createPolicy() {
    if (!policyName.trim()) return;
    setBusy(true); setNotice("");
    try {
      const payload = await api("/api/policies", { method: "POST", body: JSON.stringify({
        name: policyName,
        category: policyCategory || null,
        maxAmount: policyMaxAmount ? Number(policyMaxAmount.replace(",", ".")) : null,
        maxDaysAfterExpense: policyMaxDays ? Number(policyMaxDays) : null,
        requiresReceipt: true,
      }) });
      setPolicies((current) => [...current, payload.policy]);
      setPolicyName(""); setPolicyCategory(""); setPolicyMaxAmount(""); setPolicyMaxDays("");
      setNotice("Regra de política criada.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível criar a regra."); }
    finally { setBusy(false); }
  }

  async function saveMapping() {
    if (!contaAzulConnection || !mappingLocalKey.trim() || !mappingExternalId.trim()) return;
    setBusy(true); setNotice("");
    try {
      const payload = await api("/api/integrations/conta-azul/mappings", { method: "POST", body: JSON.stringify({
        connectionId: contaAzulConnection.id,
        mappingKind,
        localKey: mappingLocalKey,
        localLabel: mappingLocalLabel,
        externalId: mappingExternalId,
        externalLabel: mappingExternalLabel,
      }) });
      setMappings((current) => [...current.filter((item) => !(item.mapping_kind === payload.mapping.mapping_kind && item.local_key === payload.mapping.local_key)), payload.mapping]);
      setMappingLocalKey(""); setMappingLocalLabel(""); setMappingExternalId(""); setMappingExternalLabel("");
      setNotice("Mapeamento salvo.");
    } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível salvar o mapeamento."); }
    finally { setBusy(false); }
  }

  async function submitReport() {
    if (!activeReport) return;
    setBusy(true); setNotice("");
    try { await api(`/api/reports/${activeReport.id}/submit`, { method: "POST" }); await load(); setNotice("Relatório enviado para aprovação."); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível enviar o relatório."); }
    finally { setBusy(false); }
  }

  if (!user) return <main className="authShell"><section className="authCard"><h2>Entre no COMPROVA</h2><p>Faça login na página inicial para administrar relatórios.</p><a className="primary" href="/">Voltar ao login <span>→</span></a></section></main>;

  return <main>
    <header className="topbar"><a className="brand" href="/"><span className="brandMark">C</span><span>comprova</span></a><div className="topActions"><a className="settingsButton" href="/">Comprovantes</a><span className="userEmail">{user.email}</span></div></header>
    <section className="results reportWorkspace">
      <div className="resultsHeader"><div><span className="sectionNumber">Operação</span><h2>Relatórios de reembolso</h2><p>Organize, confira e envie para aprovação.</p></div><div className="actions"><button onClick={connectContaAzul} disabled={busy}>Conectar Conta Azul</button><button onClick={createDefaultFlow} disabled={busy}>Criar fluxo padrão</button></div></div>
      {notice && <div className="notice reportNotice">{notice}</div>}
      <div className="reportGrid">
        <section className="reportCard"><h3>Novo relatório</h3><label>Nome<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Prospecção INEPAD" /></label><label>Descrição<textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Período, projeto ou observações" /></label><button className="primary" onClick={createReport} disabled={busy || !name.trim()}>Criar relatório <span>→</span></button></section>
        <section className="reportCard"><h3>Relatórios existentes</h3>{reports.length ? <div className="reportList">{reports.map((report) => <button key={report.id} className={`reportListItem ${selectedReportId === report.id ? "selected" : ""}`} onClick={() => setSelectedReportId(report.id)}><span><strong>{report.name}</strong><small>{report.status} · {money(report.total_amount)}</small></span><b>›</b></button>)}</div> : <p className="muted">Nenhum relatório criado.</p>}</section>
      </div>
      {activeReport && <section className="reportCard reportDetail"><div className="reportDetailHeader"><div><h3>{activeReport.name}</h3><p>Status: <strong>{activeReport.status}</strong> · Total: <strong>{money(activeReport.total_amount)}</strong></p></div><div className="actions"><button onClick={createDefaultFlow} disabled={busy}>Garantir aprovação</button><button className="dark" onClick={submitReport} disabled={busy || !["draft", "rejected"].includes(activeReport.status)}>Enviar para aprovação</button></div></div><h4>Despesas disponíveis</h4>{expenses.length ? <><div className="selectExpenseList">{expenses.map((expense) => <label key={expense.id} className="selectExpense"><input type="checkbox" checked={selectedExpenseIds.includes(expense.id)} onChange={(event) => setSelectedExpenseIds((current) => event.target.checked ? [...current, expense.id] : current.filter((id) => id !== expense.id))} /><span><strong>{expense.receipts?.file_name || "Comprovante"}</strong><small>{expense.supplier || "Fornecedor não identificado"} · {expense.expense_date || "Sem data"} · {money(expense.amount)} · {expense.category}</small></span></label>)}</div><button className="primary" onClick={attachExpenses} disabled={busy || !selectedExpenseIds.length}>Vincular selecionadas <span>→</span></button></> : <p className="muted">Todas as despesas disponíveis já estão vinculadas ou ainda não há leituras.</p>}</section>}
      <div className="reportGrid">
        <section className="reportCard">
          <h3>Políticas de despesas</h3>
          <p className="muted">As regras são verificadas antes do envio para aprovação.</p>
          {policies.length ? <div className="reportList">{policies.map((policy) => <div key={policy.id} className="reportListItem"><span><strong>{policy.name}</strong><small>{policy.category || "Todas as categorias"} · {policy.max_amount ? "até " + money(policy.max_amount) : "sem limite de valor"}{policy.max_days_after_expense ? " · " + policy.max_days_after_expense + " dias" : ""}</small></span><b>{policy.active ? "ativa" : "inativa"}</b></div>)}</div> : <p className="muted">Nenhuma regra cadastrada.</p>}
          <div className="compactForm"><input value={policyName} onChange={(event) => setPolicyName(event.target.value)} placeholder="Nome da regra" /><input value={policyCategory} onChange={(event) => setPolicyCategory(event.target.value)} placeholder="Categoria (opcional)" /><input value={policyMaxAmount} onChange={(event) => setPolicyMaxAmount(event.target.value)} placeholder="Limite R$ (opcional)" inputMode="decimal" /><input value={policyMaxDays} onChange={(event) => setPolicyMaxDays(event.target.value)} placeholder="Prazo em dias (opcional)" inputMode="numeric" /><button onClick={createPolicy} disabled={busy || !policyName.trim()}>Adicionar regra</button></div>
        </section>
        <section className="reportCard">
          <h3>Conta Azul</h3>
          {contaAzulConnection ? <><p className="statusLine"><strong>{contaAzulConnection.status}</strong>{contaAzulConnection.last_sync_at ? " · última sincronização " + new Date(contaAzulConnection.last_sync_at).toLocaleString("pt-BR") : ""}</p>{contaAzulConnection.last_error && <p className="errorText">{contaAzulConnection.last_error}</p>}<p className="muted">Mapeamentos: {mappings.length}</p><div className="compactForm"><select value={mappingKind} onChange={(event) => setMappingKind(event.target.value)}><option value="category">Categoria</option><option value="cost_center">Centro de custo</option><option value="supplier">Fornecedor</option><option value="financial_account">Conta financeira</option><option value="payment_method">Forma de pagamento</option></select><input value={mappingLocalKey} onChange={(event) => setMappingLocalKey(event.target.value)} placeholder="Chave no COMPROVA (use * para padrão)" /><input value={mappingLocalLabel} onChange={(event) => setMappingLocalLabel(event.target.value)} placeholder="Descrição local" /><input value={mappingExternalId} onChange={(event) => setMappingExternalId(event.target.value)} placeholder="ID na Conta Azul" /><input value={mappingExternalLabel} onChange={(event) => setMappingExternalLabel(event.target.value)} placeholder="Descrição na Conta Azul" /><button onClick={saveMapping} disabled={busy || !mappingLocalKey.trim() || !mappingExternalId.trim()}>Salvar mapeamento</button></div>{mappings.length > 0 && <div className="mappingList">{mappings.map((mapping) => <small key={mapping.id}>{mapping.mapping_kind}:{mapping.local_key} → {mapping.external_id}</small>)}</div>}</> : <p className="muted">Conecte a empresa Conta Azul para configurar os mapeamentos contábeis.</p>}
        </section>
      </div>
    </section>
  </main>;
}
