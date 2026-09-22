import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils'
import type { CourseBlock } from '@/types'
import { previewMetaString, parsePreviewNumbers } from './previewHelpers'

export function PreviewChartBlock({ block, accentColor }: { block: CourseBlock; accentColor: string }) {
  const chartType = previewMetaString(block, 'chartType', 'bar')
  const title = previewMetaString(block, 'chartTitle', block.title || 'Chart')
  const axisLabels = previewMetaString(block, 'axisLabels')
  const rawData = previewMetaString(block, 'data')

  // Parse data — supports JSON [{label,value},...] or legacy space/comma-separated numbers
  const chartData: { label: string; value: number }[] = (() => {
    try {
      const parsed = JSON.parse(rawData)
      if (Array.isArray(parsed)) {
        const mapped = parsed
          .map((item: unknown, i: number) => {
            const obj = item as Record<string, unknown>
            return { label: String(obj?.label ?? obj?.name ?? `Item ${i + 1}`), value: Number(obj?.value ?? obj?.y ?? 0) }
          })
          .filter((item) => Number.isFinite(item.value))
          .slice(0, 12)
        if (mapped.length) return mapped
      }
    } catch {
      // fall through to number parsing
    }
    const numbers = parsePreviewNumbers(rawData).slice(0, 12)
    if (numbers.length) return numbers.map((v, i) => ({ label: `Item ${i + 1}`, value: v }))
    return [
      { label: 'Item 1', value: 40 },
      { label: 'Item 2', value: 70 },
      { label: 'Item 3', value: 55 },
    ]
  })()

  if (chartType === 'pie') return <PreviewPieChart data={chartData} title={title} accentColor={accentColor} />
  if (chartType === 'line') return <PreviewLineChart data={chartData} title={title} accentColor={accentColor} axisLabels={axisLabels} />
  return <PreviewBarChart data={chartData} title={title} accentColor={accentColor} axisLabels={axisLabels} />
}

function PreviewBarChart({
  data,
  title,
  accentColor,
  axisLabels,
}: {
  data: { label: string; value: number }[]
  title: string
  accentColor: string
  axisLabels: string
}) {
  const [mounted, setMounted] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const max = Math.max(...data.map((d) => d.value), 1)

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 60)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      <h3 className="mb-1 text-2xl font-bold">{title}</h3>
      {axisLabels && <p className="mb-3 text-xs text-[var(--lux-muted)]">{axisLabels}</p>}
      <div className="relative flex h-52 items-end gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-4 pb-4 pt-6">
        {data.map((item, index) => {
          const heightPct = Math.max(6, (item.value / max) * 100)
          const isHovered = hoveredIndex === index
          return (
            <div
              key={index}
              className="relative flex h-full flex-1 flex-col items-center justify-end"
              onMouseEnter={() => setHoveredIndex(index)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              {isHovered && (
                <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-2 flex -translate-x-1/2 flex-col items-center whitespace-nowrap rounded-md border border-[var(--lux-line)] bg-[var(--lux-bg-alt)] px-2.5 py-1.5 text-xs shadow-xl">
                  <span className="font-semibold text-[var(--lux-text)]">{item.label}</span>
                  <span className="font-bold" style={{ color: accentColor }}>{item.value}</span>
                </div>
              )}
              <span
                className="w-full rounded-t"
                style={{
                  height: mounted ? `${heightPct}%` : '4px',
                  background: isHovered ? accentColor : `${accentColor}CC`,
                  transition: `height 0.65s cubic-bezier(0.34,1.2,0.64,1) ${index * 55}ms, background 0.15s ease`,
                }}
              />
            </div>
          )
        })}
      </div>
      <div className="mt-1 flex gap-2 px-4">
        {data.map((item, index) => (
          <span key={index} className="flex-1 truncate text-center text-[10px] text-[var(--lux-muted)]">{item.label}</span>
        ))}
      </div>
    </section>
  )
}

function PreviewLineChart({
  data,
  title,
  accentColor,
  axisLabels,
}: {
  data: { label: string; value: number }[]
  title: string
  accentColor: string
  axisLabels: string
}) {
  const [mounted, setMounted] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  const W = 400
  const H = 180
  const PAD_L = 32
  const PAD_T = 16
  const PAD_R = 16
  const PAD_B = 16
  const innerW = W - PAD_L - PAD_R
  const innerH = H - PAD_T - PAD_B

  const vals = data.map((d) => d.value)
  const max = Math.max(...vals, 1)
  const min = Math.min(...vals, 0)
  const range = max - min || 1

  const points = data.map((item, i) => ({
    x: PAD_L + (i / Math.max(data.length - 1, 1)) * innerW,
    y: PAD_T + (1 - (item.value - min) / range) * innerH,
    label: item.label,
    value: item.value,
  }))

  const polylineStr = points.map((p) => `${p.x},${p.y}`).join(' ')
  const areaStr = [`${PAD_L},${PAD_T + innerH}`, ...points.map((p) => `${p.x},${p.y}`), `${PAD_L + innerW},${PAD_T + innerH}`].join(' ')
  const approxLength = points.length > 1
    ? points.slice(1).reduce((sum, p, i) => {
        const dx = p.x - points[i].x
        const dy = p.y - points[i].y
        return sum + Math.sqrt(dx * dx + dy * dy)
      }, 0)
    : 500

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 80)
    return () => window.clearTimeout(id)
  }, [])

  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      <h3 className="mb-1 text-2xl font-bold">{title}</h3>
      {axisLabels && <p className="mb-3 text-xs text-[var(--lux-muted)]">{axisLabels}</p>}
      <div className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-2">
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full" style={{ height: 180 }} aria-label={title}>
          {[0.25, 0.5, 0.75, 1].map((t) => (
            <line
              key={t}
              x1={PAD_L} y1={PAD_T + (1 - t) * innerH}
              x2={PAD_L + innerW} y2={PAD_T + (1 - t) * innerH}
              stroke="#222B3A" strokeWidth={1}
            />
          ))}
          <polygon points={areaStr} fill={`${accentColor}18`} />
          <polyline
            points={polylineStr}
            fill="none"
            stroke={accentColor}
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{
              strokeDasharray: approxLength,
              strokeDashoffset: mounted ? 0 : approxLength,
              transition: 'stroke-dashoffset 0.9s cubic-bezier(0.4,0,0.2,1)',
            }}
          />
          {points.map((point, index) => {
            const isHovered = hoveredIndex === index
            const ttX = Math.min(Math.max(point.x, PAD_L + 42), PAD_L + innerW - 42)
            const ttY = point.y - 12
            return (
              <g key={index}>
                <circle
                  cx={point.x} cy={point.y}
                  r={isHovered ? 6 : 4}
                  fill={isHovered ? accentColor : '#161C27'}
                  stroke={accentColor}
                  strokeWidth={2}
                  style={{ transition: 'r 0.15s ease, fill 0.15s ease' }}
                />
                {/* Wider invisible hit area */}
                <circle cx={point.x} cy={point.y} r={18} fill="transparent"
                  onMouseEnter={() => setHoveredIndex(index)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
                {isHovered && (
                  <g>
                    <rect x={ttX - 40} y={ttY - 34} width={80} height={34} rx={5} fill="#0B0F16" stroke="#313847" strokeWidth={1} />
                    <text x={ttX} y={ttY - 19} textAnchor="middle" fontSize={9} fill="#C6CFDA">{point.label}</text>
                    <text x={ttX} y={ttY - 5} textAnchor="middle" fontSize={12} fontWeight="bold" fill={accentColor}>{point.value}</text>
                  </g>
                )}
              </g>
            )
          })}
        </svg>
      </div>
      <div className="mt-1 flex gap-1 px-2">
        {data.map((item, index) => (
          <span key={index} className="flex-1 truncate text-center text-[10px] text-[var(--lux-muted)]">{item.label}</span>
        ))}
      </div>
    </section>
  )
}

function PreviewPieChart({
  data,
  title,
  accentColor,
}: {
  data: { label: string; value: number }[]
  title: string
  accentColor: string
}) {
  const [mounted, setMounted] = useState(false)
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)

  useEffect(() => {
    const id = window.setTimeout(() => setMounted(true), 80)
    return () => window.clearTimeout(id)
  }, [])

  const total = data.reduce((sum, d) => sum + Math.max(0, d.value), 0) || 1
  const R = 80
  const IR = 46
  const CX = 100
  const CY = 100

  // First segment uses accentColor; rest use evenly-spaced HSL hues
  const palette = data.map((_, i) => (i === 0 ? accentColor : `hsl(${(150 + i * 47) % 360}, 60%, 58%)`))

  const arcs = data.map((item, i) => {
    const startAngle =
      -Math.PI / 2 +
      data
        .slice(0, i)
        .reduce((angle, previous) => angle + (Math.max(0, previous.value) / total) * 2 * Math.PI, 0)
    const slice = (Math.max(0, item.value) / total) * 2 * Math.PI
    const endAngle = startAngle + slice
    const midAngle = startAngle + slice / 2
    const expand = mounted && hoveredIndex === i ? 8 : 0
    const ox = expand * Math.cos(midAngle)
    const oy = expand * Math.sin(midAngle)

    const x1 = CX + ox + R * Math.cos(startAngle)
    const y1 = CY + oy + R * Math.sin(startAngle)
    const x2 = CX + ox + R * Math.cos(endAngle)
    const y2 = CY + oy + R * Math.sin(endAngle)
    const ix1 = CX + ox + IR * Math.cos(startAngle)
    const iy1 = CY + oy + IR * Math.sin(startAngle)
    const ix2 = CX + ox + IR * Math.cos(endAngle)
    const iy2 = CY + oy + IR * Math.sin(endAngle)
    const largeArc = slice > Math.PI ? 1 : 0
    const path = `M ${ix1} ${iy1} L ${x1} ${y1} A ${R} ${R} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${IR} ${IR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`

    return { path, color: palette[i], item }
  })

  const hovered = hoveredIndex !== null ? data[hoveredIndex] : null
  const pct = hovered ? Math.round((Math.max(0, hovered.value) / total) * 100) : null

  return (
    <section className="border-t border-[var(--lux-line)] pt-5">
      <h3 className="mb-4 text-2xl font-bold">{title}</h3>
      <div className="flex flex-wrap items-center gap-6 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
        <div className="relative shrink-0">
          <svg viewBox="0 0 200 200" width={200} height={200} aria-label={title}>
            <g style={{
              transformOrigin: '100px 100px',
              transform: mounted ? 'scale(1)' : 'scale(0)',
              transition: 'transform 0.6s cubic-bezier(0.34,1.4,0.64,1)',
            }}>
              {arcs.map((arc, i) => (
                <path
                  key={i}
                  d={arc.path}
                  fill={arc.color}
                  style={{ transition: 'transform 0.18s ease', transformOrigin: '100px 100px' }}
                  onMouseEnter={() => setHoveredIndex(i)}
                  onMouseLeave={() => setHoveredIndex(null)}
                />
              ))}
            </g>
            {hovered ? (
              <>
                <text x="100" y="93" textAnchor="middle" fontSize="20" fontWeight="bold" fill="white">{hovered.value}</text>
                <text x="100" y="108" textAnchor="middle" fontSize="9" fill="#96A0AF">{hovered.label}</text>
                <text x="100" y="122" textAnchor="middle" fontSize="11" fontWeight="bold" fill={accentColor}>{pct}%</text>
              </>
            ) : (
              <text x="100" y="105" textAnchor="middle" fontSize="10" fill="#96A0AF">Hover to inspect</text>
            )}
          </svg>
        </div>
        <ul className="flex min-w-0 flex-1 flex-col gap-1">
          {data.map((item, i) => (
            <li
              key={i}
              className="flex cursor-default items-center gap-2 rounded px-2 py-1 text-sm transition"
              style={{ background: hoveredIndex === i ? `${palette[i]}20` : 'transparent' }}
              onMouseEnter={() => setHoveredIndex(i)}
              onMouseLeave={() => setHoveredIndex(null)}
            >
              <span className="h-3 w-3 shrink-0 rounded-sm" style={{ background: palette[i] }} />
              <span className={cn('min-w-0 truncate', hoveredIndex === i ? 'font-bold text-[var(--lux-text-strong)]' : 'text-[var(--lux-text)]')}>{item.label}</span>
              <span className="ml-auto shrink-0 font-semibold" style={{ color: hoveredIndex === i ? palette[i] : '#96A0AF' }}>{item.value}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
