# Iguassu de Parfum: catálogo + painel

```
site/        vitrine estática (Node puro): build.mjs lê o catálogo do Supabase e gera site/dist
site/painel/ painel do dono em /painel/ (HTML + JS, supabase-js empacotado pelo esbuild no build)
api/         manter.mjs: cron diário da Vercel pra o Supabase grátis não pausar
supabase/    migrations (tabelas, RLS, Storage, republicação automática)
scripts/     banco, carga inicial, logins, testes de acesso, servidor local
```

## Rodar local

```bash
npm install
npm run site && npm run servir     # http://localhost:8790 e http://localhost:8790/painel/
npm run site:arquivo               # monta a partir de dados/catalogo-inicial.json, sem banco
```

Precisa do `.env.local` (fora do git) com `SUPABASE_URL` e `SUPABASE_CHAVE_PUBLICA`.

## Vercel

Variáveis: `SUPABASE_URL`, `SUPABASE_CHAVE_PUBLICA`, `PUBLICACAO_SEGREDO`, `CRON_SECRET`, `SITE_URL`.
Build, saída e cron já estão no `vercel.json`.

Republicação automática: criar um Deploy Hook no projeto e gravar a URL no Vault do Supabase
como `iguassu_deploy_hook`. A partir daí, cada mudança no painel republica o site em 1 a 2 minutos.

## Banco

```bash
npm run banco:migrar                                          # aplica supabase/migrations
node --env-file=.env.local scripts/testar-acesso.mjs          # confere as regras de acesso
node --env-file=.env.local scripts/acesso.mjs senha <email>   # senha nova pro painel
```
