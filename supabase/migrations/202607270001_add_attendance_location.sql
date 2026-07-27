-- Etapa 1: registra o ambiente informado pelo participante.
-- Pode ser executada isoladamente no SQL Editor do Supabase.

alter table public.attendees
  add column if not exists attendance_location text;

-- Preserva a compatibilidade com presenças criadas antes desta migration.
update public.attendees
set attendance_location = 'Não informado (registro anterior)'
where attendance_location is null;

alter table public.attendees
  alter column attendance_location set not null;

do $$ begin
  alter table public.attendees
    add constraint attendees_attendance_location_length
    check (length(btrim(attendance_location)) between 2 and 160);
exception when duplicate_object then null; end $$;

create or replace function public.normalize_attendee()
returns trigger language plpgsql as $$
begin
  new.cpf                 := regexp_replace(new.cpf, '\D', '', 'g');
  new.phone               := nullif(regexp_replace(coalesce(new.phone,''), '\D', '', 'g'), '');
  new.email               := lower(btrim(new.email));
  new.full_name           := btrim(regexp_replace(new.full_name, '\s+', ' ', 'g'));
  new.attendance_location := btrim(regexp_replace(new.attendance_location, '\s+', ' ', 'g'));
  return new;
end $$;
