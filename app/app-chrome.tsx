"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";

const mainMenu = [
  { href: "/relatorios", title: "Relatórios", icon: "reports" },
  { href: "/aprovacoes", title: "Aprovações", icon: "approvals" },
  { href: "/configuracoes", title: "Configurações", icon: "settings" },
] as const;

type MenuItem = typeof mainMenu[number];
type Icon = MenuItem["icon"] | "collapse" | "expand" | "logout";

const preferenceKey = "inepad-reembolso:menu-expandido:v1";
const preferenceEvent = "inepad-reembolso:menu-change";
const compactMenuQuery = "(max-width: 820px)";
let localPreference = false;

function readExpanded() {
  try { return window.localStorage.getItem(preferenceKey) === "true"; }
  catch { return localPreference; }
}

function subscribeExpanded(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(preferenceEvent, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(preferenceEvent, callback);
  };
}

function setExpanded(next: boolean) {
  localPreference = next;
  try { window.localStorage.setItem(preferenceKey, String(next)); }
  catch { /* Keep the preference in this tab when storage is unavailable. */ }
  window.dispatchEvent(new Event(preferenceEvent));
}

function serverExpanded() { return false; }

function isCompactMenu() { return window.matchMedia(compactMenuQuery).matches; }

function subscribeCompactMenu(callback: () => void) {
  const query = window.matchMedia(compactMenuQuery);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}

function MenuIcon({ name }: { name: Icon }) {
  const paths = {
    reports: <><path d="M6 3h8l4 4v14H6zM14 3v5h4" /><path d="M9 12h6m-6 4h6" /></>,
    approvals: <><path d="m3 6 1.5 1.5L7 5m-4 7 1.5 1.5L7 11m-4 7 1.5 1.5L7 17M11 6h10m-10 6h10m-10 6h10" /></>,
    settings: <><circle cx="12" cy="12" r="3" /><path d="M20 14.8v-5.6l-2.4-.4a6.4 6.4 0 0 0-.8-1.4l.8-2.3-4.9-2.8-1.6 1.8a6.8 6.8 0 0 0-1.6 0L8 2.3 3.1 5.1l.8 2.3a6.4 6.4 0 0 0-.8 1.4l-2.4.4v5.6l2.4.4a6.4 6.4 0 0 0 .8 1.4l-.8 2.3L8 21.7l1.5-1.8a6.8 6.8 0 0 0 1.6 0l1.6 1.8 4.9-2.8-.8-2.3a6.4 6.4 0 0 0 .8-1.4z" transform="translate(1.65 0) scale(.96 1)" /></>,
    collapse: <path d="m12 7-5 5 5 5m6-10-5 5 5 5" />,
    expand: <path d="m6 7 5 5-5 5m6-10 5 5-5 5" />,
    logout: <path d="M12 4H5v16h7m-3-8h12m-4-4 4 4-4 4" />,
  };
  return <svg aria-hidden="true" className="inepadIcon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function WorkspaceShell({ active, children }: { active: MenuItem; children: ReactNode }) {
  const router = useRouter();
  const [account, setAccount] = useState<{ email: string } | null>(null);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const desktopExpanded = useSyncExternalStore(subscribeExpanded, readExpanded, serverExpanded);
  const compactMenu = useSyncExternalStore(subscribeCompactMenu, isCompactMenu, serverExpanded);
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const expanded = compactMenu ? mobileExpanded : desktopExpanded;

  useEffect(() => {
    const client = createClient();
    const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
      setAccount(session?.user ? { email: session.user.email ?? "Minha conta" } : null);
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!compactMenu || !expanded) return;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !event.defaultPrevented) {
        setMobileExpanded(false);
        toggleRef.current?.focus();
      }
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [compactMenu, expanded]);

  async function signOut() {
    setLogoutError("");
    setLogoutPending(true);
    try {
      const { error } = await createClient().auth.signOut({ scope: "local" });
      if (error) throw error;
      router.replace("/login");
    } catch {
      setLogoutError("Não foi possível sair. Tente novamente.");
    } finally {
      setLogoutPending(false);
    }
  }

  return (
    <div className={account ? "inepadApp" : undefined} data-menu-expanded={account ? expanded : undefined}>
      {account ? (
        <>
          {(!compactMenu || !expanded) && <a className="inepadSkipLink" href="#area-de-trabalho">Ir para o conteúdo</a>}
          {compactMenu && expanded && <button className="inepadMenuBackdrop" tabIndex={-1} aria-label="Fechar menu principal" onClick={() => { setMobileExpanded(false); toggleRef.current?.focus(); }} />}
          <aside className="inepadRail" aria-label="Navegação do sistema">
            <div className="inepadRailBrand">
              <Link href="/relatorios" aria-label="INEPAD Reembolso — Relatórios" className="inepadRailHome">
                <Image className="inepadLogoSymbol" src="/inepad-reembolso/simbolo.svg" width={38} height={38} alt="" unoptimized />
                <Image className="inepadLogoFull" src="/inepad-reembolso/logo.svg" width={128} height={55} alt="" unoptimized />
              </Link>
              <button ref={toggleRef} type="button" className="inepadRailToggle" onClick={() => compactMenu ? setMobileExpanded(!expanded) : setExpanded(!expanded)} aria-expanded={expanded} aria-controls="menu-inepad" aria-label={expanded ? "Recolher menu principal" : "Expandir menu principal"} title={expanded ? "Recolher menu principal" : "Expandir menu principal"}>
                <MenuIcon name={expanded ? "collapse" : "expand"} />
              </button>
            </div>
            <p className="inepadRailCaption">Área de trabalho</p>
            <nav id="menu-inepad" className="inepadMainMenu" aria-label="Menu principal">
              {mainMenu.map((item) => (
                <Link key={item.href} href={item.href} aria-current={active.href === item.href ? "page" : undefined} aria-label={item.title} title={expanded ? undefined : item.title} onClick={() => {
                  if (compactMenu) setMobileExpanded(false);
                }}>
                  <MenuIcon name={item.icon} /><span>{item.title}</span>
                </Link>
              ))}
            </nav>
          </aside>
        </>
      ) : null}
      <div className={account ? "inepadFrame" : undefined} inert={!!account && compactMenu && expanded}>
        {account && <header className="inepadHeader">
          <div className="inepadHeaderCrumb">
            <span>Área de trabalho</span><span aria-hidden="true">/</span><strong>{active.title}</strong>
          </div>
          <div className="inepadAccount">
            <Link href="/configuracoes?secao=meus-dados" className="inepadAccountLink" aria-label="Meus dados" title={account.email}>
              <span className="inepadAccountAvatar" aria-hidden="true">{account.email.slice(0, 1).toUpperCase()}</span>
              <span className="inepadAccountEmail">{account.email}</span>
            </Link>
            <button className="inepadLogout" type="button" disabled={logoutPending} onClick={signOut} aria-label="Sair do sistema"><MenuIcon name="logout" /><span>{logoutPending ? "Saindo…" : "Sair"}</span></button>
          </div>
          {logoutError && <p className="inepadHeaderError" role="alert">{logoutError}</p>}
        </header>}
        <div id="area-de-trabalho" tabIndex={-1} className={account ? "inepadWorkspace" : undefined}>{children}</div>
      </div>
    </div>
  );
}

export function AppChrome({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const active = mainMenu.find(({ href }) => pathname === href || pathname?.startsWith(`${href}/`));
  return active ? <WorkspaceShell active={active}>{children}</WorkspaceShell> : children;
}
