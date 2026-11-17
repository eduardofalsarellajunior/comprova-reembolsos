"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/workspace-browser";

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState<"password" | "office" | null>(null);
  const [notice, setNotice] = useState("");

  useEffect(() => {
    let active = true;
    void supabase.auth.getUser().then(({ data }) => {
      if (active && data.user) router.replace("/relatorios");
    }).catch(() => { /* Sem sessão válida: o formulário continua acessível. */ });
    return () => { active = false; };
  }, [router]);

  async function authenticate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy("password");
    setNotice("");
    try {
      if (mode === "login") {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw new Error(error.message === "Invalid login credentials" ? "E-mail ou senha incorretos." : error.message);
        if (data.user) router.replace("/relatorios");
      } else {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
        if (error) throw error;
        if (data.session && data.user) router.replace("/relatorios");
        else setNotice("Cadastro realizado. Confira seu e-mail para confirmar a conta e depois entre no sistema.");
      }
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Não foi possível autenticar. Tente novamente.");
    } finally {
      setBusy(null);
    }
  }

  async function signInWithOffice365() {
    if (busy) return;
    setBusy("office");
    setNotice("");
    try {
      const auth = supabase.auth as unknown as {
        signInWithOAuth: (credentials: { provider: string; options: { scopes: string; redirectTo: string } }) => Promise<{ error: { message: string } | null }>;
      };
      const { error } = await auth.signInWithOAuth({ provider: "azure", options: { scopes: "email", redirectTo: window.location.origin } });
      if (error) throw error;
    } catch {
      setNotice("Não foi possível iniciar o login pelo Office 365. Tente novamente ou use seu e-mail e senha.");
      setBusy(null);
    }
  }

  return (
    <main className="authShell">
      <section className="authIntro">
        <div className="eyebrow">Prestação de contas</div>
        <h1>Seus reembolsos,<br /><em>organizados.</em></h1>
        <p>Crie relatórios, reúna os comprovantes de cada despesa e acompanhe a aprovação.</p>
      </section>
      <form className="authCard" onSubmit={authenticate}>
        <Image src="/inepad-reembolso/logo.png" alt="INEPAD Reembolso" width={224} height={96} style={{ width: "min(224px, 100%)", height: "auto" }} unoptimized />
        <h2>{mode === "login" ? "Entrar no sistema" : "Criar minha conta"}</h2>
        <p>{mode === "login" ? "Use seu acesso corporativo ou entre com e-mail e senha." : "Seu histórico ficará vinculado a esta conta."}</p>
        <button type="button" className="officeButton" onClick={signInWithOffice365} disabled={busy !== null}>
          <span className="officeLogo" aria-hidden="true">▦</span>
          {busy === "office" ? "Abrindo Office 365…" : "Entrar com Office 365"}
        </button>
        <div className="authDivider"><span>ou acesso local</span></div>
        <label htmlFor="email">E-mail</label>
        <input id="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required autoComplete="email" />
        <label htmlFor="password">Senha</label>
        <input id="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} />
        <button className="primary" disabled={busy !== null}>{busy === "password" ? "Aguarde…" : mode === "login" ? "Entrar" : "Criar conta"}<span aria-hidden="true">→</span></button>
        {notice && <div className="authNotice" role="status">{notice}</div>}
        <button type="button" className="authSwitch" disabled={busy !== null} onClick={() => { setMode(mode === "login" ? "signup" : "login"); setNotice(""); }}>
          {mode === "login" ? "Primeiro acesso? Criar uma conta" : "Já tenho conta — entrar"}
        </button>
      </form>
    </main>
  );
}
