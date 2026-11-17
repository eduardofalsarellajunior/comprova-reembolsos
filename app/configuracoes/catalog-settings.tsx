"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase } from "@/lib/workspace-browser";
import styles from "./policy-settings.module.css";

type Kind = "payment_methods" | "expense_categories";
type Entry = {
  id: string;
  name: string;
  active: boolean;
  reimbursable?: boolean;
  exclusive_per_report?: boolean;
};

const editorDefaults = { id: "", name: "", reimbursable: true, exclusive: false };

async function readCatalog(companyId: string, kind: Kind) {
  const columns = kind === "payment_methods" ? "id,name,active,reimbursable,exclusive_per_report" : "id,name,active";
  const { data, error } = await supabase.from(kind).select(columns).eq("company_id", companyId).order("name");
  if (error) throw error;
  return (data ?? []) as Entry[];
}

export function ExpenseCatalogSettings({ companyId, kind }: { companyId: string; kind: Kind }) {
  const payment = kind === "payment_methods";
  const [entries, setEntries] = useState<Entry[] | null>(null);
  const [form, setForm] = useState<typeof editorDefaults | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void readCatalog(companyId, kind).then(
      (result) => { if (active) setEntries(result); },
      () => { if (active) setMessage("Não foi possível carregar este cadastro."); },
    );
    return () => { active = false; };
  }, [companyId, kind]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!form || !form.name.trim() || busy) return;
    setBusy(true);
    setMessage("");
    try {
      const record = { name: form.name.trim(), ...(payment ? { reimbursable: form.reimbursable, exclusive_per_report: form.exclusive } : {}) };
      const query = form.id
        ? supabase.from(kind).update(record).eq("id", form.id).eq("company_id", companyId)
        : supabase.from(kind).insert({ ...record, company_id: companyId });
      const { error } = await query.select("id").single();
      if (error) throw error;
      setForm(null);
      setEntries(await readCatalog(companyId, kind));
      setMessage("Cadastro salvo.");
    } catch (error) {
      const duplicate = typeof error === "object" && error !== null && "code" in error && error.code === "23505";
      setMessage(duplicate ? "Já existe um cadastro com esse nome." : "Não foi possível salvar o cadastro.");
    } finally {
      setBusy(false);
    }
  }

  async function toggle(entry: Entry) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      const { error } = await supabase.from(kind).update({ active: !entry.active }).eq("company_id", companyId).eq("id", entry.id).select("id").single();
      if (error) throw error;
      setEntries((values) => values?.map((value) => value.id === entry.id ? { ...value, active: !entry.active } : value) ?? []);
      setMessage(entry.active ? "Cadastro desativado. Os registros anteriores foram preservados." : "Cadastro ativado.");
    } catch {
      setMessage("Não foi possível alterar a situação.");
    } finally {
      setBusy(false);
    }
  }

  const visible = entries?.filter((entry) => entry.name.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR").trim()));
  return (
    <section className={`reportCard ${styles.panel}`}>
      <div className={styles.header}>
        <h2>{payment ? "Formas de pagamento" : "Tipos de despesa"}</h2>
        <button type="button" className="dark" disabled={busy || entries === null} onClick={() => setForm({ ...editorDefaults })}>
          {payment ? "Nova forma de pagamento" : "Novo tipo de despesa"}
        </button>
      </div>
      {message && <p role="status" className={styles.notice}>{message}</p>}
      {form && <form className={styles.editor} onSubmit={save}>
        <h3>{form.id ? "Editar cadastro" : "Novo cadastro"}</h3>
        <div className={styles.fields}>
          <label>Nome<input autoComplete="off" required maxLength={160} value={form.name} disabled={busy} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
          {payment && <>
            <label className={styles.check}><input type="checkbox" checked={form.reimbursable} disabled={busy} onChange={(event) => setForm({ ...form, reimbursable: event.target.checked })} /> Reembolsável</label>
            <label className={styles.check}><input type="checkbox" checked={form.exclusive} disabled={busy} onChange={(event) => setForm({ ...form, exclusive: event.target.checked })} /> Exclusiva por relatório</label>
          </>}
        </div>
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => setForm(null)}>Cancelar</button>
          <button className="dark" type="submit" disabled={busy || !form.name.trim()}>Salvar</button>
        </div>
      </form>}
      {entries === null && !message && <p className="muted">Carregando cadastro…</p>}
      {entries !== null && <>
        <label className={styles.search}>Pesquisar<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={payment ? "Buscar forma de pagamento" : "Buscar tipo de despesa"} /></label>
        <div className={styles.scroll}>
          <table className={styles.table}>
            <thead><tr><th scope="col">Nome</th>{payment && <><th scope="col">Reembolsável</th><th scope="col">Exclusiva por relatório</th></>}<th scope="col">Situação</th><th scope="col">Gerenciar</th></tr></thead>
            <tbody>{visible?.map((entry) => <tr key={entry.id}>
              <th scope="row">{entry.name}</th>
              {payment && <><td>{entry.reimbursable ? "Sim" : "Não"}</td><td>{entry.exclusive_per_report ? "Sim" : "Não"}</td></>}
              <td>{entry.active ? "Ativo" : "Inativo"}</td>
              <td><div className={styles.actions}>
                <button type="button" disabled={busy} aria-label={`Editar ${entry.name}`} onClick={() => setForm({ id: entry.id, name: entry.name, reimbursable: entry.reimbursable ?? true, exclusive: entry.exclusive_per_report ?? false })}>Editar</button>
                <button type="button" disabled={busy} aria-label={`${entry.active ? "Desativar" : "Ativar"} ${entry.name}`} onClick={() => void toggle(entry)}>{entry.active ? "Desativar" : "Ativar"}</button>
              </div></td>
            </tr>)}</tbody>
          </table>
        </div>
        {visible?.length === 0 && <p className="muted">Nenhum registro encontrado.</p>}
      </>}
    </section>
  );
}
