Plano — presencaApp: registro de presença em eventos

> **Documento histórico.** A implementação Node/Express/PDFKit descrita abaixo
> foi substituída pelo backend PHP 8.2 + Apache + Dompdf em 30/07/2026.
> Consulte o `README.md` e o diretório `backend/` para a arquitetura vigente.

Context
O diretório presencaApp está vazio; é um projeto do zero. Node 22.14, npm 10.9 e Docker 29.5 já estão instalados na máquina.

Problema a resolver: hoje não existe uma forma prática de registrar quem compareceu a um evento e emitir a lista de presença assinável. O objetivo é uma aplicação simples onde:

o participante abre um link público (sem login), escolhe num dropdown o evento que está acontecendo e preenche nome completo, CPF, e-mail e telefone;
o admin entra com login e, num dashboard, cadastra eventos, abre o preenchimento quando o evento começa e fecha quando termina — só eventos abertos aparecem no dropdown público;
o admin visualiza quem compareceu a cada evento e gera um PDF de lista de presença com os dados preenchidos e uma coluna em branco para assinatura física.
Resultado esperado: frontend publicado na Vercel, backend rodando via Docker (local e publicado no Render/Railway), dados no Supabase com Postgres + Auth + RLS.

Decisões já tomadas (respostas do usuário)
Tema	Decisão
Layout do PDF	Lista contínua: Nº, Nome+e-mail, CPF, Telefone, coluna larga em branco para assinar
Eventos	Múltiplos eventos, com estado aberto/fechado controlado pelo admin; dropdown no formulário público
Backend	Roda local via Docker e publicado (Render/Railway) — mesmo Dockerfile
Campos do formulário	Nome completo, CPF, e-mail, telefone
Arquitetura
┌─────────────────────────┐         ┌──────────────────────┐
│  frontend (Next.js 15)  │         │  backend (Express 5) │
│  Vercel                 │         │  Docker → Render     │
│                         │         │                      │
│  /            form      │         │  GET /health         │
│  /admin/login  login    │         │  GET /api/events/    │
│  /admin        eventos  │────────▶│    :id/report.pdf    │
│  /admin/eventos/[id]    │ Bearer  │    (PDFKit)          │
└───────────┬─────────────┘  JWT    └──────────┬───────────┘
            │                                   │
            │ supabase-js (anon key, RLS)       │ JWT do admin (RLS)
            ▼                                   ▼
        ┌───────────────────────────────────────────┐
        │  Supabase — Postgres + Auth + RLS         │
        │  tabelas: events, attendees               │
        └───────────────────────────────────────────┘
Divisão de responsabilidades (importante):

Formulário público e leituras do dashboard falam direto com o Supabase via anon key, protegidos por RLS. Isso mantém o site na Vercel funcionando mesmo se o backend estiver fora do ar — crítico durante um evento ao vivo.
O backend é dono da geração de PDF, que é o pedaço que realmente exige servidor (PDFKit, streaming de binário, fontes). Ele valida o JWT do admin e consulta o Supabase com o token do próprio usuário, de modo que a RLS continua valendo — o backend nunca usa a service_role key.
A validação de CPF (dígitos verificadores) é reforçada no Postgres via CHECK constraint, não só no cliente. Assim o caminho direto-ao-Supabase não vira um buraco: nem um POST manual consegue gravar CPF inválido.
Estrutura de arquivos
presencaApp/
├─ README.md                       ← setup, deploy Vercel, deploy Render
├─ .gitignore
├─ docker-compose.yml              ← backend + frontend (perfil opcional)
├─ supabase/
│  └─ schema.sql                   ← rodar no SQL Editor do Supabase
├─ frontend/
│  ├─ package.json  next.config.ts  tsconfig.json
│  ├─ .env.local.example
│  ├─ Dockerfile                   ← só para rodar a stack toda local
│  ├─ middleware.ts                ← refresh de sessão + guard /admin/*
│  └─ src/
│     ├─ app/
│     │  ├─ layout.tsx   page.tsx                    ← formulário público
│     │  └─ admin/
│     │     ├─ login/page.tsx
│     │     ├─ layout.tsx                            ← header + logout
│     │     ├─ page.tsx                              ← CRUD de eventos
│     │     └─ eventos/[id]/page.tsx                 ← presentes + PDF
│     ├─ components/  AttendanceForm.tsx  EventForm.tsx  EventCard.tsx
│     └─ lib/
│        ├─ supabase/client.ts  supabase/server.ts
│        ├─ cpf.ts               ← validação + máscara 000.000.000-00
│        ├─ phone.ts             ← máscara (00) 00000-0000
│        ├─ datetime.ts          ← Intl com timeZone America/Sao_Paulo
│        └─ api.ts               ← download do PDF + estado de loading
└─ backend/
   ├─ package.json  tsconfig.json  Dockerfile  .dockerignore  .env.example
   └─ src/
      ├─ index.ts        env.ts
      ├─ middleware/auth.ts        ← verifica Bearer JWT no Supabase
      ├─ lib/datetime.ts           ← Intl com timeZone America/Sao_Paulo
      ├─ routes/reports.ts
      └─ pdf/attendanceReport.ts   ← layout do PDF
Etapa 1 — Banco de dados (supabase/schema.sql)
Criar o projeto no Supabase e rodar este schema no SQL Editor.

Função de validação de CPF
create or replace function public.is_valid_cpf(p_cpf text)
returns boolean language plpgsql immutable as $$
declare d text; s int; i int; v1 int; v2 int;
begin
  d := regexp_replace(coalesce(p_cpf,''), '\D', '', 'g');
  if length(d) <> 11 then return false; end if;
  if d ~ '^(\d)\1{10}$' then return false; end if;          -- 111.111.111-11 etc.

  s := 0;
  for i in 1..9 loop s := s + substr(d,i,1)::int * (11 - i); end loop;
  v1 := 11 - (s % 11); if v1 >= 10 then v1 := 0; end if;

  s := 0;
  for i in 1..10 loop s := s + substr(d,i,1)::int * (12 - i); end loop;
  v2 := 11 - (s % 11); if v2 >= 10 then v2 := 0; end if;

  return v1 = substr(d,10,1)::int and v2 = substr(d,11,1)::int;
end $$;
Tabelas
create table public.events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 3 and 120),
  event_date date,
  location   text,
  is_open    boolean not null default false,   -- controla o dropdown público
  created_at timestamptz not null default now()
);

create table public.attendees (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  full_name  text not null check (length(btrim(full_name)) >= 3),
  cpf        text not null check (public.is_valid_cpf(cpf)),
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone      text check (phone ~ '^\d{10,11}$'),
  created_at timestamptz not null default now(),
  unique (event_id, cpf)                        -- 1 check-in por CPF por evento
);

create index on public.attendees (event_id, created_at);
create index on public.events (is_open) where is_open;
Normalização antes de gravar
Trigger BEFORE INSERT — roda antes dos CHECK, então as constraints avaliam o valor já limpo:

create or replace function public.normalize_attendee()
returns trigger language plpgsql as $$
begin
  new.cpf       := regexp_replace(new.cpf, '\D', '', 'g');
  new.phone     := nullif(regexp_replace(coalesce(new.phone,''), '\D', '', 'g'), '');
  new.email     := lower(btrim(new.email));
  new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  return new;
end $$;

create trigger trg_normalize_attendee
before insert or update on public.attendees
for each row execute function public.normalize_attendee();
RLS
alter table public.events    enable row level security;
alter table public.attendees enable row level security;

-- events: anônimo enxerga só os abertos (alimenta o dropdown); admin faz tudo
create policy events_anon_read_open on public.events
  for select to anon using (is_open);
create policy events_admin_all on public.events
  for all to authenticated using (true) with check (true);

-- helper security definer: evita depender de RLS aninhada dentro da policy
create or replace function public.is_event_open(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events where id = p_event_id and is_open)
$$;

-- attendees: anônimo SÓ insere, e só em evento aberto. Nunca lê (CPFs expostos).
create policy attendees_anon_insert on public.attendees
  for insert to anon with check (public.is_event_open(event_id));
create policy attendees_admin_read on public.attendees
  for select to authenticated using (true);
create policy attendees_admin_delete on public.attendees
  for delete to authenticated using (true);
Ponto de atenção: não criar policy de SELECT para anon em attendees. Sem ela, ninguém sem login consegue listar CPFs/e-mails — requisito de LGPD aqui.

Usuário admin
Criar manualmente em Authentication → Users → Add user (e-mail + senha). Desabilitar signup público em Authentication → Providers → Email → "Enable sign ups" = off, senão qualquer um cria conta e vira admin.

Etapa 2 — Frontend (Next.js 15, App Router, TypeScript, Tailwind v4)
npx create-next-app@latest frontend --typescript --tailwind --app --src-dir Dependências extras: @supabase/supabase-js, @supabase/ssr.

src/lib/cpf.ts
Porta em TS da mesma lógica de dígitos verificadores do SQL, mais maskCpf (000.000.000-00) e unmaskCpf. Usada no formulário para feedback imediato — a constraint do banco é a rede de segurança.

src/lib/supabase/client.ts e server.ts
Padrão @supabase/ssr: createBrowserClient e createServerClient com cookies.

middleware.ts — padrão updateSession do @supabase/ssr
Faz o refresh do cookie de sessão e redireciona /admin/* não autenticado para /admin/login. Guard de UX — a proteção real dos dados continua sendo a RLS.

// middleware.ts
import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  // Nada de código entre createServerClient e getUser().
  const { data: { user } } = await supabase.auth.getUser()

  const { pathname } = request.nextUrl
  if (!user && pathname.startsWith('/admin') && !pathname.startsWith('/admin/login')) {
    const url = request.nextUrl.clone()
    url.pathname = '/admin/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)'],
}
Três detalhes que quebram sutilmente se ignorados:

options precisa ser desestruturado no segundo forEach ({ name, value, options }). Sem isso o cookie vai sem maxAge/httpOnly/sameSite e a sessão do admin morre ao fechar a aba.
Não inserir código entre createServerClient e getUser() — é a regra do @supabase/ssr; qualquer coisa no meio pode fazer o refresh do token perder a corrida e deslogar o admin aleatoriamente.
Sempre retornar o supabaseResponse (ou copiar seus cookies para uma resposta nova). Criar um NextResponse do zero no final descarta o token renovado.
/ — formulário público (src/app/page.tsx + components/AttendanceForm.tsx)
Server component busca eventos abertos: select('id, name, event_date, location').eq('is_open', true).order('event_date').
Se nenhum evento aberto → mensagem "Nenhum evento aberto para registro no momento."
Formulário client component: <select> de evento + nome, CPF (máscara), e-mail, telefone (máscara).
Valida no cliente, envia insert direto ao Supabase.
Tratamento de erro por código: 23505 → "Você já registrou presença neste evento."; 23514 → "Dados inválidos, confira o CPF."; 42501 (RLS) → "Este evento não está mais aberto."
Sucesso → tela de confirmação com o nome do evento.
/admin/login
supabase.auth.signInWithPassword. Sem link de cadastro.

/admin — gestão de eventos
Lista de eventos com contagem de presentes (select('*, attendees(count)')).
Botão Novo evento (nome, data, local).
Toggle Abrir / Fechar preenchimento → update({ is_open }). Badge visual verde "Aberto" / cinza "Fechado".
Botão Copiar link do formulário (a home já filtra pelos abertos).
Link para a página do evento.
/admin/eventos/[id] — presentes + PDF
Cabeçalho com nome/data/local, badge de status e total de presentes.
Tabela: Nome, CPF (mascarado), E-mail, Telefone, horário do check-in.
Botão Gerar PDF → lib/api.ts pega session.access_token, faz fetch em ${NEXT_PUBLIC_API_URL}/api/events/${id}/report.pdf com Authorization: Bearer, converte a resposta em blob e dispara o download.
Botão remover participante (com confirmação).
Estado de carregamento do PDF (cold start do Render)
No plano gratuito o Render hiberna o serviço após ~15 min de inatividade, e o primeiro clique pode levar 30–50 s até o container subir. Sem feedback, o admin acha que travou e clica várias vezes, disparando gerações paralelas.

O botão precisa de estado explícito:

Desabilitar o botão enquanto isGenerating — impede o clique múltiplo, que é o problema real.
Spinner + texto progressivo. Mensagem inicial "Gerando relatório..." e, se passar de ~4 s, trocar para: "Gerando relatório — isso pode levar até 1 minuto se o servidor estiver iniciando." Assim o caso rápido (servidor quente, ~1 s) não assusta com um aviso de 1 minuto desnecessário.
AbortController com timeout de 90 s → mensagem de erro acionável em vez de spinner infinito.
Tratar erro de rede (backend fora do ar / NEXT_PUBLIC_API_URL errado) separado de !response.ok, com mensagens distintas: "Não foi possível conectar ao servidor de relatórios" vs. "O servidor recusou a requisição (401/404)".
finally para sempre reabilitar o botão e dar URL.revokeObjectURL no blob.
Opcional, se o cold start incomodar no uso real: um fetch('/health') disparado ao abrir a página do evento já "acorda" o Render enquanto o admin confere a lista, e o PDF sai quente.

Variáveis (frontend/.env.local.example)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
NEXT_PUBLIC_API_URL=http://localhost:8080
Etapa 3 — Backend (Node 22 + Express 5 + TypeScript + PDFKit)
Dependências: express, cors, pdfkit, @supabase/supabase-js, zod. Dev: typescript, tsx, @types/*.

PDFKit e não Puppeteer: a saída é uma tabela, não HTML complexo. Evita ~400 MB de Chromium na imagem Docker e o startup lento — importante nos tiers gratuitos do Render.

src/middleware/auth.ts
1. Lê o header Authorization: Bearer <jwt>
2. Cria um supabase client com esse JWT em global.headers
3. supabase.auth.getUser() → 401 se inválido/expirado
4. Anexa req.supabase (client já escopado) e req.user
Consequência: todas as queries do backend passam pela RLS como authenticated. Sem service_role key no backend — se o container vazar, não vaza acesso irrestrito ao banco.

src/routes/reports.ts — GET /api/events/:eventId/report.pdf
Valida eventId como UUID (zod) → 400.
req.supabase.from('events').select('*').eq('id', eventId).single() → 404 se não achar.
req.supabase.from('attendees').select('*').eq('event_id', eventId).order('full_name').
Content-Type: application/pdf, Content-Disposition: attachment; filename="lista-presenca-<slug>-<data>.pdf".
Faz pipe do stream do PDFKit direto na response.
src/pdf/attendanceReport.ts — layout
A4 retrato, margens 40pt → 515pt úteis. Larguras: Nº 25 | Nome+e-mail 180 | CPF 80 | Telefone 75 | Assinatura 155.

LISTA DE PRESENÇA
Evento X · 23/07/2026 · Auditório Central
Total de participantes: 32          Gerado em 23/07/2026 17:30

 Nº │ Nome completo        │ CPF            │ Telefone        │ Assinatura
────┼──────────────────────┼────────────────┼─────────────────┼──────────────
 01 │ Maria S. Oliveira    │ 123.456.789-01 │ (11) 98765-4321 │
    │ maria@email.com      │                │                 │
────┼──────────────────────┼────────────────┼─────────────────┼──────────────
 02 │ João P. Costa        │ 987.654.321-09 │ (21) 91234-5678 │
    │ joao@email.com       │                │                 │
────┼──────────────────────┼────────────────┼─────────────────┼──────────────
                                                    Página 1 de 3
Detalhes: linha de 42pt de altura (espaço real para assinar à caneta); ~15 linhas por página; cabeçalho da tabela repetido em toda página; rodapé com "Página X de Y" e o nome do evento; CPF e telefone formatados com máscara na renderização; e-mail em fonte menor cinza sob o nome.

Fuso horário — src/lib/datetime.ts (backend) e src/lib/datetime.ts (frontend)
created_at é timestamptz e o Postgres devolve em UTC; o container Docker roda em UTC por padrão. Formatar sem fuso explícito faz um check-in das 21h de Brasília aparecer como 00h do dia seguinte no PDF — exatamente o tipo de erro que invalida uma lista de presença como documento.

Toda formatação de data/hora — no PDF e na tabela do dashboard — passa por helpers únicos com timeZone fixo:

const TZ = 'America/Sao_Paulo'

export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ, dateStyle: 'short', timeStyle: 'short',
  }).format(new Date(iso))

export const formatDate = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short' }).format(new Date(iso))
Aplicar em: horário de check-in de cada participante, "Gerado em ..." no cabeçalho do PDF e a data no nome do arquivo (lista-presenca-<slug>-<data>.pdf).

Duas ressalvas:

events.event_date é date, não timestamptz. Passar '2026-07-23' para new Date() interpreta como meia-noite UTC, e ao formatar em America/Sao_Paulo (UTC−3) volta 22/07. Para esse campo, formatar a string direto (split('-').reverse().join('/')) ou construir a data com T00:00:00 sem sufixo de fuso — não reutilizar formatDate aqui.
Fixar TZ=America/Sao_Paulo no docker-compose.yml e no Render não substitui isso; é só defesa em profundidade, já que o timeZone explícito do Intl é o que garante o resultado.
Variáveis (backend/.env.example)
PORT=8080
SUPABASE_URL=
SUPABASE_ANON_KEY=
ALLOWED_ORIGINS=http://localhost:3000
TZ=America/Sao_Paulo
CORS lê ALLOWED_ORIGINS como lista separada por vírgula — em produção acrescentar o domínio da Vercel.

Etapa 4 — Docker
backend/Dockerfile (multi-stage)
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
USER node
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=3s \
  CMD node -e "fetch('http://localhost:8080/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/index.js"]
docker-compose.yml
Serviço backend: build em ./backend, porta 8080:8080, env_file: ./backend/.env, restart unless-stopped.
Serviço frontend sob profiles: ["fullstack"]: build em ./frontend, porta 3000:3000. Fica de fora do docker compose up padrão; sobe com docker compose --profile fullstack up quando se quer a stack inteira offline na máquina.
O mesmo backend/Dockerfile é o que o Render/Railway usa no deploy — nenhuma configuração paralela.

Etapa 5 — Deploy
Vercel (frontend): importar o repositório, Root Directory = frontend, e definir NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e NEXT_PUBLIC_API_URL (a URL pública do backend).

Render (backend): New → Web Service → runtime Docker, Root Directory backend. Variáveis: SUPABASE_URL, SUPABASE_ANON_KEY, ALLOWED_ORIGINS=https://<seu-app>.vercel.app, PORT=8080.

Ordem importa: o ALLOWED_ORIGINS só pode ser preenchido depois que a Vercel gerar o domínio, e o NEXT_PUBLIC_API_URL depois que o Render gerar o dele. Um dos dois vai precisar de um redeploy — o README vai registrar isso.

No tier gratuito do Render o serviço hiberna após inatividade; o primeiro PDF do dia pode demorar ~30 s. Aceitável para uso pontual.

Verificação
Banco

Rodar supabase/schema.sql sem erros no SQL Editor.
select public.is_valid_cpf('529.982.247-25'); → true (CPF válido conhecido); select public.is_valid_cpf('111.111.111-11'); → false.
Criar o usuário admin em Authentication → Users.
Local 4. cd backend && cp .env.example .env (preencher) && docker compose up --build. 5. curl http://localhost:8080/health → {"status":"ok"}. 6. cd frontend && cp .env.local.example .env.local (preencher) && npm run dev.

Fluxo completo 7. /admin/login com o usuário criado → cai em /admin. 8. Criar evento "Teste" → confirmar que nasce Fechado. 9. Abrir / em aba anônima → deve dizer "Nenhum evento aberto". 10. No admin, clicar Abrir preenchimento → recarregar / → o evento aparece no dropdown. 11. Preencher com CPF válido → tela de sucesso. Reenviar o mesmo CPF → "Você já registrou presença neste evento." 12. Enviar um CPF com dígito verificador errado → bloqueado no cliente; forçar via console → erro 23514 do banco. 13. No admin, Fechar preenchimento → recarregar / → evento some do dropdown. Tentar inserir via console com o event_id antigo → erro 42501 (RLS). 14. /admin/eventos/[id] → participante aparece na tabela. 15. Gerar PDF → abrir o arquivo: conferir cabeçalho com nome/data/local, CPF e telefone mascarados, coluna de assinatura em branco com altura suficiente para assinar, e "Página X de Y" no rodapé. 16. curl http://localhost:8080/api/events/<id>/report.pdf sem header Authorization → 401. 17. Cadastrar ~20 participantes de teste e gerar o PDF → confirmar quebra de página com cabeçalho de tabela repetido.

Sessão e middleware 18. Deslogado, acessar /admin/eventos/<id> direto pela URL → redireciona para /admin/login. 19. Logar, fechar a aba, reabrir e ir em /admin → continua logado (prova que options do cookie foi aplicado no setAll). 20. Confirmar que / e /admin/login seguem acessíveis sem sessão.

Fuso horário 21. Forçar um registro noturno via SQL: update attendees set created_at = '2026-07-24 02:00:00+00' where id = '<id>'; 22. Conferir no dashboard e no PDF que aparece 23/07/2026 23:00 — e não 24/07. Esse é o teste que pega o bug de UTC. 23. Criar evento com event_date = 2026-07-23 e confirmar que exibe 23/07, não 22/07 (caso date puro descrito acima).

Estado de carregamento 24. Com o backend no ar, clicar Gerar PDF → botão desabilita, spinner aparece, download acontece, botão reabilita. 25. docker compose stop backend e clicar Gerar PDF → mensagem "Não foi possível conectar ao servidor de relatórios", botão reabilita (sem spinner infinito). 26. Tentar clicar repetidamente durante a geração → nenhuma requisição duplicada na aba Network.

Produção 27. Após os dois deploys, repetir os passos 7–15 usando as URLs públicas e confirmar que não há erro de CORS no console do navegador. 28. Deixar o Render hibernar (~15 min sem uso) e clicar Gerar PDF → a mensagem estendida de "pode levar até 1 minuto" deve aparecer, e o PDF sair ao final sem timeout.
