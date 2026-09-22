import type { CourseBlock } from '@/types'
import { parsePreviewTable } from './previewHelpers'

export function PreviewTableBlock({ block }: { block: CourseBlock }) {
  const rows = parsePreviewTable(block.content ?? '')
  if (!rows.length) return <pre className="rounded-lg border border-[var(--lux-line)] bg-transparent p-4 text-sm text-[var(--lux-muted)]">{block.content || block.title || 'Table'}</pre>
  return (
    <div className="overflow-x-auto rounded-lg border border-[var(--lux-line)] bg-transparent lux-scrollbar">
      <table className="min-w-full text-left text-sm">
        <tbody>
          {rows.map((row, rowIndex) => (
            <tr key={rowIndex} className="border-b border-[var(--lux-line)] last:border-b-0">
              {row.map((cell, cellIndex) => rowIndex === 0 ? (
                <th key={cellIndex} className="px-3 py-2 font-bold">{cell}</th>
              ) : (
                <td key={cellIndex} className="px-3 py-2 text-[var(--lux-muted)]">{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
