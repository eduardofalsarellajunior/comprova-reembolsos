"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, CatalogItem, Company, Flow, loadMyCompanies, Member, money, supabase } from "@/lib/workspace-browser";

type CatalogKind = "cost_centers" | "projects" | "payment_methods" | "expense_categories";
type Rule = { id: string; name: string; category: string | null; max_amount: number | null; max_days_after_expense: number | null; active: boolean; requires_receipt: boolean };
const catalogLabels: Record<CatalogKind, string> = {
  cost_centers: "Centros de custo", projects: "Projetos", payment_methods: "Formas de pagamento", expense_categories: "Categorias",
};
const emptyCatalog: Record<CatalogKind, CatalogItem[]> = { cost_centers: [], projects: [], payment_methods: [], expense_categories: [] };
const emptyCatalogNames: Record<CatalogKind, string> = { cost_centers: "", projects: "", payment_methods: "", expense_categories: "" };
const roleLabels: Record<string, string> = { admin: "Administrador", approver: "Aprovador", employee: "Colaborador", finance: "Financeiro" };

export default function CompanyPage() {
  const [userId, setUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<{ company: Company; role: string }[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [draftOverride, setDraft] = useState<Company | null>(null);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [members, setMembers] = useState<Member[]>([]);
  const [catalog, setCatalog] = useState(emptyCatalog);
  const [catalogName, setCatalogName] = useState(emptyCatalogNames);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState("employee");
  const [flows, setFlows] = useState<Flow[]>([]);
  const [flowName, setFlowName] = useState("");
  const [approvers, setApprovers] = useState<string[]>([""]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [ruleName, setRuleName] = useState("");
  const [ruleCategory, setRuleCategory] = useState("");
  const [ruleLimit, setRuleLimit] = useState("");
  const [ruleDays, setRuleDays] = useState("");
  const [ruleReceipt, setRuleReceipt] = useState(false);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = useMemo(() => companies.find((item) => item.company.id === companyId), [companies, companyId]);
  const draft = draftOverride?.id === companyId ? draftOverride : selected?.company;
  const admin = selected?.role === "admin";

  const refreshCompany = useCallback(async (id: string) => {
    const kinds: CatalogKind[] = ["cost_centers", "projects", "payment_methods", "expense_categories"];
    const [memberResult, ...catalogResults] = await Promise.all([
      supabase.from("company_members").select("*").eq("company_id", id).order("created_at"),
      ...kinds.map((kind) => supabase.from(kind).select("*").eq("company_id", id).order("name")),
    ]);
    if (memberResult.error || catalogResults.some((result) => result.error)) throw new Error("Não foi possível carregar as configurações da empresa.");
    setMembers((memberResult.data || []) as Member[]);
    const next = {} as Record<CatalogKind, CatalogItem[]>;
    kinds.forEach((kind, index) => { next[kind] = (catalogResults[index].data || []) as CatalogItem[]; });
    setCatalog(next);
    const [flowResult, policyResult] = await Promise.all([
      api<{ flows: Flow[] }>(`/api/approval-flows?companyId=${encodeURIComponent(id)}`),
      api<{ policies: Rule[] }>(`/api/policies?companyId=${encodeURIComponent(id)}`),
    ]);
    setFlows(flowResult.flows);
    setRules(policyResult.policies);
  }, []);

  const refreshCompanies = useCallback(async (id: string, preferredCompanyId = "") => {
    const entries = await loadMyCompanies(id);
    const nextId = entries.find((item) => item.company.id === preferredCompanyId)?.company.id || entries[0]?.company.id || "";
    setCompanies(entries);
    setCompanyId(nextId);
    setDraft(null);
    if (nextId) await refreshCompany(nextId);
  }, [refreshCompany]);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      if (data.user) { setUserId(data.user.id); await refreshCompanies(data.user.id); }
    }).catch((error) => setNotice(error instanceof Error ? error.message : "Erro ao carregar sua conta.")).finally(() => setLoading(false));
  }, [refreshCompanies]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setNotice("");
    try { await action(); } catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  }

  function switchCompany(id: string) {
    setCompanyId(id);
    setDraft(null);
    setMembers([]);
    setCatalog(emptyCatalog);
    setCatalogName(emptyCatalogNames);
    setMemberEmail("");
    setMemberRole("employee");
    setFlows([]);
    setFlowName("");
    setApprovers([""]);
    setRules([]);
    setRuleName("");
    setRuleCategory("");
    setRuleLimit("");
    setRuleDays("");
    setRuleReceipt(false);
    void run(() => refreshCompany(id));
  }

  async function createCompany() {
    await run(async () => {
      const { error } = await supabase.rpc("create_company", { p_name: newCompanyName.trim() });
      if (error) throw new Error(error.message);
      await refreshCompanies(userId);
      setNewCompanyName(""); setNotice("Empresa criada. Configure a equipe e as regras abaixo.");
    });
  }

  async function saveCompany() {
    if (!draft) return;
    await run(async () => {
      const { error } = await supabase.from("companies").update({ name: draft.name.trim(), legal_name: draft.legal_name.trim(), tax_id: draft.tax_id.trim(), brand_color: draft.brand_color, report_prefix: draft.report_prefix.trim(), default_currency: draft.default_currency, require_cost_center: draft.require_cost_center, require_receipt: draft.require_receipt, allow_self_approval: draft.allow_self_approval, updated_at: new Date().toISOString() }).eq("id", draft.id);
      if (error) throw new Error(error.message);
      await refreshCompanies(userId, companyId); setNotice("Configurações salvas.");
    });
  }

  async function addMember() {
    await run(async () => {
      const { error } = await supabase.rpc("invite_company_member", { p_company_id: companyId, p_email: memberEmail.trim().toLowerCase(), p_role: memberRole });
      if (error) throw new Error(error.message);
      setMemberEmail(""); await refreshCompany(companyId);
      setNotice("Membro incluído. Ele aparecerá como ativo após entrar com este e-mail confirmado.");
    });
  }

  async function toggleMember(member: Member) {
    await run(async () => {
      if (member.active && !window.confirm("Desativar o acesso deste membro à empresa? Relatórios pendentes podem precisar ser retirados e reenviados.")) return;
      const { error } = await supabase.rpc("set_company_member_active", { p_company_id: companyId, p_member_id: member.id, p_active: !member.active });
      if (error) throw new Error(error.message);
      await refreshCompany(companyId);
      setNotice(member.active ? "Acesso desativado." : "Acesso reativado.");
    });
  }

  async function assignFlow(flowId: string, centerId?: string) {
    await run(async () => {
      const result = centerId
        ? await supabase.from("cost_centers").update({ approval_flow_id: flowId || null }).eq("id", centerId).eq("company_id", companyId).select("id")
        : await supabase.from("companies").update({ default_approval_flow_id: flowId || null }).eq("id", companyId).select("id");
      if (result.error || !result.data?.length) throw new Error(result.error?.message || "Não foi possível vincular o fluxo.");
      if (centerId) await refreshCompany(companyId);
      else await refreshCompanies(userId, companyId);
      setNotice("Roteamento de aprovação salvo.");
    });
  }

  async function addCatalog(kind: CatalogKind) {
    await run(async () => {
      const name = catalogName[kind].trim();
      if (!name) return;
      const { error } = await supabase.from(kind).insert({ company_id: companyId, name });
      if (error) throw new Error(error.message);
      setCatalogName((current) => ({ ...current, [kind]: "" })); await refreshCompany(companyId);
      setNotice(`${catalogLabels[kind]} atualizado.`);
    });
  }

  async function toggleCatalog(kind: CatalogKind, item: CatalogItem) {
    await run(async () => {
      const { error } = await supabase.from(kind).update({ active: !item.active }).eq("id", item.id);
      if (error) throw new Error(error.message);
      await refreshCompany(companyId);
    });
  }

  async function createFlow() {
    await run(async () => {
      if (approvers.some((id) => !id) || new Set(approvers).size !== approvers.length) throw new Error("Escolha aprovadores diferentes para cada etapa.");
      await api("/api/approval-flows", { method: "POST", body: JSON.stringify({ companyId, name: flowName, approverUserIds: approvers }) });
      setFlowName(""); setApprovers([""]); await refreshCompany(companyId); setNotice("Fluxo de aprovação criado.");
    });
  }

  async function toggleFlow(flow: Flow) {
    await run(async () => {
      const { error } = await supabase.from("approval_flows").update({ active: !flow.active, updated_at: new Date().toISOString() }).eq("id", flow.id);
      if (error) throw new Error(error.message);
      await refreshCompany(companyId);
    });
  }

  async function createRule() {
    await run(async () => {
      const maxAmount = ruleLimit ? Number(ruleLimit.replace(",", ".")) : null;
      const maxDaysAfterExpense = ruleDays ? Number(ruleDays) : null;
      if ((maxAmount !== null && (!Number.isFinite(maxAmount) || maxAmount <= 0)) || (maxDaysAfterExpense !== null && (!Number.isInteger(maxDaysAfterExpense) || maxDaysAfterExpense <= 0))) throw new Error("Informe um limite positivo e um prazo em dias inteiros.");
      if (maxAmount === null && maxDaysAfterExpense === null && !ruleReceipt) throw new Error("Defina pelo menos uma condição para a regra.");
      await api("/api/policies", { method: "POST", body: JSON.stringify({ companyId, name: ruleName, category: ruleCategory || null, maxAmount, maxDaysAfterExpense, requiresReceipt: ruleReceipt }) });
      setRuleName(""); setRuleCategory(""); setRuleLimit(""); setRuleDays(""); setRuleReceipt(false); await refreshCompany(companyId); setNotice("Regra de política criada.");
    });
  }

  async function toggleRule(rule: Rule) {
    await run(async () => { await api(`/api/policies/${rule.id}`, { method: "PATCH", body: JSON.stringify({ active: !rule.active }) }); await refreshCompany(companyId); });
  }

  if (loading) return <main className="authShell"><div className="authCard">Carregando empresa…</div></main>;
  if (!userId) return <main className="authShell"><div className="authCard"><h2>Entre no COMPROVA</h2><Link href="/">Voltar ao login</Link></div></main>;

  return <main>
    <header className="topbar"><Link className="brand" href="/"><span className="brandMark">C</span><span>comprova</span></Link><nav className="topActions"><Link className="settingsButton" href="/">Comprovantes</Link><Link className="settingsButton" href="/relatorios">Relatórios</Link><Link className="settingsButton" href="/aprovacoes">Aprovações</Link></nav></header>
    <section className="results reportWorkspace"><div className="resultsHeader"><div><span className="sectionNumber">Administração</span><h1>Configurações da empresa</h1><p>Personalize a operação antes de enviar relatórios para aprovação.</p></div></div>
      {notice && <p className="notice reportNotice" role="status">{notice}</p>}
      {!companies.length ? <section className="reportCard"><h2>Comece pela sua empresa</h2><p className="muted">Crie o espaço da empresa. Depois você poderá adicionar membros, centros de custo, projetos, categorias e fluxos de aprovação.</p><div className="compactForm"><input aria-label="Nome da empresa" value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} placeholder="Nome da empresa" /><button onClick={createCompany} disabled={busy || newCompanyName.trim().length < 2}>Criar empresa</button></div></section> : <>
        <label className="workspaceSelector">Empresa <select value={companyId} onChange={(event) => switchCompany(event.target.value)} disabled={busy}>{companies.map(({ company }) => <option key={company.id} value={company.id}>{company.name}</option>)}</select><span>{roleLabels[selected?.role || "employee"]}</span></label>
        {draft && <section className="reportCard"><h2>Identidade e regras gerais</h2><div className="settingsGrid"><label>Nome da empresa<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={!admin} /></label><label>Razão social<input value={draft.legal_name} onChange={(event) => setDraft({ ...draft, legal_name: event.target.value })} disabled={!admin} /></label><label>CNPJ<input value={draft.tax_id} onChange={(event) => setDraft({ ...draft, tax_id: event.target.value })} disabled={!admin} /></label><label>Prefixo do relatório<input value={draft.report_prefix} onChange={(event) => setDraft({ ...draft, report_prefix: event.target.value })} disabled={!admin} /></label><label>Cor da marca<input type="color" value={draft.brand_color} onChange={(event) => setDraft({ ...draft, brand_color: event.target.value })} disabled={!admin} /></label><label>Moeda<select value={draft.default_currency} onChange={(event) => setDraft({ ...draft, default_currency: event.target.value })} disabled={!admin}><option value="BRL">Real (BRL)</option><option value="USD">Dólar (USD)</option><option value="EUR">Euro (EUR)</option></select></label></div><div className="settingsChecks"><label><input type="checkbox" checked={draft.require_cost_center} onChange={(event) => setDraft({ ...draft, require_cost_center: event.target.checked })} disabled={!admin} /> Exigir centro de custo no relatório</label><label><input type="checkbox" checked={draft.require_receipt} onChange={(event) => setDraft({ ...draft, require_receipt: event.target.checked })} disabled={!admin} /> Exigir comprovante</label><label><input type="checkbox" checked={draft.allow_self_approval} onChange={(event) => setDraft({ ...draft, allow_self_approval: event.target.checked })} disabled={!admin} /> Permitir autoaprovação</label></div>{admin && <button className="dark" onClick={saveCompany} disabled={busy || !draft.name.trim()}>Salvar configurações</button>}</section>}
        <div className="reportGrid"><section className="reportCard"><h2>Equipe e permissões</h2><p className="muted">O membro precisa entrar com o e-mail confirmado para assumir o convite.</p><div className="reportList">{members.map((member) => <div className="reportListItem" key={member.id}><span><strong>{member.email}</strong><small>{roleLabels[member.role] || member.role} · {!member.active ? "inativo" : member.user_id ? "acesso ativo" : "aguardando login"}</small></span>{admin && member.user_id !== selected?.company.owner_id && <button disabled={busy} onClick={() => toggleMember(member)}>{member.active ? "Desativar" : "Reativar"}</button>}</div>)}</div>{admin && <div className="compactForm"><input type="email" aria-label="E-mail do membro" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="E-mail do colaborador" /><select aria-label="Perfil do membro" value={memberRole} onChange={(event) => setMemberRole(event.target.value)}><option value="employee">Colaborador</option><option value="approver">Aprovador</option><option value="finance">Financeiro</option><option value="admin">Administrador</option></select><button onClick={addMember} disabled={busy || !memberEmail.includes("@")}>Adicionar membro</button></div>}</section>
        <section className="reportCard"><h2>Fluxos de aprovação</h2><p className="muted">As etapas são sequenciais. O relatório só é aprovado após a última decisão.</p><div className="reportList">{flows.map((flow) => <div className="reportListItem" key={flow.id}><span><strong>{flow.name}</strong><small>{[...flow.approval_steps].sort((a,b) => a.step_order-b.step_order).map((step) => members.find((member) => member.user_id === step.approver_user_id)?.email || "Aprovador").join(" → ")}</small></span>{admin && <button onClick={() => toggleFlow(flow)} disabled={busy}>{flow.active ? "Desativar" : "Ativar"}</button>}</div>)}</div>{admin && <div className="compactForm"><input aria-label="Nome do fluxo" value={flowName} onChange={(event) => setFlowName(event.target.value)} placeholder="Nome do fluxo" />{approvers.map((approver, index) => <div className="flowStep" key={index}><span>Etapa {index + 1}</span><select aria-label={`Aprovador da etapa ${index + 1}`} value={approver} onChange={(event) => setApprovers((current) => current.map((value, i) => i === index ? event.target.value : value))}><option value="">Selecione o aprovador</option>{members.filter((member) => member.user_id && member.active && ["admin","approver"].includes(member.role)).map((member) => <option key={member.id} value={member.user_id || ""}>{member.email}</option>)}</select>{index > 0 && <button type="button" onClick={() => setApprovers((current) => current.filter((_, i) => i !== index))}>Remover</button>}</div>)}<button type="button" onClick={() => setApprovers((current) => [...current, ""])}>+ Etapa</button><button className="dark" onClick={createFlow} disabled={busy || flowName.trim().length < 2 || approvers.some((id) => !id)}>Criar fluxo</button></div>}{admin && <div className="compactForm"><label>Fluxo padrão da empresa<select disabled={busy} value={selected?.company.default_approval_flow_id || ""} onChange={(event) => void assignFlow(event.target.value)}><option value="">Sem fluxo padrão</option>{flows.map((item) => <option key={item.id} value={item.id} disabled={!item.active}>{item.name}{item.active ? "" : " (inativo)"}</option>)}</select></label>{catalog.cost_centers.filter((item) => item.active).map((center) => <label key={center.id}>Fluxo de {center.name}<select disabled={busy} value={center.approval_flow_id || ""} onChange={(event) => void assignFlow(event.target.value, center.id)}><option value="">Usar fluxo padrão, se definido</option>{flows.map((item) => <option key={item.id} value={item.id} disabled={!item.active}>{item.name}{item.active ? "" : " (inativo)"}</option>)}</select></label>)}</div>}</section></div>
        <div className="reportGrid">{(Object.keys(catalogLabels) as CatalogKind[]).map((kind) => <section className="reportCard" key={kind}><h2>{catalogLabels[kind]}</h2><div className="reportList">{catalog[kind].map((item) => <div className="reportListItem" key={item.id}><span><strong>{item.name}</strong><small>{item.active ? "Ativo" : "Inativo"}{kind === "payment_methods" ? item.reimbursable ? " · Reembolsável" : " · Não reembolsável" : ""}</small></span>{admin && <button onClick={() => toggleCatalog(kind, item)} disabled={busy}>{item.active ? "Desativar" : "Ativar"}</button>}</div>)}</div>{admin && <div className="compactForm"><input aria-label={`Novo ${catalogLabels[kind]}`} value={catalogName[kind]} onChange={(event) => setCatalogName((current) => ({ ...current, [kind]: event.target.value }))} placeholder={`Novo: ${catalogLabels[kind].toLowerCase()}`} /><button onClick={() => addCatalog(kind)} disabled={busy || !catalogName[kind].trim()}>Adicionar</button></div>}</section>)}</div>
        <section className="reportCard"><h2>Política de despesas</h2><p className="muted">O envio verifica o valor, o prazo e a exigência de comprovante. Deixe a categoria em branco para aplicar a regra a todas.</p><div className="reportList">{rules.map((rule) => <div className="reportListItem" key={rule.id}><span><strong>{rule.name}</strong><small>{rule.category || "Todas as categorias"} · {rule.max_amount ? `limite ${money(rule.max_amount)}` : "sem limite de valor"}{rule.max_days_after_expense != null ? ` · até ${rule.max_days_after_expense} dias` : ""}{rule.requires_receipt ? " · comprovante obrigatório" : ""}</small></span>{admin && <button onClick={() => toggleRule(rule)} disabled={busy}>{rule.active ? "Desativar" : "Ativar"}</button>}</div>)}</div>{admin && <div className="compactForm"><input aria-label="Nome da regra" value={ruleName} onChange={(event) => setRuleName(event.target.value)} placeholder="Nome da regra" /><input aria-label="Categoria da regra" value={ruleCategory} onChange={(event) => setRuleCategory(event.target.value)} placeholder="Categoria (opcional)" /><input aria-label="Limite da regra" value={ruleLimit} onChange={(event) => setRuleLimit(event.target.value)} placeholder="Limite em R$ (opcional)" inputMode="decimal" /><input type="number" min="1" step="1" aria-label="Prazo em dias" value={ruleDays} onChange={(event) => setRuleDays(event.target.value)} placeholder="Prazo em dias (opcional)" /><label className="inlineCheck"><input type="checkbox" checked={ruleReceipt} onChange={(event) => setRuleReceipt(event.target.checked)} /> Exigir comprovante nesta regra</label><button onClick={createRule} disabled={busy || !ruleName.trim()}>Adicionar regra</button></div>}</section>
      </>}
    </section>
  </main>;
}
