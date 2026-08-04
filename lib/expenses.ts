export const categories = [
  "Alimentação",
  "Hospedagem",
  "Transporte",
  "Combustível",
  "Pedágio",
  "Estacionamento",
  "Material",
  "Outros",
] as const;

export type Confidence = "alta" | "media" | "baixa";

export type Expense = {
  id: string;
  receiptId: string;
  sourceFile: string;
  storagePath: string;
  supplier: string;
  date: string;
  amount: number | null;
  currency: string;
  category: string;
  description: string;
  confidence: Confidence;
  notes: string;
  createdAt: string;
};

export const expenseSchema = {
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
          date: { type: "string", description: "Data YYYY-MM-DD ou string vazia" },
          amount: { anyOf: [{ type: "number" }, { type: "null" }] },
          currency: { type: "string" },
          category: { type: "string", enum: categories },
          description: { type: "string" },
          confidence: { type: "string", enum: ["alta", "media", "baixa"] },
          notes: { type: "string" },
        },
      },
    },
  },
};
