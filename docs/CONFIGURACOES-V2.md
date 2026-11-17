# Configurações V2 — implementação e ativação segura

Este documento descreve o código em desenvolvimento, não uma confirmação de implantação. Consulte PROJECT_CHECKPOINT.md para evidências e próximo passo. Produção, importação real e envio de e-mails exigem autorização específica.

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

## Recuperação

Antes de ativar no banco compartilhado, conferir backup, objetos existentes, grants e revisão de origem. Em problema no front, restaurar o deploy anterior autorizado e desligar o envio de e-mail; preservar as tabelas, dados e histórico novos. Não remover objetos compartilhados nem apagar filas para simular rollback. Pendências de envio ambíguo precisam ser reconciliadas com o provedor antes de qualquer tentativa manual.
