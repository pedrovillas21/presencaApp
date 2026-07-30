# Migração do Frontend: Supabase → API PHP

Complemento de [`migracao_mysql.md`](migracao_mysql.md). O banco e o backend já
foram migrados; **o frontend ainda fala 100% com o Supabase**. Este documento
lista o que falta, na ordem em que faz sentido executar.

> Estado em 30/07/2026: 15 arquivos em `frontend/src` importam o client do
> Supabase, incluindo o middleware de sessão e o login do admin. O
> `frontend/src/lib/api.ts` já existe e é o ponto de partida — só está
> incompleto e não compila.

---

## 0. Bloqueador: o frontend não compila hoje

`frontend/src/lib/api.ts:4` declara `public status: int`. `int` não é um tipo do
TypeScript (é `number`), e `next.config.ts` não tem `typescript.ignoreBuildErrors`,
então `npm run build` e `npm run typecheck` quebram antes de qualquer outra coisa.

```ts
// errado
export class ApiError extends Error {
  constructor(public status: int, message: string) { … }
}

// certo
export class ApiError extends Error {
  constructor(public status: number, message: string) { … }
}
```

Corrija isto primeiro — sem isso nada abaixo é verificável.

---

## 1. Inventário: o que cada arquivo faz hoje e vira o quê

| Arquivo | Chamada Supabase atual | Substituto na API PHP |
| :--- | :--- | :--- |
| `app/page.tsx` | `.from('events').select(…).eq('is_open', true)` | `GET /api/events` (sem token já devolve só os abertos) |
| `app/admin/page.tsx` | `.from('events').select('*, attendees(count)')` | `GET /api/events` (com token; devolve `attendees_count`) |
| `app/admin/eventos/[id]/page.tsx` | `.from('events')` + `.from('attendees')` | `GET /api/events/{id}` + `GET /api/events/{id}/attendees` |
| `app/admin/layout.tsx` | `auth.getUser()` + `.rpc('is_admin')` | `GET /api/auth/me` |
| `app/admin/login/page.tsx` | `auth.signInWithPassword` | `POST /api/auth/login` |
| `components/LogoutButton.tsx` | `auth.signOut()` | `POST /api/auth/logout` + limpar token local |
| `components/EventForm.tsx` | `.from('events').insert` | `POST /api/events` |
| `components/EditEventDialog.tsx` | `.from('events').update` | `PUT /api/events/{id}` |
| `components/EventCard.tsx` | `.from('events').update` / `.delete()` | `PUT /api/events/{id}` / `DELETE /api/events/{id}` |
| `components/AttendanceWizard.tsx` | `.from('attendees').insert` | `POST /api/attendees` |
| `components/AttendanceForm.tsx` | `.from('attendees').insert` | idem — **ver §6, provavelmente é código morto** |
| `components/AttendeeTable.tsx` | `.delete().eq('id')`, `.rpc('delete_professional_cascade')`, `.delete().in('id', […])` | `DELETE /api/attendees/{id}`, `DELETE /api/attendees/by-cpf/{cpf}`, **e um endpoint que não existe (§4)** |
| `middleware.ts` | `createServerClient` + `auth.getUser()` | ler o cookie `token` (§3) |
| `lib/supabase/client.ts`, `lib/supabase/server.ts` | — | apagar no fim |

---

## 2. Onde o token vive (decida isto antes de escrever código)

Hoje há **dois mecanismos de cookie conflitando**, e é preciso escolher um:

1. O PHP, no `login()`, faz `setcookie('token', …, httponly: true)`. Esse cookie
   nasce no domínio da **API** (`localhost:8080`) e nunca é enviado para o
   frontend (`localhost:3000`) — é inútil na arquitetura atual de dois domínios.
2. O `lib/api.ts` guarda o token em `localStorage` **e** grava um cookie `token`
   legível por JavaScript no domínio do frontend. É esse que funciona hoje.

O cookie do item 2 **não é HttpOnly**, então qualquer XSS no painel lê o token de
admin. É uma troca real em relação ao `@supabase/ssr`, que usava cookie HttpOnly.
Duas saídas:

- **Caminho curto (manter o desenho atual):** aceitar o cookie legível, reduzir a
  validade do JWT (hoje 24 h no `setAuthCookie`) e documentar a escolha. Funciona
  e é o menor esforço.
- **Caminho correto:** servir API e frontend sob o mesmo domínio (proxy reverso:
  `/api/*` → PHP, resto → Next). Aí o cookie HttpOnly que o PHP já emite passa a
  valer, `credentials: 'include'` substitui o header `Authorization`, e o
  `localStorage` some. Exige mexer no `docker-compose.yml` e no CORS, mas elimina
  a exposição do token.

**Recomendação:** caminho curto agora, para destravar a migração; caminho correto
antes de expor o painel na internet.

---

## 3. Server Components e middleware

Dois detalhes que costumam passar batido:

**a) O SSR não pode usar `NEXT_PUBLIC_API_URL`.** As páginas do admin e a home
são Server Components (`export const dynamic = 'force-dynamic'`). Dentro do
Docker, `http://localhost:8080` não resolve a partir do container do Next — o
host é `http://backend:80`. Adicione uma variável separada:

```ts
// só no servidor; nunca prefixada com NEXT_PUBLIC_
const INTERNAL_API_URL = process.env.API_URL_INTERNAL ?? 'http://backend:80'
```

E declare `API_URL_INTERNAL: http://backend:80` no serviço `frontend` do
`docker-compose.yml` (como `environment`, não como build arg — não precisa ser
inlined no bundle).

**b) Server Components não leem `localStorage`.** Para autenticar o SSR, leia o
cookie `token` com `cookies()` do `next/headers` e mande no header
`Authorization: Bearer …`. Vale criar um `lib/api-server.ts` separado do
`lib/api.ts` (que é client-side).

**c) O middleware.** Hoje ele chama `auth.getUser()`, que valida a sessão de
verdade. O substituto mínimo é checar a presença do cookie `token`; validar a
assinatura do JWT no Edge Runtime exigiria reimplementar HMAC-SHA256 com
`crypto.subtle` (o `Jwt.php` usa HS256, então é viável) ou um `fetch` para
`/api/auth/me` a cada request. Como as páginas do admin já vão validar o token na
API ao buscar dados, **checar presença no middleware é suficiente** — ele só
decide o redirecionamento, não é a barreira de segurança.

Mantenha os dois redirecionamentos que já existem: sem token em `/admin/*` →
`/admin/login`; com token em `/admin/login` → `/admin`.

---

## 4. Lacuna de API: exclusão em massa

`AttendeeTable.removeSelected()` apaga vários inscritos de uma vez com
`.delete().in('id', activeSelectedIds)`. **A API PHP não tem endpoint equivalente.**
Escolha uma das duas:

- **Sem tocar no backend:** disparar N chamadas `DELETE /api/attendees/{id}` com
  `Promise.allSettled` e contar os sucessos. Simples, mas com 200 selecionados
  são 200 requisições.
- **Com endpoint novo (preferível):** `POST /api/attendees/bulk-delete` recebendo
  `{ ids: string[] }`, autenticado, devolvendo `{ deleted_count }`. Um único
  `DELETE … WHERE id IN (…)` com placeholders.

Se optar pelo endpoint, ele é backend — some ao escopo do `migracao_mysql.md`,
não a este documento.

---

## 5. Tratamento de erro: códigos do Postgres → status HTTP

`AttendanceWizard` tem um `messageForError(error.code)` que traduz códigos do
Postgres (`23505` para CPF duplicado, `P0001` para evento lotado, `42501` para
RLS). Nada disso existe mais: a API devolve `{ error: "mensagem em português" }`
com o status HTTP adequado, e o `fetchApi` já joga essa mensagem no `ApiError`.

Substitua o mapeamento por: **mostrar `error.message` do `ApiError` direto**. As
mensagens do backend já estão em português e cobrem os casos:

| Situação | Status | Mensagem da API |
| :--- | :--- | :--- |
| CPF repetido no evento | 400 | "Este CPF já realizou presença neste evento." |
| Evento lotado | 400 | "Evento lotado (limite de N participantes)." |
| Evento fechado | 400 | "Este evento não está aberto para inscrições." |
| CPF/e-mail/telefone/local/assinatura inválidos | 400 | mensagem específica de cada campo |
| Evento fechado sendo editado | 400 | "Evento fechado não pode ser editado. Reabra-o antes de alterar seus dados." |
| Sessão expirada | 401 | "Acesso não autorizado. Faça login novamente." |

Trate o **401 de forma global** no `fetchApi`: limpar o token e redirecionar para
`/admin/login`. Sem isso a sessão expirada vira uma mensagem de erro genérica em
cada botão do painel.

---

## 6. Limpeza

- **`components/AttendanceForm.tsx` parece ser código morto.** É a versão antiga
  do formulário (sem assinatura e sem `attendance_location`), e o
  `AttendanceWizard` é quem a home renderiza. Confirme que ninguém o importa e
  **apague** em vez de migrar. Se for mantido, note que ele não envia
  `attendance_location` — a API cai no padrão `'Não informado'`.
- **`lib/types.ts`** precisa de ajustes: `EventWithCount` hoje é
  `EventRow & { attendees: { count: number }[] }`, formato do Supabase. A API
  devolve `attendees_count: number` direto. E o comentário em `max_attendees`
  ainda fala em "trigger no Postgres".
- **`app/admin/layout.tsx`** tem um bloco inteiro de "conta sem permissão de
  admin" que aponta para `supabase/schema.sql`. Com JWT isso não existe mais:
  quem está na tabela `admins` recebe token, quem não está não faz login. O bloco
  pode sair inteiro.
- Remover `@supabase/ssr` e `@supabase/supabase-js` do `package.json`, apagar
  `lib/supabase/`, e tirar `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  do `docker-compose.yml:49-50` e do `.env.example`.
- A pasta `backend/src/Supabase/` (`SupabaseClient.php`, `SupabaseResponse.php`,
  `SupabaseException.php`) também ficou órfã — nada em `Application.php` a usa.

---

## 7. Ordem sugerida de execução

1. Corrigir o `int` → `number` em `lib/api.ts` (§0) e conferir `npm run typecheck`.
2. Completar `lib/api.ts` com as funções por recurso (`listEvents`, `createEvent`,
   `createAttendee`, …) e criar o `lib/api-server.ts` para os Server Components (§3).
3. Configurar `API_URL_INTERNAL` e `ALLOWED_ORIGINS` (o backend precisa liberar
   `http://localhost:3000`).
4. Migrar login + logout + middleware + `admin/layout.tsx`. **Ponto de corte:**
   dá para conferir que o painel abre e barra quem não está logado.
5. Migrar as leituras: home, `/admin`, `/admin/eventos/[id]`.
6. Migrar as escritas: `EventForm`, `EditEventDialog`, `EventCard`,
   `AttendanceWizard`.
7. Resolver a exclusão em massa (§4) e o restante do `AttendeeTable`.
8. Limpeza (§6) e remoção das dependências do Supabase.

Depois do passo 6 nada mais deve importar `@/lib/supabase/*`:

```bash
grep -rn "lib/supabase\|@supabase" frontend/src
```

---

## 8. Verificação final

- `npm run typecheck` e `npm run build` passam.
- `docker compose --profile fullstack up --build` sobe os três containers.
- Home lista só eventos abertos; um evento fechado não aparece nem pela URL direta
  (a API devolve 404 para quem não está logado).
- Check-in completo grava e recusa CPF repetido com a mensagem certa.
- Login com `admin@exemplo.com` / `admin` entra no painel.
- Editar um evento fechado é recusado; reabrir funciona.
- PDF da lista baixa (`ReportButton` já usa a API — é o único componente
  migrado hoje).
