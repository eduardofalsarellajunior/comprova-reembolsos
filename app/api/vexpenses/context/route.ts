import { NextResponse } from "next/server";
import { createServerSupabase, getBearerToken } from "@/lib/server-auth";
import { getExpenseTypes, getMemberByEmail, getReports, isVexpensesConfigured, VexpensesApiError } from "@/lib/vexpenses";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const token = getBearerToken(request);
  const supabase = createServerSupabase(token);
  if (!token) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });
  if (!supabase) return NextResponse.json({ error: "O servidor ainda não foi configurado completamente." }, { status: 503 });
  if (!isVexpensesConfigured()) return NextResponse.json({ configured: false, error: "A conexão com a VExpenses ainda não foi configurada." }, { status: 503 });
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user?.email) return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });
  try {
    const member = await getMemberByEmail(data.user.email);
    const [expenseTypes, reports] = await Promise.all([getExpenseTypes(), getReports(member.id)]);
    return NextResponse.json({ configured: true, member, expenseTypes, reports: reports.filter((report) => ["ABERTO", "REABERTO"].includes(report.status)) });
  } catch (cause) {
    const error = cause instanceof VexpensesApiError ? cause : new VexpensesApiError("Não foi possível consultar a VExpenses.");
    return NextResponse.json({ configured: true, error: error.message }, { status: error.status });
  }
}
