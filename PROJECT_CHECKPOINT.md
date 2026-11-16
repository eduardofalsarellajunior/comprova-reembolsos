# COMPROVA — checkpoint de retomada

- **Data/fuso:** 16/11/2026, America/Sao_Paulo.
- **Responsável atual:** conta de origem / Local (alias); conta de destino ainda não assumiu a tarefa.
- **Tarefa atual:** estruturar memória técnica e preparar continuidade entre contas.
- **Última etapa concluída:** inventário e documentação revisados; autorização recebida para seguir com a transferência, tratada como publicação dos documentos em branch separada.
- **Estado de transferência:** conteúdo preparado para `codex/comprova-handoff`, com bloqueio de deploy automático dessa branch. Confirme o SHA no GitHub; a existência deste arquivo no computador de origem não confirma o push. Nenhuma publicação em `main`, deploy ou alteração no banco faz parte da transferência.

## Ponto de partida observado

- Windows/PowerShell, checkout principal; `git-dir` e `git-common-dir` em `.git`, sem outro worktree no inventário.
- Raiz deste computador: `C:\Users\55169\OneDrive - INEPAD CONSULTING LTDA\Lixo e Old\Documentos\Integração Vexpenses`. A pasta inicial da sessão (`SDR por Voz`) **não** é o COMPROVA. No outro computador, descubra o caminho em vez de copiar este.
- Remoto: `https://github.com/eduardofalsarellajunior/comprova-reembolsos.git`. Branch ativa: `codex/comprova-v1-preview`, HEAD `477aecfa6563e8e6692ce0624133a7be6ad370ac`.
- Últimos SHAs remotos confirmados: `main = 477aecfa6563e8e6692ce0624133a7be6ad370ac`; `codex/comprova-v1-preview = 49e5daed730738d84664256211fde9fdfda3c094`. A `main` local está em `a20abfb`. Nada staged no início.

## Arquivos a preservar e escopo

**Desta entrega:** `AGENTS.md`, `PROJECT_STATUS.md`, `PROJECT_LOG.md`, `PROJECT_CHECKPOINT.md`. Na branch de transferência, `vercel.json` desabilita apenas o deploy automático de `codex/comprova-handoff`; a regra não muda as demais branches.

**Da tarefa anterior (Configurações), ainda só na árvore de trabalho:**

- `app/configuracoes/`: `page.tsx`, `sections.ts`, `settings-workspace.tsx`, `settings.css`, `account-settings.tsx`, `department-settings.tsx`, `department-settings.module.css`, `operational-settings.tsx`.
- `app/page.tsx`, `app/empresa/page.tsx`, `app/relatorios/page.tsx`, `app/aprovacoes/page.tsx`, `types/supabase-js.d.ts`.
- `supabase/migrations/20261116181505_comprova_organization_settings.sql`, `docs/OPERACAO-REEMBOLSOS.md`, `tests/company-workflow.postgres.mjs`, `tests/rendered-html.test.mjs`, `tests/settings-navigation.test.mjs`.

**Fora do escopo:** preserve `tsconfig.json` (Git o marcou modificado; diff de conteúdo vazio nesta verificação), comprovantes e capturas locais, documentos locais sobre o robô VExpenses e o script local de teste do pacote VExpenses. Não inclua esses itens por conveniência e não apague arquivos de usuário.

## Testes, lacunas e próxima ação

- **Neste handoff:** origem, branches e árvore verificadas; quatro arquivos e 17 links relativos conferidos. `git diff --check` sem erros (só avisos de LF/CRLF em arquivos preexistentes); nenhum arquivo staged. Não executados build ou testes funcionais: alteração exclusivamente documental.
- **Configurações, teste anterior:** build Next/TypeScript, smoke, ESLint focado, suíte de banco descartável e teste de navegação passaram. Faltam a aplicação aprovada da migration, o deploy aprovado e a validação com perfis/contas reais após a publicação. A produção não foi revalidada nesta sessão.
- **Próxima ação exata:** na conta de destino, abra a branch `codex/comprova-handoff` após receber o SHA confirmado pela origem e siga “Recebimento” abaixo. Leia o histórico e registre a assunção. Se a próxima tarefa for continuar Configurações, obtenha antes a revisão de código ou o commit aprovado pela conta de origem; não procure essa implementação na branch de documentos nem a refaça por suposição.

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
