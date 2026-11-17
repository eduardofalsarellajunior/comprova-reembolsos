export const REPORT_CURRENCY = "BRL";
const maxValue = 999999999.99;

export function parsePositiveBrl(value: string | number | null | undefined) {
  if (value == null) return null;
  let raw = String(value).trim();
  if (raw.includes(",")) {
    if (!/^(?:\d+|\d{1,3}(?:\.\d{3})+),\d{1,2}$/.test(raw)) return null;
    raw = raw.replaceAll(".", "").replace(",", ".");
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(raw)) {
    raw = raw.replaceAll(".", "");
  } else if (!/^\d+(?:\.\d{1,2})?$/.test(raw)) return null;
  const amount = Number(raw);
  return Number.isFinite(amount) && amount > 0 && amount <= maxValue ? amount : null;
}

export function validExpenseDescription(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && value.trim().length <= 1000;
}

export function hasExpenseFields(expense: { amount?: string | number | null; description?: string | null; currency?: string | null }) {
  return expense.currency === REPORT_CURRENCY &&
    parsePositiveBrl(typeof expense.amount === "string" ? Number(expense.amount) : expense.amount) !== null &&
    validExpenseDescription(expense.description);
}

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
