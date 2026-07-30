<?php

declare(strict_types=1);

namespace PresencaApp\Pdf;

use DateTimeImmutable;
use DateTimeZone;
use Dompdf\Dompdf;
use Dompdf\Options;
use PresencaApp\Support\Format;

final class AttendanceReport
{
    public function __construct(
        private readonly DateTimeZone $timezone,
    ) {
    }

    /**
     * @param array<string, mixed> $event
     * @param list<array<string, mixed>> $attendees
     */
    public function build(array $event, array $attendees, int $total): string
    {
        $options = new Options();
        $options->set('defaultFont', 'DejaVu Sans');
        $options->set('isRemoteEnabled', false);
        $options->set('isPhpEnabled', false);

        $document = new Dompdf($options);
        $document->setPaper('a4', 'portrait');
        $document->loadHtml($this->html($event, $attendees, $total), 'UTF-8');
        $document->render();

        $title = 'Lista de presença — ' . (string) ($event['name'] ?? '');
        $document->addInfo('Title', $title);
        $document->addInfo('Author', 'presencaApp');

        $canvas = $document->getCanvas();
        $font = $document->getFontMetrics()->getFont('DejaVu Sans', 'normal');
        $eventName = mb_strimwidth((string) ($event['name'] ?? ''), 0, 58, '…');
        $canvas->page_text(40, 810, $eventName, $font, 8, [0.4, 0.4, 0.4]);
        $canvas->page_text(
            455,
            810,
            'Página {PAGE_NUM} de {PAGE_COUNT}',
            $font,
            8,
            [0.4, 0.4, 0.4],
        );

        return $document->output();
    }

    /**
     * @param array<string, mixed> $event
     * @param list<array<string, mixed>> $attendees
     */
    private function html(array $event, array $attendees, int $total): string
    {
        $name = $this->escape((string) ($event['name'] ?? ''));
        $eventDate = Format::dateOnly($this->nullableString($event['event_date'] ?? null));
        $location = $this->nullableString($event['location'] ?? null);
        $subtitleParts = array_filter([$name, $this->escape($eventDate), $this->escape($location)]);
        $subtitle = implode(' &nbsp;·&nbsp; ', $subtitleParts);
        $generatedAt = Format::dateTime(
            (new DateTimeImmutable())->format(DATE_ATOM),
            $this->timezone,
        );

        $warning = '';
        if (count($attendees) < $total) {
            $warning = sprintf(
                '<p class="warning">Lista truncada: exibindo %d de %d registros.</p>',
                count($attendees),
                $total,
            );
        }

        $rows = '';
        foreach ($attendees as $index => $attendee) {
            $rows .= $this->row($attendee, $index + 1);
        }
        if ($rows === '') {
            $rows = <<<'HTML'
                <tr>
                  <td class="empty" colspan="5">Nenhum participante registrado neste evento.</td>
                </tr>
                HTML;
        }

        return <<<HTML
            <!doctype html>
            <html lang="pt-BR">
            <head>
              <meta charset="UTF-8">
              <style>
                @page { margin: 40pt 40pt 48pt; }
                * { box-sizing: border-box; }
                body {
                  color: #111;
                  font-family: "DejaVu Sans", sans-serif;
                  font-size: 9pt;
                  margin: 0;
                }
                h1 { font-size: 18pt; margin: 0 0 6pt; }
                .subtitle { font-size: 11pt; margin: 0 0 8pt; }
                .info {
                  color: #666;
                  font-size: 8.5pt;
                  margin: 0 0 10pt;
                  width: 100%;
                }
                .info td { border: 0; padding: 0; }
                .info .generated { text-align: right; }
                .warning {
                  color: #b91c1c;
                  font-size: 8.5pt;
                  font-weight: bold;
                  margin: -4pt 0 10pt;
                }
                table.report {
                  border-collapse: collapse;
                  table-layout: fixed;
                  width: 100%;
                }
                .report thead { display: table-header-group; }
                .report tr { page-break-inside: avoid; }
                .report th,
                .report td {
                  border: 0.5pt solid #999;
                  overflow: hidden;
                  padding: 5pt;
                  vertical-align: middle;
                }
                .report th {
                  background: #eee;
                  font-size: 8.5pt;
                  height: 22pt;
                  text-align: left;
                }
                .report td { height: 66pt; }
                .report .num { padding: 3pt; text-align: center; width: 5%; }
                .report .participant { width: 31%; }
                .report .cpf { font-size: 8pt; padding: 3pt; width: 15%; }
                .report .phone { font-size: 8pt; padding: 3pt; width: 15%; }
                .report .signature { padding: 4pt; text-align: center; width: 34%; }
                .participant-name {
                  font-size: 8.5pt;
                  font-weight: bold;
                  margin-bottom: 4pt;
                }
                .detail {
                  color: #666;
                  font-size: 6.5pt;
                  line-height: 1.35;
                  margin-top: 3pt;
                  overflow-wrap: anywhere;
                }
                .signature img { max-height: 54pt; max-width: 100%; }
                .missing { color: #666; font-size: 6.5pt; font-style: italic; }
                .empty {
                  color: #666;
                  font-style: italic;
                  height: 40pt !important;
                  text-align: center;
                }
              </style>
            </head>
            <body>
              <h1>LISTA DE PRESENÇA</h1>
              <p class="subtitle">{$subtitle}</p>
              <table class="info">
                <tr>
                  <td>Total de participantes: {$total}</td>
                  <td class="generated">Gerado em {$generatedAt}</td>
                </tr>
              </table>
              {$warning}
              <table class="report">
                <thead>
                  <tr>
                    <th class="num">Nº</th>
                    <th class="participant">Participante</th>
                    <th class="cpf">CPF</th>
                    <th class="phone">Telefone</th>
                    <th class="signature">Assinatura</th>
                  </tr>
                </thead>
                <tbody>
                  {$rows}
                </tbody>
              </table>
            </body>
            </html>
            HTML;
    }

    /**
     * @param array<string, mixed> $attendee
     */
    private function row(array $attendee, int $number): string
    {
        $fullName = $this->escape((string) ($attendee['full_name'] ?? ''));
        $email = $this->escape((string) ($attendee['email'] ?? ''));
        $cpf = $this->escape(Format::cpf((string) ($attendee['cpf'] ?? '')));
        $phone = $this->escape(Format::phone($this->nullableString($attendee['phone'] ?? null)));
        $attendanceLocation = $this->escape(
            (string) ($attendee['attendance_location'] ?? ''),
        );
        $createdAt = $this->nullableString($attendee['created_at'] ?? null);
        $checkIn = $createdAt === null
            ? '—'
            : $this->escape(Format::dateTime($createdAt, $this->timezone));
        $signature = $this->signature($this->nullableString($attendee['signature_data'] ?? null));

        return <<<HTML
            <tr>
              <td class="num">{$number}</td>
              <td class="participant">
                <div class="participant-name">{$fullName}</div>
                <div class="detail">{$email}</div>
                <div class="detail">Local: {$attendanceLocation}</div>
                <div class="detail">Check-in: {$checkIn}</div>
              </td>
              <td class="cpf">{$cpf}</td>
              <td class="phone">{$phone}</td>
              <td class="signature">{$signature}</td>
            </tr>
            HTML;
    }

    private function signature(?string $value): string
    {
        $prefix = 'data:image/png;base64,';
        if ($value !== null && str_starts_with($value, $prefix)) {
            $encoded = substr($value, strlen($prefix));
            if ($encoded !== '' && base64_decode($encoded, true) !== false) {
                return sprintf(
                    '<img alt="Assinatura digital" src="%s">',
                    $this->escape($value),
                );
            }
        }

        return '<span class="missing">Sem assinatura digital</span>';
    }

    private function nullableString(mixed $value): ?string
    {
        return is_string($value) && $value !== '' ? $value : null;
    }

    private function escape(?string $value): string
    {
        return htmlspecialchars(
            $value ?? '',
            ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5,
            'UTF-8',
        );
    }
}
