# presencaApp

Registro de presença em eventos: o participante abre um link público, escolhe o
evento aberto e preenche seus dados; o admin gerencia os eventos e gera o PDF da
lista de presença com coluna em branco para assinatura física.

- **frontend** — Next.js 15 (App Router, TypeScript, Tailwind v4) → Vercel
- **backend** — PHP 8.2 + Dompdf, em Docker → Render/Railway
- **banco** — Supabase (Postgres + Auth + RLS)

O formulário público e as leituras do dashboard falam **direto com o Supabase**
via anon key, protegidos por RLS — o site continua funcionando mesmo com o
backend fora do ar, o que é crítico durante um evento ao vivo. O backend é dono
só da geração do PDF, valida o JWT do admin e consulta o banco com o token do
próprio usuário: **nunca** usa a `service_role` key.

---

## 1. Banco de dados (Supabase)

1. Crie um projeto em [supabase.com](https://supabase.com).
2. SQL Editor → cole e rode [`supabase/schema.sql`](supabase/schema.sql) inteiro.
3. Confira a validação de CPF:
   ```sql
   select public.is_valid_cpf('529.982.247-25');  -- true
   select public.is_valid_cpf('111.111.111-11');  -- false
   ```
4. **Authentication → Users → Add user**: crie o admin (e-mail + senha).
5. **Promova esse usuário a admin** — sem isso o dashboard abre vazio:
   ```sql
   insert into public.admins (user_id, email)
   select id, email from auth.users where email = 'admin@exemplo.com'
   on conflict (user_id) do nothing;
   ```
6. **Authentication → Providers → Email → "Enable sign ups" = OFF.**
   Recomendado, mas não é mais a única barreira: uma conta fora de
   `public.admins` não lê nem escreve nada.
7. Anote em **Project Settings → API**: `Project URL` e a chave `anon public`.

O que a RLS garante:

| Quem | events | attendees |
| --- | --- | --- |
| anônimo | lê só os `is_open = true` | **só insere**, e só em evento aberto e não lotado |
| logado fora de `admins` | nada | nada |
| admin (em `public.admins`) | tudo | lê e remove |

Não existe policy de `SELECT` em `attendees` para anônimo — sem login ninguém
lista CPFs e e-mails.

**Estar logado não é ser admin.** As policies exigem `public.is_admin()`, que
consulta `public.admins`. A anon key é pública por natureza (vai inlined no
bundle do Next), então amarrar permissão ao papel `authenticated` deixaria a
segurança dependendo apenas do toggle de sign-ups do painel — configuração
manual, fora do versionamento. Para revogar alguém:
`delete from public.admins where email = '...';`

### Limite de participantes

Cada evento tem `max_attendees` (padrão 500, editável no formulário de criação).
Um trigger recusa inserts além do teto. Isso existe porque o insert público vai
direto ao Supabase sem rate limit: o `unique (event_id, cpf)` não segura um
script que gera CPFs válidos, e uma lista inundada inutiliza o PDF. O relatório
também corta em 2000 linhas e imprime aviso de truncamento quando isso acontece.

## 2. Backend (local, via Docker)

```bash
cp backend/.env.example backend/.env   # preencha SUPABASE_URL e SUPABASE_ANON_KEY
docker compose up --build
curl http://localhost:8080/health      # {"status":"ok"}
```

Sem Docker, com PHP 8.2 e Composer instalados:

```bash
cd backend
composer install
composer serve
```

Para executar a validação completa do backend: `composer check`.

O container usa Apache na porta interna `80`; o Compose publica essa porta como
`8080` no host. A variável `PORT` é sobrescrita pelo Compose para evitar que um
valor antigo em `backend/.env` altere a porta interna.

## 3. Frontend (local)

```bash
cp frontend/.env.local.example frontend/.env.local   # preencha as três variáveis
cd frontend && npm install && npm run dev            # http://localhost:3000
```

Para subir a stack inteira em containers (opcional):

```bash
cp .env.example .env    # as NEXT_PUBLIC_* são build args do frontend
docker compose --profile fullstack up --build
```

## 4. Deploy

### Infraestrutura Crefito (Docker + Traefik)

O arquivo `docker-compose-prod.yml` segue o padrão da rede externa
`CrefitoNet`, com TLS pelo resolver `letsencryptresolver` e bloqueio de
indexação por `X-Robots-Tag`.

No `.env` da raiz, configure:

```dotenv
APP_ENV=homolog
APP_HOST=hmpresenca.crefito11.gov.br
BACKEND_HOST_PORT=8080
```

As credenciais do Supabase e `ALLOWED_ORIGINS` continuam em `backend/.env`.
Confirme o hostname de homologação antes do deploy e execute:

```bash
docker compose -f docker-compose-prod.yml up -d --build
```

O código não é montado como volume em produção: isso preserva o diretório
`vendor/` criado durante o build e garante que o container execute exatamente
o artefato validado.

### Vercel (frontend)

Importe o repositório → **Root Directory = `frontend`** → variáveis:

| Variável | Valor |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL do Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | chave `anon public` |
| `NEXT_PUBLIC_API_URL` | URL pública do backend no Render |

### Render (backend)

**New → Web Service** → runtime **Docker** → **Root Directory `backend`**
(é o mesmo `backend/Dockerfile` que roda local). Variáveis:

| Variável | Valor |
| --- | --- |
| `SUPABASE_URL` | Project URL do Supabase |
| `SUPABASE_ANON_KEY` | chave `anon public` |
| `ALLOWED_ORIGINS` | `https://<seu-app>.vercel.app` |
| `PORT` | `8080` |
| `TZ` | `America/Sao_Paulo` |

> **A ordem importa e um redeploy é inevitável.** `ALLOWED_ORIGINS` só pode ser
> preenchido depois que a Vercel gerar o domínio, e `NEXT_PUBLIC_API_URL` só
> depois que o Render gerar o dele. Faça um deploy de cada, preencha as duas
> variáveis cruzadas e redeploye os dois.

No tier gratuito o Render hiberna após ~15 min sem uso: o primeiro PDF do dia
pode levar 30–50 s. O botão *Gerar PDF* trata isso — desabilita durante a
geração, mostra spinner e, passados 4 s, avisa que pode levar até 1 minuto. A
página do evento ainda dispara um `GET /health` ao abrir, para acordar o
servidor enquanto o admin confere a lista.

## 5. Uso

1. `/admin/login` com o usuário criado no Supabase.
2. **Novo evento** — nasce **Fechado**, então ainda não aparece no formulário.
3. Quando o evento começar: **Abrir preenchimento**. Só aí ele entra no dropdown
   público. Ao terminar: **Fechar preenchimento**.
4. **Copiar link do formulário** e divulgar (a home já filtra os eventos abertos).
5. `/admin/eventos/<id>` — lista de presentes e **Gerar PDF**.

## Fuso horário

`created_at` é `timestamptz`, o Postgres devolve em UTC e o container roda em
UTC. Formatar sem fuso explícito faria um check-in das 21h de Brasília aparecer
como 00h do dia seguinte — erro que invalida a lista como documento. Toda
formatação passa por `frontend/src/lib/datetime.ts` e
`backend/src/Support/Format.php`, sempre com `America/Sao_Paulo` explícito.

`events.event_date` é `date` puro e tem função própria (`formatEventDate` /
`formatDateOnly`): passar `'2026-07-23'` para `new Date()` daria meia-noite UTC
e voltaria 22/07 ao formatar em UTC−3. O `TZ` no compose e no Render é só defesa
em profundidade — quem garante o resultado é o `timeZone` explícito do `Intl`.

## Estrutura

```
presencaApp/
├─ supabase/schema.sql          ← rodar no SQL Editor
├─ docker-compose.yml           ← backend (+ frontend no perfil "fullstack")
├─ frontend/                    ← Next.js 15 → Vercel
│  ├─ middleware.ts             ← refresh de sessão + guard /admin/*
│  └─ src/{app,components,lib}
└─ backend/                     ← PHP 8.2 + Dompdf → Docker/Render
   ├─ Dockerfile                ← o mesmo para local e produção
   ├─ public/                   ← front controller e roteador HTTP
   ├─ src/{pdf,Supabase,Support}
   └─ tests/                    ← testes de contrato e geração do PDF
```
