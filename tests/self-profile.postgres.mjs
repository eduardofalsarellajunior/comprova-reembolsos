// Disposable PostgreSQL only. No credentials, external network or real personal data.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const { PGlite } = await import(process.env.COMPROVA_PGLITE_MODULE || "@electric-sql/pglite");
const migrations = [
  "20261104120000_comprova_isolated_schema.sql",
  "20261106120000_comprova_reimbursement_core.sql",
  "20261106123000_comprova_audit_insert_policy.sql",
  "20261106124500_comprova_sync_jobs_insert_policy.sql",
  "20261106180000_comprova_sync_jobs_owner_guard.sql",
  "20261112120000_comprova_company_configuration.sql",
  "20261112123000_comprova_secure_approvals.sql",
  "20261116181505_comprova_organization_settings.sql",
  "20261117164803_comprova_policy_catalog_v2.sql",
  "20261117164815_comprova_member_profiles_import.sql",
  "20261117164832_comprova_project_members_and_approvals.sql",
  "20261117165624_comprova_reporting_v2_mail.sql",
];
const selfMigration = "20261119172222_comprova_self_profile_edit.sql";

test("autoedição estrita de Meus dados preserva identidades, papéis e isolamento", async (t) => {
  const db = await PGlite.create();
  const [owner, normal, approver, admin, foreignOwner, stranger, inactive] = [1, 2, 3, 4, 5, 6, 7]
    .map((n) => `20000000-0000-4000-8000-00000000000${n}`);
  const emails = new Map([
    [owner, "owner@example.test"], [normal, "normal@example.test"], [approver, "approver@example.test"],
    [admin, "admin@example.test"], [foreignOwner, "foreign@example.test"], [stranger, "stranger@example.test"],
    [inactive, "inactive@example.test"],
  ]);
  const q = (sql, ...params) => db.query(sql, params);
  const val = async (sql, ...params) => Object.values((await q(sql, ...params)).rows[0])[0];
  const as = async (id, role = "authenticated") => {
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub',$1,false)", id || "");
    await db.exec(`set role ${role}`);
  };
  const migration = async (file) => db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  const self = (company, department, title, profile) => q(
    "select comprova.update_my_company_member_profile($1,$2,$3,$4::jsonb)", company, department, title, JSON.stringify(profile),
  );
  const membership = (id) => val("select to_jsonb(m) from comprova.company_members m where m.id=$1", id);
  const profile = (id) => val("select to_jsonb(p) from comprova.company_member_profiles p where p.member_id=$1", id);
  const selectPolicies = () => q("select policyname,cmd,qual,with_check from pg_policies where schemaname='comprova' and tablename='company_member_profiles' order by policyname");
  try {
    await db.exec(`
      create role authenticated; create role anon; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key,email text not null,email_confirmed_at timestamptz);
      create table auth.identities(user_id uuid primary key references auth.users(id),provider text,identity_data jsonb);
      create function auth.uid() returns uuid language sql stable as
        $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;
      create schema storage;
      create table storage.buckets(id text primary key,name text not null,public boolean not null);
      create table storage.objects(bucket_id text not null references storage.buckets(id),name text not null,primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
      create table public.untouched_marker(id integer primary key,body text);
      insert into public.untouched_marker values(1,'preserved');
      insert into storage.buckets values('untouched','untouched',false);
      insert into storage.objects values('untouched','sentinel.txt');
    `);
    for (const [id, email] of emails) {
      await q("insert into auth.users values($1,$2,now())", id, email);
      await q("insert into auth.identities values($1,'email',jsonb_build_object('email',$2::text))", id, email);
    }
    for (const file of migrations) await migration(file);
    const policyBefore = (await selectPolicies()).rows;
    const authBefore = (await q("select to_jsonb(u) from auth.users u order by id")).rows;
    const identitiesBefore = (await q("select to_jsonb(i) from auth.identities i order by user_id")).rows;
    const protectedMetadata = (await q(`select c.relname,c.relacl,c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where n.nspname='comprova'
      and c.relname in ('company_members','company_member_profiles') order by c.relname`)).rows;
    await migration(selfMigration);
    assert.deepEqual((await selectPolicies()).rows, policyBefore, "políticas existentes permanecem idênticas");
    assert.deepEqual((await q(`select c.relname,c.relacl,c.relrowsecurity from pg_class c
      join pg_namespace n on n.oid=c.relnamespace where n.nspname='comprova'
      and c.relname in ('company_members','company_member_profiles') order by c.relname`)).rows, protectedMetadata);

    await as(owner);
    const company = await val("select comprova.create_company('Empresa QA autoedição')");
    const ownerMember = await val("select id from comprova.company_members where company_id=$1 and user_id=$2", company, owner);
    const members = new Map([[owner, ownerMember]]);
    for (const [id, role] of [[normal, "employee"], [approver, "approver"], [admin, "admin"], [inactive, "employee"]]) {
      members.set(id, await val("select comprova.invite_company_member($1,$2,$3)", company, emails.get(id), role));
      await as(id);
      assert.equal(await val("select comprova.claim_company_invitations()"), 1);
      await as(owner);
    }
    const department = await val("insert into comprova.departments(company_id,name) values($1,'Departamento QA') returning id", company);
    const otherDepartment = await val("insert into comprova.departments(company_id,name) values($1,'Outro departamento QA') returning id", company);
    const title = await val("insert into comprova.job_titles(company_id,department_id,name) values($1,$2,'Cargo QA') returning id", company, department);
    const otherTitle = await val("insert into comprova.job_titles(company_id,department_id,name) values($1,$2,'Outro cargo QA') returning id", company, otherDepartment);
    const projectId = await val("select comprova.save_managed_project($1,null,'Projeto QA','','',true,$2::uuid[])", company, [members.get(normal)]);
    await q("select comprova.set_member_approvers($1,$2,$3::uuid[],null)", company, members.get(normal), [members.get(approver)]);
    await as(foreignOwner);
    const foreignCompany = await val("select comprova.create_company('Outra empresa QA')");
    const foreignMember = await val("select id from comprova.company_members where company_id=$1 and user_id=$2", foreignCompany, foreignOwner);
    const foreignDepartment = await val("insert into comprova.departments(company_id,name) values($1,'Departamento alheio QA') returning id", foreignCompany);
    const foreignTitle = await val("insert into comprova.job_titles(company_id,department_id,name) values($1,$2,'Cargo alheio QA') returning id", foreignCompany, foreignDepartment);
    await self(foreignCompany, foreignDepartment, foreignTitle, { full_name: "Titular alheio fictício", bank: "Banco alheio QA" });
    await db.exec("reset role");
    const foreignBefore = await profile(foreignMember);
    const projectsBefore = (await q("select * from comprova.project_members order by company_id,project_id,member_id")).rows;
    const approversBefore = (await q("select * from comprova.member_approvers order by company_id,requester_member_id,position")).rows;
    const membershipsBefore = new Map();
    for (const [id, memberId] of members) membershipsBefore.set(id, await membership(memberId));

    await t.test("Normal, Intermediário, Administrador e proprietário editam somente seus nove campos e classificação", async () => {
      for (const id of [normal, approver, admin, owner]) {
        await as(id);
        const values = {
          full_name: `Pessoa fictícia ${emails.get(id)}`, cpf: "123.456.789-01", birth_date: "1990-02-28",
          phone: "11900000000", job_label: "Função fictícia", bank: "Banco QA", bank_branch: "0001",
          bank_account: "000123-4", pix_key: "pix@example.test",
        };
        await self(company, department, title, values);
        const saved = await profile(members.get(id));
        assert.equal(saved.cpf, "12345678901");
        for (const key of Object.keys(values).filter((key) => key !== "cpf")) assert.equal(saved[key], values[key]);
        const member = await membership(members.get(id));
        assert.equal(member.department_id, department);
        assert.equal(member.job_title_id, title);
        const before = membershipsBefore.get(id);
        for (const key of Object.keys(before).filter((key) => !["department_id", "job_title_id"].includes(key))) assert.deepEqual(member[key], before[key]);
        assert.equal(await val("select count(*)::int from comprova.company_member_profiles where member_id=$1", foreignMember), 0);
      }
    });

    await t.test("campos extras e valores malformados não conseguem esconder escalada de papel ou troca de login", async () => {
      await as(normal);
      const before = await profile(members.get(normal));
      for (const key of ["role", "p_role", "email", "user_id", "member_id", "p_member_id", "company_id", "active", "project_ids", "approver_ids", "department_id"]) {
        await assert.rejects(self(company, department, title, { full_name: "Não gravar", [key]: "admin" }), /campos pessoais permitidos/);
      }
      for (const payload of [null, [], "perfil", 1, true]) await assert.rejects(self(company, department, title, payload), /Dados de perfil inválidos/);
      await assert.rejects(q("select comprova.update_my_company_member_profile($1,null,null,null)", company), /Dados de perfil inválidos/);
      for (const value of [true, 123, [], { role: "admin" }]) await assert.rejects(self(company, department, title, { full_name: value }), /campos pessoais permitidos/);
      await assert.rejects(self(company, department, title, { phone: "x".repeat(21000) }), /campos pessoais permitidos/);
      assert.deepEqual(await profile(members.get(normal)), before);
    });

    await t.test("departamento/cargo exigem mesma empresa e vínculo válido, com formas nulas consistentes", async () => {
      await as(normal);
      const before = await profile(members.get(normal));
      for (const [dept, job, error] of [
        [foreignDepartment, foreignTitle, /Departamento não encontrado/],
        [department, foreignTitle, /cargo não pertence/],
        [department, otherTitle, /cargo não pertence/],
        [null, title, /cargo não pertence/],
      ]) await assert.rejects(self(company, dept, job, { full_name: "Não gravar" }), error);
      assert.deepEqual(await profile(members.get(normal)), before);
      await self(company, otherDepartment, null, { full_name: "Sem cargo QA" });
      assert.equal((await membership(members.get(normal))).department_id, otherDepartment);
      assert.equal((await membership(members.get(normal))).job_title_id, null);
      await self(company, null, null, { full_name: null, cpf: "", bank: null, phone: " " });
      const cleared = await profile(members.get(normal));
      for (const key of ["full_name", "cpf", "birth_date", "phone", "job_label", "bank", "bank_branch", "bank_account", "pix_key"]) assert.equal(cleared[key], null);
      assert.equal((await membership(members.get(normal))).department_id, null);
      assert.equal((await membership(members.get(normal))).job_title_id, null);
      await self(company, department, title, { full_name: "Pessoa restaurada QA", bank: "Banco restaurado QA" });
    });

    await t.test("CPF, data e limites reutilizam validação existente e falhas revertem toda a gravação", async () => {
      await as(normal);
      const memberBefore = await membership(members.get(normal));
      const profileBefore = await profile(members.get(normal));
      for (const [invalid, error] of [
        [{ cpf: "123" }, /CPF com 11 dígitos/],
        [{ cpf: "123456789ab" }, /CPF com 11 dígitos/],
        [{ birth_date: "1990-02-30" }, /Data de nascimento inválida/],
        [{ birth_date: "31\/01\/1990" }, /Data de nascimento inválida/],
        [{ birth_date: "2999-01-01" }, /Data de nascimento inválida/],
        [{ birth_date: "1899-12-31" }, /Data de nascimento inválida/],
        [{ full_name: "x".repeat(161) }, /check constraint/],
        [{ bank: "x".repeat(121) }, /check constraint/],
      ]) {
        await assert.rejects(self(company, otherDepartment, otherTitle, { full_name: "Não gravar", ...invalid }), error);
        assert.deepEqual(await profile(members.get(normal)), profileBefore);
        assert.deepEqual(await membership(members.get(normal)), memberBefore);
      }
    });

    await t.test("outros membros/empresas, vínculo inativo, anônimo e helper privado continuam inacessíveis", async () => {
      for (const id of [normal, approver]) {
        await as(id);
        await assert.rejects(self(foreignCompany, foreignDepartment, foreignTitle, {}), /vínculo ativo/);
        await assert.rejects(q("select comprova.update_company_member_profile($1,$2,'admin',null,null,'{}')", company, members.get(id)), /Somente administradores/);
        await assert.rejects(q("select comprova.update_company_member_assignment($1,$2,'admin',null,null)", company, members.get(id)), /Somente administradores/);
        await assert.rejects(q("select comprova.import_company_members($1,'[]',true,true)", company), /Somente administradores/);
        await assert.rejects(q("select comprova.write_company_member_profile($1,$2,'{}',false)", company, members.get(id)), /permission denied/);
        await assert.rejects(q("update comprova.company_member_profiles set bank='Ataque' where member_id=$1", members.get(id)), /permission denied/);
        await assert.rejects(q("update comprova.company_members set role='admin' where id=$1", members.get(id)), /permission denied/);
      }
      await as(owner);
      await assert.rejects(q("select comprova.update_company_member_profile($1,$2,'employee',null,null,'{}')", company, ownerMember), /permanecer administrador/);
      await assert.rejects(q("select comprova.write_company_member_profile($1,$2,'{}',false)", company, ownerMember), /permission denied/);
      await assert.rejects(q("update comprova.company_member_profiles set bank='Ataque' where member_id=$1", ownerMember), /permission denied/);
      await q("select comprova.update_company_member_profile($1,$2,'approver',$3,$4,$5::jsonb)", company, members.get(approver), department, title, JSON.stringify({ full_name: "Equipe ainda administrável QA" }));
      await db.exec("reset role");
      await q("update comprova.company_members set active=false where id=$1", members.get(inactive));
      for (const id of [inactive, stranger, null]) {
        await as(id);
        await assert.rejects(self(company, null, null, {}), /vínculo ativo|Sessão inválida/);
        assert.equal(await val("select count(*)::int from comprova.company_member_profiles"), 0);
      }
      await as(null, "anon");
      await assert.rejects(self(company, null, null, {}), /permission denied/);
      await assert.rejects(q("select comprova.write_company_member_profile($1,$2,'{}',false)", company, ownerMember), /permission denied/);
    });

    await t.test("ACL, assinatura e snapshots confirmam ausência de alterações fora dos dados pessoais autorizados", async () => {
      await db.exec("reset role");
      const functionMeta = (await q(`select prosecdef,proconfig,proargnames,pg_get_function_identity_arguments(oid) as arguments
        from pg_proc where oid='comprova.update_my_company_member_profile(uuid,uuid,uuid,jsonb)'::regprocedure`)).rows[0];
      assert.equal(functionMeta.prosecdef, true);
      assert.deepEqual(functionMeta.proconfig, ['search_path=""']);
      assert.deepEqual(functionMeta.proargnames, ["p_company_id", "p_department_id", "p_job_title_id", "p_profile"]);
      for (const [role, expected] of [["authenticated", true], ["anon", false], ["service_role", false]]) {
        assert.equal(await val("select has_function_privilege($1,'comprova.update_my_company_member_profile(uuid,uuid,uuid,jsonb)','EXECUTE')", role), expected);
      }
      assert.equal(await val("select count(*)::int from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='comprova' and p.proname='update_my_company_member_profile'"), 1);
      assert.deepEqual((await q("select to_jsonb(u) from auth.users u order by id")).rows, authBefore);
      assert.deepEqual((await q("select to_jsonb(i) from auth.identities i order by user_id")).rows, identitiesBefore);
      assert.deepEqual(await profile(foreignMember), foreignBefore);
      assert.deepEqual((await q("select * from comprova.project_members order by company_id,project_id,member_id")).rows, projectsBefore);
      assert.deepEqual((await q("select * from comprova.member_approvers order by company_id,requester_member_id,position")).rows, approversBefore);
      assert.equal(await val("select count(*)::int from comprova.project_members where project_id=$1", projectId), 1);
      assert.equal(await val("select body from public.untouched_marker where id=1"), "preserved");
      assert.equal(await val("select count(*)::int from storage.objects where bucket_id='untouched' and name='sentinel.txt'"), 1);
      assert.deepEqual((await selectPolicies()).rows, policyBefore);
    });
  } finally {
    await db.close();
  }
});
