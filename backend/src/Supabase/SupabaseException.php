<?php

declare(strict_types=1);

namespace PresencaApp\Supabase;

use RuntimeException;

final class SupabaseException extends RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $statusCode = 0,
    ) {
        parent::__construct($message);
    }
}
