<?php

declare(strict_types=1);

namespace PresencaApp\Support;

final class Validation
{
    /**
     * Local padrão quando o cliente não informa nada. Precisa bater com o
     * DEFAULT de attendees.attendance_location: dois textos diferentes para a
     * mesma coisa viram duas entradas no filtro de local do painel.
     */
    public const DEFAULT_ATTENDANCE_LOCATION = 'Não informado';

    private const SIGNATURE_PREFIX = 'data:image/png;base64,';
    private const SIGNATURE_MIN_LENGTH = 100;
    private const SIGNATURE_MAX_LENGTH = 400000;

    public static function isValidCpf(string $cpf): bool
    {
        $digits = (string) preg_replace('/\D/', '', $cpf);
        if (strlen($digits) !== 11) {
            return false;
        }

        if (preg_match('/^(\d)\1{10}$/', $digits) === 1) {
            return false;
        }

        for ($t = 9; $t < 11; $t++) {
            $d = 0;
            for ($c = 0; $c < $t; $c++) {
                $d += (int) $digits[$c] * (($t + 1) - $c);
            }
            $d = ((10 * $d) % 11) % 10;
            if ((int) $digits[$c] !== $d) {
                return false;
            }
        }

        return true;
    }

    public static function cleanDigits(string $value): string
    {
        return (string) preg_replace('/\D/', '', $value);
    }

    public static function isValidEmail(string $email): bool
    {
        return filter_var($email, FILTER_VALIDATE_EMAIL) !== false;
    }

    /**
     * Colapsa espaços internos e apara as pontas, como fazia o trigger
     * normalize_attendee no Postgres — "João   Silva" grava "João Silva".
     */
    public static function collapseSpaces(string $value): string
    {
        return trim((string) preg_replace('/\s+/u', ' ', $value));
    }

    /** Fixo/celular brasileiro já sem máscara: 10 ou 11 dígitos. */
    public static function isValidPhone(string $phone): bool
    {
        return preg_match('/^\d{10,11}$/', $phone) === 1;
    }

    public static function isValidAttendanceLocation(string $location): bool
    {
        $length = mb_strlen(trim($location));

        return $length >= 2 && $length <= 160;
    }

    /** Assinatura desenhada, sempre PNG em data URL. */
    public static function isValidSignatureData(string $signature): bool
    {
        if (!str_starts_with($signature, self::SIGNATURE_PREFIX)) {
            return false;
        }

        $length = strlen($signature);

        return $length >= self::SIGNATURE_MIN_LENGTH && $length <= self::SIGNATURE_MAX_LENGTH;
    }

    public static function uuid(): string
    {
        $data = random_bytes(16);
        $data[6] = chr((ord($data[6]) & 0x0f) | 0x40);
        $data[8] = chr((ord($data[8]) & 0x3f) | 0x80);

        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($data), 4));
    }
}
