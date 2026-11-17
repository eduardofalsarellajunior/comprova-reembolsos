# COMPROVA — histórico técnico

Histórico cronológico e cumulativo. Datas de referência em **America/Sao_Paulo**; datas de commits abaixo vêm do histórico Git. A base inicial foi reconstruída a partir do repositório e do histórico de trabalho disponível nesta conta. Não inventar resultados antigos; futuras correções devem ser acrescentadas como novas entradas.

## 2026-08-03 a 2026-08-04 — Leitor, publicação e conta

- **Evidência Git:** `e495a88` leitor em lote; `d42b3f5` configuração privada da IA; `2d719d2` correção para comprovantes grandes; `97ca8fb` adaptação à Vercel; `a7bb906` abertura de comprovante; `ce77863` login e histórico privado.
- **Decisão:** leitura e integração pelo servidor com credenciais fora do navegador. Comprovantes devem ficar privados.
- **Limite:** o histórico Git mostra as mudanças, não o resultado dos testes de cada commit.

## 2026-08-23 a 2026-10-25 — VExpenses e conferência

- **Evidência Git:** evoluções da preparação e do envio em agosto, incluindo `6da1600` e `1396c35`; modo assistido `f29ea8b`, pacote de lançamento `adac855`, limpeza `ba59c87` e download em lote `a20abfb`.
- **Decisão:** manter alternativa assistida para conferência/anexo; não aprovar relatório externo automaticamente. Não inferir que a integração está operacional em todas as contas.
- **Testes:** não reexecutados nesta inicialização documental. Instruções e artefatos locais da automação VExpenses não fazem parte desta entrega.

## 2026-11-09 a 2026-11-10 — Supabase compartilhado

- **Evidência Git:** `56fc5c8` estrutura da V1, `b04cd8f` estado do Preview e `49e5dae` exposição de `comprova` preservando os schemas já configurados. Migrations em `supabase/migrations` e contexto em `docs/STATUS-DESENVOLVIMENTO-V1.md`.
- **Decisão:** schema e buckets exclusivos, RLS e nenhum reset global do override. O projeto de origem não deveria sofrer exclusões; descarte autorizado dos dados importados ocorreu no destino conforme histórico anterior. Não presumir que linhas e arquivos do legado foram copiados.
- **Problemas registrados:** Preview antigo apontava para o Supabase real; não reutilizar sem verificar. OneDrive dificultou leitura de dependências e build local; usar QA descartável fora da pasta sincronizada se ocorrer novamente.

## 2026-11-13 — Gestão de reembolsos por empresa concluída localmente

- **Evidência Git:** commit `477aecf`. Mudanças em páginas de empresa, relatórios e aprovações, APIs, RLS/Storage, funções de transição, migrations `20261112120000` e `20261112123000`; ver também `docs/OPERACAO-REEMBOLSOS.md` e testes da versão.
- **Decisões:** aprovação sequencial com motivo de rejeição, recuperação por reenvio ou retirada, registro de pagamento sem movimentação de dinheiro, rota de aprovação por centro de custo com precedência sobre o padrão. Conta Azul fora da publicação.
- **Testes registrados na execução anterior:** build Next com TypeScript e smoke HTTP local, e suíte PGlite cobrindo ciclo de reembolso, funções com autenticação e isolamento. Não equivalem a um ciclo completo com usuários reais.

## 2026-11-16 — Publicação da gestão de reembolsos

- **Ambiente e evidência anterior:** após autorização específica de produção, as migrations de configuração de empresa e aprovação segura foram aplicadas ao Supabase `xammlyxakxrysjrzdbeq`; no histórico remoto foram registradas como `20261116174949 / comprova_company_configuration` e `20261116175019 / comprova_secure_approvals`. São as mesmas mudanças versionadas no repositório com os prefixos `20261112120000` e `20261112123000`.
- **Release:** `main` passou de `49e5dae` a `477aecf`; deploy de produção `dpl_Egrw7WncJf6xZoapmVBo2Wm9wMUx` ficou READY. Contagem registrada: sete novas tabelas com RLS, cinco RPCs do fluxo executáveis pelo autenticado e não pelo anônimo, três buckets privados.
- **Validação anterior:** HTTP 200 em `/`, `/empresa`, `/relatorios` e `/aprovacoes`; 401 em `/api/reports` sem login. Sem erros de runtime no intervalo consultado naquele deploy; não generalizar para hoje. Ciclo com usuários reais não foi executado.
- **Rollback:** não reverter só o app após colaboração sem revisar compatibilidade e visibilidade dos dados; não remover dados de aprovação.

## 2026-11-16 — Configurações, membros e organograma, só no checkout Local

- **Base:** `477aecf`, branch local `codex/comprova-v1-preview`. Implementados menu de 18 itens, área pessoal, gestão de papéis e organograma, cadastro de política de quilometragem e carga INEPAD. Arquivos exatos em [PROJECT_CHECKPOINT.md](PROJECT_CHECKPOINT.md).
- **Decisões:** cargo não determina permissão; classificação valida empresa e departamento; exclusão de cargo/departamento vinculado é protegida; carga sem duplicar, com 8/6/9 cargos. Consulta anterior, somente leitura, identificou uma organização com nome `INEPAD LTDA`; verificar novamente antes de uma futura aplicação.
- **Testes registrados na execução anterior:** TypeScript e ESLint focado; build `next build --webpack` em QA descartável; `node --test tests/rendered-html.test.mjs`, `node --test tests/company-workflow.postgres.mjs` e `node --test tests/settings-navigation.test.mjs` passaram. A suíte de banco usou PGlite 0.5.16, não o banco real.
- **Pendências:** sem commit, push, deploy ou aplicação da nova migration. Notificações e quilometragem automatizada não foram implementadas.

## 2026-11-16 — Protocolo de continuidade entre contas

- **Ambiente e base verificados nesta tarefa:** Windows/PowerShell, checkout principal Local do COMPROVA, HEAD `477aecf` em `codex/comprova-v1-preview`. GitHub confirmou `main` em `477aecf` e Preview em `49e5dae` por `git ls-remote` com acesso autorizado à rede. A sessão abriu inicialmente na pasta de outro projeto; as verificações e edições do COMPROVA usaram a raiz explícita. Nenhum worktree adicional apareceu em `git worktree list --porcelain`.
- **Arquivos:** `AGENTS.md`, `PROJECT_STATUS.md`, `PROJECT_LOG.md` e `PROJECT_CHECKPOINT.md`. Não existiam no checkout inicial. Nenhuma funcionalidade ou configuração da aplicação é alterada por esta tarefa.
- **Verificações:** os quatro Markdown existem e os 17 links relativos apontam para arquivos presentes. `git diff --check` terminou sem erros; em arquivos preexistentes, o Git só alertou sobre futura conversão de LF para CRLF. O índice continuou vazio e o HEAD permaneceu em `477aecf`. Nenhum build, teste de aplicação, acesso ao banco ou mudança em Vercel foi executado para este handoff documental; os testes acima são resultados anteriores.
- **Pendência:** definir com o usuário o que será transferido e autorizar a publicação na branch de handoff adequada. Antes do envio, verificar deploy automático e excluir arquivos privados.

## 2026-11-16 — Transferência aprovada: escopo documental

- **Decisão:** após a autorização para prosseguir, o escopo foi limitado aos quatro documentos. Configurações, sua migration, comprovantes e mudanças anteriores permanecem no checkout de origem. O handoff não autoriza merge, implantação nem migrações.
- **Base e isolamento:** GitHub confirmou `main` em `477aecfa6563e8e6692ce0624133a7be6ad370ac` e a ausência de `codex/comprova-handoff` antes da preparação. A branch é preparada numa cópia Git separada, sem trocar de branch nem alterar o índice na pasta principal.
- **Vercel:** a base não contém workflow do GitHub e o `vercel.json` original não tem regras de branch. A branch de transferência inclui `git.deploymentEnabled` com valor `false` apenas para `codex/comprova-handoff`, conforme a [referência oficial](https://vercel.com/docs/project-configuration/git-configuration#gitdeploymentenabled). Não há ajuste no painel da Vercel.
- **Verificação de entrega:** depois do push, a origem deve verificar o SHA remoto e confirmar a ausência de deploy dessa referência. Na conta de destino, siga o [checkpoint](PROJECT_CHECKPOINT.md) sem pressupor acesso a arquivos ou chats locais da origem.

## 2026-11-16 — Handoff documental publicado e verificado

- **Entrega GitHub:** `codex/comprova-handoff` confirmado por `git ls-remote` no SHA `2ae7d6a2e7e8d9df3b44e574c297fbaf0e85cadd`. A `main` continuou em `477aecfa6563e8e6692ce0624133a7be6ad370ac`; sem PR ou merge.
- **Validação:** cinco arquivos no commit (quatro Markdown e o bloqueio de deploy no `vercel.json`); 18 links relativos e `git diff --cached --check` validados. A tentativa de clone direto do OneDrive não concluiu; foi substituída por clone temporário da `main` do GitHub. O checkout principal continuou na mesma branch, sem arquivos staged; as alterações de aplicação foram preservadas.
- **Vercel e banco:** a consulta por branch e SHA não retornou deploy e o último deploy listado no projeto continuou o de produção anterior, `dpl_Egrw7WncJf6xZoapmVBo2Wm9wMUx`, READY. Nenhuma operação no banco. Este registro de verificação é posterior ao commit de transferência e fica no checkout de origem até uma nova entrega autorizada.

## 2026-11-16 — INEPAD Reembolso: marca, Configurações e entrada de Relatórios

- **Escopo e base:** Windows Local, `codex/comprova-v1-preview`, HEAD `477aecf`; refs remotos verificados. Mudanças anteriores de Configurações preservadas. Trabalho novo só na pasta de trabalho.
- **Design:** nova marca com logo/ícone do ZIP fornecido; menu lateral de ícones expansível, seleção do módulo atual e segundo painel pesquisável em Configurações. Adaptação da estrutura dos prints de referência, usando cores INEPAD. Departamentos e cargos mantêm operações e papéis anteriores.
- **Fluxo:** a raiz abre Relatórios. Login separado com e-mail/senha e Office 365; retorno OAuth conhecido mantido. Leitura, revisão e vínculo explícito de itens com o relatório editável; nenhuma submissão automática para aprovação. Histórico e exportação permanecem no painel.
- **Limites:** sem alterações no contrato de autorização, recursos Supabase, migrações, Vercel, GitHub, VExpenses ou serviços externos. Validação de código e fluxo em ambiente descartável; não usar dados reais.
- **Validação concluída:** build Next.js/TypeScript com Webpack e fontes simuladas, ESLint focado, `node --test tests/rendered-html.test.mjs` e `node --test tests/settings-navigation.test.mjs` passaram. No Chromium desktop/celular, conferidos menu recolhido/expandido, busca e diretório de Configurações, ausência de overflow móvel, upload fictício, leitura simulada e vínculo de uma despesa pelo endpoint real com dados simulados, sem chamar a submissão para aprovação. Testes sem credenciais de produção.

## 2026-11-17 — Pré-publicação do redesign

- **Autorização e base:** usuário autorizou publicar em produção. GitHub confirmou `main` em `477aecf`; Vercel retornou o deploy anterior `dpl_Egrw7WncJf6xZoapmVBo2Wm9wMUx`, READY. Árvore de origem em `codex/comprova-v1-preview`, com trabalho anterior ainda não versionado e sem stage inicial.
- **Bloqueio confirmado:** inspeção somente leitura do Supabase destino `xammlyxakxrysjrzdbeq` mostrou que as três tabelas de Configurações, duas colunas de classificação de membros e o RPC de edição ainda não existem. Logo, Departamentos e cargos, Membros de equipe e Quilometragem não estão prontos para produção.
- **Decisão:** preparar o release com arquivos explícitos em cópia separada, sem push. Aplicar somente a migration local revisada depois de aprovação específica: ela não altera schema `public`, usuários Auth, Storage ou outros sistemas; no schema `comprova`, cria as tabelas com RLS, atualiza a gestão de membros e prepara o catálogo INEPAD. Acompanhar a Vercel somente após verificar o banco.
