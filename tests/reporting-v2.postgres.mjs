// Disposable PostgreSQL and mocked mail only. Never uses project credentials.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { approvalEmailMessage, authorizedEmailDispatcher, createEmailProvider, dispatchApprovalEmailBatch, dispatchConfiguredApprovalEmails } from "../lib/email-server.ts";
import { hasExpenseFields, isReportDate, parsePositiveBrl } from "../lib/report-validation.ts";

const { PGlite } = await import(process.env.COMPROVA_PGLITE_MODULE || "@electric-sql/pglite");
const [admin, employee, reviewer, outsider] = [1,2,3,4].map(n => `00000000-0000-4000-8000-00000000000${n}`);
const migrations = [
  "20261104120000_comprova_isolated_schema.sql", "20261106120000_comprova_reimbursement_core.sql",
  "20261106123000_comprova_audit_insert_policy.sql", "20261106124500_comprova_sync_jobs_insert_policy.sql",
  "20261106180000_comprova_sync_jobs_owner_guard.sql", "20261112120000_comprova_company_configuration.sql",
  "20261112123000_comprova_secure_approvals.sql", "20261116181505_comprova_organization_settings.sql",
];

test("reporting V2 validates direct writes/manual/OCR, preserves history, and queues only final approval", async () => {
  const db = await PGlite.create();
  const q = (sql,...params) => db.query(sql,params);
  const val = async (sql,...params) => Object.values((await q(sql,...params)).rows[0])[0];
  async function as(id,role="authenticated") {
    await db.exec("reset role");
    await q("select set_config('request.jwt.claim.sub',$1,false)",id || "");
    await db.exec(`set role ${role}`);
  }
  const migration = async file => db.exec(await readFile(new URL(`../supabase/migrations/${file}`,import.meta.url),"utf8"));
  try {
    await db.exec(`
      create role authenticated; create role anon; create role service_role;
      create schema auth;
      create table auth.users(id uuid primary key,email text not null,email_confirmed_at timestamptz);
      create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
      grant usage on schema auth to authenticated,anon;
      create schema storage;
      create table storage.buckets(id text primary key,name text not null,public boolean not null);
      create table storage.objects(bucket_id text not null references storage.buckets(id),name text not null,primary key(bucket_id,name));
      alter table storage.objects enable row level security;
      grant usage on schema storage to authenticated;
      grant select,insert,update,delete on storage.objects to authenticated;
      insert into storage.buckets values('untouched','untouched',false);
      insert into storage.objects values('untouched','sentinel.txt');
    `);
    for (const [id,email] of [[admin,"admin@example.test"],[employee,"owner@example.test"],[reviewer,"reviewer@example.test"],[outsider,"outsider@example.test"]])
      await q("insert into auth.users values($1,$2,now())",id,email);
    for (const file of migrations) await migration(file);
    await as(admin);
    const company = await val("select comprova.create_company('QA reporting')");
    await q("update comprova.companies set require_receipt=false where id=$1",company);
    for (const [id,role,email] of [[employee,"employee","owner@example.test"],[reviewer,"approver","reviewer@example.test"]]) {
      await q("select comprova.invite_company_member($1,$2,$3)",company,email,role);
      await as(id); await q("select comprova.claim_company_invitations()"); await as(admin);
    }
    const legacyCenter = await val("insert into comprova.cost_centers(company_id,name) values($1,'Legacy') returning id",company);
    await as(employee);
    const legacy = await val("insert into comprova.reports(owner_id,company_id,name,currency,cost_center_id) values($1,$2,'USD history','USD',$3) returning id",employee,company,legacyCenter);
    await db.exec("reset role");
    for (const file of ["20261117164803_comprova_policy_catalog_v2.sql","20261117164815_comprova_member_profiles_import.sql","20261117164832_comprova_project_members_and_approvals.sql","20261117165624_comprova_reporting_v2_mail.sql"]) await migration(file);
    await as(admin);
    const member = await val("select id from comprova.company_members where company_id=$1 and user_id=$2",company,employee);
    const approver = await val("select id from comprova.company_members where company_id=$1 and user_id=$2",company,reviewer);
    const ownerMember = await val("select id from comprova.company_members where company_id=$1 and user_id=$2",company,admin);
    const project = await val("select comprova.save_managed_project($1,null,'Active','','',true,$2::uuid[])",company,[member]);
    const forbiddenProject = await val("select comprova.save_managed_project($1,null,'Not linked','','',true,$2::uuid[])",company,[ownerMember]);
    await q("select comprova.set_member_approvers($1,$2,$3::uuid[],null)",company,member,[approver,ownerMember]);
    const payment = await val("insert into comprova.payment_methods(company_id,name) values($1,'Pessoal') returning id",company);
    await q("insert into comprova.expense_categories(company_id,name) values($1,'Alimentação')",company);
    await as(employee);
    const createReport = (currency="BRL",projectId=project,paymentId=payment) => val("insert into comprova.reports(owner_id,company_id,name,currency,project_id,payment_method_id) values($1,$2,'QA report',$3,$4,$5) returning id",employee,company,currency,projectId,paymentId);
    const manual = (report,amount=25,description="Almoço") => val("select comprova.add_manual_report_expense($1,'Restaurante',current_date,$2,'Alimentação',$3,null)",report,amount,description);
    assert.equal(await val("select currency from comprova.reports where id=$1",legacy),"USD");
    await assert.rejects(manual(legacy),/BRL/);
    assert.equal(await val("select cost_center_id from comprova.reports where id=$1",legacy),legacyCenter);
    await assert.rejects(createReport("USD"),/reais|BRL/);
    await assert.rejects(createReport("BRL",forbiddenProject),/projeto ativo/);
    await assert.rejects(createReport("BRL",project,null),/pagamento ativa/);
    const report = await createReport();
    await assert.rejects(q("update comprova.reports set cost_center_id=$1 where id=$2",legacyCenter,report),/não centro de custo/);
    for (const amount of [0,-1,0.001,"NaN","Infinity",1000000000]) await assert.rejects(manual(report,amount),/positivo/);
    for (const description of ["","   ","a".repeat(1001)]) await assert.rejects(manual(report,25,description),/descrição/);
    const expense = await manual(report);
    await assert.rejects(q("update comprova.expenses set description='' where id=$1",expense),/descrição/);
    await assert.rejects(q("update comprova.expenses set currency='USD' where id=$1",expense),/reais/);
    await assert.rejects(q("update comprova.expenses set category='Unlisted' where id=$1",expense),/tipo de despesa/);
    await q("insert into storage.objects values('comprova-documents',$1)",`${employee}/mock.jpg`);
    const receipt = await val("insert into comprova.receipts(user_id,file_name,storage_path,mime_type,size_bytes) values($1,'mock.jpg',$2,'image/jpeg',10) returning id",employee,`${employee}/mock.jpg`);
    const ocr = await val("insert into comprova.expenses(user_id,receipt_id,amount,description,currency) values($1,$2,null,'','USD') returning id",employee,receipt);
    assert.equal(await val("select count(*)::int from comprova.expenses where id=$1",ocr),1);
    await assert.rejects(q("insert into comprova.report_expenses(report_id,expense_id) values($1,$2)",report,ocr),/Revise/);
    // The failed link did not lose the original receipt or extraction.
    assert.equal(await val("select count(*)::int from comprova.receipts where id=$1",receipt),1);
    await q("update comprova.expenses set amount=10,description='Revisado',currency='BRL',category='Alimentação',expense_date=current_date where id=$1",ocr);
    await q("insert into comprova.report_expenses(report_id,expense_id) values($1,$2)",report,ocr);
    const submitted = await val("select comprova.submit_report($1)",report);
    await as(outsider);
    await assert.rejects(q("select comprova.decide_report($1,'approve','',1,1)",submitted.approval_id),/aprovador ativo/);
    await assert.rejects(q("select comprova.claim_approval_emails(5)"),/permission denied/);
    await assert.rejects(q("select * from comprova.approval_email_outbox"),/permission denied/);
    await as(reviewer);
    assert.equal((await val("select comprova.decide_report($1,'approve','',1,1)",submitted.approval_id)).status,"submitted");
    await db.exec("reset role");
    assert.equal(await val("select count(*)::int from comprova.approval_email_outbox"),0);
    await as(admin);
    assert.equal((await val("select comprova.decide_report($1,'approve','',1,2)",submitted.approval_id)).status,"approved");
    await assert.rejects(q("select comprova.decide_report($1,'approve','',1,2)",submitted.approval_id),/não está em aprovação/);
    await db.exec("reset role");
    assert.equal(await val("select count(*)::int from comprova.approval_decisions where decision='approve'"),2);
    assert.equal(await val("select count(*)::int from comprova.approval_email_outbox"),1);
    assert.equal(await val("select recipient from comprova.approval_email_outbox"),"owner@example.test");
    await as(null,"service_role");
    const first = (await q("select * from comprova.claim_approval_emails(5)")).rows;
    assert.equal(first.length,1);
    assert.equal((await q("select * from comprova.claim_approval_emails(5)")).rows.length,0);
    const job = first[0];
    assert.equal(await val("select comprova.finish_approval_email($1,$2,false,true,null,'provider_unavailable')",job.id,job.lease_token),true);
    assert.equal(await val("select comprova.finish_approval_email($1,$2,true,false,'fake',null)",job.id,job.lease_token),false);
    await db.exec("reset role");
    assert.equal(await val("select status from comprova.approval_email_outbox"),"retry");
    await q("update comprova.approval_email_outbox set available_at=now()-interval '1 minute'");
    await as(null,"service_role");
    const second = (await q("select * from comprova.claim_approval_emails(5)")).rows[0];
    assert.equal(second.id,job.id);
    assert.notEqual(second.lease_token,job.lease_token);
    assert.equal(await val("select comprova.finish_approval_email($1,$2,true,false,'mock-provider-id',null)",second.id,second.lease_token),true);
    assert.equal((await q("select * from comprova.claim_approval_emails(5)")).rows.length,0);
    await db.exec("reset role");
    // Simulate an ambiguous crash after provider acceptance: no retry beyond key TTL.
    await q("update comprova.approval_email_outbox set status='processing',first_attempt_at=now()-interval '24 hours',locked_until=now()-interval '1 minute'");
    await as(null,"service_role");
    assert.equal((await q("select * from comprova.claim_approval_emails(5)")).rows.length,0);
    await db.exec("reset role");
    assert.equal(await val("select status from comprova.approval_email_outbox"),"failed");
    assert.equal(await val("select last_error_code from comprova.approval_email_outbox"),"reconciliation_required");
    assert.equal(await val("select count(*)::int from auth.users"),4);
    assert.equal(await val("select count(*)::int from storage.objects where bucket_id='untouched' and name='sentinel.txt'"),1);
  } finally { await db.close(); }
});

const mockJob = { id:"00000000-0000-4000-8000-000000000099",lease_token:"lease",attempts:1,recipient:"owner@example.test",payload:{reportName:'<img src=x onerror="alert(1)">&',reportCode:"RMB-TEST",totalAmount:35,currency:"BRL",approvedAt:"2026-11-17T12:00:00Z"} };

test("mail configuration fails closed, authorization is required, and HTML is escaped", () => {
  assert.equal(createEmailProvider({}),null);
  assert.equal(createEmailProvider({COMPROVA_EMAIL_PROVIDER:"resend",RESEND_API_KEY:"mock",COMPROVA_EMAIL_FROM:"bad\r\n@example.test"}),null);
  assert.equal(authorizedEmailDispatcher(null,"a".repeat(32)),false);
  assert.equal(authorizedEmailDispatcher(`Bearer ${"a".repeat(32)}`,"a".repeat(32)),true);
  assert.equal(authorizedEmailDispatcher(`Bearer ${"b".repeat(32)}`,"a".repeat(32)),false);
  assert.equal(authorizedEmailDispatcher("Bearer short","short"),false);
  const message = approvalEmailMessage(mockJob);
  assert.ok(message.html.includes("&lt;img"));
  assert.ok(!message.html.includes("<img"));
  assert.ok(message.text.includes("A aprovação não confirma pagamento"));
  assert.equal(approvalEmailMessage({...mockJob,recipient:"attacker@example.test\nBcc: bad@example.test"}),null);
});

test("mail worker retries with the same idempotency key, never exposes provider responses", async () => {
  const requests = [];
  let sequence = 0;
  const provider = createEmailProvider({COMPROVA_EMAIL_PROVIDER:"resend",RESEND_API_KEY:"mock-secret",COMPROVA_EMAIL_FROM:"QA <mail@example.test>"},async (url,options) => {
    requests.push({url,options});
    return ++sequence === 1 ? new Response("sensitive-provider-error",{status:503}) : Response.json({id:"mock-message"});
  });
  const finishes=[];
  const store={claim:async()=>[mockJob],finish:async(job,result)=>{finishes.push(result);return true;}};
  assert.equal((await dispatchApprovalEmailBatch(store,provider)).retry,1);
  assert.equal((await dispatchApprovalEmailBatch(store,provider)).sent,1);
  assert.equal(requests[0].options.headers["Idempotency-Key"],requests[1].options.headers["Idempotency-Key"]);
  assert.equal(JSON.parse(requests[0].options.body).to[0],"owner@example.test");
  assert.deepEqual(finishes[0],{success:false,retryable:true,code:"provider_unavailable"});
  const unconfirmed = await dispatchApprovalEmailBatch({...store,finish:async()=>false},provider);
  assert.equal(unconfirmed.sent,0);
  assert.equal(unconfirmed.unconfirmed,1);
});

test("automatic approval dispatch requires explicit opt-in and leaves the queue untouched when disabled", async () => {
  let claimed=0;
  const store={claim:async()=>{claimed++;return [mockJob];},finish:async()=>true};
  const config={COMPROVA_EMAIL_PROVIDER:"resend",RESEND_API_KEY:"mock-secret",COMPROVA_EMAIL_FROM:"mail@example.test"};
  assert.deepEqual(await dispatchConfiguredApprovalEmails(config,()=>store),{enabled:false});
  assert.deepEqual(await dispatchConfiguredApprovalEmails({COMPROVA_EMAIL_SEND_ENABLED:"true"},()=>store),{enabled:false});
  assert.equal(claimed,0);
  const result=await dispatchConfiguredApprovalEmails({...config,COMPROVA_EMAIL_SEND_ENABLED:"true"},()=>store,1,async()=>Response.json({id:"mock-approved"}));
  assert.equal(claimed,1);
  assert.equal(result.sent,1);
});

test("provider idempotency conflicts retry only concurrent requests with the same immutable key", async () => {
  const config = { COMPROVA_EMAIL_PROVIDER:"resend", RESEND_API_KEY:"mock-secret", COMPROVA_EMAIL_FROM:"mail@example.test" };
  for (const [name, retryable] of [["concurrent_idempotent_requests",true],["invalid_idempotent_request",false],["unknown_conflict",false]]) {
    const provider = createEmailProvider(config, async () => Response.json({name,message:"sensitive body must stay private"},{status:409}));
    assert.deepEqual(await provider.send(approvalEmailMessage(mockJob),"fixed-test-key"), {
      success:false, retryable, code:retryable ? "provider_unavailable" : "provider_rejected",
    });
  }
});

test("strict numeric cents, required description/BRL and report dates", () => {
  for (const amount of [0,-1,0.001,NaN,Infinity,1000000000]) assert.equal(parsePositiveBrl(amount),null);
  assert.equal(parsePositiveBrl("1.234,56"),1234.56);
  assert.equal(hasExpenseFields({amount:"1.234",description:"ok",currency:"BRL"}),false);
  assert.equal(hasExpenseFields({amount:"12.34",description:"ok",currency:"BRL"}),true);
  assert.equal(hasExpenseFields({amount:1,description:" ",currency:"BRL"}),false);
  assert.equal(isReportDate("2026-02-30"),false);
  assert.equal(isReportDate("2026-11-17"),true);
});
