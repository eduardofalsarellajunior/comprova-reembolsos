import assert from "node:assert/strict";
import test from "node:test";
import { allSettings, canSeeSettings, settingsSearchKey } from "../app/configuracoes/sections.ts";

test("Configurações V2 agrupam 14 itens e restringem opções administrativas", () => {
  const visible = (role, hasCompany = true) => allSettings.filter((item) => canSeeSettings(item, role, hasCompany)).map((item) => item.id);
  assert.equal(allSettings.length, 14);
  assert.equal(new Set(allSettings.map((item) => item.id)).size, 14);
  assert.equal(visible("admin").length, 14);
  assert.equal(visible("employee").length, 5);
  assert.deepEqual(visible("approver"), visible("employee"));
  assert.deepEqual(visible("finance"), visible("employee"));
  assert.ok(!visible("finance").includes("membros-equipe"));
  assert.ok(visible(undefined,false).includes("dados-empresa"));
  for (const removed of ["visao-geral", "centros-custos", "financeiro", "fluxos-aprovacao"]) {
    assert.ok(!allSettings.some((item) => item.id === removed));
  }
  assert.equal(settingsSearchKey(" Política de DESPÊSA  "), "politica de despesa");
});
