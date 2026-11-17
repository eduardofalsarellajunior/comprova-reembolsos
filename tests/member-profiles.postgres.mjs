// Disposable PostgreSQL only. No network, hosted database, or real personal data.
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
];

test("perfis privados, importação idempotente, administração e isolamento por empresa", async () => {
  const db = await PGlite.create();
  const [admin, employee, foreignOwner, stranger] = [1, 2, 3, 4].map((n) => `10000000-0000-4000-8000-00000000000${n}`);
  const q = (sql, ...args) => db.query(sql, args);
  const val = async (sql, ...args) => Object.values((await q(sql, ...args)).rows[0])[0];
  const as = async (actor) => {
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub',$1,false)", actor);
    await db.exec("set role authenticated");
  };
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create table auth.users(id uuid primary key,email text not null,email_confirmed_at timestamptz);
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
    for (const [id, email] of [[admin,"admin@example.test"],[employee,"member@example.test"],[foreignOwner,"foreign@example.test"],[stranger,"stranger@example.test"]]) {
      await q("insert into auth.users values($1,$2,now())", id, email);
    }
    for (const migration of migrations) {
      await db.exec(await readFile(new URL(`../supabase/migrations/${migration}`, import.meta.url), "utf8"));
    }
    await as(admin);
    const company = await val("select comprova.create_company('Perfil QA')");
    const ownerMember = await val("select id from comprova.company_members where company_id=$1", company);
    await as(foreignOwner);
    const foreignCompany = await val("select comprova.create_company('Outra empresa QA')");
    const foreignMember = await val("select id from comprova.company_members where company_id=$1", foreignCompany);
    await q("select comprova.update_company_member_profile($1,$2,'admin',null,null,$3::jsonb)", foreignCompany, foreignMember, JSON.stringify({ full_name:"Outro titular fictício", bank:"Banco fictício" }));
    await as(admin);
    const payload = JSON.stringify([
      { email:"member@example.test", full_name:"Pessoa fictícia", role:"employee", cpf:"123.456.789-01", bank:"Banco de teste", bank_branch:"0001", bank_account:"000123-4", phone:"11900000000" },
      { email:"new-admin@example.test", full_name:"Gestor fictício", role:"admin" },
    ]);
    const preview = await val("select comprova.import_company_members($1,$2::jsonb,false,false)", company, payload);
    assert.equal(preview.newMembers, 2);
    assert.equal(preview.newAdmins, 1);
    assert.equal(await val("select count(*)::int from comprova.company_members where company_id=$1", company), 1);
    await assert.rejects(q("select comprova.import_company_members($1,$2::jsonb,true,false)", company, payload), /Confirme.*administrativas/);
    assert.equal(await val("select count(*)::int from comprova.company_members where company_id=$1", company), 1, "falha não deixa importação parcial");
    const committed = await val("select comprova.import_company_members($1,$2::jsonb,true,true)", company, payload);
    assert.equal(committed.newMembers, 2);
    assert.equal(await val("select count(*)::int from comprova.company_members where company_id=$1", company), 3);
    const member = await val("select id from comprova.company_members where company_id=$1 and email='member@example.test'", company);
    assert.equal(await val("select user_id from comprova.company_members where id=$1", member), null, "importar não cria nem associa Auth diretamente");
    const second = await val("select comprova.import_company_members($1,$2::jsonb,true,true)", company, payload);
    assert.equal(second.newMembers, 0);
    assert.equal(second.existingMembers, 2);
    assert.equal(second.profilesFilled, 0);
    const noEscalation = await val("select comprova.import_company_members($1,$2::jsonb,true,true)", company, JSON.stringify([
      { email:"member@example.test", full_name:"Não sobrescrever", role:"admin", bank:"Não sobrescrever", pix_key:"qa@example.test" },
    ]));
    assert.equal(noEscalation.typesPreserved, 1);
    assert.equal(await val("select role from comprova.company_members where id=$1", member), "employee");
    assert.equal(await val("select bank from comprova.company_member_profiles where member_id=$1", member), "Banco de teste");
    assert.equal(await val("select pix_key from comprova.company_member_profiles where member_id=$1", member), "qa@example.test");
    const profile = { full_name:"Pessoa atualizada", cpf:"12345678901", birth_date:"1990-01-02", phone:"11911111111", job_label:"Analista", bank:"Outro banco QA", bank_branch:"0002", bank_account:"000987-6", pix_key:"pix@example.test" };
    await q("select comprova.update_company_member_profile($1,$2,'employee',null,null,$3::jsonb)", company, member, JSON.stringify(profile));
    assert.equal(await val("select full_name from comprova.company_member_profiles where member_id=$1", member), profile.full_name);
    await assert.rejects(q("select comprova.update_company_member_profile($1,$2,'employee',null,null,$3::jsonb)", company, member, JSON.stringify({...profile,birth_date:"2999-01-01"})), /Data de nascimento inválida/);
    await assert.rejects(q("select comprova.update_company_member_profile($1,$2,'employee',null,null,$3::jsonb)", company, foreignMember, JSON.stringify(profile)), /nesta empresa/);
    await assert.rejects(q("select comprova.update_company_member_profile($1,$2,'employee',null,null,'{}')", company, ownerMember), /permanecer administrador/);
    await assert.rejects(q("select comprova.invite_company_member($1,'legacy@example.test','finance')", company), /Novos tipos permitidos/);
    await as(employee);
    assert.equal(await val("select comprova.claim_company_invitations()"), 1);
    assert.equal(await val("select count(*)::int from comprova.company_member_profiles"), 1);
    assert.equal(await val("select cpf from comprova.company_member_profiles where member_id=$1", member), profile.cpf);
    assert.equal(await val("select count(*)::int from comprova.company_member_profiles where company_id=$1", foreignCompany), 0);
    await assert.rejects(q("update comprova.company_member_profiles set bank='Ataque' where member_id=$1", member), /permission denied/);
    await assert.rejects(q("select comprova.update_company_member_profile($1,$2,'admin',null,null,'{}')", company, member), /Somente administradores/);
    await assert.rejects(q("select comprova.write_company_member_profile($1,$2,'{}',false)", company, member), /permission denied/);
    await assert.rejects(q("select comprova.import_company_members($1,$2::jsonb,true,true)", company, payload), /Somente administradores/);
    await as(stranger);
    assert.equal(await val("select count(*)::int from comprova.company_member_profiles"), 0);
    await db.exec("reset role; set role anon");
    await assert.rejects(q("select comprova.import_company_members($1,$2::jsonb,false,false)", company, payload), /permission denied/);
    await db.exec("reset role");
    assert.equal(await val("select relrowsecurity from pg_class where oid='comprova.company_member_profiles'::regclass"), true);
    assert.equal(await val("select body from public.untouched_marker where id=1"), "preserved");
    assert.equal(await val("select count(*)::int from auth.users"), 4);
    assert.equal(await val("select count(*)::int from storage.objects where bucket_id='untouched' and name='sentinel.txt'"), 1);
  } finally {
    await db.close();
  }
});
