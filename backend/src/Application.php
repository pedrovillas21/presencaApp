<?php

declare(strict_types=1);

namespace PresencaApp;

use PDO;
use PDOException;
use PresencaApp\Pdf\AttendanceReport;
use PresencaApp\Support\Format;
use PresencaApp\Support\Jwt;
use PresencaApp\Support\Validation;
use Throwable;

final class Application
{
    private const REPORT_ROW_LIMIT = 2000;

    public function __construct(
        private readonly Config $config,
    ) {
    }

    public function run(): void
    {
        $origin = $this->requestHeader('Origin');
        if (!$this->applyCors($origin)) {
            $this->json(403, ['error' => 'Origem não permitida.']);

            return;
        }

        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        if ($method === 'OPTIONS') {
            http_response_code(204);

            return;
        }

        $path = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';

        // Rota de Health
        if ($method === 'GET' && $path === '/health') {
            $this->json(200, ['status' => 'ok']);

            return;
        }

        // Rotas de Autenticação
        if ($method === 'POST' && $path === '/api/auth/login') {
            $this->login();

            return;
        }

        if ($method === 'POST' && $path === '/api/auth/logout') {
            $this->logout();

            return;
        }

        if ($method === 'GET' && $path === '/api/auth/me') {
            $this->me();

            return;
        }

        // Rotas de Eventos
        if ($method === 'GET' && $path === '/api/events') {
            $this->listEvents();

            return;
        }

        if ($method === 'POST' && $path === '/api/events') {
            $this->createEvent();

            return;
        }

        if (preg_match('~^/api/events/([^/]+)$~', $path, $matches) === 1) {
            $eventId = $matches[1];
            if ($method === 'GET') {
                $this->getEvent($eventId);

                return;
            }
            if ($method === 'PUT') {
                $this->updateEvent($eventId);

                return;
            }
            if ($method === 'DELETE') {
                $this->deleteEvent($eventId);

                return;
            }
        }

        // Rotas de Participantes
        if ($method === 'POST' && $path === '/api/attendees') {
            $this->createAttendee();

            return;
        }

        if ($method === 'GET' && preg_match('~^/api/events/([^/]+)/attendees$~', $path, $matches) === 1) {
            $this->listAttendees($matches[1]);

            return;
        }

        // Exclusão em cascata por CPF (Migration 202607270003_delete_professional_cascade)
        if ($method === 'DELETE' && preg_match('~^/api/attendees/by-cpf/([^/]+)$~', $path, $matches) === 1) {
            $this->deleteAttendeesByCpf($matches[1]);

            return;
        }

        if ($method === 'DELETE' && preg_match('~^/api/attendees/([^/]+)$~', $path, $matches) === 1) {
            $this->deleteAttendee($matches[1]);

            return;
        }

        // Rota de Relatório PDF
        if ($method === 'GET' && preg_match('~^/api/events/([^/]+)/report\.pdf$~', $path, $matches) === 1) {
            $this->report($matches[1]);

            return;
        }

        $this->json(404, ['error' => 'Rota não encontrada.']);
    }

    private function login(): void
    {
        $input = $this->jsonInput();
        $email = trim((string) ($input['email'] ?? ''));
        $password = (string) ($input['password'] ?? '');

        if ($email === '' || $password === '') {
            $this->json(400, ['error' => 'E-mail e senha são obrigatórios.']);

            return;
        }

        try {
            $pdo = Database::getConnection($this->config);
            $stmt = $pdo->prepare('SELECT id, email, password_hash FROM admins WHERE email = :email LIMIT 1');
            $stmt->execute(['email' => strtolower($email)]);
            $admin = $stmt->fetch();

            if (!$admin || !password_verify($password, (string) $admin['password_hash'])) {
                $this->json(401, ['error' => 'Credenciais inválidas.']);

                return;
            }

            $token = Jwt::encode([
                'sub' => $admin['id'],
                'email' => $admin['email'],
                'role' => 'admin',
            ], $this->config->jwtSecret);

            $this->setAuthCookie($token);

            $this->json(200, [
                'token' => $token,
                'user' => [
                    'id' => $admin['id'],
                    'email' => $admin['email'],
                ],
            ]);
        } catch (PDOException $e) {
            error_log('Erro DB login: ' . $e->getMessage());
            $this->json(500, ['error' => 'Erro interno ao realizar login.']);
        }
    }

    private function logout(): void
    {
        $this->clearAuthCookie();
        $this->json(200, ['message' => 'Logout realizado com sucesso.']);
    }

    private function me(): void
    {
        $admin = $this->requireAuth();
        if ($admin === null) {
            return;
        }

        $this->json(200, ['user' => $admin]);
    }

    private function listEvents(): void
    {
        $admin = $this->getAuthUser();

        try {
            $pdo = Database::getConnection($this->config);
            if ($admin !== null) {
                // Admin enxerga todos os eventos
                $stmt = $pdo->query('
                    SELECT e.*, COUNT(a.id) AS attendees_count 
                    FROM events e 
                    LEFT JOIN attendees a ON a.event_id = e.id 
                    GROUP BY e.id 
                    ORDER BY e.created_at DESC
                ');
            } else {
                // Público enxerga apenas eventos abertos
                $stmt = $pdo->query('
                    SELECT id, name, event_date, location, is_open, max_attendees, created_at 
                    FROM events 
                    WHERE is_open = 1 
                    ORDER BY name ASC
                ');
            }

            $rows = $stmt->fetchAll() ?: [];
            $events = array_map(function ($row) {
                $row['is_open'] = (bool) $row['is_open'];
                $row['max_attendees'] = (int) $row['max_attendees'];
                if (isset($row['attendees_count'])) {
                    $row['attendees_count'] = (int) $row['attendees_count'];
                }
                return $row;
            }, $rows);

            $this->json(200, $events);
        } catch (PDOException $e) {
            error_log('Erro DB listEvents: ' . $e->getMessage());
            $this->json(500, ['error' => 'Erro ao listar eventos.']);
        }
    }

    private function getEvent(string $id): void
    {
        // Equivalente à policy events_anon_read_open: sem login, só evento
        // aberto existe. Fechado responde 404 para não vazar por UUID.
        $isAdmin = $this->getAuthUser() !== null;

        try {
            $pdo = Database::getConnection($this->config);
            $stmt = $pdo->prepare('
                SELECT e.*, COUNT(a.id) AS attendees_count
                FROM events e
                LEFT JOIN attendees a ON a.event_id = e.id
                WHERE e.id = :id
                GROUP BY e.id
            ');
            $stmt->execute(['id' => $id]);
            $event = $stmt->fetch();

            if (!$event || (!$isAdmin && !(bool) $event['is_open'])) {
                $this->json(404, ['error' => 'Evento não encontrado.']);

                return;
            }

            $event['is_open'] = (bool) $event['is_open'];
            $event['max_attendees'] = (int) $event['max_attendees'];
            $event['attendees_count'] = (int) ($event['attendees_count'] ?? 0);

            $this->json(200, $event);
        } catch (PDOException $e) {
            error_log('Erro DB getEvent: ' . $e->getMessage());
            $this->json(500, ['error' => 'Erro ao buscar evento.']);
        }
    }

    private function createEvent(): void
    {
        if ($this->requireAuth() === null) {
            return;
        }

        $input = $this->jsonInput();
        $name = trim((string) ($input['name'] ?? ''));
        $eventDate = !empty($input['event_date']) ? (string) $input['event_date'] : null;
        $location = !empty($input['location']) ? trim((string) $input['location']) : null;
        $isOpen = !empty($input['is_open']) ? 1 : 0;
        $maxAttendees = max(1, min(100000, (int) ($input['max_attendees'] ?? 500)));

        if (mb_strlen($name) < 3 || mb_strlen($name) > 120) {
            $this->json(400, ['error' => 'O nome do evento deve ter entre 3 e 120 caracteres.']);

            return;
        }

        try {
            $pdo = Database::getConnection($this->config);
            $id = Validation::uuid();
            $stmt = $pdo->prepare('
                INSERT INTO events (id, name, event_date, location, is_open, max_attendees, created_at)
                VALUES (:id, :name, :event_date, :location, :is_open, :max_attendees, NOW())
            ');
            $stmt->execute([
                'id' => $id,
                'name' => $name,
                'event_date' => $eventDate,
                'location' => $location,
                'is_open' => $isOpen,
                'max_attendees' => $maxAttendees,
            ]);

            $this->getEvent($id);
        } catch (PDOException $e) {
            error_log('Erro DB createEvent: ' . $e->getMessage());
            $this->json(500, ['error' => 'Erro ao criar evento.']);
        }
    }

    private function updateEvent(string $id): void
    {
        if ($this->requireAuth() === null) {
            return;
        }

        $input = $this->jsonInput();
        $name = trim((string) ($input['name'] ?? ''));
        $eventDate = !empty($input['event_date']) ? (string) $input['event_date'] : null;
        $location = !empty($input['location']) ? trim((string) $input['location']) : null;
        $isOpen = !empty($input['is_open']) ? 1 : 0;
        $maxAttendees = max(1, min(100000, (int) ($input['max_attendees'] ?? 500)));

        if (mb_strlen($name) < 3 || mb_strlen($name) > 120) {
            $this->json(400, ['error' => 'O nome do evento deve ter entre 3 e 120 caracteres.']);

            return;
        }

        try {
            $pdo = Database::getConnection($this->config);

            $stmtCurrent = $pdo->prepare('
                SELECT name, event_date, location, is_open, max_attendees
                FROM events WHERE id = :id
            ');
            $stmtCurrent->execute(['id' => $id]);
            $current = $stmtCurrent->fetch();

            if (!$current) {
                $this->json(404, ['error' => 'Evento não encontrado.']);

                return;
            }

            // Evento fechado é registro histórico: só aceita ser reaberto, sem
            // outras alterações junto. O trigger trg_prevent_closed_event_edits
            // repete a trava no banco para chamadas que não passam pela API.
            if (!(bool) $current['is_open']) {
                $unchanged = $isOpen === 1
                    && $name === (string) $current['name']
                    && $eventDate === ($current['event_date'] !== null ? (string) $current['event_date'] : null)
                    && $location === ($current['location'] !== null ? (string) $current['location'] : null)
                    && $maxAttendees === (int) $current['max_attendees'];

                if (!$unchanged) {
                    $this->json(400, [
                        'error' => 'Evento fechado não pode ser editado. Reabra-o antes de alterar seus dados.',
                    ]);

                    return;
                }
            }

            $stmt = $pdo->prepare('
                UPDATE events
                SET name = :name, event_date = :event_date, location = :location, is_open = :is_open, max_attendees = :max_attendees
                WHERE id = :id
            ');
            $stmt->execute([
                'id' => $id,
                'name' => $name,
                'event_date' => $eventDate,
                'location' => $location,
                'is_open' => $isOpen,
                'max_attendees' => $maxAttendees,
            ]);

            $this->getEvent($id);
        } catch (PDOException $e) {
            // 45000 é o SIGNAL de trg_prevent_closed_event_edits: só chega aqui
            // se a checagem acima e o banco discordarem (corrida entre dois
            // admins, p.ex.). É erro do cliente, não falha interna.
            if ($e->getCode() === '45000') {
                $this->json(400, [
                    'error' => 'Evento fechado não pode ser editado. Reabra-o antes de alterar seus dados.',
                ]);

                return;
            }
            error_log('Erro DB updateEvent: ' . $e->getMessage());
            $this->json(500, ['error' => 'Erro ao atualizar evento.']);
        }
    }

    private function deleteEvent(string $id): void
    {
        if ($this->requireAuth() === null) {
            return;
        }

        try {
            $pdo = Database::getConnection($this->config);
            $stmt = $pdo->prepare('DELETE FROM events WHERE id = :id');
            $stmt->execute(['id' => $id]);

            $this->json(200, ['message' => 'Evento removido com sucesso.']);
        } catch (PDOException $e) {
            error_log('Erro DB deleteEvent: ' . $e->getMessage());
            $this->json(500, ['error' => 'Erro ao excluir evento.']);
        }
    }

    private function createAttendee(): void
    {
        $input = $this->jsonInput();
        $eventId = (string) ($input['event_id'] ?? '');
        // collapseSpaces reproduz o trigger normalize_attendee do Postgres:
        // apara as pontas e colapsa espaços internos antes de validar/gravar.
        $fullName = Validation::collapseSpaces((string) ($input['full_name'] ?? ''));
        $rawCpf = (string) ($input['cpf'] ?? '');
        $rawEmail = trim((string) ($input['email'] ?? ''));
        $rawPhone = (string) ($input['phone'] ?? '');
        $rawLocation = Validation::collapseSpaces((string) ($input['attendance_location'] ?? ''));
        $signatureData = !empty($input['signature_data']) ? (string) $input['signature_data'] : null;

        $cpf = Validation::cleanDigits($rawCpf);
        $phone = Validation::cleanDigits($rawPhone);
        $email = strtolower($rawEmail);

        if (mb_strlen($fullName) < 3) {
            $this->json(400, ['error' => 'O nome completo deve ter pelo menos 3 caracteres.']);

            return;
        }

        if (!Validation::isValidCpf($cpf)) {
            $this->json(400, ['error' => 'CPF inválido.']);

            return;
        }

        if (!Validation::isValidEmail($email)) {
            $this->json(400, ['error' => 'E-mail inválido.']);

            return;
        }

        // Opcional; quando vem, respeita o mesmo formato do CHECK ^\d{10,11}$.
        if ($phone !== '' && !Validation::isValidPhone($phone)) {
            $this->json(400, ['error' => 'Telefone deve ter 10 ou 11 dígitos.']);

            return;
        }

        // Ausente cai no padrão (cliente antigo que não envia o campo); presente
        // e fora da faixa é erro, não um silencioso "Não informado" que
        // esconderia o problema do usuário.
        $attendanceLocation = $rawLocation === ''
            ? Validation::DEFAULT_ATTENDANCE_LOCATION
            : $rawLocation;

        if (!Validation::isValidAttendanceLocation($attendanceLocation)) {
            $this->json(400, ['error' => 'O local de atendimento deve ter entre 2 e 160 caracteres.']);

            return;
        }

        if ($signatureData !== null && !Validation::isValidSignatureData($signatureData)) {
            $this->json(400, ['error' => 'Assinatura inválida: envie um PNG em data URL de até 400 KB.']);

            return;
        }

        try {
            $pdo = Database::getConnection($this->config);

            // Verificar se o evento existe e se está aberto
            $stmtEvent = $pdo->prepare('SELECT id, is_open, max_attendees FROM events WHERE id = :id');
            $stmtEvent->execute(['id' => $eventId]);
            $event = $stmtEvent->fetch();

            if (!$event) {
                $this->json(404, ['error' => 'Evento não encontrado.']);

                return;
            }

            if (!(bool) $event['is_open']) {
                $this->json(400, ['error' => 'Este evento não está aberto para inscrições.']);

                return;
            }

            // Verificar teto de participantes
            $stmtCount = $pdo->prepare('SELECT COUNT(*) AS total FROM attendees WHERE event_id = :event_id');
            $stmtCount->execute(['event_id' => $eventId]);
            $countRow = $stmtCount->fetch();
            $currentCount = (int) ($countRow['total'] ?? 0);
            $maxLimit = (int) $event['max_attendees'];

            if ($currentCount >= $maxLimit) {
                $this->json(400, ['error' => sprintf('Evento lotado (limite de %d participantes).', $maxLimit)]);

                return;
            }

            // Inserir participante
            $id = Validation::uuid();
            $stmtInsert = $pdo->prepare('
                INSERT INTO attendees (id, event_id, full_name, cpf, email, phone, attendance_location, signature_data, created_at)
                VALUES (:id, :event_id, :full_name, :cpf, :email, :phone, :attendance_location, :signature_data, NOW())
            ');
            $stmtInsert->execute([
                'id' => $id,
                'event_id' => $eventId,
                'full_name' => $fullName,
                'cpf' => $cpf,
                'email' => $email,
                'phone' => $phone !== '' ? $phone : null,
                'attendance_location' => $attendanceLocation,
                'signature_data' => $signatureData,
            ]);

            $this->json(201, [
                'id' => $id,
                'event_id' => $eventId,
                'full_name' => $fullName,
                'cpf' => $cpf,
                'email' => $email,
                'phone' => $phone,
                'attendance_location' => $attendanceLocation,
            ]);
        } catch (PDOException $e) {
            if ($e->getCode() === '23000' || str_contains($e->getMessage(), '1062')) {
                $this->json(400, ['error' => 'Este CPF já realizou presença neste evento.']);

                return;
            }
            error_log('Erro DB createAttendee: ' . $e->getMessage());
            $this->json(500, ['error' => 'Erro ao registrar presença.']);
        }
    }

    private function listAttendees(string $eventId): void
    {
        if ($this->requireAuth() === null) {
            return;
        }

        try {
            $pdo = Database::getConnection($this->config);
            $stmt = $pdo->prepare('
                SELECT id, event_id, full_name, cpf, email, phone, attendance_location, signature_data, created_at 
                FROM attendees 
                WHERE event_id = :event_id 
                ORDER BY created_at DESC
            ');
            $stmt->execute(['event_id' => $eventId]);
            $attendees = $stmt->fetchAll() ?: [];

            $this->json(200, $attendees);
        } catch (PDOException $e) {
            error_log('Erro DB listAttendees: ' . $e->getMessage());
            $this->json(500, ['error' => 'Erro ao buscar participantes.']);
        }
    }

    private function deleteAttendee(string $id): void
    {
        if ($this->requireAuth() === null) {
            return;
        }

        try {
            $pdo = Database::getConnection($this->config);
            $stmt = $pdo->prepare('DELETE FROM attendees WHERE id = :id');
            $stmt->execute(['id' => $id]);

            $this->json(200, ['message' => 'Participante removido com sucesso.']);
        } catch (PDOException $e) {
            error_log('Erro DB deleteAttendee: ' . $e->getMessage());
            $this->json(500, ['error' => 'Erro ao remover participante.']);
        }
    }

    private function deleteAttendeesByCpf(string $rawCpf): void
    {
        if ($this->requireAuth() === null) {
            return;
        }

        $cpf = Validation::cleanDigits($rawCpf);
        if (!Validation::isValidCpf($cpf)) {
            $this->json(400, ['error' => 'CPF inválido.']);

            return;
        }

        try {
            $pdo = Database::getConnection($this->config);
            $stmt = $pdo->prepare('DELETE FROM attendees WHERE cpf = :cpf');
            $stmt->execute(['cpf' => $cpf]);
            $deletedCount = $stmt->rowCount();

            $this->json(200, [
                'message' => sprintf('%d registro(s) de presença associado(s) ao CPF foram excluído(s).', $deletedCount),
                'deleted_count' => $deletedCount,
            ]);
        } catch (PDOException $e) {
            error_log('Erro DB deleteAttendeesByCpf: ' . $e->getMessage());
            $this->json(500, ['error' => 'Erro ao realizar a exclusão em cascata por CPF.']);
        }
    }

    private function report(string $eventId): void
    {
        if ($this->requireAuth() === null) {
            return;
        }

        try {
            $pdo = Database::getConnection($this->config);
            $stmtEvent = $pdo->prepare('SELECT id, name, event_date, location FROM events WHERE id = :id');
            $stmtEvent->execute(['id' => $eventId]);
            $event = $stmtEvent->fetch();

            if (!$event) {
                $this->json(404, ['error' => 'Evento não encontrado.']);

                return;
            }

            $stmtAttendees = $pdo->prepare('
                SELECT full_name, cpf, email, phone, attendance_location, created_at 
                FROM attendees 
                WHERE event_id = :event_id 
                ORDER BY full_name ASC 
                LIMIT :limit
            ');
            $stmtAttendees->bindValue(':event_id', $eventId);
            $stmtAttendees->bindValue(':limit', self::REPORT_ROW_LIMIT, PDO::PARAM_INT);
            $stmtAttendees->execute();
            $rows = $stmtAttendees->fetchAll() ?: [];

            $pdf = (new AttendanceReport($this->config->timezone))->build(
                $event,
                $rows,
                count($rows),
            );

            $filename = sprintf(
                'lista-presenca-%s-%s.pdf',
                Format::slug((string) ($event['name'] ?? '')),
                Format::today($this->config->timezone),
            );

            http_response_code(200);
            header('Content-Type: application/pdf');
            header('Content-Disposition: attachment; filename="' . $filename . '"');
            header('Content-Length: ' . strlen($pdf));
            echo $pdf;
        } catch (Throwable $error) {
            error_log('Erro ao gerar PDF: ' . $error->getMessage());
            $this->json(500, ['error' => 'Erro ao gerar o relatório.']);
        }
    }

    /**
     * @return array<string, mixed>|null
     */
    private function getAuthUser(): ?array
    {
        $token = $this->bearerToken() ?? ($_COOKIE['token'] ?? null);
        if (!$token) {
            return null;
        }

        return Jwt::decode($token, $this->config->jwtSecret);
    }

    /**
     * @return array<string, mixed>|null
     */
    private function requireAuth(): ?array
    {
        $user = $this->getAuthUser();
        if ($user === null) {
            $this->json(401, ['error' => 'Acesso não autorizado. Faça login novamente.']);

            return null;
        }

        return $user;
    }

    private function setAuthCookie(string $token): void
    {
        setcookie('token', $token, [
            'expires' => time() + 86400,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private function clearAuthCookie(): void
    {
        setcookie('token', '', [
            'expires' => time() - 3600,
            'path' => '/',
            'httponly' => true,
            'samesite' => 'Lax',
        ]);
    }

    private function bearerToken(): ?string
    {
        $authorization = $this->requestHeader('Authorization');
        if (
            $authorization === null
            || preg_match('/^Bearer\s+(\S+)$/i', trim($authorization), $matches) !== 1
        ) {
            return null;
        }

        return $matches[1];
    }

    private function requestHeader(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $value = $_SERVER[$key] ?? null;

        // O Apache não repassa o Authorization para o ambiente do PHP: sob
        // mod_php ele some de $_SERVER e sobra só em apache_request_headers().
        // O zz-presenca-security.conf corrige isso no servidor; este fallback
        // cobre qualquer outro lugar onde a API rode sem aquela configuração —
        // sem ele, toda rota autenticada responde 401.
        if ((!is_string($value) || $value === '') && function_exists('apache_request_headers')) {
            foreach (apache_request_headers() as $header => $headerValue) {
                if (strcasecmp($header, $name) === 0) {
                    $value = $headerValue;
                    break;
                }
            }
        }

        return is_string($value) && $value !== '' ? $value : null;
    }

    /**
     * @return array<string, mixed>
     */
    private function jsonInput(): array
    {
        $raw = file_get_contents('php://input');
        if (!$raw) {
            return [];
        }

        $decoded = json_decode($raw, true);

        return is_array($decoded) ? $decoded : [];
    }

    private function applyCors(?string $origin): bool
    {
        header('Vary: Origin');
        if ($origin !== null && !in_array($origin, $this->config->allowedOrigins, true)) {
            return false;
        }

        if ($origin !== null) {
            header('Access-Control-Allow-Origin: ' . $origin);
        }
        header('Access-Control-Allow-Credentials: true');
        header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Authorization, Content-Type');
        header('Access-Control-Expose-Headers: Content-Disposition');

        return true;
    }

    /**
     * @param array<string, mixed> $body
     */
    private function json(int $status, array $body): void
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(
            $body,
            JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_THROW_ON_ERROR,
        );
    }
}
