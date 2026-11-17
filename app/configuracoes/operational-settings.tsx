"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, money, supabase, type Member } from "@/lib/workspace-browser";

type Department = { id: string; name: string; position?: number };
type Job = Department & { department_id: string };
type TeamMember = Member & { department_id?: string | null; job_title_id?: string | null };
type Assignment = { memberId: string; role: string; departmentId: string; jobId: string };
const roles = { admin: "Administrador", approver: "Aprovador", employee: "Colaborador", finance: "Financeiro" };
const errorMessage = (e: unknown) => e instanceof Error ? e.message : "Não foi possível completar a operação.";

export function MemberAssignments({ companyId, ownerId, userId, members, busy, onToggle, onRefresh }: {
  companyId: string; ownerId: string; userId: string; members: TeamMember[]; busy: boolean;
  onToggle: (member: Member) => Promise<void>; onRefresh: () => Promise<void>;
}) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [edit, setEdit] = useState<Assignment | null>(null);
  const [notice, setNotice] = useState("");
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      supabase.from("departments").select("id,name").eq("company_id", companyId).order("name"),
      supabase.from("job_titles").select("id,name,department_id").eq("company_id", companyId).order("name"),
    ]).then(([departmentsResult, jobsResult]) => {
      if (cancelled) return;
      if (departmentsResult.error || jobsResult.error) { setNotice("Não foi possível carregar a estrutura da empresa."); return; }
      setDepartments(departmentsResult.data || []); setJobs(jobsResult.data || []);
    }).catch((error) => { if (!cancelled) setNotice(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [companyId]);

  async function save() {
    if (!edit) return;
    setSaving(true); setNotice("");
    try {
      const { error } = await supabase.rpc("update_company_member_assignment", {
        p_company_id: companyId, p_member_id: edit.memberId, p_role: edit.role,
        p_department_id: edit.departmentId || null, p_job_title_id: edit.jobId || null,
      });
      if (error) throw new Error(error.message);
      setEdit(null);
      await onRefresh();
      setNotice("Dados do membro atualizados.");
    } catch (error) { setNotice(errorMessage(error)); }
    finally { setSaving(false); }
  }

  const disabled = busy || saving;
  const filtered = members.filter((member) => member.email.toLowerCase().includes(search.trim().toLowerCase()));
  return <>
    {notice && <p className="notice" role="status">{notice}</p>}
    {members.length > 0 && <label>Pesquisar membro<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por e-mail" /></label>}
    <div className="settingsRecords">{filtered.map((member) => {
      const role = roles[member.role as keyof typeof roles] || member.role;
      const department = departments.find((entry) => entry.id === member.department_id)?.name;
      const job = jobs.find((entry) => entry.id === member.job_title_id)?.name;
      const status = !member.active ? "Acesso desativado" : member.user_id ? "Acesso ativo" : "Aguardando primeiro login";
      return <article className="settingsRecord" key={member.id}>
        <div className="settingsRecordHeading">
          <div><strong>{member.email}</strong><p>{role} · {status}</p><p>{[department, job].filter(Boolean).join(" · ") || "Sem departamento ou cargo"}</p></div>
          <div className="settingsInlineActions">
            <button className="settingsButton" type="button" disabled={disabled} onClick={() => setEdit({ memberId: member.id, role: member.role, departmentId: member.department_id || "", jobId: member.job_title_id || "" })}>Editar</button>
            {member.user_id !== ownerId && member.user_id !== userId && <button className="settingsButton" type="button" disabled={disabled} onClick={() => void onToggle(member)}>{member.active ? "Desativar" : "Reativar"}</button>}
          </div>
        </div>
        {edit?.memberId === member.id && <form className="settingsGrid" onSubmit={(event) => { event.preventDefault(); void save(); }}>
          <label>Tipo de conta<select value={edit.role} disabled={disabled || member.user_id === ownerId || member.user_id === userId} onChange={(event) => setEdit({ ...edit, role: event.target.value })}>
            {Object.entries(roles).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label>Departamento<select value={edit.departmentId} disabled={disabled} onChange={(event) => setEdit({ ...edit, departmentId: event.target.value, jobId: "" })}><option value="">Sem departamento</option>{departments.map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <label>Cargo<select value={edit.jobId} disabled={disabled || !edit.departmentId} onChange={(event) => setEdit({ ...edit, jobId: event.target.value })}><option value="">Sem cargo</option>{jobs.filter((entry) => entry.department_id === edit.departmentId).map((entry) => <option key={entry.id} value={entry.id}>{entry.name}</option>)}</select></label>
          <div className="settingsInlineActions wideField"><button type="submit" className="dark" disabled={disabled}>Salvar membro</button><button type="button" className="settingsButton" disabled={disabled} onClick={() => setEdit(null)}>Cancelar</button></div>
        </form>}
      </article>;
    })}{!filtered.length && <p className="muted">{members.length ? "Nenhum membro encontrado." : "Nenhum membro cadastrado."}</p>}</div>
  </>;
}

export function CompanyFinance({ companyId }: { companyId: string }) {
  const [data, setData] = useState<{ approved: number; paid: number } | null>(null);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    let cancelled = false;
    Promise.all(["approved", "paid"].map((status) => supabase.from("reports").select("id", { count: "exact", head: true }).eq("company_id", companyId).eq("status", status)))
      .then(([approved, paid]) => {
        if (cancelled) return;
        if (approved.error || paid.error) { setNotice("Não foi possível consultar os relatórios financeiros."); return; }
        setData({ approved: approved.count || 0, paid: paid.count || 0 });
      }).catch((error) => { if (!cancelled) setNotice(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [companyId]);
  return <section className="reportCard">
    <h2>Acompanhamento de reembolsos</h2>
    <p>O Financeiro pode consultar relatórios aprovados e registrar pagamentos já efetuados. O INEPAD Reembolso não transfere valores.</p>
    {notice ? <p role="status">{notice}</p> : data ? <dl className="settingsAccountFacts"><div><dt>Aguardando pagamento</dt><dd>{data.approved}</dd></div><div><dt>Pagamentos registrados</dt><dd>{data.paid}</dd></div></dl> : <p className="muted">Carregando relatórios…</p>}
    <Link className="settingsButton" href="/relatorios">Abrir relatórios</Link>
  </section>;
}

export function IntegrationSettings() {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  async function checkVExpenses() {
    setBusy(true); setNotice("");
    try { await api("/api/vexpenses/context"); setNotice("A VExpenses respondeu para sua conta atual."); }
    catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }
  return <section className="reportCard">
    <h2>Serviços conectados</h2>
    <div className="settingsRecords">
      <article className="settingsRecord"><div className="settingsRecordHeading"><div><strong>VExpenses</strong><p>Consulte a disponibilidade da integração para sua conta. A verificação não cria despesas.</p></div><button className="settingsButton" type="button" disabled={busy} onClick={() => void checkVExpenses()}>Verificar conexão</button></div>
        {notice && <p role="status">{notice}</p>}
      </article>
      <article className="settingsRecord"><strong>Microsoft 365</strong><p>O vínculo é individual e fica em <Link href="/configuracoes?secao=seguranca">Minha conta → Segurança</Link>.</p></article>
      <article className="settingsRecord"><strong>Conta Azul</strong><p>A integração contábil não foi ativada nesta versão.</p></article>
    </div>
  </section>;
}

type MileageRule = { id: string; name: string; rate_per_km: number; max_km: number | null; requires_route: boolean; active: boolean };
const blankRule = { id: "", name: "", rate: "", maxKm: "", requiresRoute: false };

export function MileageSettings({ companyId, currency }: { companyId: string; currency: string }) {
  const [rules, setRules] = useState<MileageRule[]>([]);
  const [form, setForm] = useState(blankRule);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("mileage_policies").select("id,name,rate_per_km,max_km,requires_route,active").eq("company_id", companyId).order("name");
    if (error) throw new Error("Não foi possível carregar as políticas de quilometragem.");
    return (data || []) as MileageRule[];
  }, [companyId]);
  useEffect(() => {
    let cancelled = false;
    load().then((data) => { if (!cancelled) setRules(data); }).catch((error) => { if (!cancelled) setNotice(errorMessage(error)); });
    return () => { cancelled = true; };
  }, [load]);
  async function run(action: () => Promise<void>, success: string) {
    setBusy(true); setNotice("");
    try { await action(); setRules(await load()); setNotice(success); }
    catch (error) { setNotice(errorMessage(error)); }
    finally { setBusy(false); }
  }
  async function save() {
    await run(async () => {
      const rate = Number(form.rate.replace(",", "."));
      const maxKm = form.maxKm.trim() ? Number(form.maxKm.replace(",", ".")) : null;
      if (!form.name.trim() || !Number.isFinite(rate) || rate <= 0 || (maxKm !== null && (!Number.isFinite(maxKm) || maxKm <= 0))) throw new Error("Informe um nome e valores positivos.");
      const record = { name: form.name.trim(), rate_per_km: rate, max_km: maxKm, requires_route: form.requiresRoute };
      const response = form.id
        ? await supabase.from("mileage_policies").update(record).eq("company_id", companyId).eq("id", form.id).select("id")
        : await supabase.from("mileage_policies").insert({ company_id: companyId, ...record }).select("id");
      if (response.error || !response.data?.length) throw new Error(response.error?.message || "Não foi possível salvar a política.");
      setForm(blankRule);
    }, "Política de quilometragem salva.");
  }
  async function toggle(rule: MileageRule) {
    await run(async () => {
      const { data, error } = await supabase.from("mileage_policies").update({ active: !rule.active }).eq("company_id", companyId).eq("id", rule.id).select("id");
      if (error || !data?.length) throw new Error(error?.message || "Não foi possível atualizar a política.");
    }, rule.active ? "Política desativada." : "Política ativada.");
  }
  return <section className="reportCard">
    <h2>Políticas de quilometragem</h2>
    <p>Cadastre os valores e limites de referência da empresa. Este cadastro ainda não calcula despesas de trajeto nem gera reembolsos automaticamente.</p>
    {notice && <p className="notice" role="status">{notice}</p>}
    <div className="settingsRecords">{rules.map((rule) => <article className="settingsRecord" key={rule.id}><div className="settingsRecordHeading">
      <div><strong>{rule.name}</strong><p>{money(rule.rate_per_km, currency)} por km · {rule.max_km ? `até ${rule.max_km} km` : "sem limite"} · {rule.active ? "Ativa" : "Inativa"}{rule.requires_route ? " · trajeto obrigatório" : ""}</p></div>
      <div className="settingsInlineActions"><button type="button" className="settingsButton" disabled={busy} onClick={() => setForm({ id: rule.id, name: rule.name, rate: String(rule.rate_per_km), maxKm: String(rule.max_km ?? ""), requiresRoute: rule.requires_route })}>Editar</button><button type="button" className="settingsButton" disabled={busy} onClick={() => void toggle(rule)}>{rule.active ? "Desativar" : "Ativar"}</button></div>
    </div></article>)}{!rules.length && <p className="muted">Nenhuma política cadastrada.</p>}</div>
    <form className="settingsGrid" onSubmit={(event) => { event.preventDefault(); void save(); }}>
      <label>Nome<input value={form.name} maxLength={120} required onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
      <label>Valor por km ({currency})<input inputMode="decimal" value={form.rate} required onChange={(event) => setForm({ ...form, rate: event.target.value })} /></label>
      <label>Limite em km (opcional)<input inputMode="decimal" value={form.maxKm} onChange={(event) => setForm({ ...form, maxKm: event.target.value })} /></label>
      <label className="inlineCheck"><input type="checkbox" checked={form.requiresRoute} onChange={(event) => setForm({ ...form, requiresRoute: event.target.checked })} /> Exigir trajeto</label>
      <div className="settingsInlineActions wideField"><button className="dark" type="submit" disabled={busy}>{form.id ? "Salvar alterações" : "Cadastrar política"}</button>{form.id && <button className="settingsButton" type="button" disabled={busy} onClick={() => setForm(blankRule)}>Cancelar</button>}</div>
    </form>
  </section>;
}
