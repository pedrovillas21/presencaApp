-- presencaApp — schema completo
-- Rodar no SQL Editor do Supabase (projeto novo, de uma vez só).
-- Idempotente: pode ser reexecutado sem erro.

-- ---------------------------------------------------------------------------
-- Validação de CPF (dígitos verificadores)
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- Tabelas
-- ---------------------------------------------------------------------------
create table if not exists public.events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (length(btrim(name)) between 3 and 120),
  event_date date,
  location   text,
  is_open    boolean not null default false,   -- controla o dropdown público
  created_at timestamptz not null default now()
);

-- Teto de registros por evento. Existe como freio de abuso: o formulário público
-- insere direto no Supabase com a anon key, e sem teto um script com CPFs
-- válidos gerados inunda a lista de presença. Coluna adicionada à parte porque
-- o `create table if not exists` acima não altera tabela já existente.
alter table public.events
  add column if not exists max_attendees int not null default 500;

do $$ begin
  alter table public.events
    add constraint events_max_attendees_range check (max_attendees between 1 and 100000);
exception when duplicate_object then null; end $$;

create table if not exists public.attendees (
  id         uuid primary key default gen_random_uuid(),
  event_id   uuid not null references public.events(id) on delete cascade,
  full_name  text not null check (length(btrim(full_name)) >= 3),
  cpf        text not null check (public.is_valid_cpf(cpf)),
  email      text not null check (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  phone      text check (phone ~ '^\d{10,11}$'),
  created_at timestamptz not null default now(),
  unique (event_id, cpf)                        -- 1 check-in por CPF por evento
);

create index if not exists attendees_event_created_idx
  on public.attendees (event_id, created_at);
create index if not exists events_is_open_idx
  on public.events (is_open) where is_open;

-- ---------------------------------------------------------------------------
-- Normalização antes de gravar
-- Roda BEFORE INSERT/UPDATE, então os CHECK avaliam o valor já limpo.
-- ---------------------------------------------------------------------------
create or replace function public.normalize_attendee()
returns trigger language plpgsql as $$
begin
  new.cpf       := regexp_replace(new.cpf, '\D', '', 'g');
  new.phone     := nullif(regexp_replace(coalesce(new.phone,''), '\D', '', 'g'), '');
  new.email     := lower(btrim(new.email));
  new.full_name := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  return new;
end $$;

drop trigger if exists trg_normalize_attendee on public.attendees;
create trigger trg_normalize_attendee
before insert or update on public.attendees
for each row execute function public.normalize_attendee();

-- ---------------------------------------------------------------------------
-- Teto de participantes
-- security definer NÃO é opcional aqui: rodando como o invocador (anon), o
-- count cairia na própria RLS de attendees — anon não tem policy de SELECT,
-- o count voltaria 0 e o teto nunca dispararia.
-- Sob inserts simultâneos o count pode deixar passar alguns registros além do
-- limite; para conter abuso isso basta, e evita serializar a tabela no pico do
-- evento, que é justamente quando ela mais recebe escrita.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_event_capacity()
returns trigger language plpgsql security definer set search_path = public as $$
declare limite int; atual int;
begin
  select max_attendees into limite from public.events where id = new.event_id;
  if limite is null then return new; end if;   -- evento inexistente: a FK reclama

  select count(*) into atual from public.attendees where event_id = new.event_id;

  if atual >= limite then
    raise exception 'Evento lotado (limite de % participantes).', limite
      using errcode = 'P0001';
  end if;

  return new;
end $$;

drop trigger if exists trg_enforce_event_capacity on public.attendees;
create trigger trg_enforce_event_capacity
before insert on public.attendees
for each row execute function public.enforce_event_capacity();

-- ---------------------------------------------------------------------------
-- Admins
-- Estar em public.admins é o que faz alguém admin. `to authenticated` sozinho
-- não serve: a anon key é pública por natureza, então se "Enable sign ups"
-- estiver ligado no painel qualquer pessoa se cadastra e vira `authenticated`.
-- Com policies baseadas em papel isso daria acesso a todos os CPFs. Aqui a
-- garantia mora no schema, não num checkbox do dashboard.
-- ---------------------------------------------------------------------------
create table if not exists public.admins (
  user_id    uuid primary key references auth.users(id) on delete cascade,
  -- cópia só para leitura humana no SQL Editor; auth.users é a fonte da verdade
  -- e esta coluna não é reconciliada se o e-mail mudar lá.
  email      text,
  created_at timestamptz not null default now()
);

-- RLS ligada e nenhuma policy: a tabela some da API REST. Só o SQL Editor e as
-- funções security definer abaixo enxergam — ninguém se autopromove pela API.
alter table public.admins enable row level security;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.admins where user_id = auth.uid())
$$;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table public.events    enable row level security;
alter table public.attendees enable row level security;

-- events: anônimo enxerga só os abertos (alimenta o dropdown); admin faz tudo
drop policy if exists events_anon_read_open on public.events;
create policy events_anon_read_open on public.events
  for select to anon using (is_open);

drop policy if exists events_admin_all on public.events;
create policy events_admin_all on public.events
  for all to authenticated using (public.is_admin()) with check (public.is_admin());

-- helper security definer: evita depender de RLS aninhada dentro da policy
create or replace function public.is_event_open(p_event_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.events where id = p_event_id and is_open)
$$;

-- attendees: anônimo SÓ insere, e só em evento aberto. Nunca lê (CPFs expostos).
drop policy if exists attendees_anon_insert on public.attendees;
create policy attendees_anon_insert on public.attendees
  for insert to anon with check (public.is_event_open(event_id));

-- Mesmo insert liberado para `authenticated`: os cookies de sessão do
-- @supabase/ssr valem no domínio inteiro, então um admin logado em /admin que
-- abre o formulário público na mesma aba vira `authenticated`, não `anon`.
-- Sem esta policy, esse insert caía em 42501 (403) mesmo com o evento aberto.
drop policy if exists attendees_authenticated_insert on public.attendees;
create policy attendees_authenticated_insert on public.attendees
  for insert to authenticated with check (public.is_event_open(event_id));

drop policy if exists attendees_admin_read on public.attendees;
create policy attendees_admin_read on public.attendees
  for select to authenticated using (public.is_admin());

drop policy if exists attendees_admin_delete on public.attendees;
create policy attendees_admin_delete on public.attendees
  for delete to authenticated using (public.is_admin());

-- ---------------------------------------------------------------------------
-- Sanidade (opcional — rodar manualmente)
-- ---------------------------------------------------------------------------
-- select public.is_valid_cpf('529.982.247-25');  -- true
-- select public.is_valid_cpf('111.111.111-11');  -- false
-- select public.is_valid_cpf('529.982.247-24');  -- false

-- Depois de rodar:
--   1. Authentication → Users → Add user (e-mail + senha do admin)
--   2. Promover esse usuário a admin — SEM ISSO O DASHBOARD ABRE VAZIO,
--      porque as policies agora exigem public.is_admin(), não só login:
--
--        insert into public.admins (user_id, email)
--        select id, email from auth.users where email = 'admin@exemplo.com'
--        on conflict (user_id) do nothing;
--
--   3. Authentication → Providers → Email → "Enable sign ups" = OFF
--      Continua recomendado (evita criação de contas inúteis e consumo de
--      quota), mas deixou de ser a única barreira: sem estar em public.admins,
--      uma conta nova não lê nem escreve nada.
--
-- Para revogar um admin:  delete from public.admins where email = '...';
-- Para conferir quem é:   select * from public.admins;
