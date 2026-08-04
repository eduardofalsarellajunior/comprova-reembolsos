# Comprova

Aplicativo para transformar lotes de fotos, prints e PDFs de comprovantes em uma tabela editável, com login e histórico privado.

## Configuração

Copie `.env.example` para `.env.local` e configure:

- `NEXT_PUBLIC_SUPABASE_URL`: URL pública do projeto Supabase.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`: chave pública do Supabase.
- `OPENAI_API_KEY`: chave privada usada somente pela rota no servidor.

No Supabase, o bucket `receipts` deve ser privado e as tabelas `receipts` e `expenses` devem manter RLS habilitado.

## Desenvolvimento

```bash
npm run dev
```

## Verificação

```bash
npm run lint
npm run build
```
