import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { once } from "node:events";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const root = fileURLToPath(new URL("../", import.meta.url));
const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

async function ephemeralPort() {
  const probe = createServer();
  probe.listen(0, "127.0.0.1");
  await once(probe, "listening");
  const { port } = probe.address();
  await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
  return port;
}

function assertRedirect(response, base, destination) {
  assert.ok([307, 308].includes(response.status), `Redirecionamento esperado para ${destination}, recebido ${response.status}`);
  const location = response.headers.get("location");
  assert.ok(location, "Cabeçalho Location do redirecionamento ausente");
  assert.equal(new URL(location, base).href, new URL(destination, base).href);
}

test("INEPAD Reembolso abre em Relatórios e mantém as operações autenticadas", { timeout: 60000 }, async (t) => {
  const port = await ephemeralPort();
  const base = `http://127.0.0.1:${port}`;
  const server = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", String(port)], { cwd: root, stdio: ["ignore","pipe","pipe"], windowsHide: true });
  t.after(() => { server.kill(); });
  let log = "";
  server.stdout.on("data", (chunk) => { log += chunk; });
  server.stderr.on("data", (chunk) => { log += chunk; });
  let response;
  for (let i = 0; i < 40; i++) {
    if (server.exitCode !== null) break;
    try { response = await fetch(base + "/login", { redirect: "manual", signal: AbortSignal.timeout(5000) }); break; } catch { await sleep(250); }
  }
  assert.equal(response?.status, 200, `Servidor local não iniciou ou respondeu com erro:\n${log}`);
  assert.match(await response.text(), /INEPAD Reembolso/);

  const home = await fetch(base, { redirect: "manual" });
  assertRedirect(home, base, "/relatorios");
  const oauthCallback = await fetch(base + "/?code=offline-test&redirect_to=https%3A%2F%2Fexample.test", { redirect: "manual" });
  assertRedirect(oauthCallback, base, "/relatorios?code=offline-test");
  const formerCompany = await fetch(base + "/empresa", { redirect: "manual" });
  assertRedirect(formerCompany, base, "/configuracoes?secao=dados-empresa");

  const logo = await fetch(base + "/inepad-reembolso/logo.png");
  assert.equal(logo.status, 200, "A marca INEPAD Reembolso deve estar disponível");
  assert.match(logo.headers.get("content-type") || "", /^image\/png\b/);

  for (const [path, marker] of [["/configuracoes", /Carregando configurações/], ["/relatorios", /Carregando relatórios/], ["/aprovacoes", /Carregando aprovações/]]) {
    const page = await fetch(base + path);
    assert.equal(page.status, 200, path);
    assert.match(await page.text(), marker, path);
  }
  const id = "00000000-0000-4000-8000-000000000001";
  for (const [method, path] of [
    ["GET", "/api/reports"], ["GET", "/api/approval-flows"], ["GET", "/api/policies"],
    ["POST", "/api/analyze"], ["POST", `/api/reports/${id}/expenses`],
    ["POST", `/api/reports/${id}/submit`], ["POST", `/api/approvals/${id}/decision`],
    ["POST", `/api/reports/${id}/paid`],
    ["POST", "/api/team-import"], ["POST", "/api/internal/approval-emails"],
  ]) {
    const api = await fetch(base + path, { method });
    assert.equal(api.status, 401, `${method} ${path}`);
  }
});
