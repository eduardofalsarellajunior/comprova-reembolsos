"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { SupabaseUser } from "@supabase/supabase-js";
import { supabase } from "@/lib/workspace-browser";

export type AccountSection = "meus-dados" | "seguranca" | "mudar-senha" | "preferencias-email";
const profileKey = "comprova_display_name";
const preferencesKey = "comprova_email_preferences";
const categories = [
  { key: "approvalRequests", label: "Solicitações de aprovação", description: "Quando um relatório chegar para sua análise." },
  { key: "reportUpdates", label: "Andamento dos relatórios", description: "Quando um relatório for aprovado, devolvido ou pago." },
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

export default function AccountSettings({ section, userId, email }: { section: AccountSection; userId: string; email: string }) {
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
  return <AccountPanel key={`${user.id}:${section}`} section={section} user={user} email={user.email || email} onUpdate={setUser} />;
}

function AccountPanel({ section, user, email, onUpdate }: { section: AccountSection; user: SupabaseUser; email: string; onUpdate: (user: SupabaseUser) => void }) {
  const [name, setName] = useState(() => displayName(user));
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
      <p className="muted">Atualize seu nome de exibição. O e-mail de acesso e os perfis de empresa não são alterados aqui.</p>
      <form className="compactForm" onSubmit={(event) => void saveMetadata(event, { [profileKey]: name.trim() }, "Seus dados foram salvos.")}>
        <label>Nome de exibição<input autoComplete="name" maxLength={120} value={name} onChange={(event) => setName(event.target.value)} disabled={busy} /></label>
        <label>E-mail de acesso<input type="email" value={email} readOnly /></label>
        <button className="primary" type="submit" disabled={busy || name.trim() === displayName(user)}>Salvar dados</button>
      </form>
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
      <p className="muted">Escolha quais avisos quer receber. A preferência fica salva, mas o envio automático de e-mails ainda não está ativo.</p>
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
