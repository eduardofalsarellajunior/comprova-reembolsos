// Runs only against a disposable in-memory PostgreSQL. Never connects to Supabase.
// Provide the PGlite module as a file URL when installed in a separate QA checkout.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const { PGlite } = await import(process.env.COMPROVA_PGLITE_MODULE || "@electric-sql/pglite");
const [admin, employee, reviewer, finance, outsider, existingOwner, newOwner] = [1, 2, 3, 4, 5, 6, 7].map((n) => `00000000-0000-4000-8000-00000000000${n}`);
const emails = new Map([[admin, "admin@example.test"], [employee, "employee@example.test"], [reviewer, "reviewer@example.test"], [finance, "finance@example.test"], [outsider, "outsider@example.test"], [existingOwner, "existing-inepad@example.test"], [newOwner, "new-inepad@example.test"]]);
const migrations = [
  "20261104120000_comprova_isolated_schema.sql",
  "20261106120000_comprova_reimbursement_core.sql",
  "20261106123000_comprova_audit_insert_policy.sql",
  "20261106124500_comprova_sync_jobs_insert_policy.sql",
  "20261106180000_comprova_sync_jobs_owner_guard.sql",
  "20261112120000_comprova_company_configuration.sql",
  "20261112123000_comprova_secure_approvals.sql",
];

test("organograma, permissões, aprovação em duas etapas, reenvio e Financeiro com RLS", async () => {
  const db = await PGlite.create();
  const q = (sql, ...args) => db.query(sql, args);
  const rows = async (sql, ...args) => (await q(sql, ...args)).rows;
  const val = async (sql, ...args) => Object.values((await rows(sql, ...args))[0])[0];
  async function as(id) {
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub',$1,false)", id);
    await db.exec("set role authenticated");
  }
  try {
    await db.exec(`
      create role authenticated;
      create role anon;
      create schema auth;
      create table auth.users(id uuid primary key,email text not null,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated, anon;
      create schema storage;
      create table storage.buckets(id text primary key,name text not null,public boolean not null);
      create table storage.objects(bucket_id text not null references storage.buckets(id),name text not null,primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
      insert into storage.buckets values ('untouched','untouched',false);
      insert into storage.objects values ('untouched','sentinel.txt');
    `);
    for (const [id, email] of emails) await q("insert into auth.users values ($1,$2,now())", id, email);
    for (const file of migrations) await db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
    await as(existingOwner);
    const existingCompany = await val("select comprova.create_company('INEPAD LTDA')");
    await db.exec("reset role");
    await db.exec(await readFile(new URL("../supabase/migrations/20261116181505_comprova_organization_settings.sql", import.meta.url), "utf8"));
    await as(existingOwner);
    assert.deepEqual(
      await rows("select d.name,count(j.id)::int as titles from comprova.departments d join comprova.job_titles j on j.department_id=d.id where d.company_id=$1 group by d.name order by d.name", existingCompany),
      [{name:"Administrativo",titles:8},{name:"Comercial",titles:6},{name:"Operações",titles:9}],
    );
    assert.equal(await val("select count(*)::int from comprova.job_titles where name='Motoristas'"), 2);
    assert.deepEqual(await val("select comprova.seed_inepad_departments($1)", existingCompany), {departments:0,job_titles:0});
    const foreignDepartment = await val("select id from comprova.departments where company_id=$1 and name='Comercial'", existingCompany);
    await q("update comprova.companies set name='INEPAD Equipe Arquivada' where id=$1", existingCompany);
    await as(newOwner);
    const newCompany = await val("select comprova.create_company('INEPAD CONSULTING LTDA.')");
    assert.equal(await val("select count(*)::int from comprova.job_titles where company_id=$1", newCompany), 23);
    assert.equal(await val("select count(*)::int from comprova.job_titles where company_id=$1", existingCompany), 0);
    await as(admin);
    const company = await val("select comprova.create_company('Empresa QA')");
    assert.equal(await val("select count(*)::int from comprova.departments where company_id=$1", company), 0);
    await assert.rejects(q("select comprova.seed_inepad_departments($1)", company), /apenas para a empresa INEPAD/);
    await assert.rejects(q("select comprova.seed_inepad_departments($1)", newCompany), /Somente administradores/);
    const center = await val("insert into comprova.cost_centers(company_id,name) values ($1,'Comercial') returning id", company);
    for (const [id, role] of [[employee,"employee"],[reviewer,"approver"],[finance,"finance"]]) {
      await q("select comprova.invite_company_member($1,$2,$3)", company, emails.get(id), role);
      await as(id);
      assert.equal(await val("select comprova.claim_company_invitations()"), 1);
      await as(admin);
    }
    const department = await val("insert into comprova.departments(company_id,name) values ($1,'Operações') returning id", company);
    const secondDepartment = await val("insert into comprova.departments(company_id,name) values ($1,'Comercial') returning id", company);
    const jobTitle = await val("insert into comprova.job_titles(company_id,department_id,name) values ($1,$2,'Analista') returning id", company, department);
    const ownerMember = await val("select id from comprova.company_members where company_id=$1 and user_id=$2", company, admin);
    const employeeMember = await val("select id from comprova.company_members where company_id=$1 and user_id=$2", company, employee);
    await assert.rejects(q("insert into comprova.departments(company_id,name) values ($1,'operações')", company), /duplicate key/);
    await assert.rejects(q("select comprova.update_company_member_assignment($1,$2,'employee',null,null)", company, ownerMember), /permanecer administrador/);
    await assert.rejects(q("select comprova.update_company_member_assignment($1,$2,'employee',$3,null)", company, employeeMember, foreignDepartment), /nesta empresa/);
    await assert.rejects(q("select comprova.update_company_member_assignment($1,$2,'employee',$3,$4)", company, employeeMember, secondDepartment, jobTitle), /não pertence ao departamento/);
    await q("select comprova.update_company_member_assignment($1,$2,'employee',$3,$4)", company, employeeMember, department, jobTitle);
    await assert.rejects(q("delete from comprova.job_titles where id=$1", jobTitle), /foreign key/);
    await assert.rejects(q("delete from comprova.departments where id=$1", department), /foreign key/);
    await assert.rejects(q("select comprova.invite_company_member($1,$2,'admin')", company, emails.get(employee)), /já está cadastrado/);
    await q("insert into comprova.mileage_policies(company_id,name,rate_per_km,max_km,requires_route) values ($1,'Deslocamento',1.25,150,true)", company);
    await assert.rejects(q("insert into comprova.mileage_policies(company_id,name,rate_per_km) values ($1,'Negativa',-1)", company), /check constraint/);
    await as(employee);
    assert.equal(await val("select job_title_id from comprova.company_members where id=$1", employeeMember), jobTitle);
    assert.equal(await val("select count(*)::int from comprova.mileage_policies where company_id=$1", company), 1);
    assert.equal(await val("select count(*)::int from comprova.departments where company_id=$1", existingCompany), 0);
    assert.equal((await rows("update comprova.departments set name='Alterado' where id=$1 returning id", department)).length, 0);
    await assert.rejects(q("select comprova.update_company_member_assignment($1,$2,'admin',null,null)", company, employeeMember), /Somente administradores/);
    await as(admin);
    const flow = await val("select comprova.create_approval_flow($1,'Gestor e diretoria',$2::uuid[])", company, [reviewer, admin]);
    const alternative = await val("select comprova.create_approval_flow($1,'Apenas diretoria',$2::uuid[])", company, [admin]);
    await q("update comprova.companies set default_approval_flow_id=$1 where id=$2", alternative, company);
    await q("update comprova.cost_centers set approval_flow_id=$1 where id=$2", flow, center);
    const rule = await val("insert into comprova.policy_rules(owner_id,company_id,name,category,max_amount) values ($1,$2,'Teto alimentação','Alimentação',40) returning id", admin, company);
    await as(employee);
    const path = `${employee}/comprovante.jpg`;
    await q("insert into storage.objects values ('comprova-documents',$1)", path);
    const receipt = await val("insert into comprova.receipts(user_id,file_name,storage_path,mime_type,size_bytes) values ($1,'comprovante.jpg',$2,'image/jpeg',10) returning id", employee, path);
    const expense = await val("insert into comprova.expenses(receipt_id,user_id,expense_date,amount,category) values ($1,$2,current_date,45,'Alimentação') returning id", receipt, employee);
    const createReport = () => val("insert into comprova.reports(owner_id,company_id,name,cost_center_id,approval_flow_id) values ($1,$2,'Viagem QA',$3,$4) returning id", employee, company, center, alternative);
    const report = await createReport();
    assert.match(await val("select report_code from comprova.reports where id=$1", report), /^RMB-[A-F0-9]{8}$/);
    await q("insert into comprova.report_expenses(report_id,expense_id) values ($1,$2)", report, expense);
    assert.equal(Number(await val("select total_amount from comprova.reports where id=$1", report)),45);
    await assert.rejects(q("select comprova.submit_report($1)", report), /limite/);
    await q("update comprova.expenses set amount=35 where id=$1", expense);
    assert.equal(Number(await val("select total_amount from comprova.reports where id=$1", report)),35);
    const submitted = await val("select comprova.submit_report($1)", report);
    const instance = submitted.approval_id;
    assert.equal(submitted.status, "submitted");
    assert.equal(await val("select flow_id from comprova.approval_instances where id=$1", instance),flow);
    assert.equal((await rows("update comprova.expenses set amount=30 where id=$1 returning id", expense)).length,0);
    assert.equal((await rows("delete from storage.objects where name=$1 returning name", path)).length,0);
    await as(outsider);
    assert.equal((await rows("select id from comprova.reports where id=$1", report)).length,0);
    assert.equal((await rows("select name from storage.objects where name=$1", path)).length,0);
    await as(admin);
    const reviewerMember = await val("select id from comprova.company_members where company_id=$1 and user_id=$2", company, reviewer);
    await q("select comprova.set_company_member_active($1,$2,false)", company, reviewerMember);
    await as(reviewer);
    assert.equal((await rows("select id from comprova.reports where id=$1", report)).length,0);
    await assert.rejects(q("select comprova.decide_report($1,'approve','',1,1)", instance), /aprovador ativo/);
    await as(admin);
    await q("select comprova.set_company_member_active($1,$2,true)", company, reviewerMember);
    await as(reviewer);
    assert.equal((await rows("select expense_id from comprova.report_expenses where report_id=$1", report)).length,1);
    assert.equal((await rows("select id from comprova.expenses where id=$1", expense)).length,1);
    assert.equal((await rows("select id from comprova.receipts where id=$1", receipt)).length,1);
    assert.equal((await rows("select name from storage.objects where name=$1", path)).length,1);
    assert.equal((await val("select comprova.decide_report($1,'approve','',1,1)", instance)).next_step,2);
    assert.equal((await rows("select id from comprova.reports where id=$1", report)).length,0);
    assert.equal((await rows("select name from storage.objects where name=$1", path)).length,0);
    assert.equal((await rows("select id from comprova.approval_decisions where report_id=$1", report)).length,1);
    await as(admin);
    assert.equal((await val("select comprova.decide_report($1,'reject','Corrigir a classificação',1,2)", instance)).status,"rejected");
    await as(employee);
    assert.equal((await rows("delete from comprova.reports where id=$1 returning id", report)).length,0);
    await q("update comprova.expenses set amount=32 where id=$1", expense);
    assert.equal((await val("select comprova.submit_report($1)", report)).approval_id,instance);
    await as(reviewer);
    await assert.rejects(q("select comprova.decide_report($1,'approve','',1,1)", instance), /aprovação mudou/i);
    assert.equal((await val("select comprova.decide_report($1,'approve','',2,1)", instance)).next_step,2);
    await as(admin);
    assert.equal((await val("select comprova.decide_report($1,'approve','',2,2)", instance)).status,"approved");
    await as(finance);
    assert.equal((await rows("select expense_id from comprova.report_expenses where report_id=$1", report)).length,1);
    assert.equal((await val("select comprova.mark_report_paid($1)", report)).status,"paid");
    await as(employee);
    const draft = await createReport();
    const expense2 = await val("insert into comprova.expenses(receipt_id,user_id,expense_date,amount) values ($1,$2,current_date,18) returning id", receipt, employee);
    await q("insert into comprova.report_expenses(report_id,expense_id) values ($1,$2)", draft, expense2);
    assert.equal((await rows("delete from comprova.reports where id=$1 returning id", draft)).length,1);
    assert.equal((await rows("select id from comprova.expenses where id=$1", expense2)).length,1);
    const manualReport = await createReport();
    const addManual = () => val("select comprova.add_manual_report_expense($1,'Fornecedor QA',current_date,20,'Outros','Despesa manual',null)", manualReport);
    await assert.rejects(addManual(), /exige comprovante/);
    await as(admin);
    await q("update comprova.companies set require_receipt=false where id=$1", company);
    await as(employee);
    const manualExpense = await addManual();
    assert.equal(await val("select entry_source from comprova.expenses where id=$1", manualExpense), "manual");
    assert.equal((await val("select comprova.submit_report($1)", manualReport)).status, "submitted");
    await q("select comprova.withdraw_report($1)", manualReport);
    assert.equal(await val("select status from comprova.reports where id=$1", manualReport), "draft");
    assert.equal((await rows("delete from comprova.reports where id=$1 returning id", manualReport)).length,0);
    await q("update comprova.expenses set amount=25 where id=$1", manualExpense);
    assert.equal(Number(await val("select total_amount from comprova.reports where id=$1", manualReport)),25);
    await db.exec("reset role");
    assert.equal(await val("select count(*)::int from storage.objects where bucket_id='untouched'"),1);
    assert.equal(await val("select count(*)::int from comprova.approval_decisions where report_id=$1", report),4);
    assert.equal(await val("select count(*)::int from comprova.policy_rules where id=$1", rule),1);
  } finally {
    await db.close();
  }
});
