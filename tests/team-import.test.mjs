import assert from "node:assert/strict";
import { test } from "node:test";
import { parseTeamCsv, teamRoleLabel } from "../lib/team-profile.ts";

test("importação reconhece os cabeçalhos e tipos do exportado legado e mantém identificadores como texto", () => {
  const csv = '\ufeffNome;E-mail;Banco;Agência;Conta;Número do CPF ou CNPJ;Tipo de conta de usuário;Cargo\r\n"Pessoa, Teste";NORMAL@example.com;Banco;0012;00004-5;123.456.789-09;Usuário;Analista\r\nOutra Pessoa;admin@example.com;Banco;002;005;sem cadastro;Administrador;Diretor';
  const result = parseTeamCsv(csv);
  assert.deepEqual(result.records.map((row) => [row.email, row.role]), [["normal@example.com", "employee"], ["admin@example.com", "admin"]]);
  assert.equal(result.records[0].bank_branch, "0012");
  assert.equal(result.records[0].bank_account, "00004-5");
  assert.equal(result.records[0].cpf, "12345678909");
  assert.equal(result.records[1].cpf, undefined);
  assert.equal(result.missingCpf, 1);
  assert.equal(result.adminRows, 1);
  assert.equal(result.records[0].birth_date, undefined);
  assert.equal(result.records[0].pix_key, undefined);
  assert.equal(teamRoleLabel("finance"), "Intermediário (legado)");
});

test("importação recusa tipos ambíguos e e-mails duplicados sem incluir PII nas mensagens", () => {
  assert.throws(() => parseTeamCsv("Nome,E-mail,Tipo de usuário\nA,pessoa@example.com,Admin temporário"), /Tipo de conta desconhecido no registro 2\./);
  assert.throws(() => parseTeamCsv("Nome,E-mail\nA,pessoa@example.com\nB,PESSOA@example.com"), /E-mail inválido ou duplicado no registro 3\./);
  assert.throws(() => parseTeamCsv('Nome,E-mail\n"Cadastro incompleto,email@example.com'), /aspas/);
});

test("datas inválidas são rejeitadas e CPF/CNPJ não é inventado", () => {
  assert.throws(() => parseTeamCsv("Nome;E-mail;Nascimento\nA;user@example.com;30/02/1980"), /Data de nascimento inválida/);
  const result = parseTeamCsv("Nome;E-mail;Nascimento;Número do CPF ou CNPJ\nA;user@example.com;25/03/1980;11.222.333/0001-00");
  assert.equal(result.records[0].birth_date, "1980-03-25");
  assert.equal(result.records[0].cpf, undefined);
  assert.equal(result.ignoredDocuments, 1);
  assert.equal(result.defaultedRoles, 1);
});
