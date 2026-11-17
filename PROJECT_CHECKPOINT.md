# INEPAD Reembolso — checkpoint de retomada

## Checkpoint atual — continuidade e Configurações V2 (incompleto)

- **Atualizado:** 2026-11-17 15:39:35 -03:00, America/Sao_Paulo.
- **Ambiente:** Local/Windows, checkout principal do COMPROVA; não é Cloud nem worktree. A pasta inicial SDR por Voz não pertence a este produto.
- **Objetivo:** concluir Configurações V2 sem perder o trabalho entre contas. Nesta microetapa, criar o prompt reutilizável de retomada solicitado pelo usuário, sem alterar funcionalidades.
- **Última etapa concluída:** [PROMPT-RETOMADA.md](PROMPT-RETOMADA.md) criado, revisado e confirmado no GitHub em `c57d6a6a83a35b1ece598364848efc243a74616a`; inclui Local/worktree/Cloud, leitura das evidências, checkpoints de aproximadamente cinco minutos, autorização exclusiva de push em continuidade e limites de segurança. Seis arquivos documentais/de suporte alterados; nenhum código funcional modificado por esta microetapa.
- **Em execução:** entrega do prompt e registro da confirmação do snapshot; nenhuma nova etapa funcional iniciada. Conteúdo funcional V2 continua parcial, não homologado e não liberado para deploy.
- **Git:** origem `codex/comprova-v1-preview`, HEAD `477aecfa6563e8e6692ce0624133a7be6ad370ac`; `main` remota `b36af53f175190ef362f9a7a570b656a093a07a1`. O snapshot parte da `main` num clone separado; não usar a `main` local antiga. Autorização automática restrita a `codex/continuity`.
- **Arquivos:** lista explícita em [scripts/continuity-files.json](scripts/continuity-files.json), agora com 56 caminhos. Nesta microetapa: novo `PROMPT-RETOMADA.md`, referência em `AGENTS.md`, allowlist e atualização dos três registros. Demais arquivos funcionais apenas preservados no snapshot; nenhuma exclusão.
- **Decisões:** BRL para novas operações sem converter históricos; manter tabelas/fluxos antigos para o histórico; nomes de tipo Normal/Intermediário/Administrador com compatibilidade de papéis internos; sem elevar usuários existentes por importação ambígua; perfis privados por empresa. Estas decisões ainda exigem testes.
- **Inventário privado:** XLS original no computador do usuário, 22 e-mails distintos; não é incluído em Git nem no snapshot. O conversor não contém os dados. Projetos, aprovadores e campos ausentes não podem ser adivinhados.
- **Testes:** revisão independente do prompt aprovada; 24 links relativos e existência dos 56 caminhos conferidos, sintaxe PowerShell válida e `git diff --check` sem erro (avisos LF/CRLF); índice da origem vazio. O teste puro do importador passou 3/3 na microetapa anterior, não foi repetido por esta alteração documental. O teste de 18 seções antigo precisa ser atualizado. Build completo ainda não executado e há imports ausentes conhecidos.
- **Interrupção/risco:** subagentes de equipe, projetos e políticas pararam por limite informado pela ferramenta. Não há saldo da conta verificado. Não dependemos de uma última execução para salvamento.
- **Próxima ação exata:** confirmar o SHA da branch no GitHub e abrir um clone limpo dela na conta que vai continuar. Releia os quatro documentos; comece por restaurar a compilação: criar `app/configuracoes/team-settings.tsx` (contrato abaixo), adaptar `AccountSettings` para `companyId` e rodar TypeScript/lint. Depois testar migrations e UI V2 em banco descartável; completar e-mail e validar importação com o arquivo privado reanexado. Não aplicar migrations V2 em produção nem fazer merge/deploy sem nova autorização.
- **Contratos para integração:** `TeamSettings({ companyId, ownerId, userId, members, busy, onToggle, onRefresh })`; `AccountSettings({ section, userId, email, companyId? })`; `ProjectSettings({ companyId, members })`; `ExpenseCatalogSettings({ companyId, kind })`; `ExpensePolicySettings({ companyId, admin })`; `MileagePolicySettings({ companyId, admin })`.
- **Migrations V2:** `20261117164803_comprova_policy_catalog_v2.sql`, `20261117164815_comprova_member_profiles_import.sql`, `20261117164832_comprova_project_members_and_approvals.sql` contêm código parcial/revisão pendente; `20261117165624_comprova_reporting_v2_mail.sql` está vazio. Nenhuma aplicada. Sem serviço de e-mail/configuração de remetente implementado.
- **Produção preservada:** Vercel `dpl_7VFpffhuCx8UDiVB3Jox5mCd6Xxn`, revisão `b36af53`, banco só com a migration organizacional previamente aprovada. A configuração de continuidade não acessa o banco.
- **Sincronização:** prompt confirmado em `c57d6a6a83a35b1ece598364848efc243a74616a`; esta revisão registra o resultado e pode ter SHA posterior. O snapshot leva código, documentos, prompt e bloqueio de deploy juntos. Compare a ponta de `git ls-remote origin refs/heads/codex/continuity` com o SHA entregue; não tente gravar o hash do próprio commit dentro dele.
- **Isolamento conferido:** a consulta de deploys da branch/SHA retornou vazia; domínio de produção continuou em `b36af53`, deploy `dpl_7VFpffhuCx8UDiVB3Jox5mCd6Xxn` READY. Índice e branch da origem preservados.

### Próximos checkpoints e retomada

1. Durante a sessão ativa, termine uma microetapa, atualize este bloco, acrescente eventos relevantes ao log e revise os caminhos da allowlist; não aguarde aviso de créditos.
2. Consulte o SHA remoto atual e compare com o último recebido. No Windows, execute `scripts/sync-continuity.ps1 -ExpectedRemoteSha <SHA> -Publish` (somente a primeira criação usa `absent`). Não use um SHA recém-lido para esconder divergência; primeiro compare o código da outra conta.
3. Confirme o SHA remoto após o push e retome o desenvolvimento sem pedir confirmação rotineira. Registre falha de rede/permissão; nunca chame um commit local de sincronizado.
4. Na outra conta Local: clone o repositório, selecione `codex/continuity`, confira SHA e arquivos, e retome a próxima ação acima. Em Cloud: selecione essa branch ao abrir a tarefa; cada clone pode ser isolado. Nenhum trabalho ou arquivo pessoal é herdado de outro chat automaticamente.
5. Se houve mudança concorrente, preserve as duas pontas e pause apenas o push. Não faça merge/rebase/force para destravar. O procedimento não instala temporizador, serviço ou tarefa agendada; cinco minutos é uma meta operacional.

## Checkpoint anterior — publicação do redesign (preservado)

- **Data/fuso:** 17/11/2026, America/Sao_Paulo.
- **Responsável atual:** conta de origem / Local (alias); conta de destino ainda não assumiu a tarefa.
- **Tarefa atual:** publicação do redesign INEPAD Reembolso em produção.
- **Última etapa concluída:** redesign e Configurações publicados e conferidos no domínio de produção; migration no histórico Supabase `20261117160746`.
- **Estado de transferência:** a implementação e a documentação de release estão na `main`, SHA `b36af53f175190ef362f9a7a570b656a093a07a1`. A antiga branch `codex/comprova-handoff` é só o handoff inicial.

## Ponto de partida observado

- Windows/PowerShell, checkout principal; `git-dir` e `git-common-dir` em `.git`, sem outro worktree no inventário.
- Raiz deste computador: `C:\Users\55169\OneDrive - INEPAD CONSULTING LTDA\Lixo e Old\Documentos\Integração Vexpenses`. A pasta inicial da sessão (`SDR por Voz`) **não** é o COMPROVA. No outro computador, descubra o caminho em vez de copiar este.
- Remoto: `https://github.com/eduardofalsarellajunior/comprova-reembolsos.git`. Branch ativa: `codex/comprova-v1-preview`, HEAD `477aecfa6563e8e6692ce0624133a7be6ad370ac`.
- Últimos SHAs remotos confirmados: `main = 477aecfa6563e8e6692ce0624133a7be6ad370ac`; `codex/comprova-v1-preview = 49e5daed730738d84664256211fde9fdfda3c094`. A `main` local está em `a20abfb`. Nada staged no início.

## Arquivos a preservar e escopo

**Desta etapa:** `app/layout.tsx`, `app/app-chrome.tsx`, `app/workspace-shell.css`, `app/page.tsx`, `app/login/page.tsx`, `app/aprovacoes/page.tsx`, `app/relatorios/page.tsx` e seus componentes de leitura; refinamento de `app/configuracoes/`, ativos em `public/inepad-reembolso/`, teste de fumaça e documentação.

**Da entrega documental anterior:** `AGENTS.md`, `PROJECT_STATUS.md`, `PROJECT_LOG.md`, `PROJECT_CHECKPOINT.md`. Na branch de transferência, `vercel.json` desabilita apenas o deploy automático de `codex/comprova-handoff`; a regra não muda as demais branches.

**Da tarefa anterior (Configurações), incluídos neste release:**

- `app/configuracoes/`: `page.tsx`, `sections.ts`, `settings-workspace.tsx`, `settings.css`, `account-settings.tsx`, `department-settings.tsx`, `department-settings.module.css`, `operational-settings.tsx`.
- `app/page.tsx`, `app/empresa/page.tsx`, `app/relatorios/page.tsx`, `app/aprovacoes/page.tsx`, `types/supabase-js.d.ts`.
- `supabase/migrations/20261116181505_comprova_organization_settings.sql`, `docs/OPERACAO-REEMBOLSOS.md`, `tests/company-workflow.postgres.mjs`, `tests/rendered-html.test.mjs`, `tests/settings-navigation.test.mjs`.

**Fora do escopo:** preserve `tsconfig.json` (Git o marcou modificado; diff de conteúdo vazio nesta verificação), comprovantes e capturas locais, documentos locais sobre o robô VExpenses e o script local de teste do pacote VExpenses. Não inclua esses itens por conveniência e não apague arquivos de usuário.

## Testes, lacunas e próxima ação

- **Neste handoff:** origem, branches e árvore verificadas. O commit de transferência passou em `git diff --cached --check`; os quatro documentos e os 18 links relativos foram validados. No checkout principal, o índice continuou vazio. Não executados build ou testes funcionais: alteração documental com uma regra de não-deploy na branch de transferência.
- **Configurações, teste anterior:** build Next/TypeScript, smoke, ESLint focado, suíte de banco descartável e teste de navegação passaram. Falta a validação com perfis/contas reais em uma sessão autenticada.
- **Redesign, nesta tarefa:** build Webpack com TypeScript e fontes simuladas, ESLint de `app` e do teste alterado, smoke HTTP e teste das 18 seções passaram. Chromium em desktop e celular validou login fictício, busca em Configurações, menu recolhível e upload de comprovante fictício, OCR simulado, revisão e vínculo pelo endpoint real contra um banco simulado. O relatório ficou em rascunho. Não houve sessão Office 365 real, consumo de OCR real nem teste em produção.
- **Próxima ação exata:** abrir o [INEPAD Reembolso de produção](https://comprova-reembolsos.vercel.app/), entrar e conferir **Configurações → Departamentos e cargos** e **Relatórios** sem enviar dados de teste ao fluxo de aprovação. Para retomar desenvolvimento de outra conta, usar um clone limpo da `main`, confirmar o SHA e preservar o trabalho local antigo.
- **Banco verificado:** `20261116181505_comprova_organization_settings.sql` no schema `comprova` de `xammlyxakxrysjrzdbeq`. RLS nas três tabelas, seis políticas com checagem de vínculo/admin, RPCs sem acesso anônimo, 3 departamentos/23 cargos na única empresa elegível e buckets privados mantidos.
- **Produção confirmada:** `dpl_7VFpffhuCx8UDiVB3Jox5mCd6Xxn`, READY e ativo no domínio no SHA `b36af53f175190ef362f9a7a570b656a093a07a1`. Smoke HTTP aprovado (307 → Relatórios, quatro páginas com 200, imagem PNG carregada e duas APIs com 401 sem sessão). Office 365, OCR real e perfis reais não foram exercitados.
- **Recuperação:** referência anterior `477aecf` / deploy `dpl_Egrw7WncJf6xZoapmVBo2Wm9wMUx`. Se o front precisar voltar, preservar dados e tabelas novas; não reverter o banco compartilhado de forma destrutiva. A RPC de convites existente passa a rejeitar convite de e-mail já cadastrado, sem sobrescrever permissões.
- **Release:** `a99e210` mais o registro documental da migração, preparados em clone separado e publicados sem force. Pai do candidato `477aecf`, 35 arquivos, sem comprovantes, capturas, scripts locais de robô ou credenciais. O checkout de origem não foi trocado de branch. Esta confirmação pós-deploy foi acrescentada localmente.

## Transferência e retomada

### Envio — conta de origem, Local (Windows)

1. Na raiz correta, releia [AGENTS.md](AGENTS.md), confira `git status --short --branch`, `git diff --stat`, `git diff --cached --stat`, `git worktree list --porcelain` e confirme os refs remotos. Não rode `git pull` por cima da árvore suja nem use a `main` local desatualizada como base.
2. Sugestão de branch: `codex/comprova-handoff` (confirme nome e se já existe antes de criar). Para transferir **toda a tarefa pendente**, isole a branch no HEAD verificado e preserve as mudanças existentes. Use seleção explícita dos arquivos acima; o código e os quatro documentos precisam estar juntos na ponta. Para transferir **apenas o protocolo**, prefira um checkout/worktree limpo a partir do `origin/main` confirmado e copie só os quatro Markdown; registre que o código da tarefa anterior fica no computador de origem.
3. Revise `git diff --cached --name-status`, `git diff --cached --check` e o conteúdo staged. Atualize este checkpoint e o log com o alvo, o SHA de base, o responsável, as verificações e a próxima ação. Registre o SHA de handoff no aviso ao destinatário *depois* do commit (não tente gravar o SHA do próprio commit no arquivo que o gera).
4. Verifique antes a política de auto-deploy: não usar `main` para handoff, nem disparar um Preview ligado a produção. Se não for possível distinguir push de deploy, aguarde orientação/autorizações para a opção segura. Depois de autorizado, faça push explicitamente para a branch remota acordada, sem force. Confira o SHA com `git ls-remote origin refs/heads/codex/comprova-handoff` (substitua se o nome for outro) ou via GitHub. Entregue repo, branch, SHA completo e próxima ação à segunda conta.

### Recebimento — segunda conta, Local

1. Cada conta precisa ter acesso ao repositório GitHub. No segundo computador, abra no Codex Desktop a pasta do clone existente ou clone o repositório em pasta própria. Não copie o OneDrive inteiro, a pasta `.git`, conversas ou `.env.local`.
2. Confira a raiz, o remoto e `git status`. Com acesso adequado, `git fetch origin` atualiza referências locais; compare a branch anunciada e o SHA. Em clone limpo e se a branch local ainda não existir, use `git switch --track origin/codex/comprova-handoff` (ajuste o nome real). Se já existir, confira se a árvore está limpa e se a atualização é fast-forward antes de `git pull --ff-only`. Se houver divergência ou mudanças pendentes, pare e preserve ambas as versões.
3. Abra o projeto no Codex, releia os quatro arquivos, valide que o código esperado existe no SHA e registre a assunção. Nesta transferência, o código esperado é só a base `477aecf`; o trabalho local de Configurações não está incluído. Instale dependências apenas quando necessário, conforme [PROJECT_STATUS.md](PROJECT_STATUS.md); configure valores de teste por ambiente e sem compartilhar credenciais.

### Cloud — envio e retomada

1. Abra a tarefa Cloud para o mesmo repositório e selecione a referência já publicada e autorizada. Registre checkout, branch/SHA inicial e limitações de ambiente. Se não houver SHA remoto para a tarefa anterior, não tente recuperá-la adivinhando a partir do código da `main`.
2. Faça checkpoints no próprio checkout da tarefa. Antes de encerrar, inclua teste, código e documentos no mesmo conjunto versionado. Com autorização, disponibilize em branch/PR e confirme no GitHub o SHA. Se a sessão só entregar um diff, peça ao responsável para revisar e aplicar em checkout separado; o diff ainda **não** é integração.
3. No próximo ambiente (Cloud ou Local), compare o SHA anunciado com o que foi materializado, releia os arquivos e só retome quando código e checkpoint corresponderem. Em caso de rede ou credenciais indisponíveis, registre a limitação e devolva instruções de recuperação; nunca tente contornar políticas de acesso.

**Mensagem curta para colar na outra conta, somente após verificar o GitHub:**

> Abra o repositório COMPROVA `eduardofalsarellajunior/comprova-reembolsos`, branch `<branch-do-handoff>`, SHA `<sha-confirmado-no-GitHub>`. Identifique se está em Local, worktree ou Cloud. Leia AGENTS.md, PROJECT_STATUS.md, PROJECT_CHECKPOINT.md e as entradas relevantes de PROJECT_LOG.md. Confira a árvore Git e retome exatamente o próximo passo. Não faça push, merge, deploy nem migração remota sem autorização.
