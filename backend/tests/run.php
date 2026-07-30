<?php

declare(strict_types=1);

use PresencaApp\Config;
use PresencaApp\Pdf\AttendanceReport;
use PresencaApp\Support\Format;
use PresencaApp\Support\Validation;

require dirname(__DIR__) . '/vendor/autoload.php';

$tests = [];

$tests['formata CPF e telefone'] = static function (): void {
    assertSame('529.982.247-25', Format::cpf('52998224725'));
    assertSame('(61) 99999-1234', Format::phone('61999991234'));
    assertSame('(61) 3333-1234', Format::phone('6133331234'));
};

$tests['gera slug ASCII estável'] = static function (): void {
    assertSame('reuniao-de-fisioterapia', Format::slug('Reunião de Fisioterapia'));
    assertSame('evento', Format::slug('---'));
};

$tests['não desloca data pura'] = static function (): void {
    assertSame('23/07/2026', Format::dateOnly('2026-07-23'));
    assertSame(null, Format::dateOnly(null));
};

$tests['converte timestamptz para São Paulo'] = static function (): void {
    $timezone = new DateTimeZone('America/Sao_Paulo');
    assertSame('23/07/2026 21:00', Format::dateTime('2026-07-24T00:00:00Z', $timezone));
};

$tests['valida configuração'] = static function (): void {
    $config = Config::fromArray([
        'PORT' => '8080',
        'DB_HOST' => 'db',
        'DB_PORT' => '3306',
        'DB_DATABASE' => 'presenca_app',
        'DB_USERNAME' => 'presenca_user',
        'ALLOWED_ORIGINS' => 'http://localhost:3000, https://app.example.com',
        'TZ' => 'America/Sao_Paulo',
    ]);

    assertSame(8080, $config->port);
    assertSame('db', $config->dbHost);
    assertSame(3306, $config->dbPort);
    assertSame('presenca_app', $config->dbName);
    assertSame(
        ['http://localhost:3000', 'https://app.example.com'],
        $config->allowedOrigins,
    );
};

$tests['rejeita configuração insegura'] = static function (): void {
    assertThrows(
        static fn (): Config => Config::fromArray([
            'ALLOWED_ORIGINS' => 'javascript:alert(1)',
        ]),
        InvalidArgumentException::class,
    );
};

$tests['valida CPF pelos dígitos verificadores'] = static function (): void {
    assertTrue(Validation::isValidCpf('529.982.247-25'));
    assertTrue(!Validation::isValidCpf('529.982.247-24'));
    assertTrue(!Validation::isValidCpf('111.111.111-11'));
    assertTrue(!Validation::isValidCpf('5299822472'));
};

$tests['colapsa espaços como o trigger do Postgres'] = static function (): void {
    assertSame('João Silva', Validation::collapseSpaces('  João   Silva '));
    assertSame('Sede', Validation::collapseSpaces("\tSede\n"));
    assertSame('', Validation::collapseSpaces('   '));
};

$tests['aceita telefone só com 10 ou 11 dígitos'] = static function (): void {
    assertTrue(Validation::isValidPhone('6133331234'));
    assertTrue(Validation::isValidPhone('61999991234'));
    assertTrue(!Validation::isValidPhone('613333'));
    assertTrue(!Validation::isValidPhone('619999912345'));
};

$tests['limita o local de atendimento a 2..160'] = static function (): void {
    assertTrue(Validation::isValidAttendanceLocation('Sede'));
    assertTrue(Validation::isValidAttendanceLocation(Validation::DEFAULT_ATTENDANCE_LOCATION));
    assertTrue(!Validation::isValidAttendanceLocation('S'));
    assertTrue(!Validation::isValidAttendanceLocation(str_repeat('a', 161)));
};

$tests['aceita assinatura só como PNG data URL dentro do limite'] = static function (): void {
    $valid = 'data:image/png;base64,' . str_repeat('A', 200);
    assertTrue(Validation::isValidSignatureData($valid));
    assertTrue(!Validation::isValidSignatureData('data:image/jpeg;base64,' . str_repeat('A', 200)));
    assertTrue(!Validation::isValidSignatureData('data:image/png;base64,QQ=='));
    assertTrue(!Validation::isValidSignatureData(
        'data:image/png;base64,' . str_repeat('A', 400_001),
    ));
};

// Regressão: o hash semeado já teve 60 caracteres e formato bcrypt válido sem
// ser hash de nada, e o login documentado no plano caía em 401.
$tests['hash do admin padrão confere com a senha documentada'] = static function (): void {
    $schemaPath = dirname(__DIR__, 2) . '/mysql/schema.sql';
    if (!is_file($schemaPath)) {
        // A imagem do backend é construída só com ./backend; sem o repositório
        // completo montado não há schema para conferir.
        return;
    }

    $schema = (string) file_get_contents($schemaPath);
    if (preg_match('/\'(\$2[aby]\$\d{2}\$[^\']{53})\'/', $schema, $matches) !== 1) {
        throw new RuntimeException('não encontrei o hash do admin em mysql/schema.sql');
    }

    assertTrue(password_verify('admin', $matches[1]));
};

$tests['gera um PDF válido'] = static function (): void {
    $report = new AttendanceReport(new DateTimeZone('America/Sao_Paulo'));
    $pdf = $report->build(
        [
            'id' => '018f7ca2-86cc-7f45-b4aa-2a1535ce0786',
            'name' => 'Evento de teste',
            'event_date' => '2026-07-23',
            'location' => 'Brasília',
        ],
        [[
            'full_name' => 'Maria da Silva',
            'cpf' => '52998224725',
            'email' => 'maria@example.com',
            'phone' => '61999991234',
            'attendance_location' => 'Sede',
            'signature_data' => null,
            'created_at' => '2026-07-24T00:00:00Z',
        ]],
        1,
    );

    assertTrue(str_starts_with($pdf, '%PDF-'));
    assertTrue(strlen($pdf) > 1_000);
};

$tests['gera PDF multipágina com assinatura PNG'] = static function (): void {
    $image = imagecreatetruecolor(2, 2);
    if ($image === false) {
        throw new RuntimeException('não foi possível criar a imagem de teste');
    }
    ob_start();
    imagepng($image);
    $png = ob_get_clean();
    imagedestroy($image);
    if (!is_string($png)) {
        throw new RuntimeException('não foi possível codificar a imagem de teste');
    }

    $attendees = [];
    for ($index = 1; $index <= 40; $index++) {
        $attendees[] = [
            'full_name' => sprintf('Participante de teste %02d', $index),
            'cpf' => '52998224725',
            'email' => sprintf('participante%02d@example.com', $index),
            'phone' => '61999991234',
            'attendance_location' => 'Sede',
            'signature_data' => 'data:image/png;base64,' . base64_encode($png),
            'created_at' => '2026-07-24T00:00:00Z',
        ];
    }

    $pdf = (new AttendanceReport(new DateTimeZone('America/Sao_Paulo')))->build(
        [
            'name' => 'Evento multipágina',
            'event_date' => '2026-07-23',
            'location' => 'Brasília',
        ],
        $attendees,
        count($attendees),
    );

    preg_match_all('/\/Type\s*\/Page\b/', $pdf, $pages);
    assertTrue(count($pages[0]) > 1);
};

$failures = 0;
foreach ($tests as $name => $test) {
    try {
        $test();
        fwrite(STDOUT, "✓ {$name}\n");
    } catch (Throwable $error) {
        $failures++;
        fwrite(STDERR, "✗ {$name}: {$error->getMessage()}\n");
    }
}

fwrite(STDOUT, sprintf("\n%d teste(s), %d falha(s).\n", count($tests), $failures));
exit($failures === 0 ? 0 : 1);

function assertSame(mixed $expected, mixed $actual): void
{
    if ($expected !== $actual) {
        throw new RuntimeException(sprintf(
            'esperado %s, recebido %s',
            var_export($expected, true),
            var_export($actual, true),
        ));
    }
}

function assertTrue(bool $condition): void
{
    if (!$condition) {
        throw new RuntimeException('a condição deveria ser verdadeira');
    }
}

/**
 * @param callable(): mixed $callback
 * @param class-string<Throwable> $expectedClass
 */
function assertThrows(callable $callback, string $expectedClass): void
{
    try {
        $callback();
    } catch (Throwable $error) {
        if ($error instanceof $expectedClass) {
            return;
        }
        throw new RuntimeException(
            sprintf('esperava %s, recebeu %s', $expectedClass, $error::class),
        );
    }

    throw new RuntimeException(sprintf('esperava uma exceção %s', $expectedClass));
}
