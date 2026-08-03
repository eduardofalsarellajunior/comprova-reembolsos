export const runtime = "edge";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["expenses"],
  properties: {
    expenses: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["supplier", "date", "amount", "currency", "category", "description", "confidence", "notes"],
        properties: {
          supplier: { type: "string" },
          date: { type: "string", description: "Data no formato YYYY-MM-DD ou string vazia" },
          amount: { anyOf: [{ type: "number" }, { type: "null" }] },
          currency: { type: "string", description: "Código ISO, normalmente BRL" },
          category: { type: "string", enum: ["Alimentação", "Hospedagem", "Transporte", "Combustível", "Pedágio", "Estacionamento", "Material", "Outros"] },
          description: { type: "string" },
          confidence: { type: "string", enum: ["alta", "media", "baixa"] },
          notes: { type: "string" },
        },
      },
    },
  },
};

function getOutputText(payload: any) {
  if (typeof payload.output_text === "string") return payload.output_text;
  for (const item of payload.output || []) {
    for (const content of item.content || []) if (content.type === "output_text" && content.text) return content.text;
  }
  return "";
}

export async function POST(request: Request) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ error: "A chave da inteligência artificial ainda não foi configurada." }, { status: 503 });

  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return Response.json({ error: "Nenhum arquivo foi recebido." }, { status: 400 });

  const supported = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
  if (!supported.includes(file.type)) return Response.json({ error: "Formato não aceito." }, { status: 415 });
  if (file.size > 20 * 1024 * 1024) return Response.json({ error: "O arquivo ultrapassa 20 MB." }, { status: 413 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  for (let index = 0; index < bytes.length; index += 0x8000) binary += String.fromCharCode(...bytes.subarray(index, index + 0x8000));
  const dataUrl = `data:${file.type};base64,${btoa(binary)}`;
  const documentInput = file.type === "application/pdf"
    ? { type: "input_file", filename: file.name, file_data: dataUrl, detail: "high" }
    : { type: "input_image", image_url: dataUrl, detail: "high" };

  const response = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: "gpt-5.6-terra",
      reasoning: { effort: "low" },
      store: false,
      input: [{
        role: "user",
        content: [
          { type: "input_text", text: "Leia este comprovante para prestação de contas no Brasil. Extraia uma despesa por comprovante encontrado. Use o valor total efetivamente pago, não subtotal, troco ou valor de impostos. A data deve ser a data da compra ou serviço. Classifique pelo conteúdo real. Se algo não estiver legível, deixe vazio/null e reduza a confiança. Em notes, explique brevemente qualquer dúvida que exija revisão. Não invente dados." },
          documentInput,
        ],
      }],
      text: { format: { type: "json_schema", name: "receipt_expenses", strict: true, schema } },
    }),
  });

  const payload = await response.json();
  if (!response.ok) {
    const message = payload?.error?.message || "A inteligência artificial não conseguiu processar o arquivo.";
    return Response.json({ error: message }, { status: response.status });
  }

  try { return Response.json(JSON.parse(getOutputText(payload))); }
  catch { return Response.json({ error: "A leitura retornou um formato inesperado. Tente novamente." }, { status: 502 }); }
}
