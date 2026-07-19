import { useRef } from 'react'

// A skeuomorphic rotary knob. Drag up/down (or scroll) to turn. 0..1.
export default function Knob({
  value,
  onChange,
  label,
  size = 46,
  color = '#ff2e9a',
}: {
  value: number
  onChange: (v: number) => void
  label: string
  size?: number
  color?: string
}) {
  const dragRef = useRef<{ y: number; v: number } | null>(null)
  const angle = -135 + value * 270

  const onPointerDown = (e: React.PointerEvent) => {
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
    dragRef.current = { y: e.clientY, v: value }
  }
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current) return
    const dy = dragRef.current.y - e.clientY
    onChange(Math.max(0, Math.min(1, dragRef.current.v + dy / 140)))
  }
  const onPointerUp = () => {
    dragRef.current = null
  }
  const onWheel = (e: React.WheelEvent) => {
    onChange(Math.max(0, Math.min(1, value - Math.sign(e.deltaY) * 0.06)))
  }

  return (
    <div className="knob-wrap" style={{ width: size }}>
      <div
        className="knob-body"
        style={{ width: size, height: size, ['--kc' as any]: color }}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onWheel={onWheel}
        role="slider"
        aria-label={label}
        aria-valuenow={Math.round(value * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
        tabIndex={0}
      >
        <div className="knob-indicator" style={{ transform: `rotate(${angle}deg)` }} />
        <div className="knob-cap" />
      </div>
      <span className="knob-label">{label}</span>
    </div>
  )
}
