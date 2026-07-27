'use client'

import { useRef, useState } from 'react'
import Icon from '@/components/Icon'

type Props = {
  disabled?: boolean
  error?: string
  onChange: (signature: string | null) => void
}

const CANVAS_WIDTH = 900
const CANVAS_HEIGHT = 300

export default function SignaturePad({ disabled = false, error, onChange }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawingRef = useRef(false)
  const [hasInk, setHasInk] = useState(false)

  function pointFromEvent(event: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function startDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return

    const canvas = canvasRef.current
    const point = pointFromEvent(event)
    const context = canvas?.getContext('2d')
    if (!canvas || !point || !context) return

    event.currentTarget.setPointerCapture(event.pointerId)
    drawingRef.current = true
    context.strokeStyle = '#111827'
    context.fillStyle = '#111827'
    context.lineWidth = 4
    context.lineCap = 'round'
    context.lineJoin = 'round'
    context.beginPath()
    context.moveTo(point.x, point.y)
    context.arc(point.x, point.y, 2, 0, Math.PI * 2)
    context.fill()
    context.beginPath()
    context.moveTo(point.x, point.y)

    if (!hasInk) setHasInk(true)
  }

  function draw(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current || disabled) return

    const point = pointFromEvent(event)
    const context = canvasRef.current?.getContext('2d')
    if (!point || !context) return

    context.lineTo(point.x, point.y)
    context.stroke()
  }

  function finishDrawing(event: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return

    drawingRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }

    const canvas = canvasRef.current
    if (canvas) onChange(canvas.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    if (!canvas || disabled) return

    canvas.getContext('2d')?.clearRect(0, 0, canvas.width, canvas.height)
    setHasInk(false)
    onChange(null)
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-4">
        <label className="text-label-md text-on-surface" htmlFor="signature-pad">
          Assine no quadro abaixo
        </label>
        <button
          type="button"
          onClick={clear}
          disabled={!hasInk || disabled}
          className="inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-label-md text-primary transition-colors hover:bg-primary-fixed/40 disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Icon name="ink_eraser" className="text-[18px]" />
          Limpar
        </button>
      </div>

      <div
        className={`overflow-hidden rounded-card border-2 bg-white transition-colors ${
          error ? 'border-error' : 'border-border focus-within:border-primary'
        }`}
      >
        <canvas
          ref={canvasRef}
          id="signature-pad"
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onPointerDown={startDrawing}
          onPointerMove={draw}
          onPointerUp={finishDrawing}
          onPointerCancel={finishDrawing}
          aria-label="Quadro para desenhar a assinatura"
          className={`block aspect-[3/1] w-full touch-none ${
            disabled ? 'cursor-not-allowed opacity-60' : 'cursor-crosshair'
          }`}
        />
      </div>

      {error ? (
        <p className="ml-2 text-label-sm text-error">{error}</p>
      ) : (
        <p className="ml-2 text-label-sm text-muted">
          Use o dedo, uma caneta digital ou o mouse.
        </p>
      )}
    </div>
  )
}
