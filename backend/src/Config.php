<?php

declare(strict_types=1);

namespace PresencaApp;

use DateTimeZone;
use InvalidArgumentException;

final readonly class Config
{
    /**
     * @param list<string> $allowedOrigins
     */
    private function __construct(
        public int $port,
        public string $dbHost,
        public int $dbPort,
        public string $dbName,
        public string $dbUser,
        public string $dbPass,
        public string $jwtSecret,
        public array $allowedOrigins,
        public DateTimeZone $timezone,
    ) {
    }

    public static function fromEnvironment(): self
    {
        $names = [
            'PORT',
            'DB_HOST',
            'DB_PORT',
            'DB_DATABASE',
            'DB_USERNAME',
            'DB_PASSWORD',
            'JWT_SECRET',
            'ALLOWED_ORIGINS',
            'TZ',
        ];
        $values = [];

        foreach ($names as $name) {
            $value = $_ENV[$name] ?? $_SERVER[$name] ?? getenv($name);
            if ($value !== false && $value !== null) {
                $values[$name] = (string) $value;
            }
        }

        return self::fromArray($values);
    }

    /**
     * @param array<string, string> $values
     */
    public static function fromArray(array $values): self
    {
        $portValue = trim($values['PORT'] ?? '8080');
        $port = filter_var(
            $portValue,
            FILTER_VALIDATE_INT,
            ['options' => ['min_range' => 1, 'max_range' => 65535]],
        );
        if ($port === false) {
            throw new InvalidArgumentException('PORT deve ser um inteiro entre 1 e 65535.');
        }

        $dbHost = trim($values['DB_HOST'] ?? '127.0.0.1');
        $dbPortValue = trim($values['DB_PORT'] ?? '3306');
        $dbPort = (int) $dbPortValue;
        $dbName = trim($values['DB_DATABASE'] ?? 'presenca_app');
        $dbUser = trim($values['DB_USERNAME'] ?? 'presenca_user');
        $dbPass = $values['DB_PASSWORD'] ?? 'presenca_password';
        $jwtSecret = trim($values['JWT_SECRET'] ?? 'presenca_app_jwt_super_secret_key_2026');

        $origins = array_values(array_filter(
            array_map('trim', explode(',', $values['ALLOWED_ORIGINS'] ?? 'http://localhost:3000')),
            static fn (string $origin): bool => $origin !== '',
        ));
        foreach ($origins as $origin) {
            if (
                filter_var($origin, FILTER_VALIDATE_URL) === false
                || !in_array(parse_url($origin, PHP_URL_SCHEME), ['http', 'https'], true)
            ) {
                throw new InvalidArgumentException(
                    sprintf('Origem não permitida na configuração: %s', $origin),
                );
            }
        }

        $timezoneName = trim($values['TZ'] ?? 'America/Sao_Paulo');
        try {
            $timezone = new DateTimeZone($timezoneName);
        } catch (\Exception) {
            throw new InvalidArgumentException('TZ deve identificar um fuso horário válido.');
        }

        return new self(
            $port,
            $dbHost,
            $dbPort,
            $dbName,
            $dbUser,
            $dbPass,
            $jwtSecret,
            $origins,
            $timezone,
        );
    }
}
