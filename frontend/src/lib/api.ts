import { createClient } from '@/lib/supabase/client'

const API_URL = process.env.NEXT_PUBLIC_API_URL

/** Erro com mensagem já pronta para mostrar ao admin. */
export class ReportError extends Error {}

/**
 * Baixa o PDF da lista de presença.
 *
 * O backend no plano gratuito do Render hiberna após ~15 min, então a primeira
 * chamada pode levar 30–50 s. Quem chama controla o estado de loading; aqui só
 * garantimos timeout, erros distinguíveis e revogação do object URL.
 */
export async function downloadAttendanceReport(eventId: string, timeoutMs = 90_000) {
  if (!API_URL) {
    throw new ReportError(
      'NEXT_PUBLIC_API_URL não está configurada — não há servidor de relatórios para chamar.'
    )
  }

  const supabase = createClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()

  if (!session) {
    throw new ReportError('Sua sessão expirou. Faça login novamente.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(`${API_URL}/api/events/${eventId}/report.pdf`, {
      headers: { Authorization: `Bearer ${session.access_token}` },
      signal: controller.signal,
    })
  } catch (error) {
    // Rede: backend fora do ar, URL errada, CORS ou timeout do AbortController.
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ReportError(
        'O servidor demorou demais para responder (90 s). Tente novamente em instantes.'
      )
    }
    throw new ReportError(
      'Não foi possível conectar ao servidor de relatórios. Verifique se ele está no ar.'
    )
  } finally {
    clearTimeout(timeout)
  }

  if (!response.ok) {
    const detail =
      response.status === 401
        ? 'sua sessão não foi aceita — faça login novamente'
        : response.status === 404
          ? 'evento não encontrado'
          : `código ${response.status}`
    throw new ReportError(`O servidor recusou a requisição (${detail}).`)
  }

  const blob = await response.blob()
  const url = URL.createObjectURL(blob)
  try {
    const link = document.createElement('a')
    link.href = url
    link.download = filenameFrom(response) ?? `lista-presenca-${eventId}.pdf`
    document.body.appendChild(link)
    link.click()
    link.remove()
  } finally {
    // Um tick de folga para o browser iniciar o download antes de revogar.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function filenameFrom(response: Response): string | null {
  const header = response.headers.get('content-disposition')
  const match = header?.match(/filename="([^"]+)"/)
  return match?.[1] ?? null
}
