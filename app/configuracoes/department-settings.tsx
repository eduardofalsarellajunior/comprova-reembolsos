"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { supabase } from "@/lib/workspace-browser";
import styles from "./department-settings.module.css";
import SettingsIcon from "./settings-icon";

type Department = { id: string; name: string };
type JobTitle = { id: string; department_id: string; name: string };
type Directory = { departments: Department[]; jobTitles: JobTitle[] };
type DatabaseError = { code?: string; message?: string };
type Editor = { kind: "department" | "job"; id?: string; departmentId?: string; name: string };
type Notice = { message: string; error?: boolean };

type Props = {
  companyId: string;
  canManage: boolean;
  companyName?: string;
  legalName?: string;
  companyPicker?: ReactNode;
};

const compareNames = new Intl.Collator("pt-BR", { sensitivity: "base", numeric: true }).compare;
const directoryTemplate = new Map([["administrativo", 8], ["comercial", 6], ["operações", 9]]);
const maxNameLength = 120;

async function fetchDirectory(companyId: string, signal?: AbortSignal): Promise<Directory> {
  function withSignal<T extends { abortSignal(signal: AbortSignal): T }>(query: T) {
    return signal ? query.abortSignal(signal) : query;
  }
  const [departments, jobTitles] = await Promise.all([
    withSignal(supabase.from("departments").select("id,name").eq("company_id", companyId)),
    withSignal(supabase.from("job_titles").select("id,department_id,name").eq("company_id", companyId)),
  ]);
  if (departments.error || jobTitles.error) {
    const code = departments.error?.code ?? jobTitles.error?.code;
    throw new Error(code === "42P01" || code === "PGRST205"
      ? "O cadastro de departamentos ainda não foi disponibilizado neste ambiente."
      : "Não foi possível carregar departamentos e cargos.");
  }
  return {
    departments: ((departments.data ?? []) as Department[]).sort((a, b) => compareNames(a.name, b.name)),
    jobTitles: ((jobTitles.data ?? []) as JobTitle[]).sort((a, b) => compareNames(a.name, b.name)),
  };
}

function errorMessage(error: unknown, action: "save" | "delete" | "import", kind?: Editor["kind"]) {
  const failure = error as DatabaseError | null;
  if (failure?.code === "23505") {
    return kind === "department"
      ? "Já existe um departamento com esse nome na empresa."
      : "Já existe um cargo com esse nome neste departamento.";
  }
  if (action === "delete" && failure?.code === "23503") {
    return kind === "department"
      ? "Há membros vinculados a este departamento. Altere o vínculo deles antes de excluir."
      : "Há membros vinculados a este cargo. Altere o cargo deles antes de excluir.";
  }
  if (failure?.code === "42501") return "Você não tem permissão para alterar este cadastro.";
  return action === "delete" ? "Não foi possível excluir este cadastro. Verifique se ele ainda existe e se você tem permissão."
    : action === "import" ? "Não foi possível carregar o modelo INEPAD. Atualize a lista e tente novamente."
    : "Não foi possível salvar este cadastro. Verifique se você tem permissão e tente novamente.";
}

function DirectoryNameForm({ editor, busy, onSave, onCancel }: {
  editor: Editor;
  busy: boolean;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(editor.name);
  const field = useRef<HTMLInputElement>(null);
  const label = editor.kind === "department" ? "Nome do departamento" : "Nome do cargo";
  useEffect(() => { field.current?.focus(); }, []);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (name.trim() && !busy) onSave(name.trim());
  }
  return (
    <form className={styles.editor} onSubmit={submit}>
      <label>
        <span>{label}</span>
        <input ref={field} value={name} onChange={(event) => setName(event.target.value)} maxLength={maxNameLength} required disabled={busy} />
      </label>
      <div className={styles.actions}>
        <button type="button" className={styles.button} onClick={onCancel} disabled={busy}>Cancelar</button>
        <button type="submit" className={styles.primary} disabled={busy || !name.trim()}>{busy ? "Salvando…" : "Salvar"}</button>
      </div>
    </form>
  );
}

function DirectoryPanel({ companyId, canManage, companyName, legalName, companyPicker }: Props) {
  const [directory, setDirectory] = useState<Directory | null>(null);
  const [loadError, setLoadError] = useState("");
  const [notice, setNotice] = useState<Notice | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null);
  const [busy, setBusy] = useState(false);
  const jobsByDepartment = useMemo(() => {
    const groups = new Map<string, JobTitle[]>();
    for (const job of directory?.jobTitles ?? []) {
      const jobs = groups.get(job.department_id);
      if (jobs) jobs.push(job);
      else groups.set(job.department_id, [job]);
    }
    return groups;
  }, [directory]);
  const matchesInepad = /\binepad\b/i.test((companyName ?? "") + " " + (legalName ?? ""));
  const templateLoaded = directory && Array.from(directoryTemplate).every(([name, expected]) => {
    const department = directory.departments.find((item) => item.name.trim().toLocaleLowerCase("pt-BR") === name);
    return !!department && (jobsByDepartment.get(department.id)?.length ?? 0) >= expected;
  });

  useEffect(() => {
    const controller = new AbortController();
    fetchDirectory(companyId, controller.signal).then((data) => {
      if (!controller.signal.aborted) setDirectory(data);
    }).catch((error: Error) => {
      if (!controller.signal.aborted) setLoadError(error.message);
    });
    return () => controller.abort();
  }, [companyId]);

  async function reload() {
    setLoadError("");
    try { setDirectory(await fetchDirectory(companyId)); }
    catch (error) { setLoadError(error instanceof Error ? error.message : "Falha ao carregar o cadastro."); }
  }

  async function save(name: string) {
    if (!editor || busy || !canManage) return;
    setBusy(true);
    setNotice(null);
    const noun = editor.kind === "department" ? "Departamento" : "Cargo";
    const table = editor.kind === "department" ? "departments" : "job_titles";
    try {
      const payload = editor.kind === "job" ? { company_id: companyId, department_id: editor.departmentId, name }
        : { company_id: companyId, name };
      const { data, error } = editor.id
        ? await supabase.from(table).update({ name }).eq("company_id", companyId).eq("id", editor.id).select("id").maybeSingle()
        : await supabase.from(table).insert(payload).select("id").single();
      if (error || !data) throw error || new Error();
      setEditor(null);
      setNotice({ message: noun + (editor.id ? " atualizado." : " cadastrado.") });
      await reload();
    } catch (error) {
      setNotice({ message: errorMessage(error, "save", editor.kind), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function remove(kind: Editor["kind"], item: Department, jobCount = 0) {
    if (busy || !canManage) return;
    const detail = kind === "department" && jobCount
      ? " Isso também excluirá " + jobCount + (jobCount === 1 ? " cargo desse departamento." : " cargos desse departamento.")
      : "";
    if (!window.confirm('Excluir "' + item.name + '"?' + detail)) return;
    setBusy(true);
    setNotice(null);
    try {
      const table = kind === "department" ? "departments" : "job_titles";
      const { data, error } = await supabase.from(table).delete().eq("company_id", companyId).eq("id", item.id).select("id").maybeSingle();
      if (error || !data) throw error || new Error();
      setEditor(null);
      setNotice({ message: kind === "department" ? "Departamento excluído." : "Cargo excluído." });
      await reload();
    } catch (error) {
      setNotice({ message: errorMessage(error, "delete", kind), error: true });
    } finally {
      setBusy(false);
    }
  }

  async function importTemplate() {
    if (!canManage || !matchesInepad || busy) return;
    if (!window.confirm("Adicionar ao cadastro o modelo INEPAD com 3 departamentos e 23 cargos? Os registros existentes serão mantidos.")) return;
    setBusy(true);
    setNotice(null);
    try {
      const { data, error } = await supabase.rpc<{ departments: number; job_titles: number }>("seed_inepad_departments", { p_company_id: companyId });
      if (error) throw error;
      const departments = data?.departments ?? 0;
      const jobTitles = data?.job_titles ?? 0;
      setNotice({ message: departments || jobTitles
        ? "Modelo INEPAD carregado: " + departments + " departamento(s) e " + jobTitles + " cargo(s) incluído(s)."
        : "O modelo INEPAD já está cadastrado." });
      await reload();
    } catch (error) {
      setNotice({ message: errorMessage(error, "import"), error: true });
    } finally {
      setBusy(false);
    }
  }

  const closeEditor = () => setEditor(null);
  return (
    <div className={styles.panel} aria-busy={busy || (!directory && !loadError)}>
      <header className="settingsHeading">
        <h1 id="settings-title">Departamentos e cargos</h1>
        {canManage && directory && !loadError && (
          <div className={styles.headerActions}>
            {matchesInepad && !templateLoaded && (
              <button className={styles.button} onClick={() => void importTemplate()} disabled={busy}>Carregar modelo INEPAD</button>
            )}
            <button className={styles.primary} onClick={() => { setNotice(null); setEditor({ kind: "department", name: "" }); }} disabled={busy}>
              <SettingsIcon name="plus" size={16} /> Novo departamento
            </button>
          </div>
        )}
      </header>
      <div className={styles.body}>
      {companyPicker && <div className={styles.companyContext}>{companyPicker}</div>}
      {notice && <p role={notice.error ? "alert" : "status"} className={notice.error ? styles.error : styles.notice}>{notice.message}</p>}
      {loadError ? (
        <div className={styles.empty}>
          <p role="alert">{loadError}</p>
          <button className={styles.button} onClick={() => void reload()}>Tentar novamente</button>
        </div>
      ) : !directory ? <p className={styles.empty} role="status">Carregando departamentos…</p> : (
        <>
          {canManage && editor?.kind === "department" && !editor.id && (
            <DirectoryNameForm key="new-department" editor={editor} busy={busy} onSave={(name) => void save(name)} onCancel={closeEditor} />
          )}
          {!directory.departments.length ? (
            <p className={styles.empty}>Nenhum departamento cadastrado.{canManage ? " Use Novo departamento para começar." : ""}</p>
          ) : (
            <div className={styles.directory}>
              <div className={styles.columnTitle}>Nome</div>
              {directory.departments.map((department) => {
                const jobs = jobsByDepartment.get(department.id) ?? [];
                return (
                  <section key={department.id} className={styles.department} aria-labelledby={"department-" + department.id}>
                    <div className={styles.departmentBar}>
                      <h2 id={"department-" + department.id}>{department.name}</h2>
                      {canManage && (
                        <div className={styles.actions}>
                          <button className={styles.edit} aria-label={"Editar departamento " + department.name} onClick={() => { setNotice(null); setEditor({ kind: "department", id: department.id, name: department.name }); }} disabled={busy}><SettingsIcon name="pencil" size={14} /> Editar</button>
                          <button className={styles.addJob} onClick={() => { setNotice(null); setEditor({ kind: "job", departmentId: department.id, name: "" }); }} disabled={busy}><SettingsIcon name="plus" size={14} /> Novo cargo em “{department.name}”</button>
                          <button className={styles.danger} aria-label={"Excluir departamento " + department.name} onClick={() => void remove("department", department, jobs.length)} disabled={busy}><SettingsIcon name="close" size={14} /> Excluir</button>
                        </div>
                      )}
                    </div>
                    {canManage && editor?.kind === "department" && editor.id === department.id && (
                      <DirectoryNameForm key={department.id} editor={editor} busy={busy} onSave={(name) => void save(name)} onCancel={closeEditor} />
                    )}
                    <div className={styles.jobs}>
                      <h3>Cargos <span>{jobs.length}</span></h3>
                      {canManage && editor?.kind === "job" && editor.departmentId === department.id && !editor.id && (
                        <DirectoryNameForm key={"new-job-" + department.id} editor={editor} busy={busy} onSave={(name) => void save(name)} onCancel={closeEditor} />
                      )}
                      {jobs.length ? (
                        <ul className={styles.jobList}>
                          {jobs.map((job) => (
                            <li key={job.id}>
                              <div className={styles.jobRow}>
                                <span>{job.name}</span>
                                {canManage && (
                                  <div className={styles.actions}>
                                    <button className={styles.edit} aria-label={"Editar cargo " + job.name + " em " + department.name} onClick={() => { setNotice(null); setEditor({ kind: "job", id: job.id, departmentId: department.id, name: job.name }); }} disabled={busy}><SettingsIcon name="pencil" size={14} /> Editar</button>
                                    <button className={styles.danger} aria-label={"Excluir cargo " + job.name + " em " + department.name} onClick={() => void remove("job", job)} disabled={busy}><SettingsIcon name="close" size={14} /> Excluir</button>
                                  </div>
                                )}
                              </div>
                              {canManage && editor?.kind === "job" && editor.id === job.id && (
                                <DirectoryNameForm key={job.id} editor={editor} busy={busy} onSave={(name) => void save(name)} onCancel={closeEditor} />
                              )}
                            </li>
                          ))}
                        </ul>
                      ) : <p className={styles.noJobs}>Nenhum cargo cadastrado neste departamento.</p>}
                    </div>
                  </section>
                );
              })}
            </div>
          )}
        </>
      )}
      </div>
    </div>
  );
}

export default function DepartmentSettings(props: Props) {
  return <DirectoryPanel key={props.companyId} {...props} />;
}
