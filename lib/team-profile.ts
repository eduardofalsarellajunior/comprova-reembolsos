export const teamRoles = [
  { key: "employee", label: "Normal" },
  { key: "approver", label: "Intermediário" },
  { key: "admin", label: "Administrador" },
] as const;

type TeamRole = typeof teamRoles[number]["key"];
export function teamRoleLabel(role: string) {
  if (role === "finance") return "Intermediário (legado)";
  return teamRoles.find((entry) => entry.key === role)?.label ?? "Não identificado";
}

export const profileFields = [
  { key: "full_name", label: "Nome completo", limit: 160 },
  { key: "cpf", label: "CPF", limit: 14 },
  { key: "birth_date", label: "Data de nascimento", limit: 10 },
  { key: "phone", label: "Telefone", limit: 40 },
  { key: "job_label", label: "Cargo informado", limit: 160 },
  { key: "bank", label: "Banco", limit: 120 },
  { key: "bank_branch", label: "Agência", limit: 40 },
  { key: "bank_account", label: "Conta", limit: 60 },
  { key: "pix_key", label: "Chave Pix", limit: 160 },
] as const;

export type ProfileKey = typeof profileFields[number]["key"];
export type MemberProfile = Record<ProfileKey, string>;
type MemberImportRecord = Partial<MemberProfile> & { email: string; role: TeamRole; full_name: string };

const headers: Record<string, ProfileKey | "email" | "role"> = {
  nome: "full_name", "nome completo": "full_name", email: "email", "e mail": "email",
  banco: "bank", agencia: "bank_branch", "agencia bancaria": "bank_branch",
  conta: "bank_account", "conta bancaria": "bank_account", "conta corrente": "bank_account",
  cpf: "cpf", "numero do cpf ou cnpj": "cpf", "cpf ou cnpj": "cpf",
  "data de nascimento": "birth_date", nascimento: "birth_date", telefone: "phone", celular: "phone",
  cargo: "job_label", funcao: "job_label", "chave pix": "pix_key", "numero pix": "pix_key", pix: "pix_key",
  "tipo de conta de usuario": "role", "tipo de usuario": "role", "tipo de conta": "role", perfil: "role",
};

const roles = new Map<string, TeamRole>([
  ["usuario", "employee"], ["normal", "employee"], ["employee", "employee"],
  ["intermediario", "approver"], ["approver", "approver"],
  ["administrador", "admin"], ["admin", "admin"],
]);

function keyFor(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase()
    .replace(/[-_]+/g, " ").replace(/\s+/g, " ");
}

function delimiterFor(text: string) {
  let quoted = false;
  let commas = 0;
  let semicolons = 0;
  for (const ch of text) {
    if (ch === '"') quoted = !quoted;
    else if (!quoted) {
      if (ch === "\n" || ch === "\r") break;
      if (ch === ",") commas += 1;
      if (ch === ";") semicolons += 1;
    }
  }
  return semicolons > commas ? ";" : ",";
}

function csvRecords(text: string, delimiter: string) {
  const records: string[][] = [];
  let record: string[] = [];
  let cell = "";
  let inQuotes = false;
  let closingQuote = false;
  function pushCell() {
    record.push(cell);
    if (record.length > 50) throw new Error("O CSV tem mais de 50 colunas.");
    cell = "";
    closingQuote = false;
  }
  function pushRecord() {
    pushCell();
    if (record.some((entry) => entry.trim())) records.push(record);
    if (records.length > 201) throw new Error("Importe no máximo 200 pessoas por vez.");
    record = [];
  }
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes && char === '"') {
      if (text[i + 1] === '"') { cell += '"'; i += 1; }
      else { inQuotes = false; closingQuote = true; }
    } else if (inQuotes) {
      cell += char;
    } else if (char === delimiter) {
      pushCell();
    } else if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i += 1;
      pushRecord();
    } else if (char === '"' && !cell && !closingQuote) {
      inQuotes = true;
    } else if (closingQuote && (char === " " || char === "\t")) {
      continue;
    } else if (closingQuote || char === '"') {
      throw new Error("CSV inválido. Exporte a planilha novamente em CSV UTF-8.");
    } else {
      cell += char;
    }
  }
  if (inQuotes) throw new Error("Há uma célula com aspas não fechadas.");
  if (record.length || cell || closingQuote) pushRecord();
  return records;
}

function normalizedDate(value: string) {
  const br = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
  const iso = br ? [br[3], br[2], br[1]].join("-") : value;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const candidate = new Date(iso + "T00:00:00.000Z");
  if (!Number.isFinite(candidate.getTime()) || candidate.toISOString().slice(0, 10) !== iso || iso < "1900-01-01" || iso > new Date().toISOString().slice(0, 10)) return null;
  return iso;
}

export function isTeamEmail(value: string) {
  return value.length <= 254 && /^[^@\s\p{C}]+@[^@\s\p{C}]+\.[^@\s\p{C}]+$/u.test(value);
}

export function parseTeamCsv(raw: string) {
  if (raw.length > 360_000 || /[\u0000\ufffd]/u.test(raw)) {
    throw new Error("Abra a planilha e exporte como CSV UTF-8; limite de 360 mil caracteres.");
  }
  const text = raw.replace(/^\ufeff/, "");
  const [header, ...rows] = csvRecords(text, delimiterFor(text));
  if (!header || !rows.length) throw new Error("O CSV não contém membros.");
  const keys = header.map((value) => {
    const key = keyFor(value);
    return Object.hasOwn(headers, key) ? headers[key] : undefined;
  });
  if (!keys.includes("email") || !keys.includes("full_name")) {
    throw new Error("O CSV precisa dos cabeçalhos Nome e E-mail.");
  }
  const seenColumns = new Set<string>();
  for (const key of keys) {
    if (!key) continue;
    if (seenColumns.has(key)) throw new Error("O CSV tem cabeçalhos repetidos. Verifique as colunas.");
    seenColumns.add(key);
  }

  const emailKeys = new Set<string>();
  let ignoredDocuments = 0;
  let missingCpf = 0;
  let defaultedRoles = 0;
  const records = rows.map((row, index): MemberImportRecord => {
    const csvRow = index + 2;
    const values: Partial<Record<ProfileKey | "email" | "role", string>> = {};
    for (let i = 0; i < keys.length; i += 1) {
      const k = keys[i];
      if (k) values[k] = (row[i] ?? "").trim();
    }
    const email = (values.email ?? "").toLowerCase();
    if (!isTeamEmail(email) || emailKeys.has(email)) throw new Error("E-mail inválido ou duplicado no registro " + csvRow + ".");
    emailKeys.add(email);
    const full_name = values.full_name ?? "";
    if (!full_name) throw new Error("Nome obrigatório no registro " + csvRow + ".");
    const roleText = keyFor(values.role ?? "");
    const role = roleText ? roles.get(roleText) : "employee";
    if (!role) throw new Error("Tipo de conta desconhecido no registro " + csvRow + ". Use Normal, Usuário, Intermediário ou Administrador.");
    if (!roleText) defaultedRoles += 1;
    const record: MemberImportRecord = { email, full_name, role };
    for (const field of profileFields) {
      if (field.key === "cpf" || field.key === "birth_date") continue;
      const value = values[field.key];
      if (!value) continue;
      if (value.length > field.limit || /[\p{C}]/u.test(value)) throw new Error(field.label + " inválido no registro " + csvRow + ".");
      record[field.key] = value;
    }
    if (values.cpf) {
      const digits = values.cpf.replace(/\D/g, "");
      if (/^(\d{11}|\d{3}\.\d{3}\.\d{3}-\d{2})$/.test(values.cpf)) record.cpf = digits;
      else if (digits.length > 0) ignoredDocuments += 1;
    }
    if (!record.cpf) missingCpf += 1;
    if (values.birth_date) {
      const date = normalizedDate(values.birth_date);
      if (!date) throw new Error("Data de nascimento inválida no registro " + csvRow + ".");
      record.birth_date = date;
    }
    return record;
  });
  return { records, ignoredDocuments, missingCpf, defaultedRoles, adminRows: records.filter((row) => row.role === "admin").length };
}
