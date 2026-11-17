"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { api, supabase, type Member } from "@/lib/workspace-browser";
import { isTeamEmail, profileFields, teamRoleLabel, teamRoles, type MemberProfile } from "@/lib/team-profile";
import { MemberApprovalLinks, MemberProjectLinks } from "./project-settings";
import styles from "./team-settings.module.css";

type TeamMember = Member & { department_id?: string | null; job_title_id?: string | null };
type ProfileRow = Partial<MemberProfile> & { member_id: string };
type Department = { id: string; name: string };
type Job = { id: string; name: string; department_id: string };
type Notice = { message: string; error?: boolean };
type Directory = { companyId: string; allowed: boolean; profiles: ProfileRow[]; departments: Department[]; jobs: Job[]; error: string };
type ImportPreview = { rows: number; newMembers: number; existingMembers: number; typesPreserved: number; newAdmins: number; profilesFilled: number; ignoredDocuments: number; missingCpf: number; defaultedRoles: number; adminRows: number };
type CsvPreview = { csv: string; records: { email: string; full_name: string; role: string }[]; result: ImportPreview };
const emptyProfile = (): MemberProfile => Object.fromEntries(profileFields.map(({ key }) => [key, ""])) as MemberProfile;
const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR");

function ProfileEditor({ companyId, member, profile, departments, jobs, ownerId, userId, members, close, saved }: {
  companyId: string; member: TeamMember; profile?: ProfileRow; departments: Department[]; jobs: Job[]; ownerId: string; userId: string;
  members: (Member & { display_name?: string | null })[]; close: () => void; saved: () => Promise<void>;
}) {
  const modal = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState<MemberProfile>(() => ({ ...emptyProfile(), ...Object.fromEntries(profileFields.map(({ key }) => [key, profile?.[key] || ""])) }));
  const [role, setRole] = useState(member.role);
  const [department, setDepartment] = useState(member.department_id || "");
  const [job, setJob] = useState(member.job_title_id || "");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const lockedRole = member.user_id === ownerId || member.user_id === userId;
  const [savedVersion, setSavedVersion] = useState(0);
  useEffect(() => { if (modal.current && !modal.current.open) modal.current.showModal(); }, []);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    if (draft.cpf && !/^(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(draft.cpf.trim())) {
      setNotice({ message: "Informe um CPF com 11 dígitos, ou deixe em branco.", error: true }); return;
    }
    if (role === "admin" && member.role !== "admin" && !window.confirm("Conceder acesso de Administrador? Este membro poderá gerenciar a empresa e os dados pessoais e bancários da equipe.")) return;
    setBusy(true); setNotice(null);
    try {
      const { error } = await supabase.rpc("update_company_member_profile", {
        p_company_id: companyId, p_member_id: member.id, p_role: role,
        p_department_id: department || null, p_job_title_id: job || null,
        p_profile: Object.fromEntries(profileFields.map(({ key }) => [key, draft[key].trim()])),
      });
      if (error) throw new Error("Não foi possível salvar. Confira o cadastro e suas permissões; nenhum campo deste formulário foi salvo parcialmente.");
      setSavedVersion((value) => value + 1);
      setNotice({ message: "Cadastro salvo. Projetos e aprovações possuem seus próprios botões de salvar abaixo." });
      try { await saved(); }
      catch { setNotice({ message: "Cadastro salvo, mas não foi possível recarregar a equipe. Feche o cadastro e use Atualizar antes de alterar os vínculos.", error: true }); }
    } catch (error) { setNotice({ message: error instanceof Error ? error.message : "Não foi possível salvar o cadastro.", error: true }); }
    finally { setBusy(false); }
  }

  return <dialog ref={modal} className={styles.dialog} aria-labelledby="member-editor-title" onCancel={(event) => { event.preventDefault(); if (!busy) close(); }}>
    <header className={styles.heading}><div><h2 id="member-editor-title">Cadastro do membro</h2><p className="muted">{member.email}</p></div><button type="button" disabled={busy} aria-label="Fechar cadastro" onClick={close}>×</button></header>
    <form onSubmit={(event) => void save(event)}>
      <fieldset disabled={busy} className={styles.fields}>
        <legend>Dados pessoais</legend>
        {profileFields.slice(0, 5).map((field) => <label key={field.key}>{field.label}<input
          type={field.key === "birth_date" ? "date" : field.key === "phone" ? "tel" : "text"}
          inputMode={field.key === "cpf" ? "numeric" : undefined} autoComplete="off"
          max={field.key === "birth_date" ? new Date().toISOString().slice(0, 10) : undefined}
          min={field.key === "birth_date" ? "1900-01-01" : undefined}
          maxLength={field.limit} value={draft[field.key]} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} />
        </label>)}
        <label>Tipo de usuário (obrigatório)<select required value={role} disabled={lockedRole} onChange={(event) => setRole(event.target.value)}>
          {member.role === "finance" && <option value="finance">Intermediário (legado; manter)</option>}
          {teamRoles.map((item) => <option key={item.key} value={item.key}>{item.label}</option>)}
        </select></label>
        <label>Departamento<select value={department} onChange={(event) => { setDepartment(event.target.value); setJob(""); }}><option value="">Não informado</option>{departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Cargo cadastrado<select value={job} onChange={(event) => setJob(event.target.value)} disabled={!department}><option value="">Não informado</option>{jobs.filter((item) => item.department_id === department).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      </fieldset>
      <fieldset disabled={busy} className={styles.fields}>
        <legend>Dados bancários para reembolso</legend>
        {profileFields.slice(5).map((field) => <label key={field.key}>{field.label}<input autoComplete="off" maxLength={field.limit} value={draft[field.key]} onChange={(event) => setDraft({ ...draft, [field.key]: event.target.value })} /></label>)}
      </fieldset>
      {lockedRole && <p className="muted">O proprietário permanece Administrador. O próprio tipo de usuário não pode ser alterado.</p>}
      <p className="muted">Campos sem informação podem ficar vazios. A gravação substitui os dados atuais; confira antes de salvar.</p>
      <div className={styles.footer}><button type="button" disabled={busy} onClick={close}>Fechar</button><button className="dark" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar cadastro"}</button></div>
    </form>
    {notice && <p className={notice.error ? styles.error : styles.notice} role={notice.error ? "alert" : "status"}>{notice.message}</p>}
    <div className={styles.links}>
      <p className="muted">Primeiro salve o cadastro acima quando alterar o tipo de usuário. Os vínculos abaixo são salvos separadamente e não permitem autoaprovação.</p>
      <MemberProjectLinks key={`${member.id}:projects:${savedVersion}`} companyId={companyId} memberId={member.id} editable={!busy} />
      <MemberApprovalLinks key={`${member.id}:${member.role}:${member.active}:${savedVersion}`} companyId={companyId} memberId={member.id} members={members} editable={!busy} />
    </div>
  </dialog>;
}

function CsvImporter({ companyId, finish }: { companyId: string; finish: () => Promise<void> }) {
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [confirmAdmins, setConfirmAdmins] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const selection = useRef(0);
  async function readFile(file?: File) {
    const version = ++selection.current;
    setPreview(null); setConfirmAdmins(false); setConfirmed(false); setNotice(null);
    if (!file) return;
    if (file.size > 720_000) { setNotice({ message: "Arquivo muito grande. Use CSV UTF-8 com até 200 pessoas.", error: true }); return; }
    setBusy(true);
    try {
      const csv = await file.text();
      const { parseTeamCsv } = await import("@/lib/team-profile");
      const parsed = parseTeamCsv(csv);
      const result = await api<ImportPreview>("/api/team-import", { method: "POST", body: JSON.stringify({ companyId, csv, mode: "preview" }), cache: "no-store" });
      if (version === selection.current) setPreview({ csv, records: parsed.records, result });
    } catch (error) { if (version === selection.current) setNotice({ message: error instanceof Error ? error.message : "Não foi possível ler o CSV.", error: true }); }
    finally { if (version === selection.current) setBusy(false); }
  }
  async function commit() {
    if (!preview || !confirmed || busy || (preview.result.newAdmins > 0 && !confirmAdmins)) return;
    setBusy(true); setNotice(null);
    try {
      const result = await api<ImportPreview>("/api/team-import", { method: "POST", body: JSON.stringify({ companyId, csv: preview.csv, mode: "commit", confirmAdmins }), cache: "no-store" });
      setPreview(null); setConfirmed(false); setConfirmAdmins(false);
      setNotice({ message: `Importação concluída: ${result.newMembers} novos membros; ${result.profilesFilled} perfis preenchidos. Cadastros, tipos e campos já existentes foram preservados.` });
      try { await finish(); }
      catch { setNotice({ message: "Importação concluída, mas não foi possível recarregar a equipe. Use Atualizar; não importe o arquivo novamente.", error: true }); }
    } catch (error) { setNotice({ message: error instanceof Error ? error.message : "Não foi possível importar.", error: true }); }
    finally { setBusy(false); }
  }
  return <section className={styles.import} aria-busy={busy}>
    <h3>Importar equipe por CSV</h3>
    <p className="muted">Exporte a planilha como CSV UTF-8, com Nome e E-mail. Até 200 pessoas por lote. A prévia não grava dados; o cadastro não cria contas de login nem envia convites por e-mail.</p>
    <label>Selecionar CSV<input type="file" accept=".csv,text/csv" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; void readFile(file); }} /></label>
    {busy && <p role="status">{preview ? "Processando importação…" : "Validando arquivo e permissões…"}</p>}
    {preview && <>
      <dl className={styles.summary}><div><dt>Pessoas</dt><dd>{preview.result.rows}</dd></div><div><dt>Novos cadastros</dt><dd>{preview.result.newMembers}</dd></div><div><dt>Já cadastrados</dt><dd>{preview.result.existingMembers}</dd></div><div><dt>Novos Administradores</dt><dd>{preview.result.newAdmins}</dd></div></dl>
      <div className={`${styles.preview} ${styles.tableScroll}`}><table className={styles.table}><caption>Prévia dos dados do arquivo</caption><thead><tr><th>Nome</th><th>E-mail</th><th>Tipo informado</th></tr></thead><tbody>{preview.records.map((row) => <tr key={row.email}><td>{row.full_name}</td><td>{row.email}</td><td>{teamRoleLabel(row.role)}</td></tr>)}</tbody></table></div>
      <p className="muted">Campos já preenchidos, tipos e acessos ativos/inativos não serão sobrescritos. {preview.result.typesPreserved > 0 && `${preview.result.typesPreserved} tipos diferentes serão preservados.`}</p>
      {preview.result.defaultedRoles > 0 && <p className={styles.error}>{preview.result.defaultedRoles} registros sem tipo serão cadastrados como Normal.</p>}
      {(preview.result.missingCpf > 0 || preview.result.ignoredDocuments > 0) && <p className="muted">{preview.result.missingCpf} registros sem CPF válido; {preview.result.ignoredDocuments} documentos incompatíveis ignorados. Nenhum dado ausente será inventado.</p>}
      <label className={styles.check}><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} disabled={busy} /><span>Conferi a prévia e autorizo cadastrar estas pessoas e preencher somente os campos vazios.</span></label>
      {preview.result.newAdmins > 0 && <label className={styles.check}><input type="checkbox" checked={confirmAdmins} onChange={(event) => setConfirmAdmins(event.target.checked)} disabled={busy} /><span>Confirmo {preview.result.newAdmins} novas contas administrativas, com acesso aos dados pessoais e bancários da equipe.</span></label>}
      <div className={styles.tools}><button type="button" disabled={busy} onClick={() => { selection.current += 1; setPreview(null); setConfirmed(false); setConfirmAdmins(false); }}>Descartar prévia</button><button type="button" className="dark" disabled={busy || !confirmed || (preview.result.newAdmins > 0 && !confirmAdmins)} onClick={() => void commit()}>Confirmar importação</button></div>
    </>}
    {notice && <p className={notice.error ? styles.error : styles.notice} role={notice.error ? "alert" : "status"}>{notice.message}</p>}
  </section>;
}

export default function TeamSettings({ companyId, ownerId, userId, members, busy: externalBusy, onToggle, onRefresh }: {
  companyId: string; ownerId: string; userId: string; members: Member[]; busy: boolean;
  onToggle: (member: Member) => Promise<void>; onRefresh: () => Promise<void>;
}) {
  const [directory, setDirectory] = useState<Directory>({ companyId: "", allowed: false, profiles: [], departments: [], jobs: [], error: "" });
  const [revision, setRevision] = useState(0);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("active");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const pending = busy || externalBusy;
  const loading = directory.companyId !== companyId;

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const permission = await supabase.rpc<boolean>("is_company_admin", { p_company_id: companyId });
        if (permission.error) throw new Error();
        if (permission.data !== true) {
          if (live) setDirectory({ companyId, allowed: false, profiles: [], departments: [], jobs: [], error: "" });
          return;
        }
        const [profiles, departments, jobs] = await Promise.all([
          supabase.from("company_member_profiles").select(["member_id", ...profileFields.map((field) => field.key)].join(",")).eq("company_id", companyId),
          supabase.from("departments").select("id,name").eq("company_id", companyId).order("name"),
          supabase.from("job_titles").select("id,name,department_id").eq("company_id", companyId).order("name"),
        ]);
        if (profiles.error || departments.error || jobs.error) throw new Error();
        if (live) setDirectory({ companyId, allowed: true, profiles: profiles.data || [], departments: departments.data || [], jobs: jobs.data || [], error: "" });
      } catch {
        if (live) setDirectory({ companyId, allowed: false, profiles: [], departments: [], jobs: [], error: "Não foi possível carregar a equipe. Verifique se as configurações V2 foram ativadas no banco e tente novamente." });
      }
    }
    void load();
    return () => { live = false; };
  }, [companyId, revision]);

  async function refresh() { await onRefresh(); setRevision((value) => value + 1); }
  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = email.trim().toLowerCase();
    if (!directory.allowed || pending || !isTeamEmail(value) || !teamRoles.some((entry) => entry.key === role)) return;
    if (role === "admin" && !window.confirm("Cadastrar como Administrador, com acesso à gestão da empresa e aos dados pessoais e bancários da equipe?")) return;
    setBusy(true); setNotice(null);
    try {
      const { data, error } = await supabase.rpc<string>("invite_company_member", { p_company_id: companyId, p_email: value, p_role: role });
      if (error || !data) throw new Error("Não foi possível cadastrar. Confira se o e-mail já existe na equipe e suas permissões.");
      setEmail(""); setRole(""); setAdding(false); setEditingId(data);
      setNotice({ message: "Acesso cadastrado. Complete os dados pessoais, bancários e vínculos. Nenhum convite por e-mail foi enviado." });
      try { await refresh(); }
      catch { setNotice({ message: "Acesso cadastrado, mas não foi possível recarregar a equipe. Use Atualizar para completar os dados; não cadastre o e-mail novamente.", error: true }); }
    } catch (error) { setNotice({ message: error instanceof Error ? error.message : "Não foi possível cadastrar.", error: true }); }
    finally { setBusy(false); }
  }
  async function toggle(member: Member) {
    if (pending || member.user_id === ownerId || member.user_id === userId) return;
    setBusy(true);
    try { await onToggle(member); }
    catch { setNotice({ message: "Não foi possível alterar o acesso.", error: true }); }
    finally { setBusy(false); }
  }

  if (loading) return <section className="reportCard" aria-busy="true"><p role="status">Verificando acesso e carregando equipe…</p></section>;
  if (directory.error) return <section className="reportCard"><p role="alert" className={styles.error}>{directory.error}</p><button type="button" onClick={() => setRevision((value) => value + 1)}>Tentar novamente</button></section>;
  if (!directory.allowed) return <section className="reportCard"><p role="alert">Somente Administradores podem consultar e editar os dados da equipe.</p></section>;
  const profiles = new Map(directory.profiles.map((profile) => [profile.member_id, profile]));
  const departments = new Map(directory.departments.map((department) => [department.id, department.name]));
  const jobs = new Map(directory.jobs.map((job) => [job.id, job.name]));
  const team = members as TeamMember[];
  const linkMembers = members.map((member) => ({ ...member, display_name: profiles.get(member.id)?.full_name }));
  const visible = team.filter((member) => (filter === "all" || member.active === (filter === "active")) && fold(`${profiles.get(member.id)?.full_name || ""} ${member.email} ${teamRoleLabel(member.role)}`).includes(fold(search)));
  const editing = team.find((member) => member.id === editingId);
  return <section className={`reportCard ${styles.panel}`} aria-busy={pending}>
    <header className={styles.heading}><div><h2>Membros de equipe</h2><p className="muted">Cadastro pessoal, dados bancários e permissões, exclusivos dos Administradores.</p></div><button type="button" className="dark" disabled={pending} onClick={() => setAdding((value) => !value)}>{adding ? "Cancelar cadastro" : "+ Novo membro"}</button></header>
    {adding && <form className={styles.tools} onSubmit={(event) => void add(event)}><label>E-mail de acesso<input type="email" autoComplete="off" required maxLength={254} value={email} disabled={pending} onChange={(event) => setEmail(event.target.value)} /></label><label>Tipo de usuário (obrigatório)<select required value={role} disabled={pending} onChange={(event) => setRole(event.target.value)}><option value="" disabled>Selecione</option>{teamRoles.map((entry) => <option key={entry.key} value={entry.key}>{entry.label}</option>)}</select></label><button type="submit" disabled={pending || !isTeamEmail(email.trim()) || !role}>Cadastrar acesso</button></form>}
    <div className={styles.tools}><label>Pesquisar membros<input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, e-mail ou tipo" /></label><label>Situação<select value={filter} onChange={(event) => setFilter(event.target.value)}><option value="active">Ativos</option><option value="inactive">Inativos</option><option value="all">Todos</option></select></label><button type="button" disabled={pending} onClick={() => { void refresh().catch(() => setNotice({ message: "Não foi possível atualizar a equipe.", error: true })); }}>Atualizar</button></div>
    {notice && <p className={notice.error ? styles.error : styles.notice} role={notice.error ? "alert" : "status"}>{notice.message}</p>}
    <div className={styles.tableScroll}><table className={styles.table}><caption>{visible.length} membros na seleção</caption><thead><tr><th>Nome / e-mail</th><th>Tipo de usuário</th><th>Departamento / cargo</th><th>Situação</th><th>Ações</th></tr></thead><tbody>{visible.map((member) => <tr key={member.id}>
      <td><strong>{profiles.get(member.id)?.full_name || "Nome não informado"}</strong><small>{member.email}</small>{member.user_id === ownerId && <small>Proprietário da empresa</small>}</td>
      <td>{teamRoleLabel(member.role)}</td><td>{departments.get(member.department_id || "") || "—"}<small>{jobs.get(member.job_title_id || "") || profiles.get(member.id)?.job_label || "—"}</small></td>
      <td><span className={`${styles.tag} ${!member.active ? styles.mutedTag : ""}`}>{member.active ? "Ativo" : "Inativo"}</span>{member.active && !member.user_id && <small>Primeiro acesso pendente</small>}</td>
      <td><div className={styles.tools}><button type="button" disabled={pending} onClick={() => setEditingId(member.id)}>Editar</button><button type="button" disabled={pending || member.user_id === ownerId || member.user_id === userId} onClick={() => void toggle(member)}>{member.active ? "Desativar" : "Reativar"}</button></div></td>
    </tr>)}</tbody></table></div>
    {!visible.length && <p className="muted">Nenhum membro encontrado.</p>}
    <CsvImporter companyId={companyId} finish={refresh} />
    {editing && <ProfileEditor key={editing.id} companyId={companyId} member={editing} profile={profiles.get(editing.id)} departments={directory.departments} jobs={directory.jobs} ownerId={ownerId} userId={userId} members={linkMembers} close={() => setEditingId(null)} saved={refresh} />}
  </section>;
}
