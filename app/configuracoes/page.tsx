import { Suspense } from "react";
import SettingsWorkspace from "./settings-workspace";

export default function SettingsPage() {
  return <Suspense fallback={<main className="authShell"><div className="authCard">Carregando configurações…</div></main>}>
    <SettingsWorkspace />
  </Suspense>;
}
