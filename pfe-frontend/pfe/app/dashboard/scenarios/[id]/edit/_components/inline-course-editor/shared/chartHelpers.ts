export function chartDataToString(items: ChartDataItem[]): string {
  return JSON.stringify(items.map((item) => ({ label: item.label, value: item.value })))
}

export interface ChartDataItem {
  id: string
  label: string
  value: number
}

interface ParsedChartDataItem {
  label: string
  value: number
}

function parseChartData(value: unknown): ParsedChartDataItem[] {
  if (Array.isArray(value)) {
    return value
      .map((item, index) => {
        if (item && typeof item === 'object') {
          const record = item as Record<string, unknown>
          const rawValue = Number(record.value)
          return {
            label: String(record.label ?? record.name ?? `Item ${index + 1}`).slice(0, 30),
            value: Number.isFinite(rawValue) ? rawValue : 0,
          }
        }
        const rawValue = Number(item)
        return {
          label: `Item ${index + 1}`,
          value: Number.isFinite(rawValue) ? rawValue : 0,
        }
      })
      .filter((item) => item.label.trim() || item.value > 0)
      .slice(0, 12)
  }

  if (typeof value !== 'string' || !value.trim()) return []

  try {
    const parsed = JSON.parse(value)
    if (Array.isArray(parsed)) return parseChartData(parsed)
  } catch {
    // Fall through to plain text parsing.
  }

  return value
    .split(/\n|;/)
    .map((line, index) => {
      const trimmed = line.trim()
      if (!trimmed) return null
      const parts = trimmed.split(/,|\t|:/).map((part) => part.trim())
      const rawValue = Number(parts[1] ?? parts[0])
      return {
        label: (parts[1] ? parts[0] : `Item ${index + 1}`).slice(0, 30),
        value: Number.isFinite(rawValue) ? rawValue : 0,
      }
    })
    .filter((item): item is ParsedChartDataItem => Boolean(item))
    .slice(0, 12)
}

export function chartItemsForEditor(raw: unknown): ChartDataItem[] {
  const parsed = parseChartData(raw)
  const source = parsed.length
    ? parsed
    : [
        { label: 'Item 1', value: 40 },
        { label: 'Item 2', value: 70 },
        { label: 'Item 3', value: 55 },
      ]

  return source.slice(0, 12).map((item, index) => ({
    id: `chart-item-${index}`,
    label: item.label,
    value: item.value,
  }))
}
