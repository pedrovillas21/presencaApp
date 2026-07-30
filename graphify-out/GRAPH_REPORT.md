# Graph Report - presencaApp  (2026-07-30)

## Corpus Check
- 54 files · ~26,032 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 293 nodes · 485 edges · 28 communities (16 shown, 12 thin omitted)
- Extraction: 96% EXTRACTED · 4% INFERRED · 0% AMBIGUOUS · INFERRED: 19 edges (avg confidence: 0.8)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `745e1ac0`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]

## God Nodes (most connected - your core abstractions)
1. `Application` - 25 edges
2. `Database` - 13 edges
3. `formatEventDate()` - 12 edges
4. `Migração de Banco de Dados: Supabase → MySQL (SGBD Próprio)` - 11 edges
5. `Format` - 10 edges
6. `createClient()` - 10 edges
7. `AttendanceReport` - 8 edges
8. `Validation` - 8 edges
9. `presencaApp` - 8 edges
10. `Jwt` - 7 edges

## Surprising Connections (you probably didn't know these)
- `BrandPanel()` --calls--> `formatEventDate()`  [EXTRACTED]
  frontend/src/app/page.tsx → frontend/src/lib/datetime.ts
- `EventPage()` --calls--> `formatDateTime()`  [EXTRACTED]
  frontend/src/app/admin/eventos/[id]/page.tsx → frontend/src/lib/datetime.ts
- `describeEvent()` --calls--> `formatEventDate()`  [EXTRACTED]
  frontend/src/components/AttendanceForm.tsx → frontend/src/lib/datetime.ts
- `EventSummary()` --calls--> `formatEventDate()`  [EXTRACTED]
  frontend/src/components/AttendanceWizard.tsx → frontend/src/lib/datetime.ts
- `EventCard()` --calls--> `formatEventDate()`  [EXTRACTED]
  frontend/src/components/EventCard.tsx → frontend/src/lib/datetime.ts

## Communities (28 total, 12 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (10): BrandPanel(), NAV, StatusBadge(), AttendeeRow, EventRow, EventWithCount, PublicEvent, createClient() (+2 more)

### Community 1 - "Community 1"
Cohesion: 0.09
Nodes (31): formatDate(), formatDateOnly(), formatDateTime(), todayIsoInTz(), COMBINING_MARKS, maskCpf(), maskPhone(), slugify() (+23 more)

### Community 2 - "Community 2"
Cohesion: 0.16
Nodes (3): Application, Database, Validation

### Community 3 - "Community 3"
Cohesion: 0.1
Nodes (20): describeEvent(), Errors, Props, AttendanceWizard(), Errors, eventDescription(), eventScore(), EventSummary() (+12 more)

### Community 4 - "Community 4"
Cohesion: 0.1
Nodes (21): 1. Banco de dados (Supabase), 2. Backend (local, via Docker), 3. Frontend (local), 4. Deploy, 5. Uso, code:sql (select public.is_valid_cpf('529.982.247-25');  -- true), code:sql (insert into public.admins (user_id, email)), code:bash (cp backend/.env.example backend/.env   # preencha SUPABASE_U) (+13 more)

### Community 5 - "Community 5"
Cohesion: 0.14
Nodes (17): 1. Motivação da Mudança, 2. Incorporação das Migrations Existentes, 2. Novo Escopo da Arquitetura, 3. Comparativo de Schema: PostgreSQL (Supabase) vs MySQL, 3. Novo Escopo da Arquitetura, 4. Como Executar a Nova Stack no Docker, 4. Comparativo de Schema: PostgreSQL (Supabase) vs MySQL, 5. Como Executar a Nova Stack no Docker (+9 more)

### Community 7 - "Community 7"
Cohesion: 0.15
Nodes (3): pageItems(), Pagination(), saoPauloDateFormatter

### Community 8 - "Community 8"
Cohesion: 0.27
Nodes (6): ApiError, downloadAttendanceReport(), fetchApi(), filenameFrom(), getToken(), ReportError

### Community 9 - "Community 9"
Cohesion: 0.22
Nodes (7): Request, requireAuth(), env, issues, parsed, schema, app

### Community 13 - "Community 13"
Cohesion: 0.4
Nodes (4): compat, __dirname, eslintConfig, __filename

## Knowledge Gaps
- **56 isolated node(s):** `__filename`, `__dirname`, `compat`, `eslintConfig`, `nextConfig` (+51 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **12 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `formatDateTime()` connect `Community 1` to `Community 0`, `Community 3`, `Community 7`?**
  _High betweenness centrality (0.099) - this node is a cross-community bridge._
- **Why does `Format` connect `Community 6` to `Community 2`?**
  _High betweenness centrality (0.017) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Community 0` to `Community 8`, `Community 3`, `Community 7`?**
  _High betweenness centrality (0.016) - this node is a cross-community bridge._
- **Are the 11 inferred relationships involving `Database` (e.g. with `.login()` and `.listEvents()`) actually correct?**
  _`Database` has 11 INFERRED edges - model-reasoned connections that need verification._
- **Are the 3 inferred relationships involving `Format` (e.g. with `.report()` and `.html()`) actually correct?**
  _`Format` has 3 INFERRED edges - model-reasoned connections that need verification._
- **What connects `__filename`, `__dirname`, `compat` to the rest of the system?**
  _56 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._