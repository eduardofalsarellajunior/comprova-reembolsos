import assert from "node:assert/strict";
import test from "node:test";
import { allSettings, canSeeSettings, settingsSearchKey } from "../app/configuracoes/sections.ts";

test("Configurações agrupam os 18 itens e não exibem opções administrativas para outros perfis", () => {
  const visible = (role, hasCompany = true) => allSettings.filter((item) => canSeeSettings(item, role, hasCompany)).map((item) => item.id);
  assert.equal(allSettings.length, 18);
  assert.equal(new Set(allSettings.map((item) => item.id)).size, 18);
  assert.equal(visible("admin").length, 18);
  assert.equal(visible("employee").length, 6);
  assert.deepEqual(visible("approver"), visible("employee"));
  assert.deepEqual(visible("finance"), [...visible("employee"),"financeiro"]);
  assert.ok(!visible("finance").includes("membros-equipe"));
  assert.ok(visible(undefined,false).includes("dados-empresa"));
  assert.equal(settingsSearchKey(" Política de DESPÊSA  "), "politica de despesa");
});
