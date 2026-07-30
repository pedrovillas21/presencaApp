const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'

export class ApiError extends Error {
  constructor(public status: int, message: string) {
    super(message)
    this.name = 'ApiError'
  }
}

export class ReportError extends Error {}

export function getToken(): string | null {
  if (typeof window === 'undefined') return null
  const value = `; ${document.cookie}`
  const parts = value.split(`; token=`)
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null
  return localStorage.getItem('auth_token')
}

export function setToken(token: string | null) {
  if (typeof window === 'undefined') return
  if (token) {
    localStorage.setItem('auth_token', token)
    document.cookie = `token=${token}; path=/; max-age=86400; SameSite=Lax`
  } else {
    localStorage.removeItem('auth_token')
    document.cookie = `token=; path=/; max-age=0; SameSite=Lax`
  }
}

export async function fetchApi<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...options,
    headers,
    credentials: 'omit',
  })

  if (!response.ok) {
    let errorMessage = 'Erro ao se comunicar com o servidor.'
    try {
      const data = await response.json()
      if (data.error) errorMessage = data.error
    } catch {}
    throw new ApiError(response.status, errorMessage)
  }

  if (response.status === 204) {
    return {} as T
  }

  return response.json()
}

/**
 * Baixa o PDF da lista de presença.
 */
export async function downloadAttendanceReport(eventId: string, timeoutMs = 90_000) {
  const token = getToken()
  if (!token) {
    throw new ReportError('Sua sessão expirou. Faça login novamente.')
  }

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)

  let response: Response
  try {
    response = await fetch(`${API_URL}/api/events/${eventId}/report.pdf`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
  } catch (error) {
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
    setTimeout(() => URL.revokeObjectURL(url), 1000)
  }
}

function filenameFrom(response: Response): string | null {
  const header = response.headers.get('content-disposition')
  const match = header?.match(/filename="([^"]+)"/)
  return match?.[1] ?? null
}
