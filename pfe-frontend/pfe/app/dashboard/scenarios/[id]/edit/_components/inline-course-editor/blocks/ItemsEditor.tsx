import { Plus, Trash2 } from 'lucide-react'
import type { CourseBlock, CourseInteractionItem } from '@/types'
import { isQuestionBlock, uid } from '../courseEditorModel'
import { inputClass } from '../shared/editorStyles'
import { Field } from '../shared/uiPrimitives'

export function ItemsEditor({
  block,
  readOnly,
  onUpdateItems,
}: {
  block: CourseBlock
  readOnly: boolean
  onUpdateItems: (items: CourseInteractionItem[]) => void
}) {
  const items = block.items ?? []
  const updateItem = (id: string, patch: Partial<CourseInteractionItem>) => {
    onUpdateItems(items.map((item) => item.id === id ? { ...item, ...patch } : item))
  }

  return (
    <Field label={isQuestionBlock(block.type) ? 'Answer options / pairs' : 'Items'}>
      <div className="space-y-2">
        {items.map((item) => (
              <div key={item.id} className="grid gap-2 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-2 sm:grid-cols-[1fr_1fr_auto]">
            <input value={item.title} onChange={(e) => updateItem(item.id, { title: e.target.value })} placeholder="Item title" className={inputClass} />
            <input value={item.match ?? item.content ?? ''} onChange={(e) => updateItem(item.id, isQuestionBlock(block.type) || block.type === 'matching' ? { content: e.target.value } : { content: e.target.value })} placeholder={block.type === 'matching' ? 'Match' : 'Detail'} className={inputClass} />
            {!readOnly && (
              <button type="button" onClick={() => onUpdateItems(items.filter((next) => next.id !== item.id))} className="grid h-10 w-10 place-items-center rounded-lg text-[var(--lux-muted-soft)] hover:bg-red-500/10 hover:text-red-400">
                <Trash2 size={14} />
              </button>
            )}
          </div>
        ))}
        {!readOnly && (
          <button
            type="button"
            onClick={() => onUpdateItems([...items, { id: uid('item'), title: '', content: '' }])}
            className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--lux-primary-muted)]"
          >
            <Plus size={14} />
            Add item
          </button>
        )}
      </div>
    </Field>
  )
}
