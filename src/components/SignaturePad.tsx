import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import './SignaturePad.css'

type SignaturePadProps = {
  disabled?: boolean
  existingMark?: string
  onAccept: (dataUrl: string) => void
  onClearSaved?: () => void
  label?: string
}

export function SignaturePad({
  disabled,
  existingMark,
  onAccept,
  onClearSaved,
  label = 'Draw your signature',
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const drawing = useRef(false)
  const [hasStroke, setHasStroke] = useState(false)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = window.devicePixelRatio || 1
    const width = canvas.clientWidth || 320
    const height = canvas.clientHeight || 140
    canvas.width = Math.floor(width * ratio)
    canvas.height = Math.floor(height * ratio)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#111'
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, width, height)
  }, [])

  function pointFromEvent(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    }
  }

  function startDraw(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (disabled) return
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    const point = pointFromEvent(e)
    if (!canvas || !ctx || !point) return
    canvas.setPointerCapture(e.pointerId)
    drawing.current = true
    ctx.beginPath()
    ctx.moveTo(point.x, point.y)
  }

  function moveDraw(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return
    const ctx = canvasRef.current?.getContext('2d')
    const point = pointFromEvent(e)
    if (!ctx || !point) return
    ctx.lineTo(point.x, point.y)
    ctx.stroke()
    setHasStroke(true)
  }

  function endDraw(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!drawing.current) return
    drawing.current = false
    try {
      canvasRef.current?.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  function clearCanvas() {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    ctx.fillStyle = '#fff'
    ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight)
    setHasStroke(false)
  }

  function accept() {
    const canvas = canvasRef.current
    if (!canvas || !hasStroke) return
    onAccept(canvas.toDataURL('image/png'))
  }

  if (existingMark && !disabled) {
    return (
      <div className="signature-pad">
        <p className="signature-pad-label">{label}</p>
        <div className="signature-pad-saved">
          <img src={existingMark} alt="Saved signature" />
        </div>
        <div className="signature-pad-actions">
          <button
            type="button"
            className="btn btn-ghost btn-compact"
            onClick={() => {
              onClearSaved?.()
              clearCanvas()
            }}
          >
            Re-sign
          </button>
        </div>
      </div>
    )
  }

  if (existingMark && disabled) {
    return (
      <div className="signature-pad signature-pad-readonly">
        <p className="signature-pad-label">{label}</p>
        <div className="signature-pad-saved">
          <img src={existingMark} alt="Signature" />
        </div>
      </div>
    )
  }

  return (
    <div className={`signature-pad${disabled ? ' is-disabled' : ''}`}>
      <p className="signature-pad-label">{label}</p>
      <canvas
        ref={canvasRef}
        className="signature-pad-canvas"
        onPointerDown={startDraw}
        onPointerMove={moveDraw}
        onPointerUp={endDraw}
        onPointerLeave={endDraw}
        onPointerCancel={endDraw}
      />
      <div className="signature-pad-actions">
        <button
          type="button"
          className="btn btn-ghost btn-compact"
          disabled={disabled || !hasStroke}
          onClick={clearCanvas}
        >
          Clear
        </button>
        <button
          type="button"
          className="btn btn-primary btn-compact"
          disabled={disabled || !hasStroke}
          onClick={accept}
        >
          Use this signature
        </button>
      </div>
    </div>
  )
}
