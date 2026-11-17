# INEPAD Reembolso

Aplicativo para criar relatórios de reembolso, ler e conferir comprovantes dentro do relatório e acompanhar as aprovações. A página inicial abre em **Relatórios**; o menu lateral também dá acesso a **Aprovações** e **Configurações**.

## Configuração

Copie `.env.example` para `.env.local` e configure:

- `NEXT_PUBLIC_SUPABASE_URL`: URL pública do projeto Supabase.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: chave pública do Supabase.
- `OPENAI_API_KEY`: chave privada usada somente pela rota no servidor.
- `VEXPENSES_API_TOKEN`: token público da empresa na VExpenses, usado somente no servidor.
- `SUPABASE_SERVICE_ROLE_KEY`: somente para rotas de servidor/worker; nunca vai para o navegador.
- `INTEGRATION_ENCRYPTION_KEY`: segredo de 32 bytes/base64 para proteger tokens da Conta Azul.
- `CONTA_AZUL_CLIENT_ID`, `CONTA_AZUL_CLIENT_SECRET` e `CONTA_AZUL_REDIRECT_URI`: credenciais OAuth da aplicação Conta Azul.
- `CONTA_AZUL_SYNC_CRON_SECRET`: segredo usado pelo worker de fila.

No Supabase destino, o schema `comprova` precisa ser incluído em **API > Exposed schemas**. O bucket `comprova-documents` deve permanecer privado, e as tabelas do schema `comprova` devem manter RLS habilitado.

A integração com a VExpenses identifica o usuário pelo mesmo e-mail utilizado no login, carrega categorias e relatórios abertos e exige confirmação antes de criar cada despesa real.

## Arquitetura do produto

O histórico da evolução do COMPROVA, agora INEPAD Reembolso, para um sistema de gestão de reembolsos está em [`docs/ARQUITETURA-CLONE-VEXPENSES-V1.md`](docs/ARQUITETURA-CLONE-VEXPENSES-V1.md). A mudança de marca não renomeia o repositório, o domínio nem os recursos Supabase.

## Desenvolvimento

```bash
npm run dev
```

## Verificação

```bash
npm run lint
npm run build
```
