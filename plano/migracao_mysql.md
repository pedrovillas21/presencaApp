# Migração de Banco de Dados: Supabase → MySQL (SGBD Próprio)

## 1. Motivação da Mudança
O projeto **presencaApp** originalmente utilizava o **Supabase** (PostgreSQL Gerenciado + Auth + Row Level Security). A decisão de migrar para um **SGBD MySQL próprio** em container Docker traz diversos benefícios:

- **Autonomia de Infraestrutura:** Elimina a dependência de serviços BaaS (Backend-as-a-Service) de terceiros, limites de cuotas gratuitas e hibernação de bancos.
- **Portabilidade Total:** O ambiente de banco de dados (`MySQL 8.0`) roda diretamente no Docker Compose local ou em qualquer VPS / nuvem própria (Docker, AWS, DigitalOcean, Hetzner).
- **Controle de Autenticação:** A autenticação de administradores foi centralizada na API PHP através de **tokens JWT (HMAC-SHA256)** seguros com hash de senhas BCRYPT.
- **Consolidação das Regras de Negócio:** Validações de CPF, normalizações de string e limitação de participantes por evento foram integradas diretamente na API em PHP, garantindo validações antes da inserção no MySQL.

---

## 2. Incorporação das Migrations Existentes

Todas as alterações contidas na pasta `supabase/migrations/` foram integradas diretamente no novo schema MySQL e na API PHP:

1. **`202607270001_add_attendance_location.sql`**:
   - Adicionada a coluna `attendance_location VARCHAR(160) NOT NULL` na tabela `attendees`.
   - Tratamento no backend PHP para sanitizar o local de atendimento.
2. **`202607270002_add_attendee_signature.sql`**:
   - Adicionada a coluna `signature_data MEDIUMTEXT NULL` na tabela `attendees` para armazenar a assinatura digital PNG em Base64 Data URL.
3. **`202607270003_delete_professional_cascade.sql`**:
   - Implementado o endpoint REST de exclusão em cascata por CPF na API PHP: `DELETE /api/attendees/by-cpf/{cpf}` (disponível apenas para administradores autenticados).

---

## 3. Novo Escopo da Arquitetura

```
+-----------------------------------+       +-------------------------------------+       +-----------------------------------+
|        Frontend (Next.js 15)      | ----> |         Backend (PHP 8.2 API)     | ----> |          MySQL 8.0 (Docker)       |
|  - Formulário de Presença         | HTTP  |  - Endpoints REST CRUD              | PDO   |  - Tabela events                  |
|  - Assinatura Digital PNG         | REST  |  - Exclusão em Cascata por CPF      |       |  - Tabela attendees               |
|  - Painel Administrativo          |       |  - Validação de CPF (Algoritmo)     |       |  - Tabela admins                  |
|  - Login de Admin com JWT         |       |  - Autenticação JWT (Admins)        |       |                                   |
|                                   |       |  - Geração de PDF (Dompdf)          |       |                                   |
+-----------------------------------+       +-------------------------------------+       +-----------------------------------+
```

### Principais Componentes:
1. **SGBD MySQL (Container `db`):**
   - Imagem: `mysql:8.0`
   - Inicialização automática via script DDL `mysql/schema.sql`.
   - Tabelas: `events`, `attendees` (com `attendance_location` e `signature_data`), `admins`.
2. **Backend PHP (Container `backend`):**
   - API PHP 8.2 rodando em Apache.
   - Conexão nativa via **PDO MySQL**.
   - Gerenciamento de tokens JWT e cookies HTTP-Only.
   - Geração de relatórios PDF com **Dompdf**.
   - Endpoint de remoção por CPF `DELETE /api/attendees/by-cpf/{cpf}`.
3. **Frontend Next.js (Container `frontend`):**
   - Next.js 15 App Router comunicando diretamente com a API PHP (`NEXT_PUBLIC_API_URL`).

---

## 4. Comparativo de Schema: PostgreSQL (Supabase) vs MySQL

| Recurso | Supabase (PostgreSQL) | Novo MySQL |
| :--- | :--- | :--- |
| **Identificadores (IDs)** | `uuid primary key default gen_random_uuid()` | `VARCHAR(36) PRIMARY KEY` (Gerado na API via PHP UUID v4) |
| **Datas** | `timestamptz` / `date` | `DATETIME` / `DATE` |
| **Local de Atendimento** | `attendance_location text` | `attendance_location VARCHAR(160) NOT NULL` |
| **Assinatura Digital** | `signature_data text` | `signature_data MEDIUMTEXT NULL` (PNG Data URL) |
| **Exclusão em Cascata por CPF** | Função PL/pgSQL `delete_professional_cascade()` | Endpoint PHP `DELETE /api/attendees/by-cpf/{cpf}` |
| **Validação de CPF** | Função PL/pgSQL `public.is_valid_cpf()` | Método PHP `Validation::isValidCpf()` |
| **Autenticação** | `auth.users` + RLS | Tabela `admins` com `password_hash` (BCRYPT) + JWT |

---

## 5. Como Executar a Nova Stack no Docker

### Subir o Banco MySQL + Backend PHP:
```bash
docker compose up -d --build
```

### Subir a Stack Completa (MySQL + Backend + Frontend):
```bash
docker compose --profile fullstack up -d --build
```

- **API PHP:** `http://localhost:8080`
- **MySQL:** `localhost:3307` (Usuário: `presenca_user`, Senha: `presenca_password`, Banco: `presenca_app`)
  - A porta do host é 3307 para não colidir com um MySQL instalado nativamente na 3306.
    Dentro da rede do compose o backend continua usando `db:3306`.
- **Admin Padrão:** `admin@exemplo.com` / Senha: `admin`

---

## 6. Processo de Migração dos Dados Existentes (CSV)

1. Exporte as tabelas `events` e `attendees` do Supabase em formato **CSV**.
2. No seu gerenciador de banco MySQL (phpMyAdmin, DBeaver, etc.), selecione o banco `presenca_app`.
3. Importe o `events.csv` na tabela `events`.
4. Importe o `attendees.csv` na tabela `attendees`.
