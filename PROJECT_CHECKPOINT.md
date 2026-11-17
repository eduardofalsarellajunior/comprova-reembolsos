# INEPAD Reembolso — checkpoint de retomada

- **Data/fuso:** 17/11/2026, America/Sao_Paulo.
- **Responsável atual:** conta de origem / Local (alias); conta de destino ainda não assumiu a tarefa.
- **Tarefa atual:** publicação do redesign INEPAD Reembolso em produção.
- **Última etapa concluída:** redesign aplicado e validado em cópia descartável; pré-check confirma que Configurações depende de migration ainda não aplicada.
- **Estado de transferência:** o handoff documental anterior permanece na [branch codex/comprova-handoff](https://github.com/eduardofalsarellajunior/comprova-reembolsos/tree/codex/comprova-handoff), SHA `2ae7d6a2e7e8d9df3b44e574c297fbaf0e85cadd`. Ele não inclui a implementação de Configurações nem o redesign.

## Ponto de partida observado

- Windows/PowerShell, checkout principal; `git-dir` e `git-common-dir` em `.git`, sem outro worktree no inventário.
- Raiz deste computador: `C:\Users\55169\OneDrive - INEPAD CONSULTING LTDA\Lixo e Old\Documentos\Integração Vexpenses`. A pasta inicial da sessão (`SDR por Voz`) **não** é o COMPROVA. No outro computador, descubra o caminho em vez de copiar este.
- Remoto: `https://github.com/eduardofalsarellajunior/comprova-reembolsos.git`. Branch ativa: `codex/comprova-v1-preview`, HEAD `477aecfa6563e8e6692ce0624133a7be6ad370ac`.
- Últimos SHAs remotos confirmados: `main = 477aecfa6563e8e6692ce0624133a7be6ad370ac`; `codex/comprova-v1-preview = 49e5daed730738d84664256211fde9fdfda3c094`. A `main` local está em `a20abfb`. Nada staged no início.

## Arquivos a preservar e escopo

**Desta etapa:** `app/layout.tsx`, `app/app-chrome.tsx`, `app/workspace-shell.css`, `app/page.tsx`, `app/login/page.tsx`, `app/aprovacoes/page.tsx`, `app/relatorios/page.tsx` e seus componentes de leitura; refinamento de `app/configuracoes/`, ativos em `public/inepad-reembolso/`, teste de fumaça e documentação.

**Da entrega documental anterior:** `AGENTS.md`, `PROJECT_STATUS.md`, `PROJECT_LOG.md`, `PROJECT_CHECKPOINT.md`. Na branch de transferência, `vercel.json` desabilita apenas o deploy automático de `codex/comprova-handoff`; a regra não muda as demais branches.

**Da tarefa anterior (Configurações), ainda só na árvore de trabalho:**

- `app/configuracoes/`: `page.tsx`, `sections.ts`, `settings-workspace.tsx`, `settings.css`, `account-settings.tsx`, `department-settings.tsx`, `department-settings.module.css`, `operational-settings.tsx`.
- `app/page.tsx`, `app/empresa/page.tsx`, `app/relatorios/page.tsx`, `app/aprovacoes/page.tsx`, `types/supabase-js.d.ts`.
- `supabase/migrations/20261116181505_comprova_organization_settings.sql`, `docs/OPERACAO-REEMBOLSOS.md`, `tests/company-workflow.postgres.mjs`, `tests/rendered-html.test.mjs`, `tests/settings-navigation.test.mjs`.

**Fora do escopo:** preserve `tsconfig.json` (Git o marcou modificado; diff de conteúdo vazio nesta verificação), comprovantes e capturas locais, documentos locais sobre o robô VExpenses e o script local de teste do pacote VExpenses. Não inclua esses itens por conveniência e não apague arquivos de usuário.

## Testes, lacunas e próxima ação

- **Neste handoff:** origem, branches e árvore verificadas. O commit de transferência passou em `git diff --cached --check`; os quatro documentos e os 18 links relativos foram validados. No checkout principal, o índice continuou vazio. Não executados build ou testes funcionais: alteração documental com uma regra de não-deploy na branch de transferência.
- **Configurações, teste anterior:** build Next/TypeScript, smoke, ESLint focado, suíte de banco descartável e teste de navegação passaram. Faltam a aplicação aprovada da migration, o deploy aprovado e a validação com perfis/contas reais após a publicação. A produção não foi revalidada nesta sessão.
- **Redesign, nesta tarefa:** build Webpack com TypeScript e fontes simuladas, ESLint de `app` e do teste alterado, smoke HTTP e teste das 18 seções passaram. Chromium em desktop e celular validou login fictício, busca em Configurações, menu recolhível e upload de comprovante fictício, OCR simulado, revisão e vínculo pelo endpoint real contra um banco simulado. O relatório ficou em rascunho. Não houve sessão Office 365 real, consumo de OCR real nem teste em produção.
- **Próxima ação exata:** obter autorização explícita para aplicar apenas `20261116181505_comprova_organization_settings.sql` no schema `comprova` de `xammlyxakxrysjrzdbeq`. O deploy do app foi autorizado; não subir a nova versão antes da dependência no banco.
- **Ordem da publicação:** revalidar a base GitHub, histórico e alvo do Supabase; aplicar a migration aprovada e conferir RLS, permissões e carga de 3 departamentos/23 cargos somente na empresa INEPAD identificada; depois enviar o commit revisado à `main` e validar Vercel READY, redirect, marca e APIs sem sessão. Não apresentar smoke anônimo como teste de Office 365 ou OCR reais.
- **Recuperação:** referência anterior `477aecf` / deploy `dpl_Egrw7WncJf6xZoapmVBo2Wm9wMUx`. Se o front precisar voltar, preservar dados e tabelas novas; não reverter o banco compartilhado de forma destrutiva. A RPC de convites existente passa a rejeitar convite de e-mail já cadastrado, sem sobrescrever permissões.

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
