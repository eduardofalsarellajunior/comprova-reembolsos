const API_BASE = "https://api.vexpenses.com/v2";

export type VexpensesMember = { id: number; companyId: number; name: string; email: string };
export type VexpensesExpenseType = { id: number; description: string; active: boolean };
export type VexpensesReport = {
  id: number;
  description: string;
  status: string;
  userId: number;
  payingCompanyId: number;
  paymentMethodId: number;
};

type JsonRecord = Record<string, unknown>;

export class VexpensesApiError extends Error {
  constructor(message: string, public status = 502) { super(message); }
}

export function isVexpensesConfigured() { return Boolean(process.env.VEXPENSES_API_TOKEN); }

export async function vexpensesFetch(path: string, init?: RequestInit) {
  const token = process.env.VEXPENSES_API_TOKEN;
  if (!token) throw new VexpensesApiError("A integração com a VExpenses ainda não foi configurada.", 503);
  const response = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: token, ...init?.headers },
    cache: "no-store",
  });
  const raw = await response.text();
  let payload: unknown = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = raw; }
  if (!response.ok) {
    console.error("[vexpenses] request failed", JSON.stringify({ path, status: response.status, payload }));
    const record = asRecord(payload);
    const message = typeof record?.message === "string" ? record.message : `A VExpenses recusou a solicitação (${response.status}).`;
    throw new VexpensesApiError(message, response.status >= 500 ? 502 : response.status);
  }
  return payload;
}

export function asRecord(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : null;
}

export function dataItems(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) return payload.map(asRecord).filter((item): item is JsonRecord => Boolean(item));
  const record = asRecord(payload);
  const data = record?.data;
  if (Array.isArray(data)) return data.map(asRecord).filter((item): item is JsonRecord => Boolean(item));
  const dataRecord = asRecord(data);
  if (dataRecord) return [dataRecord];
  return record ? [record] : [];
}

function numberValue(value: unknown) { const result = Number(value); return Number.isFinite(result) ? result : 0; }
function stringValue(value: unknown) { return typeof value === "string" ? value : ""; }

export async function getMemberByEmail(email: string): Promise<VexpensesMember> {
  const payload = await vexpensesFetch(`/team-members/email/${encodeURIComponent(email)}`);
  const member = dataItems(payload)[0];
  if (!member) throw new VexpensesApiError("Seu e-mail de acesso não foi encontrado na equipe da VExpenses.", 404);
  const company = asRecord(member.company);
  const companyId = numberValue(member.company_id ?? member.paying_company_id ?? company?.id);
  const id = numberValue(member.id);
  if (!id || !companyId) throw new VexpensesApiError("A VExpenses não informou o usuário ou a empresa pagadora.");
  return { id, companyId, name: stringValue(member.name), email: stringValue(member.email) || email };
}

export async function getExpenseTypes(): Promise<VexpensesExpenseType[]> {
  return dataItems(await vexpensesFetch("/expenses-type"))
    .map((item) => ({ id: numberValue(item.id), description: stringValue(item.description), active: item.on !== false && item.on !== 0 }))
    .filter((item) => item.id && item.active);
}

export async function getReports(userId: number): Promise<VexpensesReport[]> {
  const query = new URLSearchParams({ paginate: "true", per_page: "100", search: `user_id:${userId}` });
  return dataItems(await vexpensesFetch(`/reports?${query}`))
    .map(mapReport)
    .filter((item) => item.id && item.userId === userId);
}

export async function getReport(reportId: number): Promise<VexpensesReport> {
  const report = dataItems(await vexpensesFetch(`/reports/${reportId}`))[0];
  if (!report) throw new VexpensesApiError("O relatório escolhido não foi encontrado na VExpenses.", 404);
  return mapReport(report);
}

function mapReport(item: JsonRecord): VexpensesReport {
  return {
    id: numberValue(item.id),
    description: stringValue(item.description),
    status: stringValue(item.status).toUpperCase(),
    userId: numberValue(item.user_id ?? asRecord(item.user)?.id),
    payingCompanyId: numberValue(item.paying_company_id ?? asRecord(item.paying_company)?.id),
    paymentMethodId: numberValue(item.payment_method_id ?? asRecord(item.payment_method)?.id),
  };
}
