-- Paridade com as travas do Supabase (CHECK + trigger de evento fechado)
-- e correção do hash do admin padrão.
--
-- Para quem JÁ subiu o banco: o `mysql/schema.sql` só roda na primeira
-- inicialização do volume (docker-entrypoint-initdb.d), então em um banco
-- existente ele nunca é reexecutado. Aplique este arquivo manualmente:
--
--   docker compose exec -T db mysql -upresenca_user -ppresenca_password \
--     presenca_app < mysql/migrations/2026073001_paridade_supabase.sql
--
-- Em banco novo (volume recriado) NÃO é necessário: o schema.sql já traz tudo.
--
-- Não é idempotente: `ADD CONSTRAINT` não aceita IF NOT EXISTS no MySQL, então
-- rodar duas vezes acusa nome de constraint duplicado. Rode uma vez só.

USE presenca_app;

-- ---------------------------------------------------------------------------
-- 0. Diagnóstico — rode ANTES. Se qualquer consulta retornar linhas, corrija
--    os dados primeiro: o ALTER falha com "Check constraint is violated".
-- ---------------------------------------------------------------------------
-- SELECT id, name FROM events WHERE CHAR_LENGTH(TRIM(name)) NOT BETWEEN 3 AND 120;
-- SELECT id, max_attendees FROM events WHERE max_attendees NOT BETWEEN 1 AND 100000;
-- SELECT id, cpf FROM attendees WHERE NOT REGEXP_LIKE(cpf, '^[0-9]{11}$');
-- SELECT id, email FROM attendees WHERE NOT REGEXP_LIKE(email, '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$');
-- SELECT id, phone FROM attendees WHERE phone IS NOT NULL AND NOT REGEXP_LIKE(phone, '^[0-9]{10,11}$');
-- SELECT id, full_name FROM attendees WHERE CHAR_LENGTH(TRIM(full_name)) < 3;
-- SELECT id, attendance_location FROM attendees
--   WHERE CHAR_LENGTH(TRIM(attendance_location)) NOT BETWEEN 2 AND 160;
-- SELECT id FROM attendees WHERE signature_data IS NOT NULL
--   AND (signature_data NOT LIKE 'data:image/png;base64,%'
--        OR CHAR_LENGTH(signature_data) NOT BETWEEN 100 AND 400000);

-- ---------------------------------------------------------------------------
-- 1. Normalização dos dados existentes
-- ---------------------------------------------------------------------------
-- O trigger normalize_attendee do Postgres colapsava espaços internos; a API
-- antiga em MySQL só aplicava trim. Alinha o que já está gravado.
UPDATE attendees
SET full_name = TRIM(REGEXP_REPLACE(full_name, '[[:space:]]+', ' ')),
    attendance_location = TRIM(REGEXP_REPLACE(attendance_location, '[[:space:]]+', ' ')),
    email = LOWER(TRIM(email)),
    cpf = REGEXP_REPLACE(cpf, '[^0-9]', ''),
    phone = NULLIF(REGEXP_REPLACE(COALESCE(phone, ''), '[^0-9]', ''), '');

-- Havia dois textos-padrão para a mesma coisa ('Não informado' vindo da API e
-- 'Não informado (registro anterior)' vindo do DEFAULT), o que duplicava a
-- entrada no filtro de local do painel. Unifica.
UPDATE attendees
SET attendance_location = 'Não informado'
WHERE attendance_location = 'Não informado (registro anterior)';

ALTER TABLE attendees
  ALTER attendance_location SET DEFAULT 'Não informado';

-- ---------------------------------------------------------------------------
-- 2. CHECK constraints (paridade com os CHECK do schema Supabase)
-- ---------------------------------------------------------------------------
ALTER TABLE events
  ADD CONSTRAINT chk_events_name_length
    CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 3 AND 120),
  ADD CONSTRAINT chk_events_max_attendees_range
    CHECK (max_attendees BETWEEN 1 AND 100000);

ALTER TABLE attendees
  ADD CONSTRAINT chk_attendees_full_name_length
    CHECK (CHAR_LENGTH(TRIM(full_name)) >= 3),
  ADD CONSTRAINT chk_attendees_cpf_format
    CHECK (REGEXP_LIKE(cpf, '^[0-9]{11}$')),
  ADD CONSTRAINT chk_attendees_email_format
    CHECK (REGEXP_LIKE(email, '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')),
  ADD CONSTRAINT chk_attendees_phone_format
    CHECK (phone IS NULL OR REGEXP_LIKE(phone, '^[0-9]{10,11}$')),
  ADD CONSTRAINT chk_attendees_attendance_location_length
    CHECK (CHAR_LENGTH(TRIM(attendance_location)) BETWEEN 2 AND 160),
  ADD CONSTRAINT chk_attendees_signature_format
    CHECK (
      signature_data IS NULL
      OR (
        signature_data LIKE 'data:image/png;base64,%'
        AND CHAR_LENGTH(signature_data) BETWEEN 100 AND 400000
      )
    );

-- ---------------------------------------------------------------------------
-- 3. Evento fechado é imutável (equivalente a prevent_closed_event_edits)
-- ---------------------------------------------------------------------------
DROP TRIGGER IF EXISTS trg_prevent_closed_event_edits;

DELIMITER $$
CREATE TRIGGER trg_prevent_closed_event_edits
BEFORE UPDATE ON events
FOR EACH ROW
BEGIN
  IF OLD.is_open = 0 AND NOT (
       NEW.is_open = 1
       AND NEW.id <=> OLD.id
       AND NEW.name <=> OLD.name
       AND NEW.event_date <=> OLD.event_date
       AND NEW.location <=> OLD.location
       AND NEW.max_attendees <=> OLD.max_attendees
       AND NEW.created_at <=> OLD.created_at
     ) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Evento fechado não pode ser editado. Reabra-o antes de alterar seus dados.';
  END IF;
END$$
DELIMITER ;

-- ---------------------------------------------------------------------------
-- 4. Hash do admin padrão
-- O valor antigo tinha 60 caracteres e formato bcrypt válido, mas não era hash
-- de coisa nenhuma: password_verify('admin', ...) devolvia false e o login
-- documentado no plano caía em 401. Só troca se ainda for o hash quebrado.
-- ---------------------------------------------------------------------------
UPDATE admins
SET password_hash = '$2y$10$1YZKXSFP/r1lrlkmp5bSRe5fBQro.O.Akbd39DkXthwi37kItLYei'
WHERE password_hash = '$2y$10$4q9kC52wZ2lYy49qY30u.e/62N4wA6M3W191kZ9281Z212Z123123';
