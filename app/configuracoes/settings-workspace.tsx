"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { api, CatalogItem, Company, Flow, loadMyCompanies, Member, money, supabase } from "@/lib/workspace-browser";
import AccountSettings from "./account-settings";
import DepartmentSettings from "./department-settings";
import { CompanyFinance, IntegrationSettings, MileageSettings, MemberAssignments } from "./operational-settings";
import { allSettings, canSeeSettings, isAccountSection, settingsGroups, settingsHref, settingsSearchKey } from "./sections";
import SettingsIcon from "./settings-icon";
import "./settings.css";

type CatalogKind = "cost_centers" | "projects" | "payment_methods" | "expense_categories";
type Rule = { id: string; name: string; category: string | null; max_amount: number | null; max_days_after_expense: number | null; active: boolean; requires_receipt: boolean };
const catalogLabels: Record<CatalogKind, string> = {
  cost_centers: "Centros de custo", projects: "Projetos", payment_methods: "Formas de pagamento", expense_categories: "Categorias",
};
const emptyCatalog: Record<CatalogKind, CatalogItem[]> = { cost_centers: [], projects: [], payment_methods: [], expense_categories: [] };
const emptyCatalogNames: Record<CatalogKind, string> = { cost_centers: "", projects: "", payment_methods: "", expense_categories: "" };
const roleLabels: Record<string, string> = { admin: "Administrador", approver: "Aprovador", employee: "Colaborador", finance: "Financeiro" };

export default function SettingsWorkspace() {
  const requestedSection = useSearchParams().get("secao");
  const item = allSettings.find((entry) => entry.id === requestedSection) || allSettings[0];
  const section = item.id;
  const [userId, setUserId] = useState("");
  const [email, setEmail] = useState("");
  const [search, setSearch] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
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
      if (data.user) { setUserId(data.user.id); setEmail(data.user.email || ""); await refreshCompanies(data.user.id); }
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

  async function setPaymentReimbursable(item: CatalogItem) {
    await run(async () => {
      const { data, error } = await supabase.from("payment_methods").update({ reimbursable: !item.reimbursable })
        .eq("company_id", companyId).eq("id", item.id).select("id");
      if (error || !data?.length) throw new Error(error?.message || "Não foi possível atualizar a forma de pagamento.");
      await refreshCompany(companyId);
      setNotice("Forma de pagamento atualizada.");
    });
  }

  if (loading) return <main className="authShell"><div className="authCard">Carregando configurações…</div></main>;
  if (!userId) return <main className="authShell"><div className="authCard"><h1>Entre no INEPAD Reembolso</h1><Link href="/login">Voltar ao login</Link></div></main>;

  const role = selected?.role;
  const allowed = canSeeSettings(item, role, !!companies.length);
  const query = settingsSearchKey(search);
  const matchingGroups = settingsGroups.map(({ label, items }) => ({ label, items: items.filter((entry) =>
    canSeeSettings(entry, role, !!companies.length) && (!query || settingsSearchKey(`${label} ${entry.title}`).includes(query))
  ) })).filter((group) => group.items.length);
  const visibleCatalog = ({ "centros-custo": "cost_centers", projetos: "projects", "formas-pagamento": "payment_methods", "tipos-despesa": "expense_categories" } as Partial<Record<string, CatalogKind>>)[section];
  const showsDirectory = allowed && section === "departamentos-cargos" && selected;
  const companyPicker = companies.length ? <div className="settingsCompany">
    <label><span>Empresa</span><select value={companyId} disabled={busy} onChange={(event) => switchCompany(event.target.value)}>{companies.map(({ company }) => <option key={company.id} value={company.id}>{company.name}</option>)}</select></label>
    {role && <span className="settingsRole" title="Tipo de conta">{roleLabels[role] || role}</span>}
  </div> : null;

  return <main className="settingsWorkspace">
      <aside className="settingsSidebar">
        <div className="settingsSidebarHeader">
          <h2>Configurações</h2>
          <button className="settingsNavToggle" type="button" aria-expanded={navigationOpen} aria-controls="settings-navigation" onClick={() => setNavigationOpen((open) => !open)}>
            <SettingsIcon name="settings" /><span>Configurações</span><SettingsIcon name="chevronDown" />
          </button>
        </div>
        <div className="settingsSidebarControls" id="settings-navigation" data-open={navigationOpen}>
          <label className="settingsSearch"><SettingsIcon name="search" size={19} /><input type="search" aria-label="Pesquisar configuração" placeholder="Pesquisar configuração" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
          <nav className="settingsNav" aria-label="Seções de configurações">
            {matchingGroups.map(({ label, items }) => <div className="settingsNavGroup" key={label} data-overview={label === "Geral"}>
              {label !== "Geral" && <h3>{label}</h3>}
              {items.map((entry) => <Link key={entry.id} href={settingsHref(entry.id)} scroll={false} aria-current={section === entry.id ? "page" : undefined} onClick={() => setNavigationOpen(false)}><SettingsIcon name={entry.icon} /><span>{entry.title}</span></Link>)}
            </div>)}
            {!matchingGroups.length && <p className="settingsSearchEmpty" role="status">Nenhuma configuração encontrada.</p>}
          </nav>
        </div>
      </aside>
      <section className="settingsContent" aria-labelledby="settings-title">
        {!showsDirectory && <div className="settingsHeading"><h1 id="settings-title">{allowed ? item.title : "Acesso restrito"}</h1>{companyPicker}</div>}
        {notice && <p className="notice reportNotice" role="status">{notice}</p>}
        {!allowed ? <section className="reportCard"><p>Seu tipo de conta não permite acessar esta seção.</p><Link href="/configuracoes">Voltar às configurações</Link></section> :
        section === "visao-geral" ? <div className="settingsOverview">
          <section className="reportCard settingsWelcome"><h2>Seu espaço de trabalho</h2><p>Gerencie sua conta e, conforme suas permissões, configure a operação da empresa.</p><p className="muted">{email}{selected ? ` · ${selected.company.name} · ${roleLabels[role || "employee"]}` : " · Nenhuma empresa vinculada"}</p></section>
          {settingsGroups.filter((group) => group.label !== "Geral").map(({ label, items }) => {
            const visible = items.filter((entry) => canSeeSettings(entry, role, !!companies.length));
            return visible.length ? <section className="reportCard" key={label}><h2>{label}</h2><div className="settingsShortcuts">{visible.map((entry) => <Link href={settingsHref(entry.id)} key={entry.id}><SettingsIcon name={entry.icon} /><span>{entry.title}</span><SettingsIcon name="chevronRight" size={15} /></Link>)}</div></section> : null;
          })}
        </div> : isAccountSection(section) ? <AccountSettings key={section} section={section} userId={userId} email={email} /> :
        !companies.length ? (section === "dados-empresa" ? <section className="reportCard"><h2>Cadastre a empresa</h2><p>Se sua equipe já usa o INEPAD Reembolso, peça ao administrador para incluir seu e-mail. Crie outro espaço apenas se a empresa ainda não estiver cadastrada.</p><form className="compactForm" onSubmit={(event) => { event.preventDefault(); void createCompany(); }}><label>Nome da empresa<input value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} placeholder="Nome da empresa" minLength={2} required /></label><button className="dark" disabled={busy || newCompanyName.trim().length < 2}>Criar empresa</button></form></section> : <section className="reportCard"><p>Você ainda não está vinculado a uma empresa.</p></section>) : <>
          {section === "dados-empresa" && draft && <section className="reportCard"><h2>Identidade e regras gerais</h2><div className="settingsGrid"><label>Nome da empresa<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} disabled={!admin} /></label><label>Razão social<input value={draft.legal_name} onChange={(event) => setDraft({ ...draft, legal_name: event.target.value })} disabled={!admin} /></label><label>CNPJ<input value={draft.tax_id} onChange={(event) => setDraft({ ...draft, tax_id: event.target.value })} disabled={!admin} /></label><label>Prefixo do relatório<input value={draft.report_prefix} onChange={(event) => setDraft({ ...draft, report_prefix: event.target.value })} disabled={!admin} /></label><label>Cor da marca<input type="color" value={draft.brand_color} onChange={(event) => setDraft({ ...draft, brand_color: event.target.value })} disabled={!admin} /></label><label>Moeda<select value={draft.default_currency} onChange={(event) => setDraft({ ...draft, default_currency: event.target.value })} disabled={!admin}><option value="BRL">Real (BRL)</option><option value="USD">Dólar (USD)</option><option value="EUR">Euro (EUR)</option></select></label></div><div className="settingsChecks"><label><input type="checkbox" checked={draft.require_cost_center} onChange={(event) => setDraft({ ...draft, require_cost_center: event.target.checked })} disabled={!admin} /> Exigir centro de custo no relatório</label><label><input type="checkbox" checked={draft.require_receipt} onChange={(event) => setDraft({ ...draft, require_receipt: event.target.checked })} disabled={!admin} /> Exigir comprovante</label><label><input type="checkbox" checked={draft.allow_self_approval} onChange={(event) => setDraft({ ...draft, allow_self_approval: event.target.checked })} disabled={!admin} /> Permitir autoaprovação</label></div>{admin && <button className="dark" onClick={saveCompany} disabled={busy || !draft.name.trim()}>Salvar configurações</button>}</section>}
          {showsDirectory && <DepartmentSettings key={companyId} companyId={companyId} companyName={showsDirectory.company.name} legalName={showsDirectory.company.legal_name} canManage={admin} companyPicker={companyPicker} />}
          {section === "membros-equipe" && selected && <section className="reportCard"><h2>Membros de equipe</h2><p className="muted">O tipo de conta define permissões. O cargo e o departamento descrevem a função na empresa e não dão acesso extra.</p><MemberAssignments key={companyId} companyId={companyId} ownerId={selected.company.owner_id} userId={userId} members={members} busy={busy} onToggle={toggleMember} onRefresh={() => refreshCompany(companyId)} />
            <form className="compactForm" onSubmit={(event) => { event.preventDefault(); void addMember(); }}>
              <label>E-mail do novo membro<input type="email" value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="E-mail do colaborador" required /></label>
              <label>Tipo de conta<select value={memberRole} onChange={(event) => setMemberRole(event.target.value)}>{Object.entries(roleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <p className="muted">O vínculo é ativado após o login com o e-mail confirmado. Esta ação não envia e-mail de convite.</p><button className="dark" disabled={busy || !memberEmail.includes("@")}>Adicionar membro</button>
            </form></section>}
          {section === "fluxos-aprovacao" && (<section className="reportCard"><h2>Fluxos de aprovação</h2><p className="muted">As etapas são sequenciais. O relatório só é aprovado após a última decisão.</p><div className="reportList">{flows.map((flow) => <div className="reportListItem" key={flow.id}><span><strong>{flow.name}</strong><small>{[...flow.approval_steps].sort((a,b) => a.step_order-b.step_order).map((step) => members.find((member) => member.user_id === step.approver_user_id)?.email || "Aprovador").join(" → ")}</small></span>{admin && <button onClick={() => toggleFlow(flow)} disabled={busy}>{flow.active ? "Desativar" : "Ativar"}</button>}</div>)}</div>{admin && <div className="compactForm"><input aria-label="Nome do fluxo" value={flowName} onChange={(event) => setFlowName(event.target.value)} placeholder="Nome do fluxo" />{approvers.map((approver, index) => <div className="flowStep" key={index}><span>Etapa {index + 1}</span><select aria-label={`Aprovador da etapa ${index + 1}`} value={approver} onChange={(event) => setApprovers((current) => current.map((value, i) => i === index ? event.target.value : value))}><option value="">Selecione o aprovador</option>{members.filter((member) => member.user_id && member.active && ["admin","approver"].includes(member.role)).map((member) => <option key={member.id} value={member.user_id || ""}>{member.email}</option>)}</select>{index > 0 && <button type="button" onClick={() => setApprovers((current) => current.filter((_, i) => i !== index))}>Remover</button>}</div>)}<button type="button" onClick={() => setApprovers((current) => [...current, ""])}>+ Etapa</button><button className="dark" onClick={createFlow} disabled={busy || flowName.trim().length < 2 || approvers.some((id) => !id)}>Criar fluxo</button></div>}{admin && <div className="compactForm"><label>Fluxo padrão da empresa<select disabled={busy} value={selected?.company.default_approval_flow_id || ""} onChange={(event) => void assignFlow(event.target.value)}><option value="">Sem fluxo padrão</option>{flows.map((item) => <option key={item.id} value={item.id} disabled={!item.active}>{item.name}{item.active ? "" : " (inativo)"}</option>)}</select></label>{catalog.cost_centers.filter((item) => item.active).map((center) => <label key={center.id}>Fluxo de {center.name}<select disabled={busy} value={center.approval_flow_id || ""} onChange={(event) => void assignFlow(event.target.value, center.id)}><option value="">Usar fluxo padrão, se definido</option>{flows.map((item) => <option key={item.id} value={item.id} disabled={!item.active}>{item.name}{item.active ? "" : " (inativo)"}</option>)}</select></label>)}</div>}</section>)}
          <>{visibleCatalog && [visibleCatalog].map((kind) => <section className="reportCard" key={kind}><h2>{catalogLabels[kind]}</h2><div className="reportList">{catalog[kind].map((item) => <div className="reportListItem" key={item.id}><span><strong>{item.name}</strong><small>{item.active ? "Ativo" : "Inativo"}{kind === "payment_methods" ? item.reimbursable ? " · Reembolsável" : " · Não reembolsável" : ""}</small></span>{admin && kind === "payment_methods" && <button onClick={() => void setPaymentReimbursable(item)} disabled={busy}>{item.reimbursable ? "Marcar não reembolsável" : "Marcar reembolsável"}</button>}{admin && <button onClick={() => toggleCatalog(kind, item)} disabled={busy}>{item.active ? "Desativar" : "Ativar"}</button>}</div>)}</div>{admin && <div className="compactForm"><input aria-label={`Novo ${catalogLabels[kind]}`} value={catalogName[kind]} onChange={(event) => setCatalogName((current) => ({ ...current, [kind]: event.target.value }))} placeholder={`Novo: ${catalogLabels[kind].toLowerCase()}`} /><button onClick={() => addCatalog(kind)} disabled={busy || !catalogName[kind].trim()}>Adicionar</button></div>}</section>)}</>
          {(section === "despesas" || section === "politica-da-empresa") && (<section className="reportCard"><h2>Política de despesas</h2><p className="muted">O envio verifica o valor, o prazo e a exigência de comprovante. Deixe a categoria em branco para aplicar a regra a todas.</p><div className="reportList">{(section === "politica-da-empresa" ? rules.filter((rule) => rule.active) : rules).map((rule) => <div className="reportListItem" key={rule.id}><span><strong>{rule.name}</strong><small>{rule.category || "Todas as categorias"} · {rule.max_amount ? `limite ${money(rule.max_amount)}` : "sem limite de valor"}{rule.max_days_after_expense != null ? ` · até ${rule.max_days_after_expense} dias` : ""}{rule.requires_receipt ? " · comprovante obrigatório" : ""}</small></span>{admin && section === "despesas" && <button onClick={() => toggleRule(rule)} disabled={busy}>{rule.active ? "Desativar" : "Ativar"}</button>}</div>)}{!rules.some((rule) => section === "despesas" || rule.active) && <p className="muted">Nenhuma regra publicada para esta empresa.</p>}</div>{admin && section === "despesas" && <div className="compactForm"><input aria-label="Nome da regra" value={ruleName} onChange={(event) => setRuleName(event.target.value)} placeholder="Nome da regra" /><input aria-label="Categoria da regra" value={ruleCategory} onChange={(event) => setRuleCategory(event.target.value)} placeholder="Categoria (opcional)" /><input aria-label="Limite da regra" value={ruleLimit} onChange={(event) => setRuleLimit(event.target.value)} placeholder="Limite em R$ (opcional)" inputMode="decimal" /><input type="number" min="1" step="1" aria-label="Prazo em dias" value={ruleDays} onChange={(event) => setRuleDays(event.target.value)} placeholder="Prazo em dias (opcional)" /><label className="inlineCheck"><input type="checkbox" checked={ruleReceipt} onChange={(event) => setRuleReceipt(event.target.checked)} /> Exigir comprovante nesta regra</label><button onClick={createRule} disabled={busy || !ruleName.trim()}>Adicionar regra</button></div>}</section>)}
          {section === "financeiro" && <CompanyFinance key={companyId} companyId={companyId} />}
          {section === "integracoes" && <IntegrationSettings key={companyId} />}
          {section === "quilometragem" && selected && <MileageSettings key={companyId} companyId={companyId} currency={selected.company.default_currency} />}
        </>}
      </section>
  </main>;
}
