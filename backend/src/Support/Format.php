<?php

declare(strict_types=1);

namespace PresencaApp\Support;

use DateTimeImmutable;
use DateTimeZone;
use Normalizer;

final class Format
{
    public static function cpf(string $cpf): string
    {
        $digits = preg_replace('/\D+/', '', $cpf) ?? '';
        if (strlen($digits) !== 11) {
            return $cpf;
        }

        return sprintf(
            '%s.%s.%s-%s',
            substr($digits, 0, 3),
            substr($digits, 3, 3),
            substr($digits, 6, 3),
            substr($digits, 9, 2),
        );
    }

    public static function phone(?string $phone): string
    {
        $value = $phone ?? '';
        $digits = preg_replace('/\D+/', '', $value) ?? '';

        if (strlen($digits) === 11) {
            return sprintf(
                '(%s) %s-%s',
                substr($digits, 0, 2),
                substr($digits, 2, 5),
                substr($digits, 7, 4),
            );
        }
        if (strlen($digits) === 10) {
            return sprintf(
                '(%s) %s-%s',
                substr($digits, 0, 2),
                substr($digits, 2, 4),
                substr($digits, 6, 4),
            );
        }

        return $value;
    }

    public static function slug(string $value): string
    {
        $normalized = Normalizer::normalize($value, Normalizer::FORM_D) ?: $value;
        $withoutMarks = preg_replace('/\p{Mn}+/u', '', $normalized) ?? $normalized;
        $slug = strtolower($withoutMarks);
        $slug = preg_replace('/[^a-z0-9]+/', '-', $slug) ?? '';
        $slug = trim($slug, '-');

        return substr($slug, 0, 60) ?: 'evento';
    }

    public static function dateTime(string $iso, DateTimeZone $timezone): string
    {
        return (new DateTimeImmutable($iso))
            ->setTimezone($timezone)
            ->format('d/m/Y H:i');
    }

    public static function dateOnly(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }

        $parts = explode('-', substr($value, 0, 10));
        if (count($parts) !== 3 || strlen($parts[0]) !== 4) {
            return $value;
        }

        return sprintf('%s/%s/%s', $parts[2], $parts[1], $parts[0]);
    }

    public static function today(DateTimeZone $timezone): string
    {
        return (new DateTimeImmutable('now', $timezone))->format('Y-m-d');
    }
}
