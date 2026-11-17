"use client";

import { useEffect, useState, type FormEvent } from "react";
import { supabase, type Member } from "@/lib/workspace-browser";
import styles from "./policy-settings.module.css";

type Person = Pick<Member, "id" | "email" | "active">;
type Link = { member_id: string; policy_id: string };
type Category = { id: string; name: string; active: boolean };
type ExpensePolicy = { id: string; name: string; is_default: boolean; past_days: number | null; future_days: number | null };
type Limit = {
  policy_id?: string;
  category_id: string;
  max_amount: number | null;
  amount_period: string;
  max_entries: number | null;
  count_period: string;
  allow_exceed: boolean;
};
type LimitInput = Omit<Limit, "max_amount" | "max_entries"> & { max_amount: string; max_entries: string };
type ExpenseData = { policies: ExpensePolicy[]; categories: Category[]; limits: Limit[]; links: Link[]; people: Person[] };
type ExpenseDraft = { id: string; name: string; default: boolean; past: string; future: string; limits: Record<string, LimitInput>; memberIds: string[] };

const periodOptions = [
  ["expense", "Por despesa"], ["day", "Dia"], ["week", "Semana"], ["month", "Mês"], ["report", "Relatório"],
] as const;
const countOptions = periodOptions.slice(1);

function checkResult<T>(result: { data: T[] | null; error: unknown }) {
  if (result.error) throw result.error;
  return result.data ?? [];
}

function readPeople(companyId: string, admin: boolean) {
  return admin
    ? supabase.from("company_members").select("id,email,active").eq("company_id", companyId).order("email")
    : Promise.resolve({ data: [] as Person[], error: null });
}

async function readExpenseData(companyId: string, admin: boolean): Promise<ExpenseData> {
  const [policies, categories, limits, links, people] = await Promise.all([
    supabase.from("expense_policy_configs").select("id,name,is_default,past_days,future_days").eq("company_id", companyId).order("is_default", { ascending: false }).order("name"),
    supabase.from("expense_categories").select("id,name,active").eq("company_id", companyId).order("name"),
    supabase.from("expense_policy_limits").select("policy_id,category_id,max_amount,amount_period,max_entries,count_period,allow_exceed").eq("company_id", companyId),
    supabase.from("expense_policy_members").select("member_id,policy_id").eq("company_id", companyId),
    readPeople(companyId, admin),
  ]);
  return {
    policies: checkResult<ExpensePolicy>(policies), categories: checkResult<Category>(categories),
    limits: checkResult<Limit>(limits), links: checkResult<Link>(links), people: checkResult<Person>(people),
  };
}

function blankLimit(categoryId: string): LimitInput {
  return { category_id: categoryId, max_amount: "", amount_period: "expense", max_entries: "", count_period: "day", allow_exceed: false };
}

function expenseDraft(data: ExpenseData, id: string): ExpenseDraft {
  const policy = data.policies.find((entry) => entry.id === id);
  return {
    id: policy?.id ?? "", name: policy?.name ?? "", default: policy?.is_default ?? !data.policies.some((entry) => entry.is_default),
    past: policy?.past_days == null ? "" : String(policy.past_days),
    future: policy?.future_days == null ? "" : String(policy.future_days),
    limits: Object.fromEntries(data.limits.filter((entry) => entry.policy_id === id).map((entry) => [entry.category_id, {
      ...entry, max_amount: entry.max_amount == null ? "" : String(entry.max_amount).replace(".", ","), max_entries: entry.max_entries == null ? "" : String(entry.max_entries),
    }])),
    memberIds: data.links.filter((link) => link.policy_id === id).map((link) => link.member_id),
  };
}

function numberInput(value: string, decimals: number, min: number, max: number, field: string): number | null {
  if (!value.trim()) return null;
  const regexp = decimals ? new RegExp(`^\\d+(?:[.,]\\d{1,${decimals}})?$`) : /^\d+$/;
  if (!regexp.test(value.trim())) throw new Error(`${field}: informe um número válido, sem separador de milhar.`);
  const parsed = Number(value.trim().replace(",", "."));
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) throw new Error(`${field}: valor fora do intervalo permitido.`);
  return parsed;
}

function databaseMessage(error: unknown, fallback: string) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "code" in error && error.code === "23505") {
    return "Nome duplicado ou membro já vinculado a outra política específica.";
  }
  return fallback;
}

function MemberChoices({ people, links, policyId, automatic, disabled, selected, onChange }: {
  people: Person[]; links: Link[]; policyId: string; automatic: boolean; disabled: boolean;
  selected: string[]; onChange: (values: string[]) => void;
}) {
  if (automatic) return <p className="muted">A política padrão é aplicada a todos que não têm uma política específica.</p>;
  const active = people.filter((member) => member.active);
  if (!active.length) return <p className="muted">Nenhum membro ativo da empresa.</p>;
  const assigned = new Set(links.filter((link) => link.policy_id !== policyId).map((link) => link.member_id));
  return <>
    <p className="muted">Cada membro pode ter uma política específica deste tipo. Ao desvincular, volta a valer a política padrão.</p>
    <div className={styles.memberList}>
      {active.map((person) => {
        const linked = assigned.has(person.id);
        return <label className={styles.check} key={person.id}>
          <input type="checkbox" disabled={disabled || linked} checked={selected.includes(person.id)} onChange={(event) => onChange(event.target.checked ? [...selected, person.id] : selected.filter((id) => id !== person.id))} />
          {person.email}{linked ? " · Outra política" : ""}
        </label>;
      })}
    </div>
  </>;
}

export function ExpensePolicySettings({ companyId, admin = false }: { companyId: string; admin?: boolean }) {
  const [data, setData] = useState<ExpenseData | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [tab, setTab] = useState<"edit" | "members">("edit");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    void readExpenseData(companyId, admin).then((loaded) => {
      if (!active) return;
      setData(loaded);
      const initial = admin ? loaded.policies[0]?.id : loaded.links[0]?.policy_id ?? loaded.policies[0]?.id;
      setDraft(expenseDraft(loaded, initial ?? ""));
    }, () => { if (active) setStatus("Não foi possível carregar as políticas de despesas."); });
    return () => { active = false; };
  }, [companyId, admin]);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin || !draft || busy) return;
    setBusy(true);
    setStatus("");
    try {
      if (draft.name.trim().length < 2) throw new Error("Informe uma descrição para a política.");
      const limits = Object.values(draft.limits).filter((row) => row.max_amount || row.max_entries || row.allow_exceed).map((row) => ({
        category_id: row.category_id,
        max_amount: numberInput(row.max_amount, 2, 0.01, 999999999999.99, "Limite de valor"),
        amount_period: row.amount_period,
        max_entries: numberInput(row.max_entries, 0, 1, 100000, "Limite de lançamentos"),
        count_period: row.count_period,
        allow_exceed: row.allow_exceed,
      }));
      const { data: policyId, error } = await supabase.rpc<string>("save_expense_policy_config", {
        p_company_id: companyId, p_policy_id: draft.id || null, p_name: draft.name.trim(), p_default: draft.default,
        p_past_days: numberInput(draft.past, 0, 0, 36500, "Dias anteriores"), p_future_days: numberInput(draft.future, 0, 0, 36500, "Dias futuros"),
        p_limits: limits, p_member_ids: draft.memberIds,
      });
      if (error) throw error;
      const loaded = await readExpenseData(companyId, admin);
      setData(loaded);
      setDraft(expenseDraft(loaded, policyId));
      setStatus("Política de despesas salva.");
    } catch (error) {
      setStatus(databaseMessage(error, "Não foi possível salvar a política de despesas."));
    } finally {
      setBusy(false);
    }
  }

  function setLimit(categoryId: string, patch: Partial<LimitInput>) {
    setDraft((form) => form && ({ ...form, limits: { ...form.limits, [categoryId]: { ...(form.limits[categoryId] ?? blankLimit(categoryId)), ...patch } } }));
  }

  return <section className={`reportCard ${styles.panel}`}>
    <div className={styles.header}><h2>Políticas de despesas</h2>{admin && data && <button className="dark" type="button" disabled={busy} onClick={() => { setDraft(expenseDraft(data, "")); setTab("edit"); }}>Nova política</button>}</div>
    {status && <p className={styles.notice} role="status">{status}</p>}
    {!data && !status && <p className="muted">Carregando políticas de despesas…</p>}
    {data && draft && (admin || draft.id) && <>
      <label className={styles.search}>Política
        <select value={draft.id} disabled={busy} onChange={(event) => { setDraft(expenseDraft(data, event.target.value)); setStatus(""); }}>
          {admin && <option value="">Nova política</option>}
          {data.policies.map((entry) => <option value={entry.id} key={entry.id}>{entry.name}{entry.is_default ? " (padrão)" : ""}</option>)}
        </select>
      </label>
      {admin && <div className={styles.tabs}>
        <button type="button" aria-pressed={tab === "edit"} onClick={() => setTab("edit")}>Editar</button>
        <button type="button" aria-pressed={tab === "members"} onClick={() => setTab("members")}>Membros vinculados</button>
      </div>}
      <form onSubmit={save} className={styles.editor}>
        {tab === "members" && admin ? <MemberChoices people={data.people} links={data.links} policyId={draft.id} automatic={draft.default} disabled={busy}
          selected={draft.memberIds} onChange={(values) => setDraft({ ...draft, memberIds: values })} /> : <>
          <div className={styles.fields}>
            <label>Descrição<input disabled={!admin || busy} required minLength={2} maxLength={160} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
            <label>Limite máximo de dias passados<input disabled={!admin || busy} type="number" min="0" max="36500" step="1" placeholder="Sem limite" value={draft.past} onChange={(event) => setDraft({ ...draft, past: event.target.value })} /></label>
            <label>Limite máximo de dias futuros<input disabled={!admin || busy} type="number" min="0" max="36500" step="1" placeholder="Sem limite" value={draft.future} onChange={(event) => setDraft({ ...draft, future: event.target.value })} /></label>
          </div>
          <p className="muted">Regras em Real (R$). O período usa a data da despesa. Em branco não há limite.</p>
          <div className={styles.scroll}><table className={styles.table}>
            <thead><tr><th scope="col">Tipo de despesa</th><th scope="col">Limite de valor</th><th scope="col">Limite de lançamentos</th><th scope="col">Permite ultrapassar limites</th></tr></thead>
            <tbody>{data.categories.filter((item) => item.active || draft.limits[item.id]).map((category) => {
              const limit = draft.limits[category.id] ?? blankLimit(category.id);
              return <tr key={category.id}>
                <th scope="row">{category.name}{category.active ? "" : " (inativo)"}</th>
                <td className={styles.limitCell}>
                  <input aria-label={`Valor máximo: ${category.name}`} placeholder="Sem limite" inputMode="decimal" disabled={!admin || busy} value={limit.max_amount} onChange={(event) => setLimit(category.id, { max_amount: event.target.value })} />
                  <select aria-label={`Período do valor: ${category.name}`} disabled={!admin || busy} value={limit.amount_period} onChange={(event) => setLimit(category.id, { amount_period: event.target.value })}>
                    {periodOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </td>
                <td className={styles.limitCell}>
                  <input aria-label={`Máximo de lançamentos: ${category.name}`} placeholder="Livre" inputMode="numeric" disabled={!admin || busy} value={limit.max_entries} onChange={(event) => setLimit(category.id, { max_entries: event.target.value })} />
                  <select aria-label={`Período dos lançamentos: ${category.name}`} disabled={!admin || busy} value={limit.count_period} onChange={(event) => setLimit(category.id, { count_period: event.target.value })}>
                    {countOptions.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                </td>
                <td><select aria-label={`Ultrapassar limites: ${category.name}`} value={limit.allow_exceed ? "yes" : "no"} disabled={!admin || busy} onChange={(event) => setLimit(category.id, { allow_exceed: event.target.value === "yes" })}><option value="no">Não</option><option value="yes">Sim</option></select></td>
              </tr>;
            })}</tbody>
          </table></div>
        </>}
        {admin && <div className={`${styles.actions} ${styles.sectionTitle}`}><button className="dark" type="submit" disabled={busy}>{busy ? "Salvando…" : "Salvar todos"}</button></div>}
      </form>
    </>}
    {data && !admin && !draft?.id && <p className="muted">Nenhuma política de despesas foi atribuída.</p>}
  </section>;
}

const vehicles = [
  ["car", "Carro"], ["motorcycle", "Moto"], ["truck", "Caminhão"], ["pickup", "Caminhonete"], ["bus", "Ônibus"], ["van", "Van"], ["other", "Outro"],
] as const;
type Vehicle = typeof vehicles[number][0];
type MileagePolicy = {
  id: string; name: string; is_default: boolean; rate_per_km: number | null; active: boolean;
  allow_manual_rate: boolean | null; requires_manual_receipt: boolean | null; vehicle_rates: Partial<Record<Vehicle, number>>;
};
type MileageRoute = { id: string; title: string; origin: string; destination: string; kilometers: number; active: boolean };
type MileageDraft = {
  id: string; name: string; default: boolean; rate: string; allowManual: string; requiresReceipt: string;
  rates: Partial<Record<Vehicle, string>>; memberIds: string[];
};
type RouteDraft = { id: string; title: string; origin: string; destination: string; km: string };
type MileageData = { policies: MileagePolicy[]; routes: MileageRoute[]; links: Link[]; people: Person[] };

const emptyRoute: RouteDraft = { id: "", title: "", origin: "", destination: "", km: "" };
function mileageDraft(data: MileageData, policyId: string, newDefault = false): MileageDraft {
  const policy = data.policies.find((entry) => entry.id === policyId);
  return {
    id: policy?.id ?? "", name: policy?.name ?? (newDefault ? "Política Padrão da Empresa" : ""), default: policy?.is_default ?? newDefault,
    rate: policy?.rate_per_km == null ? "" : String(policy.rate_per_km).replace(".", ","),
    allowManual: policy?.allow_manual_rate == null ? (newDefault ? "no" : "") : policy.allow_manual_rate ? "yes" : "no",
    requiresReceipt: policy?.requires_manual_receipt == null ? (newDefault ? "no" : "") : policy.requires_manual_receipt ? "yes" : "no",
    rates: Object.fromEntries(Object.entries(policy?.vehicle_rates ?? {}).map(([kind, value]) => [kind, String(value).replace(".", ",")])),
    memberIds: data.links.filter((entry) => entry.policy_id === policyId).map((entry) => entry.member_id),
  };
}

async function readMileageData(companyId: string, admin: boolean): Promise<MileageData> {
  const [policies, routes, links, people] = await Promise.all([
    supabase.from("mileage_policies").select("id,name,is_default,rate_per_km,allow_manual_rate,requires_manual_receipt,vehicle_rates,active")
      .eq("company_id", companyId).order("is_default", { ascending: false }).order("name"),
    supabase.from("mileage_routes").select("id,title,origin,destination,kilometers,active").eq("company_id", companyId).order("title"),
    supabase.from("mileage_policy_members").select("member_id,policy_id").eq("company_id", companyId),
    readPeople(companyId, admin),
  ]);
  return { policies: checkResult<MileagePolicy>(policies), routes: checkResult<MileageRoute>(routes), links: checkResult<Link>(links), people: checkResult<Person>(people) };
}

function FormFlag({ name, value, label, ownDefault, disabled, onChange }: {
  name: string; value: string; label: string; ownDefault: boolean; disabled: boolean; onChange: (value: string) => void;
}) {
  if (!ownDefault) return <label>{label}
    <select value={value} disabled={disabled} onChange={(event) => onChange(event.target.value)}>
      <option value="">Herdar da política padrão</option><option value="yes">Sim</option><option value="no">Não</option>
    </select>
  </label>;
  return <fieldset className={styles.flag}><legend>{label}</legend><div className={styles.actions}>
    <label className={styles.check}><input type="radio" name={name} value="yes" checked={value === "yes"} disabled={disabled} onChange={() => onChange("yes")} /> Sim</label>
    <label className={styles.check}><input type="radio" name={name} value="no" checked={value === "no"} disabled={disabled} onChange={() => onChange("no")} /> Não</label>
  </div></fieldset>;
}

export function MileagePolicySettings({ companyId, admin = false }: { companyId: string; admin?: boolean }) {
  const [data, setData] = useState<MileageData | null>(null);
  const [draft, setDraft] = useState<MileageDraft | null>(null);
  const [tab, setTab] = useState<"values" | "routes">("values");
  const [showMembers, setShowMembers] = useState(false);
  const [routeDraft, setRouteDraft] = useState<RouteDraft | null>(null);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");

  useEffect(() => {
    let active = true;
    void readMileageData(companyId, admin).then((loaded) => {
      if (!active) return;
      setData(loaded);
      const primary = loaded.policies.find((policy) => policy.is_default);
      setDraft(primary ? mileageDraft(loaded, primary.id) : (admin ? mileageDraft(loaded, "", true) : null));
    }, () => { if (active) setStatus("Não foi possível carregar as políticas de quilometragem."); });
    return () => { active = false; };
  }, [companyId, admin]);

  async function savePolicy(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin || !draft || busy) return;
    setBusy(true);
    setStatus("");
    try {
      if (draft.name.trim().length < 2) throw new Error("Informe o nome da política.");
      const standard = numberInput(draft.rate, 4, 0.0001, 99999999.9999, "Valor por quilômetro");
      if (draft.default && standard == null) throw new Error("Informe o valor por quilômetro da política padrão.");
      const rates = Object.fromEntries(Object.entries(draft.rates).map(([key, value]) => {
        const amount = numberInput(value, 4, 0.0001, 99999999.9999, "Valor por tipo de veículo");
        if (amount == null) throw new Error("Informe o valor de cada veículo selecionado.");
        return [key, amount];
      }));
      const { data: saved, error } = await supabase.rpc<string>("save_mileage_policy_config", {
        p_company_id: companyId, p_policy_id: draft.id || null, p_name: draft.name.trim(), p_default: draft.default,
        p_rate: standard, p_vehicle_rates: rates, p_allow_manual: draft.allowManual ? draft.allowManual === "yes" : null,
        p_requires_receipt: draft.requiresReceipt ? draft.requiresReceipt === "yes" : null,
        p_member_ids: draft.memberIds,
      });
      if (error) throw error;
      const loaded = await readMileageData(companyId, admin);
      setData(loaded);
      setDraft(mileageDraft(loaded, saved));
      setStatus("Política de quilometragem salva.");
    } catch (error) {
      setStatus(databaseMessage(error, "Não foi possível salvar a política de quilometragem."));
    } finally {
      setBusy(false);
    }
  }

  async function togglePolicy(policy: MileagePolicy) {
    if (!admin || busy || policy.is_default) return;
    setBusy(true);
    setStatus("");
    try {
      const { error } = await supabase.from("mileage_policies").update({ active: !policy.active }).eq("id", policy.id).eq("company_id", companyId).select("id").single();
      if (error) throw error;
      setData(await readMileageData(companyId, admin));
      setStatus(policy.active ? "Política desativada." : "Política ativada.");
    } catch {
      setStatus("Não foi possível alterar a situação da política.");
    } finally {
      setBusy(false);
    }
  }

  async function saveRoute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!admin || !routeDraft || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const kilometers = numberInput(routeDraft.km, 2, 0.01, 9999999999.99, "Quilometragem");
      if (kilometers == null) throw new Error("Informe a quilometragem.");
      if ([routeDraft.title, routeDraft.origin, routeDraft.destination].some((value) => value.trim().length < 2)) {
        throw new Error("Informe título, origem e destino.");
      }
      const row = { title: routeDraft.title.trim(), origin: routeDraft.origin.trim(), destination: routeDraft.destination.trim(), kilometers };
      const builder = routeDraft.id
        ? supabase.from("mileage_routes").update(row).eq("company_id", companyId).eq("id", routeDraft.id)
        : supabase.from("mileage_routes").insert({ ...row, company_id: companyId });
      const { error } = await builder.select("id").single();
      if (error) throw error;
      setData(await readMileageData(companyId, admin));
      setRouteDraft(null);
      setStatus("Trecho salvo.");
    } catch (error) {
      setStatus(databaseMessage(error, "Não foi possível salvar o trecho."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleRoute(route: MileageRoute) {
    if (!admin || busy) return;
    setBusy(true);
    setStatus("");
    try {
      const { error } = await supabase.from("mileage_routes").update({ active: !route.active }).eq("id", route.id).eq("company_id", companyId).select("id").single();
      if (error) throw error;
      setData(await readMileageData(companyId, admin));
      setStatus(route.active ? "Trecho desativado." : "Trecho ativado.");
    } catch {
      setStatus("Não foi possível alterar a situação do trecho.");
    } finally {
      setBusy(false);
    }
  }

  function openPolicy(id: string, withMembers = false) {
    if (!data) return;
    setDraft(mileageDraft(data, id));
    setShowMembers(withMembers);
    setStatus("");
  }

  const visible = data?.routes.filter((route) => (admin || route.active) &&
    [route.title, route.origin, route.destination].some((value) => value.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR").trim())));
  return <section className={`reportCard ${styles.panel}`}>
    <h2>Políticas de quilometragem</h2>
    <div className={styles.tabs}>
      <button type="button" aria-pressed={tab === "values"} onClick={() => setTab("values")}>Valores de quilometragem</button>
      <button type="button" aria-pressed={tab === "routes"} onClick={() => setTab("routes")}>Trechos pré-cadastrados</button>
    </div>
    {status && <p className={styles.notice} role="status">{status}</p>}
    {!data && !status && <p className="muted">Carregando políticas de quilometragem…</p>}
    {data && tab === "values" && <>
      {draft ? <form className={styles.editor} onSubmit={savePolicy}>
        <h3>{draft.default ? "Política Padrão da Empresa" : draft.id ? "Editar política específica" : "Nova política específica"}</h3>
        <p className="muted">{draft.default ? "As definições padrão valem para quem não tem política específica vinculada." : "Os valores não preenchidos herdam a política padrão da empresa."}</p>
        {showMembers ? <MemberChoices people={data.people} links={data.links} policyId={draft.id} automatic={draft.default} disabled={busy}
          selected={draft.memberIds} onChange={(values) => setDraft({ ...draft, memberIds: values })} /> : <>
          <div className={styles.fields}>
            {!draft.default && <label>Nome<input required minLength={2} maxLength={160} disabled={busy || !admin} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>}
            <label>Valor pago por km (R$)<input required={draft.default} inputMode="decimal" disabled={busy || !admin} value={draft.rate} onChange={(event) => setDraft({ ...draft, rate: event.target.value })} placeholder={draft.default ? "0,0000" : "Herdar"} /></label>
          </div>
          <h4>Valor pago por tipo de veículo</h4>
          <div className={styles.rateList}>{vehicles.map(([kind, label]) => {
            const enabled = draft.rates[kind] !== undefined;
            return <div key={kind}>
              <label className={styles.check}><input type="checkbox" checked={enabled} disabled={busy || !admin} onChange={(event) => {
                const rates = { ...draft.rates };
                if (event.target.checked) rates[kind] = ""; else delete rates[kind];
                setDraft({ ...draft, rates });
              }} /> {label}</label>
              <input aria-label={`Valor por km para ${label}`} inputMode="decimal" required={enabled} placeholder="0,0000" value={draft.rates[kind] ?? ""}
                disabled={!enabled || busy || !admin} onChange={(event) => setDraft({ ...draft, rates: { ...draft.rates, [kind]: event.target.value } })} />
            </div>;
          })}</div>
          <div className={styles.fields}>
            <FormFlag name="mileage-manual" label="Permitir alteração manual do valor do km" value={draft.allowManual} ownDefault={draft.default} disabled={busy || !admin} onChange={(value) => setDraft({ ...draft, allowManual: value })} />
            <FormFlag name="mileage-receipt" label="Exigir recibo em percursos manuais" value={draft.requiresReceipt} ownDefault={draft.default} disabled={busy || !admin} onChange={(value) => setDraft({ ...draft, requiresReceipt: value })} />
          </div>
        </>}
        {admin && <div className={styles.actions}>
          {!draft.default && <button type="button" onClick={() => setShowMembers(!showMembers)}>{showMembers ? "Editar valores" : "Membros vinculados"}</button>}
          <button className="dark" type="submit" disabled={busy}>Salvar</button>
          {!draft.default && <button type="button" disabled={busy} onClick={() => {
            const primary = data.policies.find((entry) => entry.is_default);
            if (primary) openPolicy(primary.id); else { setDraft(mileageDraft(data, "", true)); setShowMembers(false); }
          }}>Voltar à política padrão</button>}
        </div>}
      </form> : <p className="muted">A empresa ainda não cadastrou a política padrão.</p>}
      {admin && <div className={styles.header}>
        <h3>Políticas específicas de percurso</h3>
        <button className="dark" type="button" disabled={busy} onClick={() => openPolicy("")}>Criar política</button>
      </div>}
      {admin && <div className={styles.scroll}>
        <table className={styles.table}>
          <thead><tr><th scope="col">Política</th><th scope="col">Valor por km</th><th scope="col">Gerenciar</th></tr></thead>
          <tbody>{data.policies.filter((policy) => !policy.is_default).map((policy) => <tr key={policy.id}>
            <th scope="row">{policy.name}{policy.active ? "" : " (inativa)"}</th>
            <td>{policy.rate_per_km == null ? "Política padrão" : `R$ ${Number(policy.rate_per_km).toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`}</td>
            <td><div className={styles.actions}>
              <button type="button" disabled={busy} onClick={() => openPolicy(policy.id)}>Editar</button>
              <button type="button" disabled={busy} onClick={() => openPolicy(policy.id, true)}>Membros vinculados</button>
              <button type="button" disabled={busy} onClick={() => void togglePolicy(policy)}>{policy.active ? "Desativar" : "Ativar"}</button>
            </div></td>
          </tr>)}</tbody>
        </table>
      </div>}
    </>}
    {data && tab === "routes" && <>
      {admin && <div className={styles.header}><h3>Trechos cadastrados</h3><button className="dark" type="button" disabled={busy} onClick={() => setRouteDraft(emptyRoute)}>Novo trecho</button></div>}
      {routeDraft && <form className={styles.editor} onSubmit={saveRoute}>
        <div className={styles.fields}>
          <label>Título<input required minLength={2} maxLength={160} value={routeDraft.title} onChange={(event) => setRouteDraft({ ...routeDraft, title: event.target.value })} /></label>
          <label>Origem<input required minLength={2} maxLength={160} value={routeDraft.origin} onChange={(event) => setRouteDraft({ ...routeDraft, origin: event.target.value })} /></label>
          <label>Destino<input required minLength={2} maxLength={160} value={routeDraft.destination} onChange={(event) => setRouteDraft({ ...routeDraft, destination: event.target.value })} /></label>
          <label>Quilometragem<input required inputMode="decimal" value={routeDraft.km} onChange={(event) => setRouteDraft({ ...routeDraft, km: event.target.value })} /></label>
        </div>
        <div className={styles.actions}>
          <button type="button" disabled={busy} onClick={() => setRouteDraft(null)}>Cancelar</button>
          <button type="submit" className="dark" disabled={busy}>Salvar trecho</button>
        </div>
      </form>}
      <label className={styles.search}>Pesquisar<input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar título, origem ou destino" /></label>
      <div className={styles.scroll}><table className={styles.table}>
        <thead><tr><th scope="col">Título</th><th scope="col">Origem</th><th scope="col">Destino</th><th scope="col">Quilometragem</th>{admin && <th scope="col">Gerenciar</th>}</tr></thead>
        <tbody>{visible?.map((route) => <tr key={route.id}>
          <th scope="row">{route.title}{route.active ? "" : " (inativo)"}</th><td>{route.origin}</td><td>{route.destination}</td>
          <td>{Number(route.kilometers).toLocaleString("pt-BR", { minimumFractionDigits: 2 })} km</td>
          {admin && <td><div className={styles.actions}>
            <button type="button" disabled={busy} aria-label={`Editar ${route.title}`} onClick={() => setRouteDraft({ id: route.id, title: route.title, origin: route.origin, destination: route.destination, km: String(route.kilometers).replace(".", ",") })}>Editar</button>
            <button type="button" disabled={busy} aria-label={`${route.active ? "Desativar" : "Ativar"} ${route.title}`} onClick={() => void toggleRoute(route)}>{route.active ? "Desativar" : "Ativar"}</button>
          </div></td>}
        </tr>)}</tbody>
      </table></div>
      {visible?.length === 0 && <p className="muted">Nenhum trecho encontrado.</p>}
    </>}
  </section>;
}
