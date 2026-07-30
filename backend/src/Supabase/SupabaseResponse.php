<?php

declare(strict_types=1);

namespace PresencaApp\Supabase;

final readonly class SupabaseResponse
{
    /**
     * @param array<mixed> $data
     * @param array<string, string> $headers
     */
    public function __construct(
        public array $data,
        public array $headers,
    ) {
    }
}
