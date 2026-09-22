import type { CourseBlock } from '@/types'
import { statementStyleLabel } from '../preview/PreviewStatementBlock'
import { inputClass, selectClass } from '../shared/editorStyles'
import { Field } from '../shared/uiPrimitives'

export function MetadataFields({
  block,
  onChange,
}: {
  block: CourseBlock
  onChange: (key: string, value: unknown) => void
}) {
  const metadata = block.metadata ?? {}
  const fields: Array<{ key: string; label: string; type?: 'text' | 'number' | 'boolean' | 'select'; options?: string[] }> = []

  if (block.type === 'heading') fields.push({ key: 'subtitle', label: 'Subtitle' }, { key: 'level', label: 'Level', type: 'select', options: ['H1', 'H2', 'H3'] })
  if (block.type === 'callout') fields.push({ key: 'style', label: 'Style', type: 'select', options: ['Info', 'Warning', 'Tip', 'Note'] })
  if (block.type === 'statement') fields.push({ key: 'style', label: 'Style', type: 'select', options: ['Info', 'Warning', 'Tip', 'Note'] })
  if (block.type === 'quote') fields.push({ key: 'layout', label: 'Layout', type: 'select', options: ['standard'] }, { key: 'alignment', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] }, { key: 'spacing', label: 'Spacing', type: 'select', options: ['compact', 'normal', 'wide'] }, { key: 'showQuoteMark', label: 'Quote mark', type: 'boolean' }, { key: 'showAvatar', label: 'Avatar', type: 'boolean' }, { key: 'avatarUrl', label: 'Avatar URL' })
  if (block.type === 'divider') fields.push({ key: 'label', label: 'Label' }, { key: 'style', label: 'Style', type: 'select', options: ['solid', 'dashed', 'dotted'] })
  if (block.type === 'image') fields.push({ key: 'caption', label: 'Caption' }, { key: 'alt', label: 'Alt text' }, { key: 'width', label: 'Width', type: 'select', options: ['small', 'medium', 'full'] })
  if (block.type === 'image_gallery') fields.push({ key: 'layout', label: 'Layout', type: 'select', options: ['2-col grid', '3-col grid', 'carousel'] })
  if (block.type === 'video') fields.push({ key: 'autoplay', label: 'Autoplay', type: 'boolean' }, { key: 'caption', label: 'Caption' })
  if (block.type === 'audio') fields.push({ key: 'transcript', label: 'Transcript' })
  if (block.type === 'dialogue' || block.type === 'branching_dialogue') fields.push({ key: 'bubbleStyle', label: 'Speech bubble style', type: 'select', options: ['Chat', 'Screenplay', 'Comic Strip'] })
  if (block.type === 'character_monologue') fields.push({ key: 'characterName', label: 'Character name' }, { key: 'avatarUrl', label: 'Avatar URL' }, { key: 'emotion', label: 'Emotion', type: 'select', options: ['happy', 'neutral', 'concerned', 'angry', 'surprised'] }, { key: 'alignment', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] })
  if (block.type === 'fill_blank') fields.push({ key: 'acceptedAnswers', label: 'Accepted answers' }, { key: 'caseSensitive', label: 'Case sensitive', type: 'boolean' })
  if (block.type === 'true_false') fields.push({ key: 'correctAnswer', label: 'Correct answer', type: 'select', options: ['True', 'False'] }, { key: 'explanation', label: 'Explanation' })
  if (block.type === 'hotspot') fields.push({ key: 'imageUrl', label: 'Image URL' }, { key: 'regions', label: 'Hotspot regions' })
  if (block.type === 'short_answer') fields.push({ key: 'keywords', label: 'Keyword list' }, { key: 'manualReview', label: 'Manual review', type: 'boolean' })
  if (block.type === 'likert') fields.push({ key: 'scaleSize', label: 'Scale size', type: 'select', options: ['5', '7'] }, { key: 'lowLabel', label: 'Low label' }, { key: 'highLabel', label: 'High label' })
  if (block.type === 'rating_slider') fields.push({ key: 'min', label: 'Min', type: 'number' }, { key: 'max', label: 'Max', type: 'number' }, { key: 'step', label: 'Step', type: 'number' }, { key: 'minLabel', label: 'Min label' }, { key: 'maxLabel', label: 'Max label' })
  if (block.type === 'conditional_gate') fields.push({ key: 'conditionType', label: 'Condition type', type: 'select', options: ['passed quiz', 'viewed lesson', 'answered question correctly'] }, { key: 'target', label: 'Target lesson or quiz' }, { key: 'lockedMessage', label: 'Locked message' })
  if (block.type === 'timeline') fields.push({ key: 'orientation', label: 'Orientation', type: 'select', options: ['horizontal', 'vertical'] })
  if (block.type === 'checklist') fields.push({ key: 'showProgress', label: 'Show progress', type: 'boolean' })
  if (block.type === 'reveal') fields.push({ key: 'triggerLabel', label: 'Trigger label' }, { key: 'hiddenContent', label: 'Hidden content' })
  if (block.type === 'accordion') fields.push({ key: 'behavior', label: 'Open behavior', type: 'select', options: ['single', 'multiple'] })
  if (block.type === 'tabs') fields.push({ key: 'overflowArrows', label: 'Overflow arrows', type: 'boolean' })
  if (block.type === 'flashcards') fields.push({ key: 'layout', label: 'Layout', type: 'select', options: ['grid', 'stack'] }, { key: 'imageSide', label: 'Image side', type: 'select', options: ['front', 'back'] }, { key: 'clickPrompt', label: 'Flip prompt' })
  if (block.type === 'sorting_activity') fields.push({ key: 'instructions', label: 'Instructions' }, { key: 'completionMessage', label: 'Completion message' })
  if (block.type === 'before_after') fields.push({ key: 'beforeImage', label: 'Before image' }, { key: 'afterImage', label: 'After image' }, { key: 'beforeLabel', label: 'Before label' }, { key: 'afterLabel', label: 'After label' })
  if (block.type === 'table') fields.push({ key: 'rows', label: 'Rows', type: 'number' }, { key: 'columns', label: 'Columns', type: 'number' }, { key: 'headerRow', label: 'Header row', type: 'boolean' })
  if (block.type === 'chart') fields.push({ key: 'chartType', label: 'Chart type', type: 'select', options: ['bar', 'line', 'pie'] }, { key: 'axisLabels', label: 'Axis labels' }, { key: 'chartTitle', label: 'Chart title' })
  if (block.type === 'resource_link') fields.push({ key: 'url', label: 'URL' }, { key: 'icon', label: 'Icon' })
  if (block.type === 'file_download') fields.push({ key: 'fileUrl', label: 'File URL' }, { key: 'label', label: 'Display label' }, { key: 'description', label: 'Description' })
  if (block.type === 'glossary') fields.push({ key: 'term', label: 'Term' }, { key: 'definition', label: 'Definition' }, { key: 'example', label: 'Example sentence' })
  if (block.type === 'process_steps') fields.push({ key: 'introTitle', label: 'Intro title' }, { key: 'introText', label: 'Intro text' }, { key: 'introImageUrl', label: 'Intro image URL' }, { key: 'startLabel', label: 'Start button' }, { key: 'summaryTitle', label: 'Summary title' }, { key: 'summaryText', label: 'Summary text' }, { key: 'restartLabel', label: 'Restart button' })
  if (block.type === 'continue_button') fields.push({ key: 'label', label: 'Button label' }, { key: 'completionType', label: 'Completion type', type: 'select', options: ['None', 'Complete Block Directly Above', 'Complete All Blocks Above'] }, { key: 'lockedHint', label: 'Locked hint' }, { key: 'unlockedHint', label: 'Unlocked hint' }, { key: 'alignment', label: 'Alignment', type: 'select', options: ['left', 'center', 'right'] })
  if (block.type === 'score_summary') fields.push({ key: 'sourceQuiz', label: 'Source quiz' }, { key: 'passMessage', label: 'Pass message' }, { key: 'failMessage', label: 'Fail message' })
  if (block.type === 'certificate') fields.push({ key: 'logoUrl', label: 'Logo URL' }, { key: 'signatureUrl', label: 'Signature URL' })
  if (block.type === 'completion_message') fields.push({ key: 'imageUrl', label: 'Optional image' })
  if (block.type === 'restart_button') fields.push({ key: 'label', label: 'Button label' }, { key: 'scope', label: 'Scope', type: 'select', options: ['entire course', 'current lesson only'] })

  if (!fields.length) return null

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {fields.map((field) => (
        <Field key={field.key} label={field.label}>
          {field.type === 'boolean' ? (
            <label className="inline-flex h-10 items-center gap-2 text-sm text-[var(--lux-muted)]">
              <input type="checkbox" checked={Boolean(metadata[field.key])} onChange={(e) => onChange(field.key, e.target.checked)} />
              Enabled
            </label>
          ) : field.type === 'select' ? (
            <select
              value={field.key === 'style' && (block.type === 'callout' || block.type === 'statement')
                ? statementStyleLabel(String(metadata[field.key] ?? field.options?.[0] ?? 'Info'))
                : String(metadata[field.key] ?? field.options?.[0] ?? '')}
              onChange={(e) => onChange(field.key, e.target.value)}
              className={selectClass}
            >
              {(field.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
            </select>
          ) : (
            <input
              type={field.type === 'number' ? 'number' : 'text'}
              value={String(metadata[field.key] ?? '')}
              onChange={(e) => onChange(field.key, field.type === 'number' ? Number(e.target.value) : e.target.value)}
              className={inputClass}
            />
          )}
        </Field>
      ))}
    </div>
  )
}
