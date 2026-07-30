<?php

declare(strict_types=1);

namespace PresencaApp\Supabase;

use JsonException;

final class SupabaseClient
{
    public function __construct(
        private readonly string $baseUrl,
        private readonly string $anonKey,
        private readonly string $accessToken,
    ) {
    }

    /**
     * @return array<string, mixed>|null
     */
    public function authenticatedUser(): ?array
    {
        try {
            $response = $this->request('/auth/v1/user');
        } catch (SupabaseException $error) {
            if (in_array($error->statusCode, [401, 403], true)) {
                return null;
            }
            throw $error;
        }

        return isset($response->data['id']) ? $response->data : null;
    }

    /**
     * @return array<string, mixed>|null
     */
    public function event(string $eventId): ?array
    {
        $response = $this->request('/rest/v1/events', [
            'select' => 'id,name,event_date,location',
            'id' => 'eq.' . $eventId,
            'limit' => '1',
        ]);

        $event = $response->data[0] ?? null;

        return is_array($event) ? $event : null;
    }

    /**
     * @return array{rows: list<array<string, mixed>>, total: int}
     */
    public function attendees(string $eventId, int $limit): array
    {
        $response = $this->request(
            '/rest/v1/attendees',
            [
                'select' => implode(',', [
                    'full_name',
                    'cpf',
                    'email',
                    'phone',
                    'attendance_location',
                    'signature_data',
                    'created_at',
                ]),
                'event_id' => 'eq.' . $eventId,
                'order' => 'full_name.asc',
                'limit' => (string) $limit,
            ],
            ['Prefer: count=exact'],
        );

        $rows = array_values(array_filter($response->data, 'is_array'));
        $total = count($rows);
        $contentRange = $response->headers['content-range'] ?? '';
        if (preg_match('~/(\d+)$~', $contentRange, $matches) === 1) {
            $total = (int) $matches[1];
        }

        /** @var list<array<string, mixed>> $rows */
        return ['rows' => $rows, 'total' => $total];
    }

    /**
     * @param array<string, string> $query
     * @param list<string> $extraHeaders
     */
    private function request(
        string $path,
        array $query = [],
        array $extraHeaders = [],
    ): SupabaseResponse {
        $url = $this->baseUrl . $path;
        if ($query !== []) {
            $url .= '?' . http_build_query($query, '', '&', PHP_QUERY_RFC3986);
        }

        $responseHeaders = [];
        $handle = curl_init($url);
        if ($handle === false) {
            throw new SupabaseException('Não foi possível inicializar a conexão com o Supabase.');
        }

        curl_setopt_array($handle, [
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_CONNECTTIMEOUT => 10,
            CURLOPT_TIMEOUT => 30,
            CURLOPT_HTTPHEADER => [
                'Accept: application/json',
                'apikey: ' . $this->anonKey,
                'Authorization: Bearer ' . $this->accessToken,
                ...$extraHeaders,
            ],
            CURLOPT_HEADERFUNCTION => static function ($curl, string $line) use (&$responseHeaders): int {
                $length = strlen($line);
                $separator = strpos($line, ':');
                if ($separator !== false) {
                    $name = strtolower(trim(substr($line, 0, $separator)));
                    $responseHeaders[$name] = trim(substr($line, $separator + 1));
                }

                return $length;
            },
        ]);

        $body = curl_exec($handle);
        if ($body === false) {
            $message = curl_error($handle);
            curl_close($handle);
            throw new SupabaseException('Falha de rede ao consultar o Supabase: ' . $message);
        }

        $status = (int) curl_getinfo($handle, CURLINFO_RESPONSE_CODE);
        curl_close($handle);

        if ($status < 200 || $status >= 300) {
            throw new SupabaseException(
                sprintf('O Supabase respondeu com HTTP %d.', $status),
                $status,
            );
        }

        try {
            $data = json_decode($body, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $error) {
            throw new SupabaseException(
                'O Supabase retornou uma resposta JSON inválida: ' . $error->getMessage(),
                $status,
            );
        }

        if (!is_array($data)) {
            throw new SupabaseException('O Supabase retornou um formato inesperado.', $status);
        }

        return new SupabaseResponse($data, $responseHeaders);
    }
}
