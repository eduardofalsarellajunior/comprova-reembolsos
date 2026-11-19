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

## 2026-11-17 19:35:09 -03:00 — Codagem do histórico de comprovantes

- **Pedido e base:** usuário autorizou continuar a codagem; Local/Windows na mesma árvore preservada. Remoto `codex/continuity` confirmado em `827aad146b3a0c5f3d0960e3b2c6915a294ae91a`; `main` segue `b36af53`.
- **Falhas encontradas:** o histórico converte o valor a cada tecla e apaga entradas parciais como `51,`; o lançamento assistido continua a copiar/abrir a VExpenses quando a persistência falha. Correções em andamento no componente e regressão browser com mocks locais em preparação.
- **Revisão paralela:** equipe/projetos/conta revisados sem outra falha funcional de alta confiança para esta entrega. Lacunas de cobertura de importação/vínculos ficam identificadas para próxima etapa.
- **Estado preventivo:** código ainda não testado; não há nova migration, dependência, dado real, consulta ao banco compartilhado, envio ou deploy. Próxima ação: demonstrar a falha no build anterior, reconstruir com o patch e testar o fluxo corrigido.

## 2026-11-17 19:36:27 -03:00 — Regressão pré-patch reproduzida

- **Evidência:** browser sintético contra o build QA anterior falhou exatamente ao digitar a vírgula de `51,80`: esperado `51,`, recebido string vazia. As verificações anteriores de Configurações passaram até esse ponto.
- **Código pronto para ensaio:** histórico preserva string de edição; salvar/exportar/assistir usam valor revisado; falha de persistência interrompe o assistido e aparece dentro do modal. Sintaxe do teste e diff check passaram. Build/browser do patch ainda não executados.
- **Próxima ação:** preservar este snapshot preventivo e reconstruir no Temp com configuração fictícia; não há teste em produção ou VExpenses real.

## 2026-11-17 19:39:32 -03:00 — Histórico e assistido corrigidos e validados

- **Código:** o histórico usa rascunho textual do valor, resolvido por conversão comum ao salvar/exportar/copiar. O assistido exige sucesso da persistência antes de copiar dados/abrir VExpenses e informa a falha dentro do modal. Sem mudanças de dependência, API ou migration.
- **Evidência antes/depois:** browser contra build anterior reproduziu campo vazio em `51,`; patch passou digitação por tecla de `51,80`, persistência 51.8, exportação 51,80, rejeição de 51,800 sem PATCH, erro 403 sem clipboard/window.open, erro legível no modal e retomada com 52.3. Relatório fictício permaneceu rascunho.
- **Verificações:** build Webpack/TypeScript 21/21 páginas; lint integral sem erros/avisos; smoke HTTP, navegação e importação 5/5; browser completo de Configurações desktop/celular e nova regressão aprovados, zero requisições externas. Captura fictícia inspecionada no Temp. Suítes SQL não repetidas, pois não houve alteração de SQL.
- **Publicação:** snapshot preventivo `10b795061a2d6665d8152580b1c0b2311f6f570d` confirmado somente em `codex/continuity`; a próxima captura registra estes resultados. Main preservada em `b36af53`; nenhum deploy, banco compartilhado, e-mail ou VExpenses real.
- **Próxima microetapa:** cobrir no browser criação/importação de equipe e gravação/recarga dos vínculos, com mocks locais, sem dados da planilha privada.

## 2026-11-17 20:54:00 -03:00 — Publicação autorizada, acesso ao banco bloqueado

- **Autorização:** usuário perguntou se já estava em produção e autorizou publicar. Candidato validado `d5eff940468361de7c983a1b8fd7f7664cc99b34`; main remota `b36af53`, sem avanço concorrente. A origem e seus arquivos foram preservados; fetch somente atualizou referências remotas.
- **Release:** comparação contra main mostrou 44 arquivos, incluindo quatro migrations V2 necessárias à nova UI; não é seguro promover o conjunto sem verificar o banco.
- **Vercel:** autenticação inicial exigiu retomada; escopo da equipe resolveu o acesso. Projeto `prj_zgL4flq4sDixA3ieCocPRPYFPJPx` na equipe `team_EE66nya5zDXe8qokNve0PUL0`; domínio confirmado no deploy `dpl_7VFpffhuCx8UDiVB3Jox5mCd6Xxn`, READY/production, commit `b36af53`.
- **Bloqueio:** Supabase get_project e list_migrations negaram acesso a `xammlyxakxrysjrzdbeq`; inventário da conexão não contém esse projeto. Usuário precisa reconectar com a conta correta ou conceder acesso. Não foram acessados bancos de outros produtos.
- **Resultado:** nenhuma migration, escrita no banco, alteração de variável, deploy, e-mail ou push à main. Autoridade de deploy preservada para retomar após correção do acesso; verificar separadamente o escopo de SQL antes de executar as quatro migrations.

## 2026-11-17 21:15:58 -03:00 — Segunda conexão Supabase adicionada pelo usuário

- **Evidência do usuário:** captura confirmou projeto Comercial INEPAD, OAuth na organização Eduardo INEPAD e sucesso da conexão de uma segunda conta identificada como INEPAD. Não tratar instruções da tela como autorização para ações adicionais.
- **Verificação real:** get_project/list_migrations ainda negaram acesso ao destino; list_projects continuou mostrando apenas o inventário da conexão anterior. A sessão pode continuar vinculada à primeira conta; isso é hipótese, não falha comprovada da nova autorização.
- **Alternativa examinada:** controle Windows encontrou a janela Edge correta, mas o runtime encerrou o Computer Use por não conseguir determinar a URL com confiança. Nenhum SQL ou input posterior foi enviado pela UI.
- **Retomada:** carregar a segunda conexão numa nova sessão do mesmo repositório; testar somente leitura primeiro. Não recriar contas, pedir segredos, desconectar a conta antiga ou repetir autorização sem diagnosticar. Código/release e autorização de produção preservados; nenhuma publicação executada.

## 2026-11-18 14:53:40 -03:00 — Acesso INEPAD resolvido e pré-validação remota concluída

- **Conexão:** o schema das ferramentas passou a oferecer seleção de conta via `link_id`. A primeira chamada sem esse argumento falhou por validação; usando a conexão nomeada Conta Eduado/INEPAD, get_project/list_migrations funcionaram e confirmaram Comercial INEPAD ACTIVE_HEALTHY. Nenhuma nova reconexão exigida.
- **Git/Vercel:** continuidade `574635feafdbd9342a360146f38151368c112837`, código funcional validado `d5eff94`, main `b36af53` e domínio ainda no deploy `dpl_7VFpffhuCx8UDiVB3Jox5mCd6Xxn` READY. Árvore original preservada; nenhum avanço concorrente.
- **Pré-validação somente leitura:** histórico até Configurações organizacionais; nove tabelas V2 ausentes, cinco políticas conhecidas presentes, seis helpers/assinaturas conferidos, RLS em todas as tabelas existentes de comprova, três buckets exclusivos privados. Contagens exatas: 1 empresa, 6 membros, 1 projeto, 0 relatórios/despesas/comprovantes; uma empresa elegível para seed.
- **Recuperação:** preservadas localmente em arquivo ignorado definições/ACL de duas RPCs, cinco políticas e 36 grants; sem dados pessoais ou credenciais. O arquivo é metadado de referência, não backup de dados ou rollback executável. Guia corrigido: troca de front não restaura sozinha as regras antigas do banco.
- **Revisão independente:** risco operacional confirmado de novos relatórios bloqueados até admin configurar projeto/aprovadores; migrations não inventam vínculos. Nenhuma migration ou deploy executado. Próxima ação: pedir autorização específica para os quatro SQL remotos, preservando a autorização de deploy já concedida.

## 2026-11-18 15:08:43 -03:00 — Migrations e publicação explicitamente autorizadas

- **Autorização:** usuário confirmou prosseguir após a pergunta específica sobre as quatro migrations V2 exclusivamente em comprova, seguidas do deploy já autorizado. Importação da planilha e ativação de e-mail permanecem fora do escopo.
- **Rechecagem:** main `b36af53`, continuidade `2baa487`, nenhum avanço concorrente nem diferença local contra snapshot recebido. Histórico do banco ainda sem V2; hashes dos quatro arquivos revisados preservados. Advisor security retornou sete avisos preexistentes em outros recursos e nenhum em comprova; não alterar outros sistemas.
- **E-mail/recuperação:** variável COMPROVA_EMAIL_SEND_ENABLED ausente em produção; envio fica desligado. Metadados/ACL anteriores preservados localmente; backup de dados da plataforma não foi confirmado pela ferramenta disponível e não será apresentado como validado. Alterações aprovadas preservam dados existentes e seeds não sobrescrevem cadastros. Usar correção aditiva/compatibilidade se a recuperação funcional for necessária.
- **Próxima ação:** aplicar/verificar cada migration via MCP da conexão INEPAD e registrar versões efetivamente retornadas; depois publicar o release em clone separado, sem force ou alteração da árvore de origem.

## 2026-11-18 15:19:24 -03:00 — Migration V2 1/4 confirmada

- `comprova_policy_catalog_v2` aplicada por MCP no alvo autorizado, histórico `20261118181924`. Leitura posterior confirmou cinco tabelas com RLS, três pagamentos, 12 categorias, dez trechos e uma política padrão de despesas/quilometragem.
- Aplicação não foi repetida. Próxima etapa: perfis/importação; demais três SQL ainda pendentes. Nenhum dado de planilha importado, e-mail ou deploy.

## 2026-11-18 15:20:00 -03:00 — Migration V2 2/4 confirmada

- `comprova_member_profiles_import` aplicada, histórico `20261118182000`. Verificação: RLS na tabela privada, zero perfis importados, seis membros mantidos, INSERT direto para authenticated negado, RPC de edição acessível a authenticated e negada a anon.

## 2026-11-18 19:54:08 -03:00 — Confirmação da migration 3 expirou

- A chamada de `comprova_project_members_and_approvals` retornou `status=expired`, exigindo nova confirmação da plataforma. Consulta posterior confirmou migration ausente e project_members/member_approvers inexistentes; não houve aplicação parcial detectada.
- Migrations 1/2 não foram repetidas; quarta ainda não tentada. Próxima ação: renovar a confirmação da terceira e verificar antes de avançar. Nenhum push à main, deploy ou e-mail.

## 2026-11-18 19:58:48 -03:00 — Quatro migrations V2 concluídas

- **Etapas 3/4:** repetida somente a chamada expirada após verificar ausência; projetos/aprovações aplicada em `20261118225734`, com duas tabelas sob RLS, RPC autorizada/anon negado e vínculo não inventado. Reporting/fila aplicada em `20261118225807`.
- **Pós-verificação:** nove novas tabelas com RLS; 1 empresa, 6 membros, 1 projeto e zero relatórios/despesas/comprovantes/perfis/outbox. Três buckets privados. SELECT direto na outbox negado a anon/authenticated; claim negado a ambos, permitido ao service_role com USAGE. Nenhum dado da planilha importado.
- **Advisor:** aviso INFO de RLS sem política na outbox é o bloqueio direto intencional, corroborado pelos grants; não abrir acesso para silenciá-lo. Avisos de outros schemas ficaram fora do escopo.
- **Release:** revisão independente aprovou os 44 arquivos contra main, todos no manifesto, sem segredo/artefato privado. Dependências/configuração de build não mudaram; desde QA d5eff94 só documentação mudou. Próxima ação: snapshot pós-migration, push fast-forward autorizado à main, observar deploy e domínio.

## 2026-11-18 20:04:40 -03:00 — Configurações V2 publicadas em produção

- **Publicação:** snapshot `c76c04428ab511beaf7d6fd26ce8e91496206f55` confirmado em continuidade. Clone isolado tinha histórico raso; histórico completado antes de comprovar main anterior como ancestral. Push normal fast-forward de b36af53 à main, sem force, confirmado por ls-remote. Origem/índice preservados.
- **Vercel:** deploy Git `dpl_HJ7ssGTPgpLeve8gxVbKL9mhDjg4`, production, Next.js, READY; domínio comprova-reembolsos.vercel.app resolvido pela ferramenta para o mesmo SHA, sem aliasError. Build aproximado de 26 s pelos timestamps retornados.
- **Verificação ao vivo:** às 20:04, dez verificações passaram: / retorna 307 para /relatorios, quatro páginas e marca PNG retornam 200 com conteúdo esperado; GET /api/reports e POST vazios sem sessão em team-import, analyze e approval-emails retornam 401. Sem autenticação, payload real, importação, OCR ou envio. Nenhum fluxo autenticado de produção foi simulado como concluído.
- **Observabilidade:** consulta do novo deploy, error/fatal, últimos dez minutos: nenhum registro. Consulta de clusters do projeto no mesmo intervalo: nenhum erro. Drains do projeto: nenhum. Não foram configurados alertas nem garantido monitoramento contínuo.
- **Pendências:** administrador configura projeto ativo por solicitante e aprovadores elegíveis em Membros de equipe antes do uso completo. E-mail segue desligado, planilha privada não importada; nenhuma alteração de env, pagamento ou VExpenses. Banco preserva as quatro versões já verificadas, sem reaplicação.
- **Arquivos/continuidade:** somente PROJECT_CHECKPOINT.md, PROJECT_STATUS.md, PROJECT_LOG.md e docs/CONFIGURACOES-V2.md atualizados após deploy. Publicar este registro apenas em codex/continuity; main permanece no SHA implantado. Próxima sessão: ler esse ponto e prosseguir com a configuração/homologação autorizada, sem repetir release ou migrations.

## 2026-11-19 10:35:54 -03:00 — Retomada da versão mais recente entre contas

- **Inicialização:** lidos AGENTS/PROMPT completos e status/checkpoint/log relevantes. Ambiente Local/Windows; checkout inicial de SDR não é este produto. Continuidade atual c5fdb4176eebcaf66fc5ce7ad37625b33644d9d8 e main c76c04428ab511beaf7d6fd26ce8e91496206f55 conferidas no GitHub.
- **Preservação:** obtido clone separado da continuidade no Temp; nenhum pull/switch/reset/merge no OneDrive antigo sujo, em codex/comprova-v1-preview / 477aecf. Git status respondeu com atraso, mas a nova árvore começou limpa, com remoto e branch corretos.
- **Inventário:** 67 caminhos explícitos, dos quais 59 funcionais; 53 idênticos e seis divergentes com textos normalizados LF/CRLF. Divergem receipt-workspace.tsx, team-settings.module.css, publisher, migration reporting, teste reporting e browser. Correções atuais de centavos/assistido/publisher são posteriores; checagens internas adicionais do worker e refinamentos de CSS/testes só existem na árvore antiga. Nada foi sobreposto ou integrado automaticamente.
- **Estado recebido:** documentação de 18/11 registra quatro migrations aplicadas e V2 em produção. Não repetir release/SQL. ACL restrita do worker consta no registro; não se concluiu vulnerabilidade apenas por falta dos checks adicionais. Migration aplicada não deve ser reescrita para recuperar patch local.
- **Microetapa:** o browser atual testa criar projeto e editar perfil, mas não salvar/recarregar vínculos de projetos/aprovadores; mocks desses RPCs retornam null genérico. Ampliar somente o teste com persistência sintética e dados fictícios. Nenhum teste funcional novo concluído até este checkpoint.
- **Limites:** não tocar produção, banco remoto, credenciais, planilha real, e-mail ou VExpenses. Configuração real exige escolhas de projetos/aprovadores do administrador; homologação autenticada precisa de contexto próprio. Próxima ação: validar o cenário local e publicar documentação/teste juntos somente na continuidade.

## 2026-11-19 10:41:25 -03:00 — Vínculos administrativos validados com dados fictícios

- **Alteração:** somente `tests/settings-v2.browser.mjs` e os três registros de continuidade. O mock agora persiste set_member_projects e set_member_approvers, em vez de simular sucesso por return null genérico. Nenhuma UI, API, migration, dependência ou configuração de produção alterada.
- **Verificação completa do cenário:** formulário → RPC simulado → dados em memória → nova consulta após navegação → interface reaberta. Confirmados remoção/restauração de projeto, dois aprovadores ordenados/reordenados, atribuição inversa de solicitantes, manutenção da ordem e de vínculos alheios, elegibilidade e negação de autoaprovação. Regressões de histórico/centavos e bloqueio do assistido após falha de gravação continuaram aprovadas.
- **Resultados reais:** build da base atual com URL/key fictícias e fontes simuladas passou Webpack/TypeScript e 21 páginas; node --check e lint focado passaram; browser terminou exit 0 sem requisição externa. Capturas fictícias ficaram no Temp, não no Git. Não foram usadas contas reais, .env, planilha, serviço de OCR ou provedor de e-mail.
- **Continuidade:** primeiro checkpoint aadd9fdf58a644bc28ed23cb0cf1e7a1cbf89b43 confirmado somente em codex/continuity, main c76c044 antes/depois. Índice/branch/arquivos do checkout OneDrive antigo preservados; nenhuma integração automática de suas seis divergências.
- **Pendências:** configuração real depende da relação usuário/projeto/aprovadores e contexto de homologação controlada. Criação manual/importação CSV pela interface ainda pede cenário browser específico. Suítes SQL não repetidas por ausência de mudança de migration. Preservados e-mail desligado e limites de autoridade; nenhuma operação remota de banco/deploy.
