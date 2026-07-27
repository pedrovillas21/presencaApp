-- Etapa 3: exclusão administrativa de um profissional em todos os eventos.
-- Execute depois de 202607270002_add_attendee_signature.sql.

create or replace function public.delete_professional_cascade(p_cpf text)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  normalized_cpf text;
  deleted_count integer;
begin
  if not public.is_admin() then
    raise exception 'Acesso restrito a administradores.'
      using errcode = '42501';
  end if;

  normalized_cpf := regexp_replace(coalesce(p_cpf, ''), '\D', '', 'g');

  if not public.is_valid_cpf(normalized_cpf) then
    raise exception 'CPF inválido.'
      using errcode = '22023';
  end if;

  delete from public.attendees
  where cpf = normalized_cpf;

  get diagnostics deleted_count = row_count;
  return deleted_count;
end;
$$;

revoke all on function public.delete_professional_cascade(text) from public;
revoke all on function public.delete_professional_cascade(text) from anon;
grant execute on function public.delete_professional_cascade(text) to authenticated;

comment on function public.delete_professional_cascade(text) is
  'Exclui todas as presenças vinculadas a um CPF; disponível somente para administradores.';
