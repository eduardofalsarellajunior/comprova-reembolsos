// Local, synthetic browser integration test. This does NOT validate production,
// real Supabase/RLS, Microsoft 365, email delivery, or bank information.
// Build a disposable copy without .env, using NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:56443
// and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=offline-test-publishable, then run:
// QA_APP_ROOT=<absolute temporary build directory> node tests/settings-v2.browser.mjs
// Optional: QA_SUPABASE_PORT (must match the build), QA_CHROME_PATH.
// Chrome profile/screenshots stay under the OS temporary directory, never in Git.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:http";
import { mkdtemp, readdir, realpath, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { isAbsolute, join, relative, resolve } from "node:path";
import { setTimeout as pause } from "node:timers/promises";

assert.ok(process.env.QA_APP_ROOT && isAbsolute(process.env.QA_APP_ROOT), "QA_APP_ROOT deve ser um diretório absoluto de build descartável.");
const qaRoot = await realpath(resolve(process.env.QA_APP_ROOT));
const temporaryRoot = await realpath(tmpdir());
const temporaryRoots = [temporaryRoot];
// The Codex Windows sandbox redirects os.tmpdir; a parent QA build can live in
// the verified native Windows Temp instead. Neither path is ever deleted here.
if (process.platform === "win32") temporaryRoots.push(await realpath(join(homedir(), "AppData", "Local", "Temp")));
assert.ok(temporaryRoots.some((root) => { const scopedPath = relative(root, qaRoot); return scopedPath && !scopedPath.startsWith("..") && !isAbsolute(scopedPath); }), "Por segurança, QA_APP_ROOT deve estar dentro do Temp do sistema.");
assert.ok(!(await readdir(qaRoot)).some((name) => /^\.env(?:\..*)?$/.test(name) && name !== ".env.example"), "A cópia QA não deve conter arquivos .env.");
const mockPort = Number(process.env.QA_SUPABASE_PORT || 56443);
assert.ok(Number.isInteger(mockPort) && mockPort > 1024 && mockPort < 65536, "Porta local inválida.");
const artifacts = await mkdtemp(join(temporaryRoot, "inepad-settings-v2-browser-"));
const userId = "11111111-1111-4111-8111-111111111111";
const companyId = "22222222-2222-4222-8222-222222222222";
const employeeId = "33333333-3333-4333-8333-333333333333";
const approverId = "44444444-4444-4444-8444-444444444444";
const departmentId = "55555555-5555-4555-8555-555555555555";
const jobId = "66666666-6666-4666-8666-666666666666";
const projectId = "77777777-7777-4777-8777-777777777777";
const inactiveProjectId = "88888888-8888-4888-8888-888888888888";
const categoryId = "99999999-9999-4999-8999-999999999999";
const expensePolicyId = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const mileagePolicyId = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const user = { id: userId, aud: "authenticated", role: "authenticated", email: "admin@example.test", user_metadata: { full_name: "Pessoa fictícia Admin" }, app_metadata: { provider: "email", providers: ["email"] }, identities: [{ provider: "email" }], created_at: "2026-01-01T12:00:00Z", email_confirmed_at: "2026-01-01T12:00:00Z" };
const company = { id: companyId, owner_id: userId, name: "Empresa fictícia QA", legal_name: "Empresa fictícia QA", tax_id: "", brand_color: "#0e5f9c", report_prefix: "QA", default_currency: "BRL", require_cost_center: false, require_receipt: false, allow_self_approval: false, default_approval_flow_id: null };
const baseMember = { company_id: companyId, active: true, department_id: departmentId, job_title_id: jobId };
const personal = (member_id, full_name) => ({ member_id, company_id: companyId, full_name, cpf: null, birth_date: "2000-01-01", phone: null, job_label: "Cargo fictício", bank: "Banco fictício QA", bank_branch: "AG-QA", bank_account: "CONTA-QA", pix_key: "pix@example.test" });
const rest = {
  companies: [company],
  company_members: [
    { ...baseMember, id: userId, user_id: userId, email: user.email, role: "admin" },
    { ...baseMember, id: employeeId, user_id: employeeId, email: "normal@example.test", role: "employee" },
    { ...baseMember, id: approverId, user_id: approverId, email: "intermediario@example.test", role: "approver" },
  ],
  company_member_profiles: [personal(userId, "Pessoa fictícia Admin"), personal(employeeId, "Pessoa fictícia Normal"), personal(approverId, "Pessoa fictícia Intermediária")],
  departments: [{ id: departmentId, company_id: companyId, name: "Departamento fictício" }],
  job_titles: [{ id: jobId, company_id: companyId, department_id: departmentId, name: "Cargo fictício" }],
  projects: [{ id: projectId, company_id: companyId, name: "Projeto fictício ativo", code: "QA", description: "Somente teste", active: true }, { id: inactiveProjectId, company_id: companyId, name: "Projeto fictício inativo", code: "OLD", description: "Histórico sintético", active: false }],
  project_members: [{ company_id: companyId, project_id: projectId, member_id: employeeId }],
  member_approvers: [{ company_id: companyId, requester_member_id: employeeId, approver_member_id: approverId, position: 1 }],
  expense_categories: [{ id: categoryId, company_id: companyId, name: "Categoria fictícia", active: true }],
  payment_methods: [],
  expense_policy_configs: [{ id: expensePolicyId, company_id: companyId, name: "Política fictícia de despesas", is_default: true, past_days: 30, future_days: 0 }],
  expense_policy_limits: [{ company_id: companyId, policy_id: expensePolicyId, category_id: categoryId, max_amount: 50, amount_period: "expense", max_entries: 2, count_period: "day", allow_exceed: false }],
  expense_policy_members: [],
  policy_rules: [],
  mileage_policies: [{ id: mileagePolicyId, company_id: companyId, name: "Política Padrão da Empresa", is_default: true, rate_per_km: 1.5, active: true, allow_manual_rate: true, requires_manual_receipt: false, vehicle_rates: { car: 1.7 } }],
  mileage_policy_members: [], mileage_routes: [], reports: [], receipts: [], expenses: [], report_expenses: [], approval_flows: [],
};
const encode = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
const exp = Math.floor(Date.now() / 1000) + 3600;
const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: userId, exp, role: "authenticated", aud: "authenticated" })}.fixture`;
const auth = { access_token: token, refresh_token: "offline-fixture-refresh", expires_in: 3600, expires_at: exp, token_type: "bearer", user };
const routesSeen = new Set();
const rpcCalls = [];
async function readJson(request) { const chunks = []; for await (const chunk of request) chunks.push(chunk); return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}"); }
function filteredRows(table, params) {
  return (rest[table] || []).filter((row) => [...params].every(([key, condition]) => {
    if (["select", "order", "limit", "offset"].includes(key)) return true;
    if (key === "or") return condition.replace(/^\(|\)$/g, "").split(",").some((entry) => { const [field, op, value] = entry.split("."); return op === "eq" && String(row[field]) === value; });
    if (condition.startsWith("eq.")) return String(row[key]) === condition.slice(3);
    if (condition.startsWith("in.(")) return condition.slice(4, -1).split(",").includes(String(row[key]));
    return true;
  }));
}
function simulateRpc(name, args) {
  rpcCalls.push({ name, args });
  if (name === "is_company_admin") return rest.company_members[0].role === "admin";
  if (name === "update_company_member_profile") {
    Object.assign(rest.company_members.find((row) => row.id === args.p_member_id), { role: args.p_role, department_id: args.p_department_id, job_title_id: args.p_job_title_id });
    Object.assign(rest.company_member_profiles.find((row) => row.member_id === args.p_member_id), args.p_profile);
  }
  if (name === "save_managed_project") {
    const id = args.p_project_id || "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
    const row = { id, company_id: companyId, name: args.p_name, code: args.p_code, description: args.p_description, active: args.p_active };
    const current = rest.projects.find((project) => project.id === id);
    if (current) Object.assign(current, row); else rest.projects.push(row);
    rest.project_members = [...rest.project_members.filter((link) => link.project_id !== id), ...args.p_member_ids.map((member_id) => ({ company_id: companyId, project_id: id, member_id }))];
    return id;
  }
  if (name === "save_expense_policy_config") {
    Object.assign(rest.expense_policy_configs[0], { name: args.p_name, past_days: args.p_past_days, future_days: args.p_future_days });
    rest.expense_policy_limits = args.p_limits.map((row) => ({ ...row, company_id: companyId, policy_id: expensePolicyId }));
    return expensePolicyId;
  }
  if (name === "save_mileage_policy_config") {
    Object.assign(rest.mileage_policies[0], { name: args.p_name, rate_per_km: args.p_rate, vehicle_rates: args.p_vehicle_rates, allow_manual_rate: args.p_allow_manual, requires_manual_receipt: args.p_requires_receipt });
    return mileagePolicyId;
  }
  return null;
}
const mock = createServer(async (req, res) => {
  const url = new URL(req.url, "http://127.0.0.1");
  const pathname = url.pathname;
  routesSeen.add(`${req.method} ${pathname}`);
  res.setHeader("access-control-allow-origin", "*");
  res.setHeader("access-control-allow-methods", "GET, HEAD, POST, PATCH, OPTIONS");
  res.setHeader("access-control-allow-headers", req.headers["access-control-request-headers"] || "*");
  res.setHeader("access-control-expose-headers", "content-range");
  res.setHeader("content-type", "application/json");
  try {
    if (req.method === "OPTIONS") { res.writeHead(204).end(); return; }
    if (pathname === "/auth/v1/token") { await readJson(req); res.end(JSON.stringify(auth)); return; }
    if (pathname === "/auth/v1/user") { res.end(JSON.stringify(user)); return; }
    if (pathname.startsWith("/rest/v1/rpc/")) { res.end(JSON.stringify(simulateRpc(pathname.split("/").at(-1), await readJson(req)))); return; }
    if (pathname.startsWith("/rest/v1/") && ["GET", "HEAD"].includes(req.method)) {
      const rows = filteredRows(pathname.split("/").at(-1), url.searchParams);
      res.end(JSON.stringify(req.headers.accept?.includes("pgrst.object") ? rows[0] || null : rows)); return;
    }
    res.writeHead(404).end(JSON.stringify({ message: "Rota não simulada." }));
  } catch { res.writeHead(500).end(JSON.stringify({ message: "Falha no mock local." })); }
});
const bind = async (server, port) => { server.listen(port, "127.0.0.1"); await once(server, "listening"); };
const portReservation = createServer();
await bind(portReservation, 0);
const appPort = portReservation.address().port;
await new Promise((done) => portReservation.close(done));
await bind(mock, mockPort);
const origin = `http://127.0.0.1:${appPort}`;
const next = spawn(process.execPath, [join(qaRoot, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(appPort)], {
  cwd: qaRoot, env: { ...process.env, NEXT_PUBLIC_SUPABASE_URL: `http://127.0.0.1:${mockPort}`, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: "offline-test-publishable", OPENAI_API_KEY: "", VEXPENSES_API_TOKEN: "", CONTA_AZUL_CLIENT_ID: "", SUPABASE_SERVICE_ROLE_KEY: "", INTEGRATION_ENCRYPTION_KEY: "" },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
});
let appLog = "";
next.stdout.on("data", (data) => { appLog += data; });
next.stderr.on("data", (data) => { appLog += data; });
const chromium = spawn(process.env.QA_CHROME_PATH || "C:/Users/55169/AppData/Local/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-win64/chrome-headless-shell.exe", [
  "--headless", "--no-first-run", "--no-default-browser-check", "--disable-background-networking", "--disable-component-update", "--disable-gpu",
  "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0", `--user-data-dir=${join(artifacts, "chrome-profile")}`, "about:blank",
], { stdio: ["ignore", "ignore", "pipe"], windowsHide: true });
let chromeLog = "";
chromium.stderr.on("data", (data) => { chromeLog += data; });
async function waitFor(check, label, timeout = 18000) {
  const until = Date.now() + timeout;
  do { const value = await check().catch(() => false); if (value) return value; await pause(120); } while (Date.now() < until);
  throw new Error(`Tempo esgotado: ${label}`);
}
let ws;
let inspectBrowser;
try {
  const chromePort = await waitFor(async () => chromeLog.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1], "porta de depuração Chromium");
  const tabs = await (await fetch(`http://127.0.0.1:${chromePort}/json/list`)).json();
  ws = new WebSocket(tabs.find((tab) => tab.type === "page").webSocketDebuggerUrl);
  await once(ws, "open");
  const pending = new Map();
  const exceptions = [];
  const blockedRequests = [];
  let id = 0;
  const cmd = (method, params = {}) => new Promise((resolveCommand, reject) => { const key = ++id; pending.set(key, { resolveCommand, reject }); ws.send(JSON.stringify({ id: key, method, params })); });
  ws.addEventListener("message", ({ data }) => {
    const message = JSON.parse(data);
    if (message.method === "Runtime.exceptionThrown") exceptions.push(message.params.exceptionDetails.exception?.description || message.params.exceptionDetails.text);
    if (message.method === "Fetch.requestPaused") {
      const { requestId, request } = message.params;
      const url = new URL(request.url);
      if (["http:", "https:"].includes(url.protocol) && !["127.0.0.1", "localhost", "[::1]"].includes(url.hostname)) {
        blockedRequests.push(url.origin); void cmd("Fetch.failRequest", { requestId, errorReason: "BlockedByClient" }).catch(() => {});
      } else void cmd("Fetch.continueRequest", { requestId }).catch(() => {});
    }
    if (pending.has(message.id)) {
      const action = pending.get(message.id); pending.delete(message.id);
      if (message.error) action.reject(new Error(message.error.message));
      else action.resolveCommand(message.result);
    }
  });
  const evaluate = async (expression) => { const response = await cmd("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }); if (response.exceptionDetails) throw new Error(response.exceptionDetails.exception?.description || response.exceptionDetails.text); return response.result.value; };
  inspectBrowser = () => evaluate("({url:location.href,text:document.body.innerText.slice(0,900),email:document.querySelector('input[type=email]')?.value,submitDisabled:document.querySelector('form.authCard button.primary')?.disabled})");
  const present = (css) => evaluate(`Boolean(document.querySelector(${JSON.stringify(css)}))`);
  const click = (css) => evaluate(`document.querySelector(${JSON.stringify(css)}).click()`);
  const bodyIncludes = (value) => evaluate(`document.body.textContent.includes(${JSON.stringify(value)})`);
  const clickText = (selector, text) => evaluate(`Array.from(document.querySelectorAll(${JSON.stringify(selector)})).find((node) => node.textContent.trim() === ${JSON.stringify(text)} && !node.disabled)?.click()`);
  const fill = (css, value) => evaluate(`(${((selector, content) => { const node = document.querySelector(selector); const prototype = node.tagName === "SELECT" ? HTMLSelectElement.prototype : node.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, content); node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }).toString()})(${JSON.stringify(css)},${JSON.stringify(value)})`);
  const fillLabel = (text, value, scope = "document") => evaluate(`(${((labelText, content, root) => { const label = Array.from(root.querySelectorAll("label")).find((node) => node.textContent.trim().startsWith(labelText)); const node = label.querySelector("input,select,textarea"); const prototype = node.tagName === "SELECT" ? HTMLSelectElement.prototype : node.tagName === "TEXTAREA" ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype; Object.getOwnPropertyDescriptor(prototype, "value").set.call(node, content); node.dispatchEvent(new Event(node.tagName === "SELECT" ? "change" : "input", { bubbles: true })); }).toString()})(${JSON.stringify(text)},${JSON.stringify(value)},${scope})`);
  const navigate = async (section) => { await cmd("Page.navigate", { url: origin + (section ? `/configuracoes?secao=${section}` : "/configuracoes") }); await waitFor(() => present('nav[aria-label="Seções de configurações"]'), `seção ${section || "meus-dados"}`); };
  const screenshot = async (name) => { const frame = await cmd("Page.captureScreenshot", { format: "png" }); await writeFile(join(artifacts, name), Buffer.from(frame.data, "base64")); };
  await cmd("Runtime.enable"); await cmd("Page.enable");
  await cmd("Fetch.enable", { patterns: [{ urlPattern: "*" }] });
  await cmd("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await waitFor(async () => (await fetch(origin + "/login")).ok, "Next local pronto");
  await cmd("Page.navigate", { url: origin + "/login" });
  await waitFor(() => present('input[type="password"]'), "login fictício");
  await waitFor(() => evaluate("Object.keys(document.querySelector('input[type=email]')).some((key) => key.startsWith('__reactProps$') && typeof document.querySelector('input[type=email]')[key].onChange === 'function')"), "hidratação do formulário de login");
  await fill('input[type="email"]', user.email); await fill('input[type="password"]', "offline-fixture-only");
  await click("form.authCard button.primary");
  await waitFor(() => present('nav[aria-label="Menu principal"]'), "sessão local simulada");

  await navigate("");
  await waitFor(() => bodyIncludes("Banco fictício QA"), "perfil pessoal próprio");
  const menuSelector = 'nav[aria-label="Seções de configurações"]';
  const menuItems = await evaluate(`Array.from(document.querySelector(${JSON.stringify(menuSelector)}).querySelectorAll('a')).map((node) => node.textContent.trim())`);
  assert.equal(menuItems.length, 14, "Administrador deve ver as 14 configurações atuais.");
  assert.ok(!menuItems.some((item) => ["Centros de custo", "Fluxos de aprovação", "Cartões", "Adiantamentos", "Viagens"].includes(item)), "Itens removidos não devem voltar ao menu.");
  assert.equal(await evaluate("document.querySelectorAll('.settingsAccount input,.settingsAccount textarea,.settingsAccount select').length"), 0, "Meus dados não deve permitir edição pessoal/bancária nem nome.");
  assert.equal(await evaluate("Array.from(document.querySelectorAll('.settingsAccount button')).some((node) => /salvar/i.test(node.textContent))"), false);

  await navigate("membros-equipe");
  await waitFor(() => bodyIncludes("Pessoa fictícia Normal"), "equipe administrativa");
  await evaluate("Array.from(document.querySelectorAll('tbody tr')).find((row) => row.textContent.includes('normal@example.test')).querySelector('button').click()");
  await waitFor(() => present("dialog[open]"), "modal de perfil");
  assert.deepEqual(await evaluate("Array.from(Array.from(document.querySelector('dialog').querySelectorAll('label')).find((node) => node.textContent.startsWith('Tipo de usuário')).querySelector('select').options).map((option) => option.value)"), ["employee", "approver", "admin"]);
  assert.ok(await bodyIncludes("Dados bancários para reembolso"));
  assert.ok(await evaluate("Array.from(document.querySelector('dialog').querySelectorAll('input')).some((node) => node.value === 'CONTA-QA')"));
  await fillLabel("Banco", "Banco QA atualizado", "document.querySelector('dialog')");
  await clickText("dialog button", "Salvar cadastro");
  await waitFor(async () => rpcCalls.some((call) => call.name === "update_company_member_profile"), "gravação fictícia do perfil por RPC");
  await waitFor(() => bodyIncludes("Cadastro salvo."), "confirmação visual do perfil salvo");
  assert.equal(rest.company_member_profiles.find((row) => row.member_id === employeeId).bank, "Banco QA atualizado");
  await waitFor(() => bodyIncludes("Quem aprova os relatórios deste membro"), "permissões de aprovação");
  assert.equal(await evaluate("Array.from(document.querySelectorAll('dialog select option')).filter((node) => node.parentElement.parentElement.textContent.startsWith('Adicionar aprovador')).some((node) => node.textContent.includes('Pessoa fictícia Normal'))"), false, "Sem autoaprovação no seletor.");
  await screenshot("equipe-modal-desktop.png");
  await click('button[aria-label="Fechar cadastro"]');

  await navigate("projetos");
  await waitFor(() => bodyIncludes("Projeto fictício ativo"), "projetos ativos");
  await clickText("button", "+ Novo projeto");
  await waitFor(() => present("dialog[open]"), "wizard do projeto");
  assert.deepEqual(await evaluate("Array.from(document.querySelector('dialog ol[aria-label=\"Etapas do cadastro\"]').children).map((node) => node.textContent.replace(/^[✓0-9]+/, ''))"), ["Informações", "Membros", "Resumo"]);
  await fillLabel("Nome do projeto", "Projeto novo fictício", "document.querySelector('dialog')");
  await clickText("dialog button", "Próximo");
  await waitFor(() => bodyIncludes("Selecione os membros que poderão usar"), "etapa membros");
  await evaluate("Array.from(document.querySelectorAll('dialog label')).find((node) => node.textContent.includes('normal@example.test')).querySelector('input').click()");
  await clickText("dialog button", "Próximo");
  await waitFor(() => present('dialog li[aria-current="step"]'), "etapa resumo");
  assert.ok(await evaluate("document.querySelector('dialog li[aria-current=step]').textContent.includes('Resumo')"));
  await clickText("dialog button", "Salvar projeto");
  await waitFor(() => evaluate("!document.querySelector('dialog[open]') && document.body.textContent.includes('Projeto novo fictício')"), "projeto criado no mock e wizard fechado");
  assert.equal(rpcCalls.find((call) => call.name === "save_managed_project").args.p_member_ids.length, 1);
  await evaluate("Array.from(document.querySelectorAll('button')).find((node) => node.textContent.includes('Projetos inativos')).click()");
  await waitFor(() => bodyIncludes("Projeto fictício inativo"), "aba projetos inativos");
  assert.equal(await bodyIncludes("Projeto fictício ativo"), false);

  await navigate("despesas");
  await waitFor(() => present('input[aria-label="Valor máximo: Categoria fictícia"]'), "limites de despesas");
  await fill('input[aria-label="Valor máximo: Categoria fictícia"]', "45,50");
  await fill('select[aria-label="Período do valor: Categoria fictícia"]', "month");
  await clickText("button", "Salvar todos");
  await waitFor(() => bodyIncludes("Política de despesas salva."), "política de despesas no mock");
  assert.equal(rpcCalls.find((call) => call.name === "save_expense_policy_config").args.p_limits[0].max_amount, 45.5);
  assert.equal(rest.expense_policy_limits[0].amount_period, "month");
  await navigate("quilometragem");
  await waitFor(() => present('input[aria-label="Valor por km para Carro"]'), "política de km");
  await fillLabel("Valor pago por km", "1,6500");
  await clickText("button", "Salvar");
  await waitFor(() => bodyIncludes("Política de quilometragem salva."), "política de km no mock");
  assert.equal(rest.mileage_policies[0].rate_per_km, 1.65);
  await clickText("button", "Trechos pré-cadastrados");
  await waitFor(() => bodyIncludes("Trechos cadastrados"), "aba de trechos");

  const expand = 'button[aria-label="Expandir menu principal"]';
  const collapse = 'button[aria-label="Recolher menu principal"]';
  if (await present(collapse)) await click(collapse);
  await click(expand); assert.ok(await present(collapse));
  await screenshot("configuracoes-menu-desktop.png");
  await click(collapse);
  await cmd("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await pause(300);
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Configurações sem overflow horizontal no celular.");
  await click(expand); assert.ok(await present(".inepadFrame[inert]"), "Menu móvel isola o conteúdo.");
  await evaluate("window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))");
  assert.ok(await present(expand), "Escape fecha o menu móvel.");
  await screenshot("configuracoes-mobile.png");
  await navigate("membros-equipe");
  await waitFor(() => bodyIncludes("Pessoa fictícia Normal"), "equipe no celular");
  assert.ok(await evaluate("document.documentElement.scrollWidth <= window.innerWidth + 1"), "Tabela da equipe não amplia a página no celular.");
  await evaluate("Array.from(document.querySelectorAll('tbody tr')).find((row) => row.textContent.includes('normal@example.test')).querySelector('button').click()");
  await waitFor(() => present("dialog[open]"), "perfil no celular");
  assert.ok(await evaluate("document.querySelector('dialog').getBoundingClientRect().left >= 0 && document.querySelector('dialog').getBoundingClientRect().right <= innerWidth + 1"), "Modal de cadastro cabe na tela móvel.");
  await screenshot("equipe-modal-mobile.png");
  await click('button[aria-label="Fechar cadastro"]');

  rest.company_members[0].role = "employee";
  await cmd("Emulation.setDeviceMetricsOverride", { width: 1366, height: 900, deviceScaleFactor: 1, mobile: false });
  await navigate("");
  await waitFor(() => bodyIncludes("Banco fictício QA"), "Meus dados como usuário comum");
  assert.equal(await evaluate(`document.querySelector(${JSON.stringify(menuSelector)}).querySelectorAll('a').length`), 5, "Usuário comum só vê cinco itens pessoais/política.");
  assert.equal(await present('a[href="/configuracoes?secao=membros-equipe"]'), false);
  assert.equal(await evaluate("document.querySelectorAll('.settingsAccount input,.settingsAccount select,.settingsAccount textarea').length"), 0);
  await navigate("membros-equipe");
  await waitFor(() => bodyIncludes("Disponível apenas a administradores."), "bloqueio da rota administrativa para usuário comum");
  assert.equal(await present('button[aria-label="Fechar cadastro"]'), false);
  assert.equal(exceptions.length, 0, `Exceções JavaScript: ${exceptions.join(", ")}`);
  assert.equal(blockedRequests.length, 0, "A aplicação tentou rede externa durante o teste local.");
  assert.ok(routesSeen.has("POST /auth/v1/token"));
  assert.ok(routesSeen.has("GET /rest/v1/company_member_profiles"));
  console.log("OK — Configurações V2: 14 itens/admin e 5/comum; perfil admin e Meus dados somente leitura; wizard/projetos inativos; despesas/km; menu desktop/mobile. Tudo com Auth/REST/RPC simulados, sem rede externa.");
  console.log(`Capturas locais fictícias: ${artifacts}`);
} catch (error) {
  console.error(error.message);
  if (inspectBrowser) console.error("Estado fictício do browser:", await inspectBrowser().catch(() => "indisponível"));
  console.error(`Rotas locais simuladas: ${[...routesSeen].join(", ")}`);
  console.error(`Servidor local: ${appLog.slice(-1600)}`);
  console.error(`Chromium: ${chromeLog.slice(0, 400)}`);
  process.exitCode = 1;
} finally {
  ws?.close(); chromium.kill(); next.kill(); mock.close();
}
