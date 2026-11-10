# Status do desenvolvimento — COMPROVA V1

## Implementado

- Login por e-mail/senha e botão de Office 365/Microsoft Entra ID.
- Vínculo do Office 365 à conta existente pelo botão **Vincular Office 365**.
- Upload privado para o bucket `comprova-documents`.
- Leitura em lote e histórico no schema `comprova`.
- Relatórios com criação, vínculo de despesas, total calculado no banco e estados de aprovação.
- Políticas de despesa com limite por categoria/valor/prazo e exigência de comprovante.
- Fluxo de aprovação padrão, aprovação/rejeição e trilha de auditoria.
- Integração Conta Azul por OAuth 2.0, tokens cifrados no servidor, mapeamentos contábeis e fila persistente.
- Retentativas, backoff, dead-letter e registro de eventos da fila. A idempotência do envio financeiro ainda precisa de validação antes do uso real.
- Execução manual protegida em `/api/integrations/conta-azul/queue`; o cron automático permanece desativado.
- Migrations versionadas sem alteração do schema `public`, de buckets existentes ou de `auth.users`.

## Configuração obrigatória antes do Preview

1. No Supabase destino, adicionar `comprova` em **Settings > API > Exposed schemas**.
2. Confirmar que `comprova-documents`, `comprova-uploads` e `comprova-recordings` continuam privados.
3. Configurar no servidor as variáveis do `.env.example`.
4. No Supabase Auth, habilitar o provedor Azure e cadastrar os callbacks do Preview e produção.
5. No Microsoft Entra ID, limitar o aplicativo ao tenant corporativo e cadastrar os callbacks do Supabase.
6. Criar a aplicação Conta Azul, preencher as credenciais e cadastrar exatamente `CONTA_AZUL_REDIRECT_URI`.
7. Criar os mapeamentos de categoria, fornecedor e conta financeira na tela de Relatórios.
8. Executar a migração binária do Storage somente com as credenciais de serviço inseridas localmente; elas não devem ser coladas no chat nem no repositório.

## Limitações conhecidas

- A branch `codex/comprova-v1-preview` foi publicada para teste, mas a produção ainda usa a versão anterior. O Preview não deve ser usado para lançar despesas reais.
- O script de Storage está pronto, mas a cópia dos 26 arquivos não foi executada porque a conexão administrativa do projeto de origem recusou autenticação. O banco destino já contém os 26 registros e 21 despesas.
- O lint e o build local não conseguiram ler dependências armazenadas como reparse points do OneDrive (`UNKNOWN: unknown error, read`). O `tsc --noEmit` passou sem erros depois das correções.
- A branch de Preview foi enviada ao GitHub e compilada na Vercel; o corte de produção não foi executado.
- A migração `20261106180000_comprova_sync_jobs_owner_guard.sql` foi aplicada e verificada no Supabase destino em 09/11/2026.
- A exportação financeira não está pronta para produção: a fila pode reenviar despesas em uma tentativa posterior, e a reconciliação ainda não compara os registros externos. Não ativar o cron nem lançar despesas reais na Conta Azul antes de corrigir e testar esses casos.

## Próxima execução autorizada

Depois de configurar as variáveis e expor o schema, rodar o Preview e verificar:

1. login Office 365;
2. upload de uma imagem e de um PDF;
3. criação de relatório e vínculo;
4. violação de política bloqueante;
5. aprovação e criação de `sync_jobs`;
6. correção e teste de idempotência, concorrência e reconciliação da fila;
7. execução manual do worker com o segredo configurado, usando dados de teste;
8. lançamento de teste na Conta Azul e reconciliação.
