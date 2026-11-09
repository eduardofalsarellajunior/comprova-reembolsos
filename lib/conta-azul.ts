const OAUTH_BASE = "https://login.contaazul.com";
const API_BASE = process.env.CONTA_AZUL_API_BASE_URL || "https://api-v2.contaazul.com";

function required(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} não configurada.`);
  return value;
}

export function contaAzulConfigured() {
  return Boolean(process.env.CONTA_AZUL_CLIENT_ID && process.env.CONTA_AZUL_CLIENT_SECRET && process.env.CONTA_AZUL_REDIRECT_URI);
}

export function buildContaAzulAuthorizationUrl(state: string) {
  const params = new URLSearchParams({ response_type: "code", client_id: required("CONTA_AZUL_CLIENT_ID"), redirect_uri: required("CONTA_AZUL_REDIRECT_URI"), state, scope: "openid profile aws.cognito.signin.user.admin" });
  return `${OAUTH_BASE}/#/oauth/authorize?${params.toString()}`;
}

type TokenResponse = { access_token: string; refresh_token?: string; expires_in?: number; token_type?: string };

async function tokenRequest(body: URLSearchParams) {
  const basic = Buffer.from(`${required("CONTA_AZUL_CLIENT_ID")}:${required("CONTA_AZUL_CLIENT_SECRET")}`).toString("base64");
  const response = await fetch(`${API_BASE}/oauth/token`, { method: "POST", headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" }, body });
  const payload = await response.json().catch(() => null) as TokenResponse & { message?: string } | null;
  if (!response.ok || !payload?.access_token) throw new Error(payload?.message || `A Conta Azul recusou a autorização (${response.status}).`);
  return payload;
}

export function exchangeContaAzulCode(code: string) {
  return tokenRequest(new URLSearchParams({ grant_type: "authorization_code", code, redirect_uri: required("CONTA_AZUL_REDIRECT_URI") }));
}

export function refreshContaAzulToken(refreshToken: string) {
  return tokenRequest(new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken }));
}

export async function contaAzulFetch(accessToken: string, path: string, init?: RequestInit) {
  const response = await fetch(`${API_BASE}${path}`, { ...init, headers: { Accept: "application/json", "Content-Type": "application/json", Authorization: `Bearer ${accessToken}`, ...init?.headers } });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`Conta Azul respondeu ${response.status}: ${typeof payload?.message === "string" ? payload.message : "erro não especificado"}`);
  return payload;
}

export function buildPayablePayload(input: { description: string; expenseDate: string; amount: number; supplierId: string; financialAccountId: string; categoryId: string; costCenterId?: string; observation?: string; externalReference: string }) {
  return {
    descricao: input.description,
    data_competencia: input.expenseDate,
    valor: input.amount,
    conta_financeira: input.financialAccountId,
    id_fornecedor: input.supplierId,
    observacao: input.observation || "",
    referencia_externa: input.externalReference,
    rateio: [{ id_categoria: input.categoryId, valor: input.amount, rateio_centro_custo: input.costCenterId ? [{ id_centro_custo: input.costCenterId, valor: input.amount }] : [] }],
    condicao_pagamento: { tipo: "A_VISTA", quantidade_parcelas: 1, data_primeira_parcela: input.expenseDate },
  };
}
