# Configurações V2 — implementação e ativação segura

As quatro migrations deste guia foram aplicadas e verificadas no projeto autorizado em 18/11/2026; o novo front ainda está em preparação para publicar nesta captura. Consulte PROJECT_CHECKPOINT.md para o estado mais recente. Importação real e envio de e-mails não foram ativados.

## Funcionalidade

- Menu de 14 seções: removidos visão geral, centros de custos, Financeiro e configuração de fluxos. Dados históricos desses recursos são mantidos.
- Meus dados exibe CPF, nascimento, telefone, cargo e banco/agência/conta/Pix do próprio cadastro, somente leitura. Administradores editam pela equipe, inclusive o próprio cadastro. Segurança, senha e preferências da conta permanecem disponíveis.
- Novas contas têm tipo Normal, Intermediário ou Administrador. O papel técnico financeiro legado permanece compatível para preservar o histórico, mas não pode ser atribuído a novos cadastros.
- Equipe: edição administrativa, departamento/cargo, projetos e responsáveis por aprovação. A associação de login depende de e-mail confirmado; importar não cria usuários Auth nem redefine senha.
- Projetos: edição, membros e resumo; listas ativas/inativas. Desativar mantém histórico e vínculos existentes; novo relatório exige projeto ativo autorizado.
- Novas operações em Real, sem seletor de moeda nem conversão de históricos. Projeto e pagamento pertencem ao contexto do relatório e são herdados pelas despesas nele vinculadas.
- Valor positivo com no máximo dois decimais, descrição, categoria, projeto e pagamento são validados no servidor/banco. Extração OCR incompleta pode ficar avulsa para revisão, mas não ser vinculada ou submetida.
- Catálogos e políticas seguem as referências fornecidas. Limites legados ativos continuam visíveis em leitura e válidos; não são apagados silenciosamente quando a política V2 está sem limite.
- Aprovações novas congelam responsáveis e etapas em snapshot. Mudar os vínculos não muda uma aprovação em curso.

## Banco — sequência explícita, somente após autorização

Sobre o histórico já aplicado até Configurações organizacionais, revisar e aplicar nesta ordem, exclusivamente no schema comprova:

1. `20261117164803_comprova_policy_catalog_v2.sql`
2. `20261117164815_comprova_member_profiles_import.sql`
3. `20261117164832_comprova_project_members_and_approvals.sql`
4. `20261117165624_comprova_reporting_v2_mail.sql`

Não executar todas as migrations históricas indiscriminadamente: há arquivos antigos de public/overrides de outros sistemas. As quatro V2 devem ser ensaiadas juntas em banco descartável, com RLS e papéis reais, antes do alvo compartilhado. Não renomear schema/buckets, escrever em auth.users nem importar a planilha durante esse ensaio.

Histórico remoto aplicado (não repetir): política/catálogos `20261118181924`, perfis/importação `20261118182000`, projetos/aprovações `20261118225734`, reporting/fila de e-mail `20261118225807`. Versões geradas pelo MCP diferem dos timestamps dos arquivos locais. As nove tabelas novas têm RLS; a outbox nega acesso direto a usuários e só o worker pode processá-la. O aviso informativo de RLS sem política nessa tabela é esperado ([referência do linter](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy)); não criar uma política de acesso amplo para silenciá-lo.

## E-mail de aprovação

A aprovação final enfileira um evento transacional único. O servidor tenta processar o evento após a decisão apenas quando o envio está explicitamente ativado e configurado. Falha no e-mail nunca desfaz a aprovação.

Variáveis apenas no servidor, sem valores ou segredos nos documentos:

| Nome | Finalidade |
| --- | --- |
| `COMPROVA_EMAIL_SEND_ENABLED` | Ativação explícita; somente `true` habilita tentativas. |
| `COMPROVA_EMAIL_PROVIDER` | Adapter implementado: `resend`. |
| `COMPROVA_EMAIL_FROM` | Remetente permitido e verificado no provedor. |
| `RESEND_API_KEY` | Credencial privada do provedor. |
| `SUPABASE_SERVICE_ROLE_KEY` | Credencial privada já usada pelo servidor, nunca no cliente. |
| `COMPROVA_EMAIL_DISPATCH_SECRET` | Segredo exclusivo do worker, pelo menos 32 caracteres. |

O worker é `POST /api/internal/approval-emails`, autenticado pelo segredo exclusivo. Nenhum cron foi ativado. A recuperação periódica requer um agendador autorizado; sem ele, uma falha temporária pode ficar pendente até chamada posterior ao worker. Não compartilhar credenciais entre ambientes.

Há lease, tentativas limitadas, backoff e chave idempotente por evento. Após a janela segura, o evento exige reconciliação, sem reenvio cego. `sent` significa aceitação pelo provedor, não confirmação de chegada à caixa postal. [Contrato de idempotência do Resend](https://resend.com/docs/dashboard/emails/idempotency-keys).

## Importação privada e testes

O XLS real não está no Git. Em outro computador, o administrador deverá receber o arquivo por canal autorizado e convertê-lo com `scripts/converter-equipe-xls.py`, ou exportar CSV UTF-8. A interface exige prévia e confirmação; novos administradores exigem confirmação separada. Reimportar preserva papéis e campos já preenchidos. Dados de projeto/aprovação ausentes não são inferidos.

Testes puros/SQL: navegação, parser, perfis, projetos/políticas e reporting em `tests/`. PGlite 0.5.16 pode ser instalado em diretório de QA separado e indicado por `COMPROVA_PGLITE_MODULE` como URL file. Nenhum desses testes consulta o Supabase remoto.

No OneDrive, use QA limpo fora da pasta sincronizada para build. Não copie .env, .next, dependências virtuais, comprovantes ou planilhas. O teste `tests/settings-v2.browser.mjs` exige `QA_APP_ROOT` no Temp, build com URL fictícia `http://127.0.0.1:56443` e chave pública fictícia `offline-test-publishable`; somente serviços locais simulados são permitidos. Capturas e perfil do navegador ficam fora do Git. Esse ensaio não substitui login Office 365, OCR, usuário real ou e-mail de produção.

## Gate de ativação

**Situação em 18/11/2026, 20:04 -03:00:** gate remoto concluído após autorização específica. Quatro migrations aplicadas/verificadas; front c76c044 em main, deploy dpl_HJ7ssGTPgpLeve8gxVbKL9mhDjg4 READY no domínio de produção. Smoke público/sem sessão passou 10/10. Não repetir migrations ou deploy por causa da lista histórica abaixo. Homologação autenticada e vínculos administrativos continuam pendentes; e-mail desativado e planilha não importada.

Em 17/11/2026, a ponta de continuidade passou em build Webpack/TypeScript (21 páginas), smoke HTTP, lint e browser sintético desktop/celular. A suíte SQL/mocks registrada passou 13/13. A revisão estática das quatro migrations encontrou nove tabelas novas, todas com RLS; nenhuma DDL escreve fora de `comprova`. Os únicos acessos a outros namespaces são leituras do e-mail verificado em `auth.users` e da existência do comprovante em `storage.objects`. Os `drop` substituem somente cinco políticas RLS conhecidas. Isso é evidência local, não confirma o estado atual do Supabase compartilhado.

Antes de qualquer ativação remota:

1. Obter autorização específica para a consulta/pré-validação e para aplicar as quatro migrations no projeto correto; a autorização de checkpoint não cobre banco ou deploy.
2. Conferir histórico, objetos, nomes das cinco políticas substituídas, grants, backup/recuperação e que a migration organizacional anterior está presente. Uma divergência interrompe a aplicação; não adaptar o banco por adivinhação.
3. Aplicar somente os quatro arquivos listados acima, na ordem, sem `db push` indiscriminado e sem importar a planilha. Verificar objetos/RLS/grants e os marcadores de isolamento depois de cada etapa.
4. Manter `COMPROVA_EMAIL_SEND_ENABLED` desligado e não criar cron/worker durante a migration. Provedor, remetente, segredo e reconciliação exigem uma ativação separada.
5. Autorizar e executar o deploy do front separadamente, apenas depois do banco validado. O branch `codex/continuity` permanece com deploy automático bloqueado e não deve ser mesclado ou promovido implicitamente.
6. Homologar com contas de teste controladas os três tipos de usuário, projetos/aprovadores, relatório em BRL e aprovação. Não usar comprovantes, pagamentos, e-mails ou lançamentos reais nessa etapa sem autorização adicional.

## Recuperação

Antes de ativar no banco compartilhado, conferir backup, objetos existentes, grants e revisão de origem. Em problema no front, restaurar o deploy anterior autorizado e desligar o envio de e-mail; preservar as tabelas, dados e histórico novos. Não remover objetos compartilhados nem apagar filas para simular rollback. Pendências de envio ambíguo precisam ser reconciliadas com o provedor antes de qualquer tentativa manual.

Voltar somente o front não restaura integralmente o comportamento anterior: as migrations substituem `submit_report` e `add_manual_report_expense`, acrescentam validações em triggers e revogam a escrita direta em `projects`. A recuperação funcional exige plano revisado de compatibilidade/correção aditiva, preservando dados e definições/ACL anteriores. Não prometer rollback completo apenas com troca de deploy.

As migrations não preenchem vínculos de projeto ou aprovador por suposição. Após a ativação, o administrador precisa configurar esses vínculos para permitir novos relatórios e submissões. A carga de catálogos/políticas não substitui essa configuração nem importa a planilha de equipe.
