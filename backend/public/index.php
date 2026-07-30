<?php

declare(strict_types=1);

use Dotenv\Dotenv;
use PresencaApp\Application;
use PresencaApp\Config;

require dirname(__DIR__) . '/vendor/autoload.php';

Dotenv::createImmutable(dirname(__DIR__))->safeLoad();

try {
    (new Application(Config::fromEnvironment()))->run();
} catch (Throwable $error) {
    error_log(sprintf(
        'Erro não tratado: %s em %s:%d',
        $error->getMessage(),
        $error->getFile(),
        $error->getLine(),
    ));

    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json; charset=utf-8');
    }

    echo json_encode(
        ['error' => 'Erro interno do servidor.'],
        JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES,
    );
}
