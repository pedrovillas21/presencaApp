# Graph Report - presencaApp  (2026-07-27)

## Corpus Check
- 44 files · ~20,012 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 173 nodes · 287 edges · 16 communities (11 shown, 5 thin omitted)
- Extraction: 100% EXTRACTED · 0% INFERRED · 0% AMBIGUOUS
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `8a6a03e3`
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

## God Nodes (most connected - your core abstractions)
1. `formatEventDate()` - 12 edges
2. `createClient()` - 10 edges
3. `presencaApp` - 8 edges
4. `drawRow()` - 5 edges
5. `buildAttendanceReport()` - 5 edges
6. `unmaskCpf()` - 5 edges
7. `maskCpf()` - 5 edges
8. `unmaskPhone()` - 5 edges
9. `maskPhone()` - 5 edges
10. `createClient()` - 5 edges

## Surprising Connections (you probably didn't know these)
- `describeEvent()` --calls--> `formatEventDate()`  [EXTRACTED]
  frontend/src/components/AttendanceForm.tsx → frontend/src/lib/datetime.ts
- `EventSummary()` --calls--> `formatEventDate()`  [EXTRACTED]
  frontend/src/components/AttendanceWizard.tsx → frontend/src/lib/datetime.ts
- `BrandPanel()` --calls--> `formatEventDate()`  [EXTRACTED]
  frontend/src/app/page.tsx → frontend/src/lib/datetime.ts
- `EventPage()` --calls--> `formatEventDate()`  [EXTRACTED]
  frontend/src/app/admin/eventos/[id]/page.tsx → frontend/src/lib/datetime.ts
- `eventDescription()` --calls--> `formatEventDate()`  [EXTRACTED]
  frontend/src/components/AttendanceWizard.tsx → frontend/src/lib/datetime.ts

## Communities (16 total, 5 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.09
Nodes (31): formatDate(), formatDateOnly(), formatDateTime(), todayIsoInTz(), COMBINING_MARKS, maskCpf(), maskPhone(), slugify() (+23 more)

### Community 1 - "Community 1"
Cohesion: 0.14
Nodes (11): BrandPanel(), EventCard(), StatusBadge(), EventPage(), formatEventDate(), AttendeeRow, EventRow, EventWithCount (+3 more)

### Community 2 - "Community 2"
Cohesion: 0.13
Nodes (5): NAV, downloadAttendanceReport(), filenameFrom(), ReportError, createClient()

### Community 3 - "Community 3"
Cohesion: 0.16
Nodes (9): describeEvent(), Errors, Props, isValidCpf(), maskCpf(), unmaskCpf(), isValidPhone(), maskPhone() (+1 more)

### Community 4 - "Community 4"
Cohesion: 0.11
Nodes (17): 1. Banco de dados (Supabase), 2. Backend (local, via Docker), 3. Frontend (local), 4. Deploy, 5. Uso, code:sql (select public.is_valid_cpf('529.982.247-25');  -- true), code:sql (insert into public.admins (user_id, email)), code:bash (cp backend/.env.example backend/.env   # preencha SUPABASE_U) (+9 more)

### Community 5 - "Community 5"
Cohesion: 0.15
Nodes (8): AttendanceWizard(), Errors, eventDescription(), eventScore(), EventSummary(), normalize(), Step, Props

### Community 6 - "Community 6"
Cohesion: 0.22
Nodes (7): Request, requireAuth(), env, issues, parsed, schema, app

### Community 7 - "Community 7"
Cohesion: 0.4
Nodes (4): compat, __dirname, eslintConfig, __filename

## Knowledge Gaps
- **46 isolated node(s):** `schema`, `parsed`, `issues`, `app`, `COMBINING_MARKS` (+41 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **5 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `formatDateTime()` connect `Community 0` to `Community 1`, `Community 3`?**
  _High betweenness centrality (0.237) - this node is a cross-community bridge._
- **Why does `createClient()` connect `Community 2` to `Community 1`, `Community 3`, `Community 5`?**
  _High betweenness centrality (0.029) - this node is a cross-community bridge._
- **Why does `formatEventDate()` connect `Community 1` to `Community 3`, `Community 5`?**
  _High betweenness centrality (0.024) - this node is a cross-community bridge._
- **What connects `schema`, `parsed`, `issues` to the rest of the system?**
  _46 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.09 - nodes in this community are weakly interconnected._
- **Should `Community 1` be split into smaller, more focused modules?**
  _Cohesion score 0.14 - nodes in this community are weakly interconnected._
- **Should `Community 2` be split into smaller, more focused modules?**
  _Cohesion score 0.13 - nodes in this community are weakly interconnected._