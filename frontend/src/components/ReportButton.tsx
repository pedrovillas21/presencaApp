'use client'

import { useEffect, useRef, useState } from 'react'
import Icon from '@/components/Icon'
import { downloadAttendanceReport, ReportError } from '@/lib/api'

const SLOW_AFTER_MS = 4000

export default function ReportButton({ eventId }: { eventId: string }) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [slow, setSlow] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const slowTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Acorda o Render enquanto o admin confere a lista, para o PDF sair quente.
  useEffect(() => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL
    if (!apiUrl) return
    fetch(`${apiUrl}/health`).catch(() => {
      // Só aquecimento — se falhar, o clique no botão reporta o erro de verdade.
    })
  }, [])

  useEffect(() => () => {
    if (slowTimer.current) clearTimeout(slowTimer.current)
  }, [])

  async function handleClick() {
    setError(null)
    setIsGenerating(true)
    setSlow(false)
    slowTimer.current = setTimeout(() => setSlow(true), SLOW_AFTER_MS)

    try {
      await downloadAttendanceReport(eventId)
    } catch (err) {
      setError(
        err instanceof ReportError
          ? err.message
          : 'Erro inesperado ao gerar o relatório. Tente novamente.'
      )
    } finally {
      if (slowTimer.current) clearTimeout(slowTimer.current)
      setSlow(false)
      setIsGenerating(false)
    }
  }

  return (
    <div className="flex shrink-0 flex-col items-stretch gap-2 md:items-end">
      <button onClick={handleClick} className="btn-primary" disabled={isGenerating}>
        {isGenerating ? 'Gerando relatório…' : 'Exportar Relatório PDF'}
        <Icon
          name={isGenerating ? 'progress_activity' : 'picture_as_pdf'}
          className={isGenerating ? 'animate-spin' : ''}
        />
      </button>

      {isGenerating && slow && (
        <p className="max-w-xs text-label-sm text-muted md:text-right">
          Gerando relatório — isso pode levar até 1 minuto se o servidor estiver iniciando.
        </p>
      )}

      {error && (
        <p role="alert" className="alert-error max-w-xs md:text-right">
          {error}
        </p>
      )}
    </div>
  )
}
