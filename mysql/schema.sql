-- presencaApp — Schema MySQL Completo (Incluindo todas as migrations)
-- Banco de Dados próprio (MySQL 8.0+)
--
-- Os CHECK e o TRIGGER abaixo replicam as travas que no Supabase viviam em
-- CHECK/TRIGGER/RLS. A API PHP valida a mesma coisa antes de inserir e devolve
-- mensagem amigável — o banco é a segunda linha de defesa, que continua valendo
-- para escrita direta (phpMyAdmin, importação de CSV, script de manutenção).
--
-- Requer MySQL 8.0.16+: antes dessa versão o CHECK é aceito e ignorado.

CREATE DATABASE IF NOT EXISTS presenca_app CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE presenca_app;

-- ---------------------------------------------------------------------------
-- Tabela de Eventos
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS events (
  id VARCHAR(36) PRIMARY KEY,
  name VARCHAR(120) NOT NULL,
  event_date DATE NULL,
  location VARCHAR(255) NULL,
  is_open TINYINT(1) NOT NULL DEFAULT 0,
  max_attendees INT NOT NULL DEFAULT 500,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_events_is_open (is_open),
  CONSTRAINT chk_events_name_length
    CHECK (CHAR_LENGTH(TRIM(name)) BETWEEN 3 AND 120),
  -- Teto de registros por evento. Existe como freio de abuso: sem ele um script
  -- com CPFs válidos gerados inunda a lista de presença.
  CONSTRAINT chk_events_max_attendees_range
    CHECK (max_attendees BETWEEN 1 AND 100000)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Tabela de Participantes (Check-ins)
-- Inclui colunas de migrations: attendance_location e signature_data
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS attendees (
  id VARCHAR(36) PRIMARY KEY,
  event_id VARCHAR(36) NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  cpf VARCHAR(11) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(20) NULL,
  attendance_location VARCHAR(160) NOT NULL DEFAULT 'Não informado',
  signature_data MEDIUMTEXT NULL, -- PNG Data URL da assinatura digital
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY unq_event_cpf (event_id, cpf),
  INDEX idx_attendees_event_created (event_id, created_at),
  INDEX idx_attendees_cpf (cpf),
  CONSTRAINT fk_attendees_events FOREIGN KEY (event_id) REFERENCES events(id) ON DELETE CASCADE,
  CONSTRAINT chk_attendees_full_name_length
    CHECK (CHAR_LENGTH(TRIM(full_name)) >= 3),
  -- Só o formato: os dígitos verificadores dependem de algoritmo, que o CHECK do
  -- MySQL não consegue chamar (não aceita função armazenada). Quem valida de
  -- verdade é Validation::isValidCpf() na API.
  CONSTRAINT chk_attendees_cpf_format
    CHECK (REGEXP_LIKE(cpf, '^[0-9]{11}$')),
  CONSTRAINT chk_attendees_email_format
    CHECK (REGEXP_LIKE(email, '^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$')),
  CONSTRAINT chk_attendees_phone_format
    CHECK (phone IS NULL OR REGEXP_LIKE(phone, '^[0-9]{10,11}$')),
  CONSTRAINT chk_attendees_attendance_location_length
    CHECK (CHAR_LENGTH(TRIM(attendance_location)) BETWEEN 2 AND 160),
  -- Nulo só em registros anteriores à migration da assinatura; a interface nova
  -- sempre envia. O teto de 400 KB evita encher o MEDIUMTEXT (16 MB) por abuso.
  CONSTRAINT chk_attendees_signature_format
    CHECK (
      signature_data IS NULL
      OR (
        signature_data LIKE 'data:image/png;base64,%'
        AND CHAR_LENGTH(signature_data) BETWEEN 100 AND 400000
      )
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- Evento fechado é registro histórico: só pode ser reaberto, sem alterações.
-- A trava no banco impede que uma chamada direta ao MySQL contorne a API.
-- `<=>` é a igualdade NULL-safe (equivalente ao `is distinct from` do Postgres).
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
-- Tabela de Administradores
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id VARCHAR(36) PRIMARY KEY,
  email VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Admin padrão inicial: admin@exemplo.com / senha: admin
-- TROCAR APÓS O PRIMEIRO ACESSO — este hash é público, está versionado aqui.
INSERT INTO admins (id, email, password_hash)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'admin@exemplo.com',
  '$2y$10$1YZKXSFP/r1lrlkmp5bSRe5fBQro.O.Akbd39DkXthwi37kItLYei'
)
ON DUPLICATE KEY UPDATE email=email;
