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
- **Candidato local:** `a99e210a81bd32979fe78e7f12fbaf2184df8391`, 35 arquivos selecionados em cópia separada. Hashes das cópias e `git diff --cached --check` conferidos; suíte descartável de banco e teste das seções passaram novamente. Sem changes remotas, push ou deploy do candidato.

## 2026-11-17 — Migration de Configurações em produção

- **Autorização:** usuário aprovou explicitamente a migração após a solicitação de publicação. Revalidados a ponta `477aecf` na `main`, a Vercel e o schema de destino antes da operação.
- **Execução:** somente a migration versionada `20261116181505_comprova_organization_settings.sql` em `xammlyxakxrysjrzdbeq` / `comprova`; registro remoto `20261117160746`. Sem migração em lote.
- **Resultado:** Administrativo 8 cargos, Comercial 6, Operações 9; três tabelas com RLS, seis políticas e dois RPCs conferidos. Três buckets do COMPROVA permaneceram privados, a lista de namespaces não mudou e os vínculos da equipe mantiveram a contagem. Nenhuma alteração em Auth ou Storage.
- **Próxima etapa:** enviar o release de código `a99e210` e este registro à `main` e validar o deploy no domínio. Em caso de problema com o front, preservar o banco novo e usar a versão anterior do app; não desfazer DDL de forma destrutiva.

## 2026-11-17 — INEPAD Reembolso em produção

- **GitHub:** push autorizado em fast-forward; `main` confirmada em `b36af53f175190ef362f9a7a570b656a093a07a1`. O commit `a99e210` traz a implementação; o commit de ponta acrescenta somente o registro da migração.
- **Vercel:** `dpl_7VFpffhuCx8UDiVB3Jox5mCd6Xxn` em READY, produção, branch `main`, associado a `comprova-reembolsos.vercel.app`. Build/ativação observados sem intervenção no domínio, Vercel ou configuração de variáveis.
- **Verificação sem sessão:** `/` deu 307 para `/relatorios`; `/login`, `/relatorios`, `/configuracoes`, `/aprovacoes` e a logo deram 200; `GET /api/reports` e `POST /api/analyze` deram 401. A busca de erros de runtime nos caminhos testados não retornou registros na janela consultada.
- **Limites:** não exercitamos login real, OCR em produção, aprovação, VExpenses ou Conta Azul. Esta confirmação pós-deploy foi gravada no checkout de origem depois do push para não disparar um novo deploy só de documentação.

## 2026-11-17 14:57:27 -03:00 — Snapshot preventivo das configurações em desenvolvimento

- **Base/ambiente:** Local, Windows/PowerShell; checkout principal `codex/comprova-v1-preview` em `477aecf`, sem novos commits na origem. A produção publicada é `b36af53`. Nenhuma migração ou transferência de dados desta etapa foi executada remotamente.
- **Código parcial preservado:** componentes de projetos/catálogos/políticas, perfis/importação CSV, conversor offline do XLS, validação de relatório/BRL e remoção parcial de opções antigas. Faltam a UI de equipe, adaptação de Meus dados, integração de validações/e-mail e testes completos; existem referências de imports não resolvidas.
- **Interrupção:** três subagentes reportaram limite de uso e encerraram antes de concluir. Não há medição de saldo/consumo da conta. O trabalho parcial precisa ser guardado antes de novas microetapas.
- **Planilha:** inventário privado de 22 cadastros com e-mails distintos e papel mapeado; nenhuma linha real copiada para o repositório. Nenhuma associação de projeto/aprovador foi inferida.

## 2026-11-17 14:57:27 -03:00 — Protocolo automático de continuidade

- **Pedido:** adotar checkpoints preventivos por microetapa, meta de cinco minutos e autorização automática de commit/push apenas em `codex/continuity`. Esta configuração não modifica funções da aplicação; o código parcial da tarefa anterior é apenas preservado no snapshot.
- **Preparação:** ler quatro documentos, verificar branch/índice/worktrees e refs remotos; criar branch em clone separado da `main` confirmada, sem mudar a árvore suja de origem. Bloqueio de deploy só para a branch de continuidade.
- **Segurança:** allowlist por caminhos, revisão do diff, varredura de segredos, hashes das cópias e rechecagem do remoto antes do push. Sem force, merge, reset, produção, credenciais ou XLS real no commit.
- **Verificações:** registrar o teste de sintaxe do script, a comparação de hashes, o commit/push e a confirmação do SHA nas etapas seguintes. Testes funcionais da configuração V2 não foram executados; resultados antigos do redesign não validam esse snapshot.

## 2026-11-17 15:01:10 -03:00 — Ensaio de continuidade antes do push

- **Resultados:** sintaxe PowerShell e 21 links internos conferidos; `tests/team-import.test.mjs` passou 3/3 com dados fictícios. Manifesto contém 55 caminhos explícitos e nenhuma planilha/dado privado real.
- **Proteções observadas:** o primeiro ensaio bloqueou a própria definição genérica de chave privada no scanner; a assinatura foi tornada específica. O segundo bloqueou linhas vazias finais em dois arquivos; ajustadas somente essas linhas, sem mudar lógica da aplicação.
- **Estado:** clones de ensaio preservados para inspeção; nenhuma mudança de branch/índice na origem, nenhum push ou deploy até essa etapa. Repetir o ensaio após a revisão e confirmar a referência remota antes de publicar.

## 2026-11-17 15:01:49 -03:00 — Ensaio concluído, publicação autorizada preparada

- **Teste local concluído:** o publisher criou `5c1040cee81f88d12e809ccd2a59d3df75fe132b` somente em clone temporário (sem `-Publish`). Os 55 arquivos foram copiados e conferidos por hash; 29 diferem da `main`; diff staged sem erros. O índice e a branch de origem não foram alterados.
- **Próxima operação:** repetir a mesma captura com `-Publish`, revisar a ponta remota antes/depois e confirmar que a Vercel não criou deploy da branch. O SHA final pode diferir do ensaio porque este registro também será incluído.

## 2026-11-17 15:03:47 -03:00 — Primeiro checkpoint remoto confirmado

- **Entrega:** `scripts/sync-continuity.ps1 -ExpectedRemoteSha absent -Publish` criou e publicou `db431990ddff1edb4d7d24d3258d7c1fcfdab998` exclusivamente em `codex/continuity`. Confirmado por `git ls-remote`; a `main` antes/depois permaneceu `b36af53`.
- **Conteúdo:** 55 arquivos revisados no snapshot, 29 alterados em relação à base, com o código parcial, os quatro documentos, o publisher e a regra de não-deploy. Sem planilha original, dados pessoais reais, credenciais ou comprovantes.
- **Concorrência:** repetir a expectativa `absent` após criação da branch abortou antes de clone/commit/push. Não houve force nem merge.
- **Vercel:** consulta da branch/SHA retornou zero deploys; domínio de produção permaneceu no deploy anterior do redesign, READY. Não houve SQL remoto nesta configuração.
- **Continuidade:** atualizar e sincronizar este resultado na próxima revisão; depois retomar a implementação V2 pelo ponto marcado no checkpoint, sem tratar o snapshot parcial como build aprovado.

## 2026-11-17 15:37:01 -03:00 — Prompt permanente para retomada entre contas

- **Pedido e ambiente:** criar um prompt reutilizável nesta conta ou no outro Codex, incluindo checkpoints de aproximadamente cinco minutos. Confirmado Local/Windows no checkout correto, `codex/comprova-v1-preview`, HEAD `477aecf`; índice vazio e trabalho anterior preservado.
- **Base remota:** `codex/continuity` confirmada em `1762c491221a0487e098f8fb7cb343c474d881fd`; `main` em `b36af53`. A consulta inicial de rede no sandbox não resolveu o host; a conferência autorizada fora dele teve sucesso. Não houve mudança de branch nem pull na árvore suja.
- **Arquivos:** criado `PROMPT-RETOMADA.md`, vinculado em `AGENTS.md` e incluído em `scripts/continuity-files.json` (56 caminhos); atualizados status e checkpoint. Nenhum código de funcionalidade alterado, arquivo removido, dado importado ou SQL remoto executado.
- **Decisões:** o prompt consulta a ponta e o checkpoint mais recentes, não fixa SHA nem depende de outro chat. Reitera autorização de commit/push exclusivamente para `codex/continuity`, proteção de produção, isolamento Supabase, dados privados fora do Git e coordenação de alterações concorrentes. Cinco minutos é meta da sessão ativa, sem promessa de salvamento com o aplicativo parado ou sem créditos.
- **Revisão e testes:** um revisor independente aprovou o prompt sem problemas concretos; 56 arquivos do manifesto existentes, 24 links relativos válidos, sintaxe do publisher válida, `git diff --check` sem erros (avisos LF/CRLF) e índice da origem vazio. Não executados build ou testes funcionais nesta microetapa documental; a V2 permanece parcial conforme checkpoint.
- **Próxima ação:** sincronizar documentos e prompt com o código já preservado por meio do publisher, confirmar SHA remoto e entregar o texto ao usuário. A retomada funcional continua pela compilação de equipe/Meus dados, sem migração ou deploy implícitos.

## 2026-11-17 15:39:35 -03:00 — Prompt de retomada publicado e conferido

- **GitHub:** `c57d6a6a83a35b1ece598364848efc243a74616a` confirmado em `codex/continuity` após push normal sobre `1762c49`; seis arquivos documentais/de suporte no commit. Os 56 caminhos do snapshot conferidos pelo publisher; nenhuma alteração funcional nesta microetapa.
- **Isolamento:** `main` antes/depois permaneceu em `b36af53`; consulta Vercel da branch retornou zero deploys. Nenhum SQL, importação, e-mail ou deploy executado. Branch e índice da pasta de origem preservados.
- **Entrega:** usar o texto de `PROMPT-RETOMADA.md` em qualquer uma das contas. Este registro posterior será sincronizado na mesma branch; a ponta pode ter SHA diferente do commit que criou o prompt. Próxima ação funcional permanece a do checkpoint; não confundir continuidade publicada com aplicação V2 pronta.

## 2026-11-17 15:50:09 -03:00 — Retomada funcional de Configurações V2

- **Base:** retomada autorizada pelo usuário, checkout Local/Windows preservado, `codex/continuity` conferida em `96b72ab`, `main` ainda `b36af53`; índice vazio. Sem checkout/pull sobre a árvore suja.
- **Execução:** tarefas repartidas por arquivos entre equipe/conta, projetos/políticas e validação/e-mail; root integra, revisa perfis e mantém checkpoints. Orientações oficiais Supabase/RLS verificadas; novos objetos somente no schema comprova, sem execução remota.
- **Teste concluído:** navegação ajustada de 18 para 14 seções, com remoção de visão geral/centros de custos/Financeiro/fluxos. Suíte de navegação e parser de importação passou 4/4. TypeScript inicial confirmou duas integrações ausentes e um arquivo gerado antigo; não é validação de build V2.
- **Ensaio:** instalado PGlite 0.5.16 em pasta temporária separada, sem alterar dependências do app. Testes de banco ainda em preparação.
- **Decisões:** OCR incompleto continua revisável como extração avulsa; validação estrita no lançamento manual, vínculo e submissão. Projeto e pagamento são herdados do contexto do relatório. Limites legados ativos não serão apagados silenciosamente e devem ser mostrados na interface.
- **Próxima ação:** integrar equipe/Meus dados, executar ensaios SQL e validar build limpo. Snapshot preventivo pode conter código parcial; nenhuma migração, importação real, e-mail ou produção nesta etapa.

## 2026-11-17 15:56:04 -03:00 — Equipe integrada e ensaio de perfis aprovado

- **Avanço:** TeamSettings/CSS implementados, Meus dados somente leitura do perfil privado, senha/segurança/preferências preservadas. Editor de admin inclui cadastro, banco, cargo/departamento, tipos obrigatórios, projetos/aprovadores e importação com prévia/confirmações; gravações usam RPC e RLS, não metadata editável para autorização.
- **Banco descartável:** `tests/member-profiles.postgres.mjs` passou, cobrindo preview sem escrita, rollback integral, repetição sem duplicidade, preservação de tipos/campos, associação por e-mail confirmado, datas inválidas, proteção do proprietário e negação a comum/anônimo/outra empresa. Marcadores em public/Storage e contagem Auth permaneceram intactos no teste fictício. `tests/company-workflow.postgres.mjs` também passou; total 2/2.
- **Integração:** TypeScript corrigido para componentes; único erro restante no checkout é um artefato antigo em .next. Lint dos componentes de equipe passou. Build e browser em QA limpo ainda pendentes.
- **Políticas/e-mail:** revisão de RLS de quilometragem, membros ativos/inativos e políticas legadas em andamento. Quatro SQLs V2 preenchidos; fila final aprovada/dispatcher configurável em testes, sem provedor real ativado.
- **Checkpoint:** anterior `cf69c90` confirmado no remoto; manifesto ampliado para 64 caminhos para transferir código e documentação juntos. Nenhum push para main, deploy, SQL remoto ou dado real.

## 2026-11-17 16:03:14 -03:00 — Ensaios combinados e revisão independente

- **Resultados:** 12/12 testes combinados de navegação/parser/perfis/regressão/políticas/reporting passaram em PGlite e mocks. Revisão cruzada achou duas falhas: service_role precisava USAGE no schema e conflito transitório de idempotência não podia encerrar a fila. Corrigidos em SQL/adapter; removido grant artificial do teste e suíte de e-mail passou 6/6. Referência: documentação oficial do Resend sobre chaves idempotentes.
- **React/QA:** compilação e TypeScript passaram numa cópia limpa sem .env; geração estática falhou por EPERM do sandbox ao criar diretório. Repetir fora dessa restrição. Lint integral apontou setter/memoização e carregamento de equipe em effect; ajustados preservando regras e adicionando guarda contra resposta tardia de outra empresa. Lint repetido em andamento.
- **Continuidade:** captura anterior foi bloqueada pelo hash porque um agente alterou arquivo durante a cópia; nenhum commit/push saiu dessa captura. Versão remota ainda cf69c90; ensaio isolado preservado. Foram acrescentados dispatcher, teste browser e guia de ativação ao manifesto (67 caminhos).
- **Limites:** build completo, smoke e browser ainda pendentes. Nenhum e-mail real, serviço provisionado, dado importado, SQL remoto ou produção alterados. Provedor/agendador exigirão configuração/autorização; fila não implica entrega real.

## 2026-11-17 16:09:10 -03:00 — Build V2 e suíte final aprovados

- **Código:** dependência explícita do setter no callback resolveu o último erro de lint sem desativar regra. Guarda de resposta tardia protege troca de empresa. Texto de preferências distingue confirmação transacional de aprovação dos avisos opcionais ainda não implementados.
- **Validação:** 13/13 testes puros/SQL/mocks combinados passaram; build Webpack/TypeScript com configuração fictícia e fontes simuladas passou, gerando 21 páginas. Lint integral app/lib/tests no QA passou sem avisos. Fonte OneDrive preservada, sem apagar .next antigo do usuário.
- **Ambiente:** build anterior EPERM resolvido por execução autorizada fora do sandbox. Smoke/browser tiveram restrições de localhost/Chrome; repetir fora delas. Smoke também expôs abort de 500ms no corpo da resposta; tempo do fixture ajustado para 5s/limite global60s. Browser ainda em execução; rebuild dos últimos ajustes pendente.
- **Git:** snapshot `5e6313d` confirmado só em codex/continuity, main b36af53 preservada. Nada aplicado no banco compartilhado ou na produção.

## 2026-11-17 16:21:48 -03:00 — Retomada em clone local separado

- **Ambiente:** Local/Windows; a pasta inicial não era o produto e continha registros de despesas não versionados. Ela foi preservada. O repositório foi clonado em subpasta separada, sem worktree adicional, na branch `codex/continuity`.
- **Git:** HEAD, upstream e remoto confirmados em `36c8364f6e691da0902ee3284c9b229e74352a48`, sem alterações iniciais e sem divergência. `main` remota permaneceu em `b36af53f175190ef362f9a7a570b656a093a07a1`. Nenhum merge, rebase, force push ou mudança de produção.
- **Leitura e decisão:** `PROMPT-RETOMADA.md`, `AGENTS.md`, status, checkpoint, log recente, manifesto e fixtures foram conferidos. A evidência recebida registra build e 13 testes aprovados; o item realmente pendente é o rebuild final e a validação HTTP/browser com mocks locais.
- **Testes desta sessão:** ainda não executados. Node 24.18.0, npm 11.16.0 e Chrome local foram identificados. A próxima operação usará cópia QA no Temp sem `.env`, `.next`, dados reais ou serviços externos.

## 2026-11-17 16:27:47 -03:00 — Rebuild, smoke e browser V2 aprovados

- **QA descartável:** cópia do snapshot em Temp nativo, sem `.env` e sem dados reais; `npm ci --no-audit --no-fund` instalou 417 pacotes pelo lockfile. O aviso de scripts pendentes de `sharp`/`unrs-resolver` não exigiu liberação adicional para os testes concluídos.
- **Resultados:** `next build --webpack` passou TypeScript e gerou 21/21 páginas; smoke HTTP passou 1/1; ESLint integral passou sem erros ou avisos. Browser Chrome headless passou em desktop e celular com 14 seções para admin, 5 para comum, Meus dados somente leitura, equipe, projeto/wizard/inativos, despesas, quilometragem, menu e responsividade.
- **Isolamento:** o browser usou somente Auth/REST/RPC locais simulados e confirmou zero requisições externas; capturas contêm apenas dados fictícios e ficaram no Temp. Nenhum Office 365, OCR, Supabase, provedor de e-mail ou dado real foi exercitado.
- **Próxima ação:** sincronizar o checkpoint em `codex/continuity` e revisar localmente migrations/guia/bloqueio de deploy. Sem SQL remoto, importação, e-mail, deploy ou `main`.

## 2026-11-17 16:33:47 -03:00 — Gate de ativação e publisher revisados

- **Continuidade:** a validação anterior foi confirmada em `codex/continuity` no SHA `34cb6fc84f1d0a8c36b73b740a88ca9fa0f2520d`; `main` permaneceu em `b36af53f175190ef362f9a7a570b656a093a07a1`.
- **Falha e correção:** o comando documentado do publisher sem `-SourceRoot` falhou antes de clonar porque o valor padrão era avaliado cedo demais. A primeira correção resolveu a pasta `scripts`, também rejeitada antes do clone. A versão final resolve o pai de `$PSScriptRoot`; parser PowerShell e ensaio completo sem `-Publish` passaram, criando somente um commit temporário.
- **Migrations:** revisão local das quatro V2 confirmou nove tabelas novas com RLS, zero DDL de tabela/schema fora de `comprova`, zero `DROP TABLE/SCHEMA` e somente cinco substituições de políticas RLS conhecidas. Os acessos a `auth.users` e `storage.objects` são somente leitura. O guia agora separa autorização de pré-validação/migration, configuração de e-mail e deploy.
- **Limites:** nenhuma consulta ao Supabase compartilhado, SQL remoto, importação, e-mail ou deploy. Próxima operação remota exige autorização específica; checkpoint continua autorizado apenas em `codex/continuity`.
