# INEPAD Reembolso — estado do projeto

**Referência:** 17/11/2026 (America/Sao_Paulo). Leia o [checkpoint](PROJECT_CHECKPOINT.md) para retomar. Este documento distingue o que o GitHub contém do que ainda está no computador atual.

## Produto e repositório

- **Produto:** INEPAD Reembolso (antigo COMPROVA); relatórios, leitura de comprovantes e fluxo de aprovação por empresa. A nova marca está no ar; repositório, domínio de produção e nomes dos recursos existentes não mudaram.
- **Repositório:** [eduardofalsarellajunior/comprova-reembolsos](https://github.com/eduardofalsarellajunior/comprova-reembolsos).
- **Produção em 17/11:** [comprova-reembolsos.vercel.app](https://comprova-reembolsos.vercel.app/) serve a revisão `b36af53f175190ef362f9a7a570b656a093a07a1`, deploy Vercel `dpl_7VFpffhuCx8UDiVB3Jox5mCd6Xxn` READY. A revisão anterior foi `477aecf`, deploy `dpl_Egrw7WncJf6xZoapmVBo2Wm9wMUx`.
- **GitHub:** `main = b36af53f175190ef362f9a7a570b656a093a07a1` confirmado após o push; o branch de Preview estava em `49e5dae` na consulta anterior. Não confunda o checkout local antigo com a nova ponta remota.
- **Checkout deste computador:** Local/Windows, checkout principal em OneDrive, branch `codex/comprova-v1-preview`, HEAD `477aecf`. O branch local está um commit à frente do upstream de Preview, mas esse commit já está no GitHub via `main`. A branch `main` **local** aponta para `a20abfb`; não use esse ponteiro como indicação do que está em produção.
- **Transferência entre contas:** a antiga [branch codex/comprova-handoff](https://github.com/eduardofalsarellajunior/comprova-reembolsos/tree/codex/comprova-handoff), SHA `2ae7d6a`, é documentação sem o redesign; busque a nova entrega na `main` depois de confirmar o GitHub.

## Arquitetura e pontos de entrada

| Camada | Onde está e como funciona |
| --- | --- |
| Web | Next.js App Router 16.2.6, React 19, TypeScript, Tailwind/CSS. `app/page.tsx` redireciona a Relatórios, `app/login` trata o acesso, e `app/empresa` encaminha para `app/configuracoes`. |
| Sessão | Supabase Auth com e-mail/senha e fluxo para Microsoft/Office 365. Sessão e acesso encadeados à identidade e aos vínculos da empresa; quatro perfis: administrador, aprovador, colaborador e financeiro. |
| Banco e arquivos | Supabase compartilhado de destino, project ref `xammlyxakxrysjrzdbeq`, schema exclusivo `comprova` exposto na Data API com RLS. Buckets privados `comprova-documents`, `comprova-uploads` e `comprova-recordings`. Configuração de acesso em `lib/supabase`; migrations em `supabase/migrations`. |
| Negócio | `app/api/analyze` aciona o serviço de leitura no servidor; `app/api/reports`, `approval-flows`, `approvals` e `policies` servem os fluxos. O banco valida papéis, submissão e decisões em etapas. |
| Integrações | `app/api/vexpenses` e `lib/vexpenses.ts` suportam consulta/envio e o fluxo assistido; anexos podem exigir a interface da VExpenses. `app/api/integrations/conta-azul` tem base de OAuth/mapeamento/fila; produção não foi ativada. `vercel.json` está vazio de cron. |
| Deploy | GitHub integrado à Vercel; push a `main` pode disparar produção. Setup e nomes de variáveis em [README.md](README.md); configuração de credenciais é independente por ambiente/conta. |

## Redesign — INEPAD Reembolso

- A raiz `/` redireciona para `/relatorios`; `/login` reúne acesso por e-mail/senha e Office 365. Parâmetros conhecidos do retorno OAuth podem seguir para Relatórios sem aceitar um destino externo.
- Barra principal lateral recolhível e navegação comum a **Relatórios**, **Aprovações** e **Configurações**. Em Configurações há um segundo painel pesquisável e o conteúdo da seção escolhida. Os perfis e permissões de empresa são os mesmos do trabalho anterior.
- A leitura e a revisão de imagens/PDFs estão dentro do relatório em edição. O vínculo exige escolha explícita; não envia para aprovação. Lançamento manual, caixa de entrada e histórico de comprovantes continuam disponíveis.
- Visuais de marca vieram do ZIP enviado pelo usuário. Logo e ícone estão em `public/inepad-reembolso/`. `comprova` continua sendo o nome técnico do schema e dos prefixes de Storage; o pacote para o robô VExpenses mantém seu formato de compatibilidade.
- Validação local: build Next/TypeScript, ESLint, smoke HTTP, teste dos perfis de Configurações e navegação em Chromium desktop/celular passaram. O teste de comprovantes usou dados e OCR simulados; não validou serviços de produção.
- A migration `20261116181505_comprova_organization_settings.sql` foi aplicada após aprovação em 17/11 (histórico Supabase `20261117160746`), antes da liberação da interface. As três tabelas novas têm RLS, e a carga INEPAD tem 3 departamentos/23 cargos. Usuários Auth e arquivos não foram alterados.
- Smoke no domínio de produção: raiz redireciona para `/relatorios`; `/login` exibe a marca; Relatórios, Configurações, Aprovações e a imagem da logo respondem 200; APIs de relatórios e leitura recusam com 401 sem sessão. Não houve teste de Office 365 ou OCR reais.

## Funcionalidade e decisões

- **Na base `477aecf`:** leitura em lote de imagens/PDFs e histórico privado; gestão básica da empresa/equipe; centros de custo, projetos, categorias, formas de pagamento, regras de despesa; relatórios com despesas manuais ou importadas; atribuição de fluxo padrão ou por centro de custo; aprovação sequencial, rejeição motivada, reenvio, retirada e registro financeiro sem transferência de dinheiro.
- **Na atualização de Configurações:** menu pesquisável com 18 itens, seções de conta, integração e políticas; organograma e associação do membro a departamento/cargo separada do perfil; carga INEPAD LTDA com 23 cargos em três departamentos (8 Administrativo, 6 Comercial, 9 Operações); configuração de política de quilometragem sem cálculo automático; preferências de e-mail sem disparos.
- **Política de implantação:** uma autorização específica dispensou Preview para o release anterior. Não é autorização geral. O Preview consultado anteriormente apontava ao Supabase de produção; revalidar o isolamento antes de usar. Não religar o projeto Supabase antigo, nem copiar seus comprovantes para teste.
- **Limitações e lacunas:** não se confirmou o fluxo com contas reais de solicitante, aprovador e Financeiro em produção nem o login Office 365 de ponta a ponta nesta revisão. Ainda não há aprovação linha a linha, delegação, envio de convites/notificações por e-mail e quilometragem automatizada. Para Conta Azul, ainda faltam validações de idempotência, concorrência e reconciliação; não ativar cron nem executar lançamentos reais. Cartões, adiantamentos e viagens não fazem parte do fluxo atual.

## Ambiente e testes

- Node **>= 22.13.0**, npm com `package-lock.json`: `npm ci`, `npm run dev`, `npm run lint`, `npm run build`. No PowerShell, use `npm.cmd` se a política bloquear `npm.ps1`. Configure `.env.local` pelo modelo `.env.example` com recursos de teste; não sincronize esse arquivo entre contas.
- `npm test` executa build mais smoke local do servidor Next. Teste de banco: `node --test tests/company-workflow.postgres.mjs`, com PGlite **0.5.16** em ambiente descartável e, se instalado fora do checkout, `COMPROVA_PGLITE_MODULE` apontando para a URL `file:` do módulo. PGlite não é dependência do aplicativo. Teste de menu (só no código local): `node --test tests/settings-navigation.test.mjs` (use Node 24 ou outro com strip de tipos TS ativo).
- OneDrive já impediu o build por arquivos virtuais/reparse points. Na validação anterior, foi usada uma cópia QA fora do OneDrive, com configuração fictícia, fonte simulada e sem credenciais de produção. Não transfira essa cópia nem assuma que o caminho QA existirá no outro computador.
- O teste PGlite usa cadeias explícitas de migrations. Não aplique indiscriminadamente todas as migrations históricas: há um SQL do legado ligado ao `public` e um específico do override no projeto compartilhado.

## Referências e precedência

- [Arquitetura V1](docs/ARQUITETURA-CLONE-VEXPENSES-V1.md) e [status V1 histórico](docs/STATUS-DESENVOLVIMENTO-V1.md) preservam contexto de fases antigas. Seus números de migração, situação de Preview/produção e ações autorizadas não são um estado atual.
- [Roteiro de operação](docs/OPERACAO-REEMBOLSOS.md) explica o fluxo publicado. As notas de publicação mais recentes neste checkout foram acrescentadas após verificação do domínio.
- Para saber o que já foi testado e o próximo passo, consulte [PROJECT_LOG.md](PROJECT_LOG.md) e [PROJECT_CHECKPOINT.md](PROJECT_CHECKPOINT.md). Em caso de dúvida sobre produção, consulte GitHub, Vercel e Supabase separadamente; não presuma que um status vale para os três.

## Desenvolvimento em andamento e continuidade — 17/11/2026

- A tarefa atual é finalizar Configurações: dados pessoais/bancários administrados, três tipos de usuário, projetos e vínculos de pessoas/aprovadores, moeda BRL, campos obrigatórios, catálogos e políticas dos anexos e e-mail de aprovação. A implementação está **parcial, não testada e não implantada**.
- A interface de Configurações foi parcialmente conectada a componentes novos; `team-settings.tsx` ainda não existe e `AccountSettings` ainda não recebeu o contrato `companyId`. Não trate esse snapshot como versão compilável.
- Existem três migrations locais novas de políticas, perfis/importação e projetos/aprovações. Nenhuma delas foi aplicada. O arquivo `20261117165624_comprova_reporting_v2_mail.sql` é só um placeholder vazio: não implementa validação nem envio de e-mail.
- A planilha de equipe foi inventariada privadamente: 22 e-mails distintos, 18 Normais e 4 Administradores; campos ausentes não foram inventados. Não houve importação no banco. Os dados pessoais da planilha não integram o GitHub; outra conta precisará receber o arquivo por canal autorizado.
- Branch permanente autorizada: `codex/continuity`; checkpoint e código da tarefa são transferidos juntos, sem merge ou deploy automático. Rotina em `scripts/sync-continuity.ps1`, com allowlist e comparação da ponta remota.
- O checkout de origem segue Local/Windows e sujo, em `codex/comprova-v1-preview`, HEAD `477aecf`; a produção continua na `main` em `b36af53`. Não atualize essa árvore com pull/reset para obter a branch de continuidade.
- Regra de cinco minutos: meta durante a sessão ativa, não promessa de temporizador ou execução fora dela. As contas devem ter acesso ao mesmo GitHub; a conexão de uma não garante credenciais ou acesso a serviços na outra.
- Primeiro snapshot de continuidade confirmado: `db431990ddff1edb4d7d24d3258d7c1fcfdab998` em [codex/continuity](https://github.com/eduardofalsarellajunior/comprova-reembolsos/tree/codex/continuity). Inclui o código parcial da configuração V2 e instruções para restaurar a compilação. Não é uma versão pronta para produção.
- Teste do publisher realizado em Windows: commit/push funcionaram; referência remota desatualizada foi rejeitada antes de outro clone/commit. Nenhum deploy da branch encontrado, e a `main` permaneceu em `b36af53`.
