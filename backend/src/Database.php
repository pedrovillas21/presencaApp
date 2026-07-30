<?php

declare(strict_types=1);

namespace PresencaApp;

use PDO;
use PDOException;

final class Database
{
    private static ?PDO $pdo = null;

    public static function getConnection(Config $config): PDO
    {
        if (self::$pdo === null) {
            $dsn = sprintf(
                'mysql:host=%s;port=%d;dbname=%s;charset=utf8mb4',
                $config->dbHost,
                $config->dbPort,
                $config->dbName,
            );

            try {
                self::$pdo = new PDO($dsn, $config->dbUser, $config->dbPass, [
                    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
                    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
                    PDO::ATTR_EMULATE_PREPARES => false,
                ]);
            } catch (PDOException $e) {
                throw new PDOException('Falha na conexão com o MySQL: ' . $e->getMessage(), (int) $e->getCode());
            }
        }

        return self::$pdo;
    }
}
