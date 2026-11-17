# INEPAD Reembolso — operação e validação de reembolsos

## Como usar depois da publicação

Acesse **Configurações** para trocar entre Minha conta, Empresa, Operacional e Políticas. A tela de **Membros de equipe** vincula o e-mail confirmado à empresa; o **tipo de conta** define o acesso e é independente do cargo. Administradores gerenciam a empresa; Financeiro tem sua área de relatórios aprovados e pagos; Colaborador e Aprovador podem consultar as políticas em Minha conta, sem acesso à edição.

Em **Departamentos e cargos**, a migration `20261116181505_comprova_organization_settings.sql` cadastra o modelo na única empresa INEPAD reconhecida: Administrativo (8), Comercial (6) e Operações (9). A carga não duplica nomes existentes. Um departamento ou cargo associado a membros não pode ser excluído até que esses vínculos sejam ajustados. O catálogo de quilometragem salva regras de referência, mas ainda não calcula despesas automaticamente; preferências de e-mail são salvas sem disparar notificações.

1. Em **Configurações → Dados da empresa**, crie a empresa. Cadastre centros de custo, projetos, formas de pagamento, categorias e regras. A configuração da moeda vale para novos relatórios; não há conversão de câmbio.
2. Inclua os e-mails dos participantes com seus perfis. O vínculo é assumido após login com o e-mail confirmado; o INEPAD Reembolso ainda não envia e-mail de convite.
3. Cadastre os fluxos na ordem em que os aprovadores devem decidir. Defina um fluxo padrão ou atribua fluxos aos centros de custo; o fluxo do centro tem prioridade sobre o padrão. Sem atribuição, o solicitante escolhe um fluxo ativo. A autoaprovação fica bloqueada por padrão.
4. A página inicial abre em **Relatórios**. Crie um rascunho e informe centro de custo, projeto, período e fluxo. No rascunho, abra **Ler comprovantes**, escolha os arquivos, revise os dados lidos e vincule os itens selecionados. O lançamento manual e a caixa de entrada continuam disponíveis. A leitura não envia o relatório para aprovação.
5. Em **Aprovações**, cada aprovador confere as despesas e os comprovantes e decide sua etapa. Uma rejeição exige motivo e devolve o relatório para correção. Um novo envio começa na primeira etapa. O autor ou administrador pode retirar um relatório que ainda esteja em aprovação sem apagar as decisões já tomadas.
6. Depois da última aprovação, o Financeiro ou administrador pode marcar como pago. Isso registra o pagamento; não movimenta dinheiro.

## O que está e o que não está no módulo

- A leitura automática fica dentro do relatório editável. Categorias da empresa aparecem no lançamento manual; a classificação automática não é treinada por empresa. O painel de leitura também dá acesso ao histórico e à exportação dos comprovantes existentes.
- A decisão é sobre o relatório inteiro e as etapas são sequenciais. Ainda não há aprovação por despesa, delegação nem notificações por e-mail. Se o acesso de um aprovador for desativado, o administrador pode retirar relatórios pendentes e corrigir o roteamento antes do reenvio.
- Conta Azul, cartões, adiantamentos e gestão de viagens não fazem parte desta entrega.

## Testes e publicação

- `npm test` compila o Next.js, inicia o servidor local em uma porta temporária e testa a renderização das áreas principais e o bloqueio das APIs sem sessão.
- O teste `node --test tests/company-workflow.postgres.mjs` executa migrations em um Postgres descartável, com perfis fictícios de administrador, colaborador, aprovador, financeiro e pessoa externa. Requer PGlite 0.5.16; se instalado fora do checkout, passe a URL `file:` do módulo em `COMPROVA_PGLITE_MODULE`. O teste não usa a conexão do Supabase.
- As migrations novas são `20261112120000_comprova_company_configuration.sql` e `20261112123000_comprova_secure_approvals.sql`. Elas atuam no schema `comprova` e nas políticas dos buckets exclusivos. Não alteram usuários do Auth nem recriam buckets.
- Antes de aplicar em um projeto existente, confira se há relatórios, fluxos ou políticas sem empresa; não atribua registros legados a uma empresa sem confirmar os responsáveis. Confira também o isolamento dos buckets e o acesso à Data API.
- Em Preview, use contas de teste e um Supabase isolado, valide o login real, o upload/abertura do arquivo e as ações nas duas sessões (solicitante e aprovador), além do Financeiro. Não use comprovantes de produção para a validação.
- Só depois do aceite em Preview e autorização para produção: preserve um backup, aplique as migrations e publique a versão correspondente. Se a versão precisar ser revertida, pare novas submissões e preserve relatórios e decisões registrados; não remova dados ou restaure políticas antigas sem verificar a compatibilidade.
