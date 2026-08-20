const TZ = 'America/Sao_Paulo'

/** Para colunas timestamptz (created_at). */
export const formatDateTime = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', {
    timeZone: TZ,
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(iso))

/** Para colunas timestamptz e para Date (ex.: "gerado em"). */
export const formatDate = (value: string | Date) =>
  new Intl.DateTimeFormat('pt-BR', { timeZone: TZ, dateStyle: 'short' }).format(
    typeof value === 'string' ? new Date(value) : value
  )

/**
 * events.event_date é `date` puro ("2026-07-23"), não timestamptz.
 * Passar isso para new Date() o interpreta como meia-noite UTC e, formatado em
 * America/Sao_Paulo (UTC−3), volta o dia anterior. Formata a string direto.
 */
export const formatDateOnly = (value: string | null | undefined) => {
  if (!value) return null
  const [y, m, d] = value.slice(0, 10).split('-')
  if (!y || !m || !d) return value
  return `${d}/${m}/${y}`
}

/** Data de hoje em São Paulo, no formato AAAA-MM-DD (nome de arquivo). */
export const todayIsoInTz = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: TZ }).format(new Date())
