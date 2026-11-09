# Arquitetura do sistema de reembolsos — COMPROVA V1

## Objetivo

Criar um sistema próprio de gestão de reembolsos inspirado nos fluxos usados no VExpenses, mas otimizado para o uso do INEPAD:

1. importar vários comprovantes de uma vez;
2. ler fotos, prints e PDFs com IA;
3. permitir conferência e edição em tabela;
4. organizar despesas em relatórios;
5. aplicar regras de política;
6. enviar o relatório para aprovação somente quando o usuário decidir;
7. manter histórico, comprovantes e trilha de auditoria.

Esta versão não tenta reproduzir cartões corporativos, reservas de viagens ou toda a operação financeira do VExpenses. O foco é o ciclo de reembolso e prestação de contas.

## Requisitos obrigatórios da primeira versão

Além da leitura e conferência dos comprovantes, a V1 deverá nascer com:

1. **Login corporativo pelo Office 365/Microsoft Entra ID**;
2. **Integração contábil com Conta Azul**, incluindo fila, retentativas, idempotência e reconciliação.

Sem esses dois itens, a primeira versão ficaria limitada a uma planilha inteligente e não fecharia o ciclo operacional de reembolso.

## Avaliação funcional do VExpenses

As páginas públicas da VExpenses descrevem estes grupos de funcionalidades: reembolsos e adiantamentos, relatórios, políticas de despesas, fluxo de aprovação, centros de custo/filiais, combustível e quilometragem, auditoria antifraude, dashboards, integração com ERP, aplicativo web/mobile, cartões corporativos e viagens corporativas.

### O que é essencial para o COMPROVA

| Capacidade | Decisão para a V1 |
|---|---|
| Usuários e login | Implementar com Supabase Auth; o mesmo usuário pode acessar Consórcio e COMPROVA no projeto compartilhado. |
| Comprovantes | Upload em lote de JPG, PNG, HEIC quando suportado, PDF e prints. Armazenamento privado por usuário. |
| Leitura automática | OCR/visão para fornecedor, data, valor, moeda, categoria, descrição e observações. |
| Conferência | Tabela editável com destaque de baixa confiança, duplicidade e campos ausentes. |
| Relatórios | Criar, editar, filtrar, reabrir e fechar relatório; agrupar despesas por período, projeto e centro de custo. |
| Política | Validar valor, categoria, data, reembolsabilidade, centro de custo e campos obrigatórios. Alertar antes de enviar. |
| Aprovação | Fluxo configurável de pendente, enviado, em análise, aprovado, rejeitado e pago. |
| Comprovante clicável | Abrir o arquivo original por URL assinada temporária, sem tornar o bucket público. |
| Histórico | Registrar alterações, aprovações, rejeições, reenvios e exportações. |
| Exportação | CSV/XLSX e pacote JSON; integração com VExpenses fica como adaptador separado. |

### Capacidades para uma fase posterior

- adiantamentos e acerto de adiantamento;
- quilometragem e rotas via GPS;
- cartões corporativos e conciliação automática;
- reservas de passagem, hotel e locação;
- auditoria antifraude avançada e detecção de padrões;
- dashboards financeiros avançados;
- integração contábil/ERP avançada com múltiplos destinos;
- aplicativo móvel nativo/offline;
- múltiplas empresas, filiais e regras por grupo.

## Integração obrigatória com Conta Azul

### Escopo mínimo da V1

O primeiro corte deve enviar somente despesas de relatórios **aprovados**. Relatórios em rascunho, em conferência ou rejeitados não podem gerar lançamento contábil.

Fluxo mínimo:

1. administrador conecta a empresa Conta Azul por OAuth 2.0;
2. COMPROVA importa categorias, fornecedores, contas financeiras e centros de custo necessários ao mapeamento;
3. usuário configura o vínculo entre categoria/centro de custo do COMPROVA e Conta Azul;
4. aprovação do relatório cria um item na fila de integração;
5. o worker envia o lançamento para a Conta Azul;
6. o sistema guarda o identificador externo e o resultado;
7. uma rotina de reconciliação consulta a Conta Azul e corrige estados divergentes.

### Componentes técnicos necessários

- OAuth 2.0 com `client_id`, `client_secret`, `access_token` e `refresh_token` protegidos no servidor;
- renovação automática de token;
- `integration_connections`, uma conexão por empresa Conta Azul;
- `accounting_mappings` para categorias, centros de custo, fornecedores e contas;
- `sync_jobs` como fila persistente;
- `sync_events` como histórico de tentativas;
- chave de idempotência por `report_id` + tipo de operação;
- retentativa com backoff para falhas transitórias e estado `dead_letter` para falhas permanentes;
- reconciliação por polling, porque a API da Conta Azul não oferece webhooks nativos;
- limite de concorrência por conexão para respeitar os limites da API.

### Delimitação contábil da V1

Não é necessário começar com toda a contabilidade da Conta Azul. O mínimo é:

- lançar a despesa aprovada;
- associar fornecedor, categoria, centro de custo e data;
- registrar valor e observação;
- guardar o ID retornado pelo ERP;
- exibir sucesso, pendência ou erro reconciliável.

Conciliação bancária completa, contas a pagar, baixa financeira e sincronização bidirecional podem entrar depois, mas a estrutura da fila deve permitir sua inclusão.

Segundo a documentação atual da Conta Azul, a API usa OAuth 2.0, possui limites de requisição e não oferece sandbox permanente nem webhooks nativos. A V1 deve, portanto, usar a conta de desenvolvimento para testes e polling controlado em vez de depender de eventos recebidos do ERP.

## Autenticação obrigatória pelo Office 365

### Decisão

Usar Microsoft Entra ID (Office 365) como provedor OAuth do Supabase Auth, restrito ao tenant corporativo do INEPAD. O aplicativo não deve criar uma segunda conta local para o mesmo e-mail.

### Fluxo

1. usuário clica em **Entrar com Office 365**;
2. Microsoft Entra ID autentica o usuário;
3. Supabase Auth recebe o callback OAuth;
4. a aplicação valida tenant, domínio e e-mail;
5. o usuário recebe acesso conforme seu papel no COMPROVA;
6. o `user_id` do Supabase continua sendo a chave das tabelas e do Storage.

### Configurações necessárias

- registro de aplicativo no Microsoft Entra ID;
- `client_id` e segredo guardados apenas no Supabase Auth;
- tenant URL do INEPAD, em vez de liberar contas Microsoft genéricas;
- callback do Supabase cadastrado no Azure;
- URL de produção e URLs de Preview cadastradas no Supabase Auth;
- política de domínio permitido;
- associação segura do usuário existente do Consórcio pelo provedor/e-mail, sem escrever diretamente em `auth.users`.

### Regras de segurança

- não usar senha do Office 365 dentro do COMPROVA;
- não armazenar tokens Microsoft na tabela de despesas;
- não aceitar e-mail apenas como prova suficiente se o `sub`/tenant do provedor estiver disponível;
- bloquear acesso quando o usuário não pertencer ao tenant autorizado;
- registrar login, logout, falha e revogação na auditoria.

## Tabelas adicionais exigidas para esses requisitos

Além das tabelas de reembolso, a V1 deverá criar no schema `comprova`:

- `identity_links`: vínculo entre o usuário Auth e a identidade Office 365;
- `integration_connections`: empresa, provedor, estado e metadados não secretos;
- `integration_secrets`: referência protegida a tokens, nunca exibida na UI;
- `accounting_mappings`: regras de correspondência COMPROVA ↔ Conta Azul;
- `sync_jobs`: fila persistente e idempotente;
- `sync_events`: tentativas, respostas sanitizadas e reconciliação;
- `external_records`: IDs externos por relatório, despesa e lançamento.

As tabelas de segredo devem usar um mecanismo de segredo do ambiente ou cofre; valores de token não devem ser gravados em texto aberto nem no repositório.

### Observação sobre a avaliação

O navegador autenticado foi deixado disponível para inspeção, mas o controle automatizado foi interrompido pelo mecanismo de segurança antes de uma varredura completa da interface. Portanto, a lista acima combina a experiência operacional já registrada no COMPROVA com a documentação pública da VExpenses. Antes de implementar cada tela equivalente, devemos validar o comportamento observado no ambiente do usuário.

## Arquitetura proposta

```text
Web COMPROVA
  ├─ Autenticação e sessão
  ├─ Caixa de entrada de comprovantes
  ├─ Tabela de conferência
  ├─ Relatórios e filtros
  ├─ Política e validações
  ├─ Aprovação
  └─ Exportação/integrações
          │
          ▼
Next.js App Router
  ├─ Server Actions/API protegidas
  ├─ fila de processamento de OCR
  ├─ adaptador VExpenses
  └─ auditoria e notificações
          │
          ├──────── Supabase Auth
          ├──────── PostgreSQL (schema comprova)
          ├──────── Storage privado (comprova-documents)
          └──────── OpenAI/serviço de leitura
```

## Domínio de dados

O schema isolado `comprova` deve ser a única superfície de dados do produto.

### Identidade

- `comprova.user_map`: associação de identidade de origem para o usuário Auth do projeto destino;
- `auth.users`: administrado somente pelo Supabase Auth, sem escrita direta pela aplicação;
- perfis, membros e papéis adicionais devem ficar em tabelas próprias do schema `comprova`.

### Comprovantes

`comprova.receipts`

- `id`, `user_id`, `file_name`, `storage_path`, `mime_type`, `size_bytes`;
- `status`: `pending`, `processing`, `completed`, `error`;
- `error_message`, `created_at`, `updated_at`;
- bucket lógico padrão: `comprova-documents`.

### Despesas

`comprova.expenses`

- vínculo com comprovante e usuário;
- fornecedor, data, valor, moeda, categoria e descrição;
- confiança da leitura e observações;
- estado de envio para integração externa;
- IDs e erros retornados por integrações.

### Relatórios

Próxima tabela: `comprova.reports`.

- `id`, `owner_id`, `name`, `description`;
- `period_start`, `period_end`;
- `status`: `draft`, `in_review`, `submitted`, `approved`, `rejected`, `paid`, `cancelled`;
- `total_amount`, `currency`, `submitted_at`, `approved_at`, `paid_at`;
- `cost_center_id`, `project_id` quando aplicável.

Próxima tabela de vínculo: `comprova.report_expenses`.

- `report_id`, `expense_id`, `position`;
- restrição para impedir a mesma despesa em dois relatórios ativos;
- histórico de inclusão e remoção.

### Política

Próximas tabelas:

- `comprova.policies`;
- `comprova.policy_rules`;
- `comprova.policy_assignments`;
- `comprova.policy_violations`.

As regras devem produzir violações explicáveis, não bloquear silenciosamente. O usuário poderá corrigir ou justificar uma exceção antes do envio.

### Aprovação e auditoria

Próximas tabelas:

- `comprova.approval_flows`;
- `comprova.approval_steps`;
- `comprova.approval_instances`;
- `comprova.audit_events`;
- `comprova.notifications`.

Cada transição deve registrar ator, data, estado anterior, estado novo, motivo e metadados mínimos.

## Storage

Buckets privados exclusivos:

- `comprova-uploads`: arquivos recém-enviados;
- `comprova-documents`: comprovantes confirmados e históricos;
- `comprova-recordings`: reservado para anexos de áudio ou comandos falados futuros.

Regras:

- nenhum bucket existente do projeto compartilhado deve ser reutilizado;
- caminhos devem começar pelo identificador lógico do proprietário;
- políticas de Storage devem validar `bucket_id` e proprietário;
- a interface usa URL assinada temporária para abrir o arquivo;
- arquivos não devem ser expostos em URL pública permanente.

## Módulos da aplicação

### 1. Entrada de comprovantes

- seleção múltipla e arrastar-e-soltar;
- limite e validação de tamanho/tipo;
- checksum para evitar reenvio do mesmo arquivo;
- fila visual por arquivo;
- retomada de falhas.

### 2. Leitura inteligente

- processar cada arquivo de forma idempotente;
- guardar resultado bruto e resultado normalizado;
- separar confiança por campo;
- permitir revisão manual sem perder a leitura original;
- suportar mais de uma despesa encontrada no mesmo PDF.

### 3. Conferência

- tabela editável;
- filtros por confiança, erro, data, categoria e relatório;
- preview do comprovante ao clicar no nome;
- detecção de provável duplicidade por hash, fornecedor, data e valor;
- ação em lote para categorizar, atribuir relatório ou excluir rascunhos.

### 4. Relatórios

- criação manual pelo usuário;
- inclusão e retirada de despesas enquanto estiver em rascunho;
- cálculo de totais no servidor;
- validação antes de submeter;
- bloqueio de edição durante aprovação, salvo rejeição ou reabertura.

### 5. Aprovação

- aprovador individual ou por níveis;
- comentários e motivo de rejeição;
- reenvio após correção;
- nunca enviar automaticamente para aprovação;
- pagamento é um estado de controle, não uma transferência financeira automática na V1.

### 6. Integrações

Cada destino deve ter um adaptador independente:

- `VExpensesAdapter`: consulta relatórios/categorias e registra status;
- `CsvAdapter`: exporta para conferência;
- `ErpAdapter`: fase posterior;
- `NotificationAdapter`: e-mail/WhatsApp, fase posterior.

O adaptador VExpenses não deve alterar o fluxo interno de aprovação do COMPROVA e não deve enviar o relatório para aprovação sem comando explícito do usuário.

## Segurança

- RLS ativado em todas as tabelas do schema `comprova`;
- usuário comum só acessa os próprios dados;
- aprovador acessa apenas relatórios atribuídos;
- funções `SECURITY DEFINER` com `search_path` explícito e checagem interna de autorização;
- chaves privadas somente em variáveis de servidor;
- logs sem tokens, URLs assinadas completas ou conteúdo de comprovantes;
- operações destrutivas em lote exigem confirmação na interface;
- nenhuma alteração em `public`, `auth.users` ou buckets de outros sistemas.

## Roadmap de implementação

### Fase 1 — base isolada, login corporativo e conferência

- concluir migração de Storage para `comprova-documents`;
- apontar a aplicação para o Supabase destino e schema `comprova`;
- configurar login Office 365/Microsoft Entra ID e associar o usuário já existente;
- validar upload, leitura, tabela editável, preview e histórico;
- criar `reports` e vínculo de despesas.

### Fase 2 — operação de reembolso e Conta Azul (implementada no código)

- políticas e violações;
- criação de relatório pelo usuário;
- validação de fechamento;
- exportação CSV/XLSX/JSON;
- trilha de auditoria completa.
- conexão OAuth2 da Conta Azul;
- mapeamentos contábeis;
- fila, retentativas e idempotência;
- reconciliação por polling;
- falta apenas configurar as credenciais da aplicação Conta Azul e executar o worker em Preview.

### Fase 3 — aprovação (base implementada; evolução multinível)

- fluxo multinível;
- comentários, rejeição e reabertura;
- notificações;
- visão do aprovador e visão financeira.

### Fase 4 — integrações

- adaptador VExpenses com lançamento assistido;
- ERP e conciliação;
- dashboards e indicadores;
- automações de fechamento e pagamento.

## Critérios de aceite da V1

1. Um usuário consegue entrar com o mesmo login já usado no Consórcio.
2. Um lote misto de imagens e PDFs é recebido sem exigir leitura manual inicial.
3. Cada comprovante aparece em uma tabela editável.
4. O nome do arquivo abre o original em preview privado.
5. Uma despesa pode ser corrigida e vinculada a um relatório.
6. O sistema impede acesso entre usuários.
7. O sistema registra alterações e não perde o arquivo original.
8. Nenhuma ação envia automaticamente um relatório para aprovação.
9. Os dados e arquivos do COMPROVA não usam objetos públicos ou buckets de outros produtos.
10. O fluxo funciona em ambiente Preview antes de qualquer publicação.

## Referências funcionais

- [VExpenses — gestão de despesas corporativas](https://lp.vexpenses.com/gestao-de-despesas-corporativas/)
- [VExpenses — demonstração e gestão de reembolsos](https://material.vexpenses.com/demonstracao-ao-vivo/)
- [VExpenses — assistente de IA](https://material.vexpenses.com/assistente-vexpenses/)
- [VExpenses — viagens corporativas](https://lp.vexpenses.com/vexpenses-viagens/)
