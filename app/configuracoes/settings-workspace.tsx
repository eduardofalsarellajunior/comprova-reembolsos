"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { loadMyCompanies, supabase, type Company, type Member } from "@/lib/workspace-browser";
import AccountSettings from "./account-settings";
import DepartmentSettings from "./department-settings";
import TeamSettings from "./team-settings";
import ProjectSettings from "./project-settings";
import { ExpenseCatalogSettings } from "./catalog-settings";
import { ExpensePolicySettings, MileagePolicySettings } from "./policy-settings";
import { IntegrationSettings } from "./operational-settings";
import { allSettings, canSeeSettings, isAccountSection, settingsGroups, settingsHref, settingsSearchKey } from "./sections";
import SettingsIcon from "./settings-icon";
import "./settings.css";

type Membership = { company: Company; role: string };
const roleLabels: Record<string, string> = { admin: "Administrador", approver: "Intermediário", employee: "Normal", finance: "Intermediário" };

export default function SettingsWorkspace() {
  const requestedSection = useSearchParams().get("secao");
  const item = allSettings.find((entry) => entry.id === requestedSection) ?? allSettings[0];
  const section = item.id;
  const [user, setUser] = useState<{ id: string; email: string } | null>(null);
  const [search, setSearch] = useState("");
  const [navigationOpen, setNavigationOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [companies, setCompanies] = useState<Membership[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [draftOverride, setDraft] = useState<Company | null>(null);
  const [newCompanyName, setNewCompanyName] = useState("");
  const [team, setTeam] = useState<{ id: string; members: Member[] } | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const selected = companies.find((entry) => entry.company.id === companyId);
  const draft = draftOverride?.id === companyId ? draftOverride : selected?.company;
  const role = selected?.role;
  const admin = role === "admin";
  const members = team?.id === companyId ? team.members : [];
  const canLoadTeam = admin && (section === "membros-equipe" || section === "projetos");

  const refreshTeams = useCallback(async (id: string) => {
    const { data, error } = await supabase.from("company_members").select("*").eq("company_id", id).order("created_at");
    if (error) throw new Error("Não foi possível carregar os membros.");
    setTeam({ id, members: (data || []) as Member[] });
  }, []);

  const refreshCompanies = useCallback(async (id: string, preferredCompanyId = "") => {
    const entries = await loadMyCompanies(id);
    setCompanies(entries);
    setCompanyId(entries.some((entry) => entry.company.id === preferredCompanyId) ? preferredCompanyId : (entries[0]?.company.id ?? ""));
    setDraft(null);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getUser().then(async ({ data }) => {
      if (!alive || !data.user) return;
      setUser({ id: data.user.id, email: data.user.email ?? "" });
      await refreshCompanies(data.user.id);
    }).catch((error) => { if (alive) setNotice(error instanceof Error ? error.message : "Erro ao carregar sua conta."); })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [refreshCompanies]);

  useEffect(() => {
    if (!canLoadTeam || !companyId) return;
    let alive = true;
    void refreshTeams(companyId).catch((error: Error) => { if (alive) setNotice(error.message); });
    return () => { alive = false; };
  }, [canLoadTeam, companyId, refreshTeams]);

  async function run(action: () => Promise<void>) {
    setBusy(true); setNotice("");
    try { await action(); }
    catch (error) { setNotice(error instanceof Error ? error.message : "Não foi possível concluir."); }
    finally { setBusy(false); }
  }

  async function createCompany() {
    if (!user) return;
    await run(async () => {
      const { error } = await supabase.rpc("create_company", { p_name: newCompanyName.trim() });
      if (error) throw new Error(error.message);
      await refreshCompanies(user.id);
      setNewCompanyName(""); setNotice("Empresa criada. Configure a equipe e os projetos.");
    });
  }

  async function saveCompany() {
    if (!draft || !admin || !user) return;
    await run(async () => {
      const { data, error } = await supabase.from("companies").update({
        name: draft.name.trim(), legal_name: draft.legal_name.trim(), tax_id: draft.tax_id.trim(),
        brand_color: draft.brand_color, report_prefix: draft.report_prefix.trim(),
        default_currency: "BRL", require_receipt: draft.require_receipt, updated_at: new Date().toISOString(),
      }).eq("id", draft.id).select("id");
      if (error || !data?.length) throw new Error("Não foi possível salvar os dados da empresa.");
      await refreshCompanies(user.id, companyId);
      setNotice("Configurações salvas.");
    });
  }

  async function toggleMember(member: Member) {
    if (!admin) return;
    if (member.active && !window.confirm("Desativar o acesso deste membro à empresa? Relatórios pendentes podem precisar ser retirados e reenviados.")) return;
    await run(async () => {
      const { error } = await supabase.rpc("set_company_member_active", { p_company_id: companyId, p_member_id: member.id, p_active: !member.active });
      if (error) throw new Error(error.message);
      await refreshTeams(companyId);
      setNotice(member.active ? "Acesso desativado." : "Acesso reativado.");
    });
  }

  if (loading) return <main className="authShell"><div className="authCard">Carregando configurações…</div></main>;
  if (!user) return <main className="authShell"><div className="authCard"><h1>Entre no INEPAD Reembolso</h1><Link href="/login">Ir para o login</Link></div></main>;

  const allowed = canSeeSettings(item, role, !!companies.length);
  const matchingGroups = settingsGroups.map((group) => ({
    label: group.label,
    items: group.items.filter((entry) => canSeeSettings(entry, role, !!companies.length) && settingsSearchKey(entry.title).includes(settingsSearchKey(search))),
  })).filter(({ items }) => items.length);
  const companyPicker = companies.length > 0 ? <div className="settingsCompany">
    <label>Empresa <select value={companyId} onChange={(event) => { setCompanyId(event.target.value); setDraft(null); setTeam(null); setNotice(""); }} disabled={busy}>{companies.map((entry) => <option key={entry.company.id} value={entry.company.id}>{entry.company.name}</option>)}</select></label>
    {role && <span className="settingsRole">{roleLabels[role] || role}</span>}
  </div> : null;
  const showsDirectory = allowed && section === "departamentos-cargos" && selected;

  return <main className="settingsWorkspace">
    <aside className="settingsSidebar" aria-label="Configurações">
      <div className="settingsSidebarHeader">
        <h2>Configurações</h2>
        <button type="button" className="settingsNavToggle" aria-expanded={navigationOpen} aria-controls="settings-navigation" onClick={() => setNavigationOpen((open) => !open)}><SettingsIcon name="settings" /><span>Configurações</span><SettingsIcon name="chevronDown" /></button>
      </div>
      <div className="settingsSidebarControls" id="settings-navigation" data-open={navigationOpen}>
        <label className="settingsSearch"><SettingsIcon name="search" /><input type="search" aria-label="Pesquisar configuração" placeholder="Pesquisar configuração" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
        <nav className="settingsNav" aria-label="Seções de configurações">
          {matchingGroups.map(({ label, items }) => <div key={label} className="settingsNavGroup"><h3>{label}</h3>{items.map((entry) =>
            <Link key={entry.id} href={settingsHref(entry.id)} scroll={false} aria-current={section === entry.id ? "page" : undefined} onClick={() => setNavigationOpen(false)}><SettingsIcon name={entry.icon} /><span>{entry.title}</span></Link>)}</div>)}
          {!matchingGroups.length && <p className="settingsSearchEmpty" role="status">Nenhuma configuração encontrada.</p>}
        </nav>
      </div>
    </aside>
    <section className="settingsContent" aria-labelledby="settings-title">
      {!showsDirectory && <div className="settingsHeading"><h1 id="settings-title">{allowed ? item.title : "Acesso restrito"}</h1>{companyPicker}</div>}
      {notice && <p className="notice reportNotice" role="status">{notice}</p>}
      {!allowed ? <section className="reportCard"><p>Disponível apenas a administradores.</p><Link href="/configuracoes">Voltar a Meus dados</Link></section> :
        isAccountSection(section) ? <AccountSettings key={section + companyId} section={section} userId={user.id} email={user.email} companyId={companyId} /> :
        !selected ? (section === "dados-empresa" ? <section className="reportCard">
          <h2>Cadastre a empresa</h2><p>Se sua equipe já usa o INEPAD Reembolso, peça ao administrador para cadastrar seu e-mail.</p>
          <form className="compactForm" onSubmit={(event) => { event.preventDefault(); void createCompany(); }}><label>Nome da empresa<input value={newCompanyName} onChange={(event) => setNewCompanyName(event.target.value)} minLength={2} required /></label><button className="dark" disabled={busy || newCompanyName.trim().length < 2}>Criar empresa</button></form>
        </section> : <section className="reportCard"><p>Você ainda não está vinculado a uma empresa.</p></section>) : <>
          {section === "dados-empresa" && draft && <section className="reportCard"><h2>Identidade e regras gerais</h2>
            <form onSubmit={(event) => { event.preventDefault(); void saveCompany(); }}><div className="settingsGrid">
              <label>Nome da empresa<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required /></label>
              <label>Razão social<input value={draft.legal_name} onChange={(event) => setDraft({ ...draft, legal_name: event.target.value })} /></label>
              <label>CNPJ<input value={draft.tax_id} onChange={(event) => setDraft({ ...draft, tax_id: event.target.value })} /></label>
              <label>Prefixo do relatório<input value={draft.report_prefix} onChange={(event) => setDraft({ ...draft, report_prefix: event.target.value })} /></label>
              <label>Cor da marca<input type="color" value={draft.brand_color} onChange={(event) => setDraft({ ...draft, brand_color: event.target.value })} /></label>
            </div><p className="muted">Moeda do sistema: Real (R$).</p>
            <div className="settingsChecks"><label><input type="checkbox" checked={draft.require_receipt} onChange={(event) => setDraft({ ...draft, require_receipt: event.target.checked })} /> Exigir comprovante</label></div>
            <button className="dark" disabled={busy || !draft.name.trim()}>Salvar configurações</button></form>
          </section>}
          {showsDirectory && <DepartmentSettings key={companyId} companyId={companyId} companyName={selected.company.name} legalName={selected.company.legal_name} canManage={admin} companyPicker={companyPicker} />}
          {section === "membros-equipe" && <TeamSettings key={companyId} companyId={companyId} ownerId={selected.company.owner_id} userId={user.id} members={members} busy={busy} onToggle={toggleMember} onRefresh={() => refreshTeams(companyId)} />}
          {section === "projetos" && <ProjectSettings key={companyId} companyId={companyId} members={members} />}
          {section === "formas-pagamento" && <ExpenseCatalogSettings key={companyId} companyId={companyId} kind="payment_methods" />}
          {section === "tipos-despesa" && <ExpenseCatalogSettings key={companyId} companyId={companyId} kind="expense_categories" />}
          {(section === "despesas" || section === "politica-da-empresa") && <ExpensePolicySettings key={companyId + section} companyId={companyId} admin={admin && section === "despesas"} />}
          {section === "quilometragem" && <MileagePolicySettings key={companyId} companyId={companyId} admin={admin} />}
          {section === "integracoes" && <IntegrationSettings key={companyId} />}
        </>}
    </section>
  </main>;
}
