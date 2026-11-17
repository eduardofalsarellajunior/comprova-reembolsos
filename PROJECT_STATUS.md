# INEPAD Reembolso — estado do projeto

**Referência:** 17/11/2026 (America/Sao_Paulo). Leia o [checkpoint](PROJECT_CHECKPOINT.md) para retomar. Este documento distingue o que o GitHub contém do que ainda está no computador atual.

## Produto e repositório

- **Produto:** INEPAD Reembolso (antigo COMPROVA); relatórios, leitura de comprovantes e fluxo de aprovação por empresa. A marca nova está no checkout Local; repositório, domínio de produção e nomes dos recursos existentes não mudaram.
- **Repositório:** [eduardofalsarellajunior/comprova-reembolsos](https://github.com/eduardofalsarellajunior/comprova-reembolsos).
- **Produção:** [comprova-reembolsos.vercel.app](https://comprova-reembolsos.vercel.app/). Em 17/11, a Vercel ainda indicava o deploy anterior `dpl_Egrw7WncJf6xZoapmVBo2Wm9wMUx` (base `477aecf`), READY. O banco foi consultado somente para leitura da dependência de Configurações.
- **GitHub consultado neste handoff:** `main = 477aecfa6563e8e6692ce0624133a7be6ad370ac`; `codex/comprova-v1-preview = 49e5daed730738d84664256211fde9fdfda3c094`.
- **Checkout deste computador:** Local/Windows, checkout principal em OneDrive, branch `codex/comprova-v1-preview`, HEAD `477aecf`. O branch local está um commit à frente do upstream de Preview, mas esse commit já está no GitHub via `main`. A branch `main` **local** aponta para `a20abfb`; não use esse ponteiro como indicação do que está em produção.
- **Transferência entre contas:** os quatro documentos foram enviados à [branch codex/comprova-handoff](https://github.com/eduardofalsarellajunior/comprova-reembolsos/tree/codex/comprova-handoff), separada da `main`, no SHA confirmado `2ae7d6a2e7e8d9df3b44e574c297fbaf0e85cadd`. A nova área de Configurações, suas migrations, alterações e testes continuam somente no checkout de origem, sem commit.

## Arquitetura e pontos de entrada

| Camada | Onde está e como funciona |
| --- | --- |
| Web | Next.js App Router 16.2.6, React 19, TypeScript, Tailwind/CSS. `app/page.tsx` (comprovantes e login), `app/empresa`, `app/relatorios`, `app/aprovacoes`. `app/configuracoes` é trabalho local; nele, `/empresa` passa a redirecionar. |
| Sessão | Supabase Auth com e-mail/senha e fluxo para Microsoft/Office 365. Sessão e acesso encadeados à identidade e aos vínculos da empresa; quatro perfis: administrador, aprovador, colaborador e financeiro. |
| Banco e arquivos | Supabase compartilhado de destino, project ref `xammlyxakxrysjrzdbeq`, schema exclusivo `comprova` exposto na Data API com RLS. Buckets privados `comprova-documents`, `comprova-uploads` e `comprova-recordings`. Configuração de acesso em `lib/supabase`; migrations em `supabase/migrations`. |
| Negócio | `app/api/analyze` aciona o serviço de leitura no servidor; `app/api/reports`, `approval-flows`, `approvals` e `policies` servem os fluxos. O banco valida papéis, submissão e decisões em etapas. |
| Integrações | `app/api/vexpenses` e `lib/vexpenses.ts` suportam consulta/envio e o fluxo assistido; anexos podem exigir a interface da VExpenses. `app/api/integrations/conta-azul` tem base de OAuth/mapeamento/fila; produção não foi ativada. `vercel.json` está vazio de cron. |
| Deploy | GitHub integrado à Vercel; push a `main` pode disparar produção. Setup e nomes de variáveis em [README.md](README.md); configuração de credenciais é independente por ambiente/conta. |

## Redesign local — INEPAD Reembolso

- A raiz `/` redireciona para `/relatorios`; `/login` reúne acesso por e-mail/senha e Office 365. Parâmetros conhecidos do retorno OAuth podem seguir para Relatórios sem aceitar um destino externo.
- Barra principal lateral recolhível e navegação comum a **Relatórios**, **Aprovações** e **Configurações**. Em Configurações há um segundo painel pesquisável e o conteúdo da seção escolhida. Os perfis e permissões de empresa são os mesmos do trabalho anterior.
- A leitura e a revisão de imagens/PDFs estão dentro do relatório em edição. O vínculo exige escolha explícita; não envia para aprovação. Lançamento manual, caixa de entrada e histórico de comprovantes continuam disponíveis.
- Visuais de marca vieram do ZIP enviado pelo usuário. Logo e ícone estão em `public/inepad-reembolso/`. `comprova` continua sendo o nome técnico do schema e dos prefixes de Storage; o pacote para o robô VExpenses mantém seu formato de compatibilidade.
- Validação local: build Next/TypeScript, ESLint, smoke HTTP, teste dos perfis de Configurações e navegação em Chromium desktop/celular passaram. O teste de comprovantes usou dados e OCR simulados; não validou serviços de produção.
- O redesign e o trabalho anterior de Configurações não estão no GitHub nem em produção. Nenhuma migration ou configuração remota foi alterada nesta tarefa.
- A publicação do app foi autorizada em 17/11. O pré-check confirmou que o schema de produção ainda não contém `departments`, `job_titles`, `mileage_policies`, as duas colunas de classificação de membros ou a RPC de atribuição. Aguardar autorização explícita para a migration `20261116181505_comprova_organization_settings.sql`, antes do push na `main`.

## Funcionalidade e decisões

- **Na versão publicada `477aecf`:** leitura em lote de imagens/PDFs e histórico privado; gestão básica da empresa/equipe; centros de custo, projetos, categorias, formas de pagamento, regras de despesa; relatórios com despesas manuais ou importadas; atribuição de fluxo padrão ou por centro de custo; aprovação sequencial, rejeição motivada, reenvio, retirada e registro financeiro sem transferência de dinheiro.
- **Na atualização local de Configurações:** menu pesquisável com 18 itens, seções de conta, integração e políticas; organograma e associação do membro a departamento/cargo separada do perfil; carga INEPAD LTDA com 23 cargos em três departamentos (8 Administrativo, 6 Comercial, 9 Operações); configuração de política de quilometragem sem cálculo automático; preferências de e-mail sem disparos. Ainda não aplicar a migration `20261116181505_comprova_organization_settings.sql` nem publicar sem aprovação.
- **Política de implantação:** uma autorização específica dispensou Preview para o release anterior. Não é autorização geral. O Preview consultado anteriormente apontava ao Supabase de produção; revalidar o isolamento antes de usar. Não religar o projeto Supabase antigo, nem copiar seus comprovantes para teste.
- **Limitações e lacunas:** não se confirmou o fluxo com contas reais de solicitante, aprovador e Financeiro em produção nem o login Office 365 de ponta a ponta nesta revisão. Ainda não há aprovação linha a linha, delegação, envio de convites/notificações por e-mail e quilometragem automatizada. Para Conta Azul, ainda faltam validações de idempotência, concorrência e reconciliação; não ativar cron nem executar lançamentos reais. Cartões, adiantamentos e viagens não fazem parte do fluxo atual.

## Ambiente e testes

- Node **>= 22.13.0**, npm com `package-lock.json`: `npm ci`, `npm run dev`, `npm run lint`, `npm run build`. No PowerShell, use `npm.cmd` se a política bloquear `npm.ps1`. Configure `.env.local` pelo modelo `.env.example` com recursos de teste; não sincronize esse arquivo entre contas.
- `npm test` executa build mais smoke local do servidor Next. Teste de banco: `node --test tests/company-workflow.postgres.mjs`, com PGlite **0.5.16** em ambiente descartável e, se instalado fora do checkout, `COMPROVA_PGLITE_MODULE` apontando para a URL `file:` do módulo. PGlite não é dependência do aplicativo. Teste de menu (só no código local): `node --test tests/settings-navigation.test.mjs` (use Node 24 ou outro com strip de tipos TS ativo).
- OneDrive já impediu o build por arquivos virtuais/reparse points. Na validação anterior, foi usada uma cópia QA fora do OneDrive, com configuração fictícia, fonte simulada e sem credenciais de produção. Não transfira essa cópia nem assuma que o caminho QA existirá no outro computador.
- O teste PGlite usa cadeias explícitas de migrations. Não aplique indiscriminadamente todas as migrations históricas: há um SQL do legado ligado ao `public` e um específico do override no projeto compartilhado.

## Referências e precedência

- [Arquitetura V1](docs/ARQUITETURA-CLONE-VEXPENSES-V1.md) e [status V1 histórico](docs/STATUS-DESENVOLVIMENTO-V1.md) preservam contexto de fases antigas. Seus números de migração, situação de Preview/produção e ações autorizadas não são um estado atual.
- [Roteiro de operação](docs/OPERACAO-REEMBOLSOS.md) explica o fluxo. Seu trecho sobre Configurações pertence à mudança **local** até publicação.
- Para saber o que já foi testado e o próximo passo, consulte [PROJECT_LOG.md](PROJECT_LOG.md) e [PROJECT_CHECKPOINT.md](PROJECT_CHECKPOINT.md). Em caso de dúvida sobre produção, consulte GitHub, Vercel e Supabase separadamente; não presuma que um status vale para os três.
