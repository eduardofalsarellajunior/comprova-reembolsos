"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import type { SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/workspace-browser";
import { profileFields, teamRoleLabel, type MemberProfile } from "@/lib/team-profile";

export type AccountSection = "meus-dados" | "seguranca" | "mudar-senha" | "preferencias-email";
const profileKey = "comprova_display_name";
const preferencesKey = "comprova_email_preferences";
const categories = [
  { key: "approvalRequests", label: "Solicitações de aprovação", description: "Quando um relatório chegar para sua análise." },
  { key: "reportUpdates", label: "Andamento dos relatórios", description: "Outros avisos sobre relatórios devolvidos ou pagos." },
  { key: "reminders", label: "Lembretes", description: "Avisos sobre despesas e relatórios pendentes." },
] as const;
type PreferenceKey = (typeof categories)[number]["key"];
type Preferences = Record<PreferenceKey, boolean>;

function displayName(user: SupabaseUser) {
  const meta = user.user_metadata;
  const value = meta?.[profileKey] ?? meta?.full_name ?? meta?.name;
  return typeof value === "string" ? value.slice(0, 120) : "";
}

function preferences(user: SupabaseUser): Preferences {
  const stored = user.user_metadata?.[preferencesKey];
  const source: Partial<Preferences> = stored && typeof stored === "object" ? stored : {};
  return { approvalRequests: source.approvalRequests !== false, reportUpdates: source.reportUpdates !== false, reminders: source.reminders === true };
}

function hasIdentity(user: SupabaseUser, provider: string) {
  const providers = user.app_metadata?.providers;
  return user.identities?.some((identity) => identity.provider === provider) ||
    (Array.isArray(providers) && providers.includes(provider)) ||
    user.app_metadata?.provider === provider;
}

function formatDate(value?: string) {
  if (!value) return "Não informado";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Não informado" : date.toLocaleString("pt-BR");
}

type Notice = { message: string; error?: boolean };

export default function AccountSettings({ section, userId, email, companyId }: { section: AccountSection; userId: string; email: string; companyId?: string }) {
  const [user, setUser] = useState<SupabaseUser | null>(null);
  const [failed, setFailed] = useState(false);
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data, error }) => {
      if (!active) return;
      if (error || !data.user || data.user.id !== userId) {
        setFailed(true);
        return;
      }
      setUser(data.user);
    }).catch(() => { if (active) setFailed(true); });
    return () => { active = false; };
  }, [userId, refresh]);

  if (failed) return <section className="reportCard"><h2>Minha conta</h2><p role="alert">Não foi possível verificar sua conta. Entre novamente ou tente recarregar.</p><button className="primary" type="button" onClick={() => { setFailed(false); setRefresh((value) => value + 1); }}>Tentar novamente</button></section>;
  if (!user || user.id !== userId) return <section className="reportCard" aria-busy="true"><p role="status">Carregando sua conta…</p></section>;
  return <AccountPanel key={`${user.id}:${section}:${companyId || ""}`} section={section} user={user} email={user.email || email} companyId={companyId} onUpdate={setUser} />;
}

type PersonalMember = { id: string; role: string; department_id: string | null; job_title_id: string | null };
type PersonalDepartment = { id: string; name: string };
type PersonalJob = PersonalDepartment & { department_id: string };
type PersonalDraft = { profile: MemberProfile; department: string; job: string };
type PersonalSnapshot = { key: string; member: PersonalMember; draft: PersonalDraft; departments: PersonalDepartment[]; jobs: PersonalJob[] };

async function personalMembership(companyId: string, userId: string) {
  const result = await supabase.from("company_members").select("id,role,department_id,job_title_id").eq("company_id", companyId).eq("user_id", userId).eq("active", true).maybeSingle();
  if (result.error || !result.data) throw new Error("Não foi possível verificar seu vínculo com a empresa. Recarregue o cadastro ou procure o administrador.");
  return result.data as PersonalMember;
}

async function personalSnapshot(companyId: string, userId: string, key: string): Promise<PersonalSnapshot> {
  const member = await personalMembership(companyId, userId);
  const [profile, departments, jobs] = await Promise.all([
    supabase.from("company_member_profiles").select(profileFields.map((field) => field.key).join(",")).eq("company_id", companyId).eq("member_id", member.id).maybeSingle(),
    supabase.from("departments").select("id,name").eq("company_id", companyId).order("name"),
    supabase.from("job_titles").select("id,name,department_id").eq("company_id", companyId).order("name"),
  ]);
  if (profile.error || departments.error || jobs.error) throw new Error("Não foi possível carregar seu cadastro. Os dados pessoais não foram substituídos pelos dados do login.");
  const values = profile.data as Partial<MemberProfile> | null;
  return {
    key, member, departments: departments.data || [], jobs: jobs.data || [],
    draft: { profile: Object.fromEntries(profileFields.map(({ key: field }) => [field, values?.[field] || ""])) as MemberProfile, department: member.department_id || "", job: member.job_title_id || "" },
  };
}

function sameMembership(first: PersonalMember, second: PersonalMember) {
  return first.id === second.id && first.role === second.role && first.department_id === second.department_id && first.job_title_id === second.job_title_id;
}

function PersonalProfile({ companyId, userId, email, fallbackName }: { companyId?: string; userId: string; email: string; fallbackName: string }) {
  const [snapshot, setSnapshot] = useState<PersonalSnapshot | null>(null);
  const [draft, setDraft] = useState<PersonalDraft | null>(null);
  const [revision, setRevision] = useState(0);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const operation = useRef(0);
  const pending = useRef(false);
  const live = useRef(false);
  const key = `${companyId || ""}:${userId}:${revision}`;

  useEffect(() => {
    live.current = true;
    const version = ++operation.current;
    const current = () => live.current && operation.current === version;
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session || session.user.id !== userId) {
        operation.current += 1;
        pending.current = false;
        setBusy(false);
        setBlocked(true);
        setSnapshot(null);
        setDraft(null);
        setNotice({ message: "Sua sessão mudou ou expirou. Entre novamente ou recarregue o cadastro.", error: true });
      }
    });
    async function load() {
      if (!companyId) return;
      try {
        const session = await supabase.auth.getUser();
        if (session.error || session.data.user?.id !== userId) throw new Error("Sua sessão mudou ou expirou. Entre novamente.");
        const loaded = await personalSnapshot(companyId, userId, key);
        if (!current()) return;
        setSnapshot(loaded); setDraft(loaded.draft); setBlocked(false);
      } catch (error) {
        if (current()) setNotice({ message: error instanceof Error ? error.message : "Não foi possível carregar seu cadastro.", error: true });
      }
    }
    void load();
    return () => { live.current = false; operation.current += 1; subscription.subscription.unsubscribe(); };
  }, [companyId, userId, key]);

  function reload() {
    if (pending.current) return;
    setSnapshot(null); setDraft(null); setNotice(null); setBlocked(false);
    setRevision((value) => value + 1);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!companyId || !snapshot || snapshot.key !== key || !draft || blocked || pending.current) return;
    const profile = Object.fromEntries(profileFields.map(({ key: field }) => [field, draft.profile[field].trim()])) as MemberProfile;
    for (const field of profileFields) {
      if (profile[field.key].length > field.limit || /[\p{C}]/u.test(profile[field.key])) {
        setNotice({ message: `Confira o campo ${field.label}; limite de ${field.limit} caracteres e sem caracteres de controle.`, error: true }); return;
      }
    }
    if (profile.cpf && !/^(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(profile.cpf)) {
      setNotice({ message: "Informe um CPF com 11 dígitos, ou deixe em branco.", error: true }); return;
    }
    if (profile.birth_date) {
      const date = new Date(`${profile.birth_date}T00:00:00.000Z`);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(profile.birth_date) || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== profile.birth_date || profile.birth_date < "1900-01-01" || profile.birth_date > new Date().toISOString().slice(0, 10)) {
        setNotice({ message: "Informe uma data de nascimento válida, entre 1900 e hoje, ou deixe em branco.", error: true }); return;
      }
    }
    if ((draft.department && !snapshot.departments.some((item) => item.id === draft.department)) || (draft.job && !snapshot.jobs.some((item) => item.id === draft.job && item.department_id === draft.department))) {
      setNotice({ message: "Escolha um departamento e cargo válidos desta empresa.", error: true }); return;
    }
    const version = ++operation.current;
    const current = () => live.current && operation.current === version;
    pending.current = true; setBusy(true); setNotice(null);
    let saved = false;
    try {
      const session = await supabase.auth.getUser();
      if (!current()) return;
      if (session.error || session.data.user?.id !== userId) { setBlocked(true); throw new Error("Sua sessão mudou ou expirou. Entre novamente."); }
      const member = await personalMembership(companyId, userId);
      if (!current()) return;
      if (!sameMembership(member, snapshot.member)) { setBlocked(true); throw new Error("Seu vínculo ou cadastro foi alterado. Recarregue o cadastro antes de salvar novamente."); }
      const result = await supabase.rpc("update_my_company_member_profile", {
        p_company_id: companyId, p_department_id: draft.department || null,
        p_job_title_id: draft.job || null, p_profile: profile,
      });
      if (!current()) return;
      if (result.error) {
        if (result.error.code === "PGRST202" || result.error.code === "42883") throw new Error("A edição de Meus dados ainda não foi ativada no banco de dados. Procure o administrador.");
        throw new Error("Não foi possível salvar seus dados. Confira o cadastro e suas permissões e tente novamente.");
      }
      saved = true;
      setBlocked(true);
      const loaded = await personalSnapshot(companyId, userId, key);
      if (!current()) return;
      if (loaded.member.id !== snapshot.member.id || loaded.member.role !== snapshot.member.role) throw new Error();
      setSnapshot(loaded); setDraft(loaded.draft); setBlocked(false);
      setNotice({ message: "Seus dados foram salvos e recarregados." });
    } catch (error) {
      if (current()) setNotice({ message: saved ? "Seus dados foram salvos, mas não foi possível recarregar o cadastro. Use Recarregar cadastro antes de fazer novas alterações." : error instanceof Error ? error.message : "Não foi possível confirmar o salvamento. Recarregue o cadastro antes de tentar novamente.", error: true });
    } finally {
      if (current()) { pending.current = false; setBusy(false); }
    }
  }

  if (!companyId) return <><p className="muted">Você ainda não está vinculado a uma empresa. Procure o administrador para habilitar seu cadastro.</p><dl className="settingsAccountFacts"><div><dt>Nome de acesso</dt><dd>{fallbackName || "Não informado"}</dd></div><div><dt>E-mail de acesso</dt><dd>{email}</dd></div></dl></>;
  if (!snapshot || snapshot.key !== key || !draft) return <>{notice ? <><p className="warningBox" role="alert">{notice.message}</p><button type="button" onClick={reload}>Tentar novamente</button></> : <p role="status">Carregando seu cadastro…</p>}</>;
  const dirty = JSON.stringify(draft) !== JSON.stringify(snapshot.draft);
  return <>
    <p className="muted">Edite seus dados pessoais e bancários nesta empresa. O e-mail de acesso permanece inalterado; o tipo de usuário é gerenciado pelos administradores.</p>
    <dl className="settingsAccountFacts"><div><dt>E-mail de acesso</dt><dd>{email}</dd></div><div><dt>Tipo de usuário</dt><dd>{teamRoleLabel(snapshot.member.role)}</dd></div></dl>
    <form className="compactForm" onSubmit={(event) => void save(event)} aria-busy={busy}>
      <fieldset className="compactForm" disabled={busy || blocked}>
        <legend>Cadastro pessoal</legend>
        {profileFields.slice(0, 5).map((field) => <label key={field.key}>{field.label}<input
          type={field.key === "birth_date" ? "date" : field.key === "phone" ? "tel" : "text"}
          inputMode={field.key === "cpf" ? "numeric" : undefined} autoComplete="off"
          min={field.key === "birth_date" ? "1900-01-01" : undefined}
          max={field.key === "birth_date" ? new Date().toISOString().slice(0, 10) : undefined}
          maxLength={field.limit} value={draft.profile[field.key]}
          onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, [field.key]: event.target.value } })} />
        </label>)}
        <label>Departamento<select value={draft.department} onChange={(event) => setDraft({ ...draft, department: event.target.value, job: "" })}><option value="">Não informado</option>{snapshot.departments.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
        <label>Cargo cadastrado<select value={draft.job} disabled={!draft.department} onChange={(event) => setDraft({ ...draft, job: event.target.value })}><option value="">Não informado</option>{snapshot.jobs.filter((item) => item.department_id === draft.department).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
      </fieldset>
      <fieldset className="compactForm" disabled={busy || blocked}>
        <legend>Dados para reembolso</legend>
        {profileFields.slice(5).map((field) => <label key={field.key}>{field.label}<input autoComplete="off" maxLength={field.limit} value={draft.profile[field.key]} onChange={(event) => setDraft({ ...draft, profile: { ...draft.profile, [field.key]: event.target.value } })} /></label>)}
      </fieldset>
      <p className="muted">Campos sem informação podem ficar vazios. As alterações valem somente para seu cadastro nesta empresa.</p>
      <div className="actions">
        <button className="primary" type="submit" disabled={busy || blocked || !dirty}>{busy ? "Salvando…" : "Salvar meus dados"}</button>
        <button type="button" disabled={busy || blocked || !dirty} onClick={() => { setDraft(snapshot.draft); setNotice(null); }}>Cancelar alterações</button>
        <button type="button" disabled={busy} onClick={() => { if (!dirty || window.confirm(blocked ? "Recarregar o cadastro atual da empresa?" : "Descartar as alterações não salvas e recarregar seu cadastro?")) reload(); }}>Recarregar cadastro</button>
      </div>
    </form>
    {notice && <p className={notice.error ? "warningBox" : "muted"} role={notice.error ? "alert" : "status"}>{notice.message}</p>}
  </>;
}

function AccountPanel({ section, user, email, companyId, onUpdate }: { section: AccountSection; user: SupabaseUser; email: string; companyId?: string; onUpdate: (user: SupabaseUser) => void }) {
  const [prefs, setPrefs] = useState(() => preferences(user));
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [nonce, setNonce] = useState("");
  const [needsCode, setNeedsCode] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const msLinked = hasIdentity(user, "azure");
  const emailIdentity = hasIdentity(user, "email");

  async function act(action: () => Promise<void>) {
    setBusy(true);
    setNotice(null);
    try {
      const current = await supabase.auth.getUser();
      if (current.error || current.data.user?.id !== user.id) {
        setNotice({ message: "Sua sessão mudou ou expirou. Entre novamente.", error: true });
        return;
      }
      await action();
    } catch {
      setNotice({ message: "Não foi possível concluir agora. Tente novamente.", error: true });
    } finally {
      setBusy(false);
    }
  }

  async function saveMetadata(event: FormEvent<HTMLFormElement>, values: Record<string, unknown>, message: string) {
    event.preventDefault();
    await act(async () => {
      const { data, error } = await supabase.auth.updateUser({ data: values });
      if (error || !data.user) {
        setNotice({ message: "Não foi possível salvar seus dados. Tente novamente.", error: true });
        return;
      }
      onUpdate(data.user);
      setNotice({ message });
    });
  }

  async function changePassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 8 || password !== confirmation) {
      setNotice({ message: "A senha deve ter pelo menos 8 caracteres e ser igual à confirmação.", error: true });
      return;
    }
    if (needsCode && !nonce.trim()) {
      setNotice({ message: "Informe o código de confirmação enviado ao seu e-mail.", error: true });
      return;
    }
    await act(async () => {
      const { data, error } = await supabase.auth.updateUser({ password, ...(needsCode ? { nonce: nonce.trim() } : {}) });
      if (error || !data.user) {
        if (error?.code === "reauthentication_needed" || error?.code === "reauthentication_not_valid") {
          setNeedsCode(true);
          setNotice({ message: "Confirme sua identidade. Solicite um código para o seu e-mail e informe-o abaixo.", error: true });
        } else if (error?.code === "weak_password") {
          setNotice({ message: "Escolha uma senha mais forte que atenda aos requisitos de segurança.", error: true });
        } else if (error?.code === "same_password") {
          setNotice({ message: "Escolha uma senha diferente da atual.", error: true });
        } else {
          setNotice({ message: "Não foi possível trocar sua senha. Tente novamente ou procure o administrador.", error: true });
        }
        return;
      }
      onUpdate(data.user);
      setPassword("");
      setConfirmation("");
      setNonce("");
      setNeedsCode(false);
      setNotice({ message: "Senha alterada." });
    });
  }

  function requestCode() {
    void act(async () => {
      const { error } = await supabase.auth.reauthenticate();
      if (error) {
        setNotice({ message: "Não foi possível enviar um código agora. Aguarde ou entre novamente.", error: true });
        return;
      }
      setNotice({ message: "Código enviado. Confira a caixa de entrada e o spam." });
    });
  }

  function linkMicrosoft() {
    void act(async () => {
      const { error } = await supabase.auth.linkIdentity({ provider: "azure", options: { scopes: "email", redirectTo: window.location.origin } });
      if (error) setNotice({ message: "Não foi possível vincular a conta Microsoft. A identidade pode já estar associada a outro acesso ou o vínculo pode estar desativado.", error: true });
    });
  }

  function signOut() {
    void act(async () => {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) {
        setNotice({ message: "Não foi possível encerrar esta sessão.", error: true });
        return;
      }
      window.location.assign("/");
    });
  }

  return <section className="reportCard settingsAccount" aria-busy={busy}>
    {section === "meus-dados" && <>
      <h2>Meus dados</h2>
      <PersonalProfile companyId={companyId} userId={user.id} email={email} fallbackName={displayName(user)} />
    </>}
    {section === "seguranca" && <>
      <h2>Segurança</h2>
      <p className="muted">Confira a identidade desta sessão e os métodos de acesso disponíveis.</p>
      <dl className="settingsAccountFacts">
        <div><dt>Conta ativa</dt><dd>{email || "Não informado"}</dd></div>
        <div><dt>Verificação de e-mail</dt><dd>{user.email_confirmed_at ? "Confirmado" : "Não confirmado"}</dd></div>
        <div><dt>Último acesso</dt><dd>{formatDate(user.last_sign_in_at)}</dd></div>
        <div><dt>Microsoft 365</dt><dd>{msLinked ? "Vinculado" : "Não vinculado"}</dd></div>
      </dl>
      <div className="actions">
        {!msLinked && <button className="primary" type="button" onClick={linkMicrosoft} disabled={busy}>Vincular Microsoft 365</button>}
        <button type="button" onClick={signOut} disabled={busy}>Sair desta sessão</button>
      </div>
    </>}
    {section === "mudar-senha" && <>
      <h2>Mudar senha</h2>
      {emailIdentity ? <>
        <p className="muted">Altere a senha usada para entrar por e-mail. Se o seu acesso for pela Microsoft 365, a senha da Microsoft é gerenciada separadamente.</p>
        <form className="compactForm" onSubmit={(event) => void changePassword(event)}>
          <label>Nova senha<input type="password" autoComplete="new-password" minLength={8} required value={password} onChange={(event) => setPassword(event.target.value)} disabled={busy} /></label>
          <label>Confirme a nova senha<input type="password" autoComplete="new-password" minLength={8} required value={confirmation} onChange={(event) => setConfirmation(event.target.value)} disabled={busy} /></label>
          {needsCode && <>
            <button type="button" onClick={requestCode} disabled={busy}>Enviar código de confirmação</button>
            <label>Código enviado por e-mail<input type="text" autoComplete="one-time-code" inputMode="numeric" maxLength={12} value={nonce} onChange={(event) => setNonce(event.target.value)} disabled={busy} required /></label>
          </>}
          <button className="primary" type="submit" disabled={busy}>Alterar senha</button>
        </form>
      </> : <p className="muted">Esta conta não usa o acesso por e-mail e senha. Para mudar sua senha, use as configurações do provedor de login.</p>}
    </>}
    {section === "preferencias-email" && <>
      <h2>Preferências de e-mail</h2>
      <p className="muted">A confirmação de aprovação é uma comunicação transacional, enviada quando o serviço de e-mail da empresa está ativo. As preferências abaixo ficam salvas para os demais avisos opcionais, cujo envio ainda depende de implementação e configuração.</p>
      <form className="compactForm" onSubmit={(event) => void saveMetadata(event, { [preferencesKey]: prefs }, "Preferências salvas.")}>
        <fieldset className="settingsAccountChoices">
          <legend>Avisos</legend>
          {categories.map(({ key, label, description }) => <label className="selectExpense" key={key}>
            <input type="checkbox" checked={prefs[key]} onChange={(event) => setPrefs({ ...prefs, [key]: event.target.checked })} disabled={busy} />
            <span><strong>{label}</strong><small>{description}</small></span>
          </label>)}
        </fieldset>
        <button className="primary" type="submit" disabled={busy}>Salvar preferências</button>
      </form>
    </>}
    {notice && <p className={notice.error ? "warningBox" : "muted"} role={notice.error ? "alert" : "status"}>{notice.message}</p>}
  </section>;
}
