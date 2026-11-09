import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";

export const runtime = "nodejs";

async function context(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token || !supabase) return { supabase: null, user: null };
  const { data, error } = await supabase.auth.getUser(token);
  return { supabase, user: error ? null : data.user };
}

export async function GET(request: Request) {
  const { supabase, user } = await context(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const { data, error } = await supabase.from("policy_rules").select("*").eq("owner_id", user.id).order("created_at", { ascending: true });
  if (error) return NextResponse.json({ error: "Não foi possível carregar as políticas." }, { status: 500 });
  return NextResponse.json({ policies: data || [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await context(request);
  if (!supabase || !user) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  const body = await request.json().catch(() => null) as { name?: string; category?: string | null; maxAmount?: number | null; requiresReceipt?: boolean; maxDaysAfterExpense?: number | null } | null;
  const name = body?.name?.trim();
  if (!name) return NextResponse.json({ error: "Informe o nome da regra." }, { status: 400 });
  const maxAmount = body?.maxAmount === null || body?.maxAmount === undefined || body.maxAmount === 0 ? null : Number(body.maxAmount);
  const maxDays = body?.maxDaysAfterExpense === null || body?.maxDaysAfterExpense === undefined || body.maxDaysAfterExpense === 0 ? null : Number(body.maxDaysAfterExpense);
  if (maxAmount !== null && (!Number.isFinite(maxAmount) || maxAmount < 0)) return NextResponse.json({ error: "O limite de valor é inválido." }, { status: 400 });
  if (maxDays !== null && (!Number.isInteger(maxDays) || maxDays < 0)) return NextResponse.json({ error: "O prazo em dias é inválido." }, { status: 400 });
  const { data, error } = await supabase.from("policy_rules").insert({
    owner_id: user.id,
    name,
    category: body?.category?.trim() || null,
    max_amount: maxAmount,
    requires_receipt: body?.requiresReceipt !== false,
    max_days_after_expense: maxDays,
    active: true,
  }).select().single();
  if (error || !data) return NextResponse.json({ error: "Não foi possível criar a regra." }, { status: 500 });
  return NextResponse.json({ policy: data }, { status: 201 });
}
