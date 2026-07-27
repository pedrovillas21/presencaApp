-- Etapa 2: armazena a assinatura desenhada como PNG data URL.
-- Execute depois de 202607270001_add_attendance_location.sql.

alter table public.attendees
  add column if not exists signature_data text;

-- Nullable somente para registros históricos. A interface nova exige assinatura.
do $$ begin
  alter table public.attendees
    add constraint attendees_signature_data_format
    check (
      signature_data is null
      or (
        signature_data like 'data:image/png;base64,%'
        and length(signature_data) between 100 and 400000
      )
    );
exception when duplicate_object then null; end $$;

comment on column public.attendees.signature_data is
  'Assinatura digital do check-in em data URL PNG; null apenas em registros anteriores à migration.';
