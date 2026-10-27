# Investindo!

**Patrimônio se constrói todo mês.** O Investindo! recebe quanto você quer
investir no mês, consulta os indicadores do dia e devolve um rateio pronto:
quanto vai para cada classe e em qual produto, seguindo regras fixas que você
define.

Projeto acadêmico. Não é recomendação de investimento.

- Escopo: `Escopo – App de Investimentos Pessoais.pdf`
- Decisões técnicas, fontes de dados e modelo de dados: [docs/DECISOES.md](docs/DECISOES.md)

## Tecnologias

| Camada | Escolha |
| --- | --- |
| App | React 18 + Vite + TypeScript, PWA instalável |
| Banco, login, funções | Supabase (Postgres com RLS, Auth, Edge Functions, pg_cron) |
| E-mails | Resend via SMTP do Supabase |
| Gráficos | Recharts |
| Testes | Vitest |

## Estrutura

```
src/
  domain/      regras puras, sem rede: rateio, renda fixa, carteira, metas, calendário
  lib/         Supabase, sessão, acesso a dados com cache, formatação pt-BR
  componentes/ componentes do manual de marca
  paginas/     telas (conta, primeiro acesso, Início, Investir, Carteira, Metas, Ajustes)
  styles/      tokens.css (manual de marca) e estilos globais
supabase/
  migrations/  esquema, RLS e função de confirmar aporte
  functions/   coletor (indicadores, Tesouro, ETFs) e excluir-conta
  templates/   e-mails da conta (gerados por scripts/gerar-emails.mjs)
  agendamento.sql  pg_cron do coletor (rodar uma vez em produção)
```

## Rodando localmente

Requisitos: Node 20+ e Docker.

```bash
npm install
```

```bash
npx supabase start
```

Copie `.env.example` para `.env.local` e cole a `anon key` que o comando acima
mostrou. Depois:

```bash
npm run dev
```

O app abre em http://localhost:5173. Os e-mails locais (confirmação, senha)
chegam no Mailpit, em http://127.0.0.1:54524.

Para popular os indicadores localmente, copie `supabase/functions/.env.example`
para `supabase/functions/.env`, preencha os valores e rode:

```bash
npx supabase functions serve --env-file supabase/functions/.env
```

```bash
curl -X POST "http://127.0.0.1:54521/functions/v1/coletor?tarefa=tudo&desde=2024-01-01" -H "Authorization: Bearer SEU_COLETOR_SEGREDO"
```

## Testes

```bash
npm test
```

Os testes cobrem o rateio (incluindo os dois exemplos do escopo), a escolha da
renda fixa, a curva de CDB/Tesouro, o calendário de dias úteis, a avaliação da
carteira, a formatação do manual de marca e os leitores de cada fonte de dados.

## Publicando

1. Crie as contas gratuitas: [Supabase](https://supabase.com),
   [Resend](https://resend.com) (com um domínio verificado por SPF e DKIM) e
   [brapi.dev](https://brapi.dev).
2. `npx supabase link --project-ref SEU_PROJETO` e `npx supabase db push`.
3. No painel do Supabase, em Authentication:
   - configure o SMTP do Resend (ou use a integração oficial);
   - defina o Site URL com o endereço do app;
   - cole os modelos de `supabase/templates/`.
4. Envie os segredos e publique as funções:

```bash
npx supabase secrets set --env-file supabase/functions/.env
```

```bash
npx supabase functions deploy coletor --no-verify-jwt
```

```bash
npx supabase functions deploy excluir-conta
```

5. Habilite `pg_cron` e `pg_net` e rode `supabase/agendamento.sql` no SQL Editor.
6. Publique o app (Vercel, Netlify ou Cloudflare Pages) com `VITE_SUPABASE_URL`
   e `VITE_SUPABASE_ANON_KEY`. Comando de build: `npm run build`; pasta: `dist`.
