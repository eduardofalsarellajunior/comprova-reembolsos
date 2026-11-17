"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/workspace-browser";
import styles from "./project-settings.module.css";

type Project = { id: string; name: string; code: string; description: string; active: boolean };
type ProjectMember = { project_id: string; member_id: string };
type ApprovalLink = { requester_member_id: string; approver_member_id: string; position: number };
export type LinkMember = { id: string; email: string; role: string; active: boolean; user_id?: string | null; display_name?: string | null };
type ProjectDraft = Omit<Project, "id"> & { id?: string };

const blankProject: ProjectDraft = { name: "", code: "", description: "", active: true };
const projectSteps = ["Informações", "Membros", "Resumo"];
const projectColumns = "id,name,code,description,active";
const shortName = (member: LinkMember) => member.display_name?.trim() || member.email;
const fold = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("pt-BR").trim();
const mayApprove = (member?: LinkMember) => member?.active === true && ["admin", "approver"].includes(member.role);
const changeSelection = (current: string[], id: string, checked: boolean) => checked
  ? current.includes(id) ? current : [...current, id]
  : current.filter((value) => value !== id);

function useProjectDirectory(companyId: string, memberId?: string) {
  const [snapshot, setSnapshot] = useState<{ companyId?: string; memberId?: string; revision: number; projects: Project[]; links: ProjectMember[]; error: string }>({ revision: -1, projects: [], links: [], error: "" });
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    let live = true;
    const projectQuery = supabase.from("projects").select(projectColumns).eq("company_id", companyId).order("name");
    const links = supabase.from("project_members").select("project_id,member_id").eq("company_id", companyId);
    void Promise.all([projectQuery, memberId ? links.eq("member_id", memberId) : links]).then(([projects, membership]) => {
      if (!live) return;
      setSnapshot({
        companyId, memberId, revision, projects: projects.data || [], links: membership.data || [],
        error: projects.error || membership.error ? "Não foi possível carregar projetos e membros." : "",
      });
    }).catch(() => {
      if (live) setSnapshot({ companyId, memberId, revision, projects: [], links: [], error: "Não foi possível carregar projetos e membros." });
    });
    return () => { live = false; };
  }, [companyId, memberId, revision]);
  const loading = snapshot.companyId !== companyId || snapshot.memberId !== memberId || snapshot.revision !== revision;
  return { projects: loading ? [] : snapshot.projects, links: loading ? [] : snapshot.links, error: loading ? "" : snapshot.error,
    loading, reload: () => setRevision((x) => x + 1) };
}

function ProjectEditor({ companyId, initial, members, selected, close, finish }: {
  companyId: string; initial: ProjectDraft; members: LinkMember[]; selected: string[]; close: () => void; finish: (active: boolean) => void;
}) {
  const modal = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(initial);
  const [selectedIds, setSelectedIds] = useState(selected);
  const [query, setQuery] = useState("");
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const searchableMembers = members.filter((member) => member.active || selected.includes(member.id))
    .sort((left, right) => shortName(left).localeCompare(shortName(right), "pt-BR"));
  const visibleMembers = searchableMembers.filter((member) => fold(shortName(member) + " " + member.email).includes(fold(query)));
  const allVisible = visibleMembers.length > 0 && visibleMembers.every((member) => selectedIds.includes(member.id));

  useEffect(() => {
    const dialog = modal.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  function toggleVisible() {
    const ids = new Set(visibleMembers.map((member) => member.id));
    setSelectedIds((current) => allVisible ? current.filter((id) => !ids.has(id)) : [...new Set([...current, ...ids])]);
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error: problem } = await supabase.rpc("save_managed_project", {
        p_company_id: companyId, p_project_id: draft.id || null, p_name: draft.name, p_code: draft.code,
        p_description: draft.description, p_active: draft.active, p_member_ids: selectedIds,
      });
      if (problem) throw problem;
      finish(draft.active);
    } catch (problem) {
      setError(problem && typeof problem === "object" && "message" in problem ? String(problem.message) : "Não foi possível salvar o projeto.");
    } finally { setBusy(false); }
  }

  return <dialog
    ref={modal} className={styles.dialog} aria-labelledby="project-editor-title"
    onCancel={(event) => { event.preventDefault(); if (!busy) close(); }}
  >
    <header className={styles.heading}>
      <h2 id="project-editor-title">{draft.id ? "Editar projeto" : "Novo projeto"}</h2>
      <button type="button" onClick={close} disabled={busy} aria-label="Fechar editor de projeto">×</button>
    </header>
    <ol className={styles.steps} aria-label="Etapas do cadastro">
      {projectSteps.map((name, index) => <li key={name} aria-current={step === index ? "step" : undefined}>
        <span aria-hidden="true">{index < step ? "✓" : index + 1}</span>{name}
      </li>)}
    </ol>
    <form onSubmit={(event) => {
      event.preventDefault();
      if (step === 2) void save();
      else if (draft.name.trim()) setStep((value) => value + 1);
    }}>
      {step === 0 && <div className={styles.fields}>
        <label>Nome do projeto<input required maxLength={160} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></label>
        <label>Código (opcional)<input maxLength={60} value={draft.code} onChange={(e) => setDraft({ ...draft, code: e.target.value })} /></label>
        <label>Descrição (opcional)<textarea rows={3} maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
        <label className={styles.check}><input type="checkbox" checked={draft.active} onChange={(e) => setDraft({ ...draft, active: e.target.checked })} /> Projeto ativo</label>
      </div>}
      {step === 1 && <div className={styles.fields}>
        <p>Selecione os membros que poderão usar este projeto nos relatórios.</p>
        <label>Pesquisar membros<input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Pesquisar por nome ou e-mail" /></label>
        <label className={styles.check}><input type="checkbox" checked={allVisible} disabled={!visibleMembers.length} onChange={toggleVisible} />
          Selecionar {query.trim() ? "resultados" : "todos"} ({selectedIds.length}/{searchableMembers.length})
        </label>
        <div className={styles.checkList}>
          {visibleMembers.map((member) => <label className={styles.check} key={member.id}><input type="checkbox" checked={selectedIds.includes(member.id)}
            onChange={(e) => setSelectedIds((current) => changeSelection(current, member.id, e.target.checked))} />
            <span>{shortName(member)}{!member.active && " (inativo)"}</span>
          </label>)}
        </div>
        {!visibleMembers.length && <p className="muted">Nenhum membro encontrado.</p>}
      </div>}
      {step === 2 && <div className={styles.fields}>
        <dl className={styles.summary}>
          <div><dt>Projeto</dt><dd>{draft.name.trim()}</dd></div>
          <div><dt>Situação</dt><dd>{draft.active ? "Ativo" : "Inativo"}</dd></div>
          <div><dt>Código</dt><dd>{draft.code.trim() || "—"}</dd></div>
          <div><dt>Membros</dt><dd>{selectedIds.length}</dd></div>
        </dl>
        {draft.description && <p>{draft.description}</p>}
        <ul className={styles.names}>{searchableMembers.filter((member) => selectedIds.includes(member.id)).map((member) => <li key={member.id}>{shortName(member)}</li>)}</ul>
        {!selectedIds.length && <p className="muted">Sem membros vinculados, ninguém poderá usar o projeto em novos relatórios.</p>}
      </div>}
      {error && <p role="alert" className={styles.error}>{error}</p>}
      <footer className={styles.footer}>
        <button type="button" className="settingsButton" disabled={busy} onClick={() => step === 0 ? close() : setStep((value) => value - 1)}>{step === 0 ? "Cancelar" : "Voltar"}</button>
        <button type="submit" className="dark" disabled={busy || !draft.name.trim()}>{busy ? "Salvando…" : step === 2 ? "Salvar projeto" : "Próximo"}</button>
      </footer>
    </form>
  </dialog>;
}

export function ProjectSettings({ companyId, members, onChanged }: { companyId: string; members: LinkMember[]; onChanged?: () => void }) {
  const { projects, links, error, loading, reload } = useProjectDirectory(companyId);
  const [activeTab, setActiveTab] = useState(true);
  const [search, setSearch] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<ProjectDraft | null>(null);
  const projectCount = new Map<string, number>();
  for (const item of links) projectCount.set(item.project_id, (projectCount.get(item.project_id) || 0) + 1);
  const visible = projects.filter((project) => project.active === activeTab && fold(project.name + " " + project.code).includes(fold(search)));
  return <section className={`reportCard ${styles.panel}`}>
    <div className={styles.heading}>
      <p className="muted">Cadastre projetos e vincule quem pode usá-los em novos relatórios.</p>
      <button type="button" className="dark" onClick={() => setEditing({ ...blankProject, active: true })} disabled={loading || !!error}>+ Novo projeto</button>
    </div>
    <div role="group" aria-label="Situação dos projetos" className={styles.filters}>
      {[true, false].map((active) => <button type="button" key={String(active)} aria-pressed={activeTab === active} onClick={() => setActiveTab(active)}>
        {active ? "Projetos ativos" : "Projetos inativos"} <span>{projects.filter((project) => project.active === active).length}</span>
      </button>)}
    </div>
    <label className={styles.search}>Pesquisar projetos<input type="search" placeholder="Nome ou código do projeto" value={search} onChange={(event) => setSearch(event.target.value)} /></label>
    {loading && <p className="muted" role="status">Carregando projetos…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {notice && <p role="status" className={styles.notice}>{notice}</p>}
    {!!visible.length && <div className={styles.tableScroll}>
      <table className={styles.table}><thead><tr><th>Nome</th><th>Membros</th><th>Ações</th></tr></thead>
        <tbody>{visible.map((project) => <tr key={project.id}><td>
          <strong>{project.name}</strong>{project.code && <small>Código: {project.code}</small>}
        </td><td>{projectCount.get(project.id) || 0}</td>
          <td><button className="settingsButton" type="button" disabled={!!error} onClick={() => setEditing(project)} aria-label={`Editar ${project.name}`}>Editar</button></td></tr>)}</tbody>
      </table>
    </div>}
    {!loading && !error && !visible.length && <p className="muted">{search ? "Nenhum projeto encontrado." : activeTab ? "Nenhum projeto ativo." : "Nenhum projeto inativo."}</p>}
    {editing && <ProjectEditor companyId={companyId} initial={editing} members={members} selected={links.filter((item) => item.project_id === editing.id).map((item) => item.member_id)}
      close={() => setEditing(null)} finish={(active) => {
        setEditing(null); setActiveTab(active); setSearch(""); reload(); setNotice("Projeto salvo."); onChanged?.();
      }} />}
  </section>;
}
export default ProjectSettings;

export function MemberProjectLinks({ companyId, memberId, editable = false }: { companyId: string; memberId: string; editable?: boolean }) {
  const { projects, links, error, loading, reload } = useProjectDirectory(companyId, memberId);
  const [draft, setDraft] = useState<string[] | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const ids = draft || links.map((link) => link.project_id);
  const list = projects.filter((project) => ids.includes(project.id) || (editable && project.active));
  async function save() {
    if (!editable || loading || saving || !draft) return;
    setSaving(true); setNotice("");
    try {
      const { error } = await supabase.rpc("set_member_projects", { p_company_id: companyId, p_member_id: memberId, p_project_ids: ids });
      if (error) throw error;
      setNotice("Projetos vinculados."); reload(); setDraft(null);
    } catch { setNotice("Não foi possível alterar os projetos vinculados."); } finally { setSaving(false); }
  }
  return <section className={styles.memberSection}>
    <h3>Projetos vinculados</h3>
    {loading && <p className="muted">Carregando projetos…</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    {!loading && !error && !list.length && <p className="muted">Sem projetos disponíveis.</p>}
    <div className={styles.checkList}>{list.map((project) => <label className={styles.check} key={project.id}><input type="checkbox" disabled={!editable || saving}
      checked={ids.includes(project.id)} onChange={(e) => setDraft(changeSelection(ids, project.id, e.target.checked))} />
      <span>{project.name}{!project.active && " (inativo)"}</span>
    </label>)}</div>
    {editable && <button type="button" className="settingsButton" onClick={save} disabled={saving || loading || !!error || !draft}>Salvar projetos vinculados</button>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}

export function MemberApprovalLinks({ companyId, members, memberId, editable = false }: {
  companyId: string; members: LinkMember[]; memberId: string; editable?: boolean;
}) {
  const [snapshot, setSnapshot] = useState<{ key: string; rows: ApprovalLink[]; error: boolean }>({ key: "", rows: [], error: false });
  const [draft, setDraft] = useState<{ approvers: string[]; requesters: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState("");
  const key = `${companyId}:${memberId}`;
  const loading = snapshot.key !== key;
  const currentMember = members.find((member) => member.id === memberId);
  const canApprove = mayApprove(currentMember);
  const current = {
    approvers: snapshot.rows.filter((row) => row.requester_member_id === memberId).sort((a, b) => a.position - b.position).map((row) => row.approver_member_id),
    requesters: snapshot.rows.filter((row) => row.approver_member_id === memberId).map((row) => row.requester_member_id),
  };
  const value = draft || current;
  const otherMembers = members.filter((item) => item.id !== memberId && (!currentMember?.user_id || item.user_id !== currentMember.user_id))
    .sort((a, b) => shortName(a).localeCompare(shortName(b), "pt-BR"));
  const memberById = new Map(members.map((item) => [item.id, item]));

  useEffect(() => {
    let live = true;
    async function load() {
      try {
        const { data, error } = await supabase.from("member_approvers").select("requester_member_id,approver_member_id,position").eq("company_id", companyId)
          .or(`requester_member_id.eq.${memberId},approver_member_id.eq.${memberId}`);
        if (live) setSnapshot({ key, rows: data || [], error: !!error });
      } catch { if (live) setSnapshot({ key, rows: [], error: true }); }
    }
    void load();
    return () => { live = false; };
  }, [key, companyId, memberId]);

  function move(from: number, to: number) {
    if (to < 0 || to >= value.approvers.length) return;
    const approvers = [...value.approvers];
    [approvers[from], approvers[to]] = [approvers[to], approvers[from]];
    setDraft({ ...value, approvers });
  }
  async function save() {
    if (!editable || !draft || saving || loading || snapshot.error) return;
    setSaving(true); setNotice("");
    try {
      const args = {
        p_company_id: companyId, p_member_id: memberId, p_approver_ids: value.approvers,
        p_requester_ids: value.requesters,
      };
      const { error } = await supabase.rpc("set_member_approvers", args);
      if (error) throw error;
      setSnapshot({ key, error: false, rows: [...value.approvers.map((id, position) => ({
        requester_member_id: memberId, approver_member_id: id, position: position + 1,
      })), ...value.requesters.map((id) => ({ requester_member_id: id, approver_member_id: memberId, position: 1 }))] });
      setDraft(null); setNotice("Vínculos de aprovação salvos.");
    } catch (problem) {
      setNotice(problem && typeof problem === "object" && "message" in problem ? String(problem.message) : "Não foi possível salvar os vínculos de aprovação.");
    } finally { setSaving(false); }
  }

  return <section className={styles.memberSection}>
    <h3>Permissões de aprovação</h3>
    <p className="muted">Os novos relatórios seguem a ordem configurada. A aprovação em andamento mantém as etapas do envio.</p>
    {loading && <p className="muted">Carregando aprovadores…</p>}
    {!loading && snapshot.error && <p role="alert" className={styles.error}>Não foi possível carregar os vínculos.</p>}
    {!loading && !snapshot.error && <div className={styles.approvalGrid}>
      <div>
        <h4>Quem aprova os relatórios deste membro</h4>
        {!value.approvers.length && <p className="muted">Nenhum aprovador atribuído.</p>}
        <ol className={styles.approvalOrder}>{value.approvers.map((id, index) => {
          const member = memberById.get(id);
          return <li key={id}><span>{member ? shortName(member) : "Membro"}{!mayApprove(member) ? " (não pode aprovar)" : !member?.user_id ? " (primeiro acesso pendente)" : ""}</span>
            {editable && <div>
              <button type="button" className="settingsButton" disabled={saving || index === 0} onClick={() => move(index, index - 1)} aria-label={`Subir etapa ${index + 1}`}>↑</button>
              <button type="button" className="settingsButton" disabled={saving || index === value.approvers.length - 1} onClick={() => move(index, index + 1)} aria-label={`Descer etapa ${index + 1}`}>↓</button>
              <button type="button" className="settingsButton" disabled={saving} onClick={() => setDraft({ ...value, approvers: changeSelection(value.approvers, id, false) })}>Remover</button>
            </div>}
          </li>;
        })}</ol>
        {editable && <label>Adicionar aprovador<select
          value="" disabled={saving}
          onChange={(e) => setDraft({ ...value, approvers: changeSelection(value.approvers, e.target.value, true) })}
        ><option value="" disabled>Selecione</option>{otherMembers.filter((item) => mayApprove(item) && !value.approvers.includes(item.id)).map((member) => (
          <option value={member.id} key={member.id}>{shortName(member)}{!member.user_id && " (primeiro acesso pendente)"}</option>
        ))}</select></label>}
      </div>
      <div>
        <h4>De quem este membro pode aprovar relatórios</h4>
        {!canApprove && <p className="muted">Só Administradores e Intermediários ativos podem receber novas atribuições.</p>}
        <div className={styles.checkList}>
          {otherMembers.filter((item) => value.requesters.includes(item.id) || (editable && canApprove && item.active)).map((member) => (
            <label key={member.id} className={styles.check}><input type="checkbox" checked={value.requesters.includes(member.id)} disabled={!editable || saving || (!canApprove && !value.requesters.includes(member.id))}
              onChange={(e) => setDraft({ ...value, requesters: changeSelection(value.requesters, member.id, e.target.checked) })} />{shortName(member)}{!member.active && " (inativo)"}</label>
          ))}
        </div>
        {!value.requesters.length && <p className="muted">Nenhum solicitante atribuído.</p>}
      </div>
    </div>}
    {editable && <button type="button" className="settingsButton" disabled={loading || snapshot.error || saving || !draft} onClick={save}>Salvar permissões de aprovação</button>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
