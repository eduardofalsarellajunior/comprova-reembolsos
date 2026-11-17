export const REPORT_CURRENCY = "BRL";
const maxValue = 999999999.99;

export function parsePositiveBrl(value: string | number | null | undefined) {
  if (value == null) return null;
  if (typeof value === "number") {
    return Number.isFinite(value) && value > 0 && value <= maxValue && Math.abs(Math.round(value * 100) - value * 100) < 0.00001 ? value : null;
  }
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
    // Database numerics use a decimal point; a string such as 1.234 is not BRL 1,234.00.
    (typeof expense.amount !== "string" || /^\d+(?:\.\d{1,2})?$/.test(expense.amount)) &&
    parsePositiveBrl(typeof expense.amount === "string" ? Number(expense.amount) : expense.amount) !== null &&
    validExpenseDescription(expense.description);
}

export function isReportDate(value: unknown): value is string | null {
  if (value === null || value === "") return true;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

export function isWorkspaceId(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
