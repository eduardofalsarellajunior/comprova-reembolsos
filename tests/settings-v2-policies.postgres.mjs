// Disposable, in-memory PostgreSQL only. This test never connects to Supabase.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const { PGlite } = await import(process.env.COMPROVA_PGLITE_MODULE || "@electric-sql/pglite");
const [admin, employee, reviewer, outsider, second] = [11, 12, 13, 14, 15].map((n) => `00000000-0000-4000-8000-0000000000${n}`);
const migrations = [
  "20261104120000_comprova_isolated_schema.sql", "20261106120000_comprova_reimbursement_core.sql",
  "20261106123000_comprova_audit_insert_policy.sql", "20261106124500_comprova_sync_jobs_insert_policy.sql",
  "20261106180000_comprova_sync_jobs_owner_guard.sql", "20261112120000_comprova_company_configuration.sql",
  "20261112123000_comprova_secure_approvals.sql", "20261116181505_comprova_organization_settings.sql",
];
const v2Migrations = [
  "20261117164803_comprova_policy_catalog_v2.sql", "20261117164815_comprova_member_profiles_import.sql",
  "20261117164832_comprova_project_members_and_approvals.sql", "20261117165624_comprova_reporting_v2_mail.sql",
  "20261119183738_comprova_safe_project_delete.sql",
];

test("Configurações V2: catálogos, projetos, isolamento, limites reais e snapshot de aprovação", async () => {
  const db = await PGlite.create();
  const q = (sql, ...args) => db.query(sql, args);
  const rows = async (sql, ...args) => (await q(sql, ...args)).rows;
  const val = async (sql, ...args) => Object.values((await rows(sql, ...args))[0])[0];
  const apply = async (file) => db.exec(await readFile(new URL(`../supabase/migrations/${file}`, import.meta.url), "utf8"));
  const as = async (id) => {
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub',$1,false)", id);
    await db.exec("set role authenticated");
  };
  try {
    await db.exec(`
      create role authenticated; create role anon; create role service_role bypassrls;
      create schema auth;
      create table auth.users(id uuid primary key,email text not null,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
      grant usage on schema auth to authenticated,anon;
      create schema storage;
      create table storage.buckets(id text primary key,name text not null,public boolean not null);
      create table storage.objects(bucket_id text not null references storage.buckets(id),name text not null,primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
      insert into storage.buckets values ('untouched','untouched',false);
      insert into storage.objects values ('untouched','sentinel.txt');
    `);
    for (const id of [admin, employee, reviewer, outsider, second]) await q("insert into auth.users values($1,$2,now())", id, `qa-${id.slice(-2)}@example.test`);
    for (const file of migrations) await apply(file);
    await as(admin);
    const company = await val("select comprova.create_company('INEPAD CONSULTING LTDA.')");
    await q("update comprova.companies set require_receipt=false where id=$1", company);
    const legacyProject = await val("insert into comprova.projects(company_id,name) values($1,'Projeto histórico') returning id", company);
    for (const [id, role] of [[employee,"employee"], [reviewer,"approver"], [second,"employee"]]) {
      await q("select comprova.invite_company_member($1,$2,$3)", company, `qa-${id.slice(-2)}@example.test`, role);
      await as(id);
      await q("select comprova.claim_company_invitations()");
      await as(admin);
    }
    await as(outsider);
    const foreign = await val("select comprova.create_company('Empresa externa QA')");
    await db.exec("reset role");
    for (const file of v2Migrations) await apply(file);
    await as(admin);
    const memberId = async (id) => val("select id from comprova.company_members where company_id=$1 and user_id=$2", company, id);
    const employeeMember = await memberId(employee);
    const reviewerMember = await memberId(reviewer);
    const secondMember = await memberId(second);
    assert.equal(await val("select count(*)::int from comprova.project_members where project_id=$1", legacyProject), 0, "não inferir vínculos históricos");
    assert.equal(await val("select count(*)::int from comprova.cost_centers where company_id=$1", company), 0, "não inventar centros de custos");
    assert.deepEqual(await rows("select name,reimbursable,exclusive_per_report from comprova.payment_methods where company_id=$1 order by name", company), [
      {name:"Cartão Corporativo",reimbursable:false,exclusive_per_report:false},
      {name:"Cartão Pessoal",reimbursable:true,exclusive_per_report:false}, {name:"Dinheiro",reimbursable:true,exclusive_per_report:false},
    ]);
    assert.deepEqual((await rows("select name from comprova.expense_categories where company_id=$1", company)).map((row) => row.name).sort(), [
      "Alimentação","Combustível","Estacionamento","Gráfica","Hospedagem","Locação Automóvel","Outros","Passagem Aérea","Passagem Rodoviária","Pedágio","Taxi","Telefonia",
    ].sort());
    assert.deepEqual(Object.fromEntries((await rows("select destination,kilometers from comprova.mileage_routes where company_id=$1 and origin='Ribeirão Preto'", company)).map((route) => [route.destination,Number(route.kilometers)])), {
      "Marília":552,"Itu":532,"Olímpia":280,"Franca":202,"Indaiatuba":484,"Cravinhos":42,"Cajuru":130,"Mococa":218,"Guaxupé":316,"Sertãozinho":55,
    });
    const standard = await val("select id from comprova.mileage_policies where company_id=$1 and is_default", company);
    assert.deepEqual(await rows("select rate_per_km::text,allow_manual_rate,requires_manual_receipt from comprova.mileage_policies where id=$1", standard), [
      {rate_per_km:"1.5000",allow_manual_rate:true,requires_manual_receipt:false},
    ]);
    const specific = await val("select comprova.save_mileage_policy_config($1,null,'QA específica',false,2,'{}',null,null,$2::uuid[])", company, [employeeMember]);
    await assert.rejects(q("update comprova.mileage_policies set active=false where id=$1", standard), /check constraint/);
    await assert.rejects(q("select comprova.save_mileage_policy_config($1,null,'QA duplicada',false,2,'{}',null,null,$2::uuid[])", company, [employeeMember]), /outra política/);
    const project = await val("select comprova.save_managed_project($1,null,'Projeto QA','QA','Descrição fictícia',true,$2::uuid[])", company, [employeeMember,secondMember]);
    await assert.rejects(q("select comprova.save_managed_project($1,null,'projeto qa','','',true,'{}')", company), /este nome/);
    const disposableProject = await val("select comprova.save_managed_project($1,null,'Projeto descartável QA','','',true,$2::uuid[])", company, [employeeMember]);
    assert.equal(await val("select count(*)::int from comprova.project_members where project_id=$1", disposableProject), 1);
    await q("select comprova.delete_managed_project($1,$2)", company, disposableProject);
    assert.equal(await val("select count(*)::int from comprova.projects where id=$1", disposableProject), 0, "admin exclui projeto sem relatório");
    assert.equal(await val("select count(*)::int from comprova.project_members where project_id=$1", disposableProject), 0, "exclusão limpa somente vínculos do cadastro");
    await q("select comprova.set_member_approvers($1,$2,$3::uuid[])", company, employeeMember, [reviewerMember]);
    await assert.rejects(q("select comprova.set_member_approvers($1,$2,$3::uuid[])", company, employeeMember, [employeeMember]), /vínculos/);
    await assert.rejects(q("select comprova.set_member_approvers($1,$2,$3::uuid[])", company, reviewerMember, [secondMember]), /aprovadores ativos/);
    const policy = await val("select id from comprova.expense_policy_configs where company_id=$1 and is_default", company);
    const category = await val("select id from comprova.expense_categories where company_id=$1 and name='Alimentação'", company);
    const payment = await val("select id from comprova.payment_methods where company_id=$1 and name='Dinheiro'", company);
    const expenseSpecific = await val("select comprova.save_expense_policy_config($1,null,'QA despesas específica',false,null,null,'[]',$2::uuid[])",company,[secondMember]);
    const configure = (past, future, amount, count, period="expense") => q("select comprova.save_expense_policy_config($1,$2,'INEPAD',true,$3,$4,$5::jsonb,'{}')", company,policy,past,future, JSON.stringify([{
      category_id:category,max_amount:amount,amount_period:period,max_entries:count,count_period:"day",allow_exceed:false,
    }]));
    await configure(null,null,100,2);
    await as(employee);
    assert.equal(await val("select count(*)::int from comprova.mileage_policies where company_id=$1", company), 2, "só padrão e específica própria");
    assert.equal(await val("select count(*)::int from comprova.mileage_policies where id=$1", specific), 1);
    assert.equal(await val("select count(*)::int from comprova.expense_policy_configs where id=$1", expenseSpecific),0);
    await assert.rejects(q("select comprova.save_managed_project($1,null,'Proibido','','',true,'{}')", company), /administradores/);
    await assert.rejects(q("select comprova.delete_managed_project($1,$2)", company, project), /administradores/);
    await assert.rejects(q("select comprova.save_expense_policy_config($1,$2,'INEPAD',true,null,null,'[]','{}')", company,policy), /Permissão insuficiente/);
    await assert.rejects(q("insert into comprova.reports(owner_id,company_id,name,currency,project_id,payment_method_id) values($1,$2,'Sem vínculo','BRL',$3,$4)",employee,company,legacyProject,payment), /vinculado/);
    const makeReport = async (amounts, dateOffset=0) => {
      const report = await val("insert into comprova.reports(owner_id,company_id,name,currency,project_id,payment_method_id) values($1,$2,'Relatório fictício','BRL',$3,$4) returning id",employee,company,project,payment);
      for (const amount of amounts) {
        await q("select comprova.add_manual_report_expense($1,'Fornecedor fictício',(now() at time zone 'America/Sao_Paulo')::date+$2::int,$3,'Alimentação','Despesa fictícia',null)",report,dateOffset,amount);
      }
      return report;
    };
    const excessive = await makeReport([101]);
    await assert.rejects(q("select comprova.submit_report($1)",excessive), /limite/);
    const report = await makeReport([40,45]);
    const submitted = await val("select comprova.submit_report($1)",report);
    const frozenFlow = await val("select approval_flow_id from comprova.reports where id=$1",report);
    assert.equal(submitted.status,"submitted");
    const overCount = await makeReport([10]);
    await assert.rejects(q("select comprova.submit_report($1)",overCount), /limite/);
    await as(admin);
    // Grants may deny the operation before RLS; neither path may mutate a snapshot.
    for (const sql of ["delete from comprova.approval_steps where flow_id=$1 returning id", "update comprova.approval_steps set step_order=2 where flow_id=$1 returning id"]) {
      try { assert.equal((await rows(sql,frozenFlow)).length,0, "snapshot enviado é imutável"); }
      catch (error) { assert.equal(error.code,"42501"); }
    }
    await q("select comprova.set_member_approvers($1,$2,'{}')",company,employeeMember);
    await as(reviewer);
    assert.equal(await val("select approval_flow_id from comprova.reports where id=$1",report),frozenFlow, "aprovação enviada usa snapshot, não novos vínculos");
    assert.equal((await val("select comprova.decide_report($1,'approve','',1,1)",submitted.approval_id)).status,"approved");
    await as(admin);
    await q("select comprova.set_member_approvers($1,$2,$3::uuid[])",company,employeeMember,[reviewerMember]);
    await configure(null,null,100,null,"day");
    await as(employee);
    const overDailyAmount = await makeReport([20]);
    await assert.rejects(q("select comprova.submit_report($1)",overDailyAmount), /limite/, "valor diário considera outros relatórios já aprovados");
    await as(admin);
    await configure(1,0,null,null);
    await as(employee);
    const past = await makeReport([5],-2);
    const future = await makeReport([5],1);
    await assert.rejects(q("select comprova.submit_report($1)",past), /prazo/);
    await assert.rejects(q("select comprova.submit_report($1)",future), /prazo/);
    await as(admin);
    await configure(null,null,null,null);
    await as(employee);
    assert.equal((await val("select comprova.submit_report($1)",past)).status,"submitted", "campos vazios removem limites V2");
    assert.equal((await val("select comprova.submit_report($1)",future)).status,"submitted", "futuro em branco não inventa prazo máximo");
    await as(admin);
    await q("insert into comprova.policy_rules(owner_id,company_id,name,category,max_amount,requires_receipt) values($1,$2,'Teto legado fictício','Alimentação',3,false)",admin,company);
    await as(employee);
    const legacyRestricted = await makeReport([5]);
    await assert.rejects(q("select comprova.submit_report($1)",legacyRestricted), /limite/, "configuração V2 não relaxa regra legada silenciosamente");
    await as(second);
    assert.equal(await val("select count(*)::int from comprova.mileage_policies where company_id=$1",company),1, "outro membro não lê política específica alheia");
    assert.equal(await val("select count(*)::int from comprova.expense_policy_configs where id=$1",expenseSpecific),1);
    await as(outsider);
    assert.equal(await val("select count(*)::int from comprova.expense_policy_configs where company_id=$1",company),0);
    assert.equal(await val("select count(*)::int from comprova.project_members where company_id=$1",company),0);
    await assert.rejects(q("select comprova.set_member_projects($1,$2,$3::uuid[])",company,employeeMember,[project]), /administradores/);
    await as(admin);
    await assert.rejects(q("select comprova.save_managed_project($1,null,'Cruzado','','',true,$2::uuid[])",foreign,[employeeMember]), /administradores/);
    await q("select comprova.set_company_member_active($1,$2,false)",company,employeeMember);
    await q("select comprova.save_mileage_policy_config($1,$2,'QA específica',false,2,'{}',null,null,$3::uuid[])",company,specific,[employeeMember]);
    await q("select comprova.save_managed_project($1,$2,'Projeto QA','QA','',false,$3::uuid[])",company,project,[employeeMember,secondMember]);
    assert.equal(await val("select count(*)::int from comprova.project_members where project_id=$1",project),2, "inativar não remove vínculos");
    await assert.rejects(q("select comprova.delete_managed_project($1,$2)",company,project), /relatórios não pode ser excluído/, "relatório preserva o projeto e orienta inativação");
    assert.equal(await val("select count(*)::int from comprova.projects where id=$1",project),1);
    assert.equal(await val("select has_function_privilege('authenticated','comprova.delete_managed_project(uuid,uuid)','execute')"),true);
    assert.equal(await val("select has_function_privilege('anon','comprova.delete_managed_project(uuid,uuid)','execute')"),false);
    await db.exec("reset role");
    assert.equal(await val("select count(*)::int from auth.users"),5);
    assert.equal(await val("select count(*)::int from storage.objects where bucket_id='untouched'"),1);
    assert.equal(await val("select count(*)::int from comprova.company_members where company_id=$1",foreign),1);
  } finally { await db.close(); }
});
