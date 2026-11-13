import { createClient } from "@/lib/supabase/client";

export const supabase = createClient();

export async function api<T = Record<string, unknown>>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("Sua sessão expirou. Entre novamente.");
  const response = await fetch(path, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Não foi possível concluir a operação.");
  return payload as T;
}

export type Company = {
  id: string; owner_id: string; name: string; legal_name: string; tax_id: string;
  brand_color: string; report_prefix: string; default_currency: string;
  require_cost_center: boolean; require_receipt: boolean; allow_self_approval: boolean;
  default_approval_flow_id: string | null;
};
export type Member = { id: string; company_id: string; email: string; user_id: string | null; role: string; active: boolean };
export type CatalogItem = { id: string; company_id: string; name: string; code?: string; reimbursable?: boolean; active: boolean; approval_flow_id?: string | null };
export type Flow = { id: string; company_id: string; name: string; active: boolean; approval_steps: { id: string; step_order: number; approver_user_id: string }[] };

export function money(value: number | string | null | undefined, currency = "BRL") {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(Number(value || 0));
}

export async function loadMyCompanies(userId: string): Promise<{ company: Company; role: string }[]> {
  const { error: claimError } = await supabase.rpc("claim_company_invitations");
  if (claimError) throw new Error("A configuração da empresa ainda não foi ativada no banco de dados.");
  const { data, error } = await supabase.from("company_members").select("company_id,role").eq("user_id", userId).eq("active", true);
  const memberships = (data || []) as Pick<Member, "company_id" | "role">[];
  if (error) throw new Error("Não foi possível carregar suas empresas.");
  if (!memberships?.length) return [];
  const { data: companies, error: companyError } = await supabase.from("companies").select("*").in("id", memberships.map((row) => row.company_id));
  if (companyError) throw new Error("Não foi possível carregar a configuração da empresa.");
  return ((companies || []) as Company[]).map((company) => ({ company, role: memberships.find((row) => row.company_id === company.id)?.role || "employee" }));
}
