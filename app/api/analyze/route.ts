import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { expenseSchema } from "@/lib/expenses";

export const runtime = "nodejs";
export const maxDuration = 60;

type ResponseContent = { type?: string; text?: string };
type ResponseItem = { content?: ResponseContent[] };
type OpenAIResponse = { output_text?: string; output?: ResponseItem[]; error?: { message?: string } };
type ExtractedExpense = {
  supplier: string;
  date: string;
  amount: number | null;
  currency: string;
  category: string;
  description: string;
  confidence: "alta" | "media" | "baixa";
  notes: string;
};

function responseText(payload: OpenAIResponse) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) {
      if (content.type === "output_text" && content.text) return content.text;
    }
  }
  return "";
}

export async function POST(request: Request) {
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return NextResponse.json({ error: "Sessão inválida." }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const openAiKey = process.env.OPENAI_API_KEY;
  if (!supabaseUrl || !publishableKey || !openAiKey) {
    return NextResponse.json({ error: "O servidor ainda não foi configurado completamente." }, { status: 503 });
  }

  const supabase = createClient(supabaseUrl, publishableKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: authError } = await supabase.auth.getUser(token);
  if (authError || !userData.user) return NextResponse.json({ error: "Sua sessão expirou. Entre novamente." }, { status: 401 });

  const body = await request.json().catch(() => null) as { receiptId?: string } | null;
  if (!body?.receiptId) return NextResponse.json({ error: "Comprovante não informado." }, { status: 400 });

  const { data: receipt, error: receiptError } = await supabase
    .from("receipts")
    .select("id, user_id, file_name, storage_path, mime_type")
    .eq("id", body.receiptId)
    .single();
  if (receiptError || !receipt || receipt.user_id !== userData.user.id) {
    return NextResponse.json({ error: "Comprovante não encontrado." }, { status: 404 });
  }

  await supabase.from("receipts").update({ status: "processing", error_message: null, updated_at: new Date().toISOString() }).eq("id", receipt.id);

  try {
    const { data: fileBlob, error: downloadError } = await supabase.storage.from("receipts").download(receipt.storage_path);
    if (downloadError || !fileBlob) throw new Error("Não foi possível abrir o arquivo armazenado.");
    const base64 = Buffer.from(await fileBlob.arrayBuffer()).toString("base64");
    const dataUrl = `data:${receipt.mime_type};base64,${base64}`;
    const documentInput = receipt.mime_type === "application/pdf"
      ? { type: "input_file", filename: receipt.file_name, file_data: dataUrl }
      : { type: "input_image", image_url: dataUrl, detail: "high" };

    const aiResponse = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${openAiKey}` },
      body: JSON.stringify({
        model: "gpt-5.6-terra",
        reasoning: { effort: "low" },
        store: false,
        input: [{ role: "user", content: [
          { type: "input_text", text: "Leia este comprovante para prestação de contas no Brasil. Extraia uma despesa por comprovante encontrado. Use o valor total efetivamente pago, não subtotal, troco ou impostos. A data deve ser a data da compra ou serviço. Classifique pelo conteúdo real. Se algo não estiver legível, deixe vazio/null e reduza a confiança. Em notes, explique brevemente qualquer dúvida que exija revisão. Não invente dados." },
          documentInput,
        ] }],
        text: { format: { type: "json_schema", name: "receipt_expenses", strict: true, schema: expenseSchema } },
      }),
    });
    const raw = await aiResponse.text();
    let aiPayload: OpenAIResponse;
    try { aiPayload = JSON.parse(raw); }
    catch { throw new Error("O serviço de leitura retornou uma resposta inesperada."); }
    if (!aiResponse.ok) throw new Error(aiPayload?.error?.message || "A IA não conseguiu processar este arquivo.");

    const parsed = JSON.parse(responseText(aiPayload)) as { expenses: ExtractedExpense[] };
    const records = parsed.expenses.map((expense) => ({
      receipt_id: receipt.id,
      user_id: userData.user.id,
      supplier: expense.supplier || "",
      expense_date: expense.date || null,
      amount: expense.amount,
      currency: expense.currency || "BRL",
      category: expense.category || "Outros",
      description: expense.description || "",
      confidence: expense.confidence || "baixa",
      notes: expense.notes || "",
    }));
    const { data: saved, error: saveError } = await supabase.from("expenses").insert(records).select();
    if (saveError) throw new Error("A leitura foi concluída, mas não foi possível salvar o resultado.");
    await supabase.from("receipts").update({ status: "completed", updated_at: new Date().toISOString() }).eq("id", receipt.id);
    return NextResponse.json({ expenses: saved });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro inesperado.";
    await supabase.from("receipts").update({ status: "error", error_message: message, updated_at: new Date().toISOString() }).eq("id", receipt.id);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
