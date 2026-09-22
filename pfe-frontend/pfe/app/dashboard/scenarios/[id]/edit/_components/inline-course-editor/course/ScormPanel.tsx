import { useState } from 'react'
import { toast } from 'react-hot-toast'
import { Button } from '@/components/ui/Button'
import { getApiErrorMessage, scormApi } from '@/lib/api'
import type { CourseDocument } from '@/types'
import { getScormSettings, type CourseReadiness, type ScormSettings } from '../courseEditorModel'
import { PercentageInput } from './PercentageInput'
import {
  COURSE_THEME_PRESETS,
  DEFAULT_COURSE_THEME,
  updateCourseTheme,
} from '../shared/courseTheme'
import { inputClass } from '../shared/editorStyles'
import { Field, RadioGroup } from '../shared/uiPrimitives'

export function ScormPanel({
  document,
  scenarioId,
  readOnly,
  readiness,
  onUpdateDocument,
  onSaveBeforeExport,
}: {
  document: CourseDocument
  scenarioId?: string
  readOnly: boolean
  readiness: CourseReadiness
  onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void
  onSaveBeforeExport: () => Promise<boolean>
}) {
  const [exporting, setExporting] = useState(false)
  const [exportFormat, setExportFormat] = useState<'scorm' | 'pdf'>('scorm')
  const scorm = getScormSettings(document)
  const updateScorm = (patch: Partial<ScormSettings>) => {
    if (readOnly) return
    onUpdateDocument((current) => ({
      ...current,
      metadata: {
        ...current.metadata,
        scorm: {
          ...getScormSettings(current),
          ...patch,
        } as unknown as Record<string, unknown>,
      },
      settings: {
        ...current.settings,
        passingScore: patch.passingScore ?? current.settings.passingScore,
        scormVersion: patch.version === 'scorm_2004_3rd' ? '2004' : patch.version === 'scorm_1_2' ? '1.2' : current.settings.scormVersion,
      },
    }))
  }

  const downloadExport = (blob: Blob, filename: string) => {
    const url = window.URL.createObjectURL(blob)
    const link = window.document.createElement('a')
    link.href = url
    link.download = filename
    link.style.display = 'none'
    window.document.body.append(link)
    link.click()
    link.remove()
    window.setTimeout(() => window.URL.revokeObjectURL(url), 0)
  }

  const exportScorm = async () => {
    if (!scenarioId) return
    setExporting(true)
    try {
      const response = await scormApi.export(scenarioId)
      downloadExport(response.data, `${scorm.courseIdentifier || 'course'}.zip`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'SCORM export failed'))
    } finally {
      setExporting(false)
    }
  }

  const exportPdf = async () => {
    if (!scenarioId) return
    setExporting(true)
    try {
      const response = await scormApi.exportPdf(scenarioId)
      downloadExport(response.data, `${scorm.courseIdentifier || 'course'}.pdf`)
    } catch (error) {
      toast.error(getApiErrorMessage(error, 'PDF export failed'))
    } finally {
      setExporting(false)
    }
  }

  const onExport = async () => {
    if (!scenarioId) {
      toast.error('Save the course before exporting.')
      return
    }
    if (!readiness.ready) {
      toast.error(`Resolve ${readiness.errors.length} blocking course check${readiness.errors.length === 1 ? '' : 's'} before exporting.`)
      return
    }
    const saved = await onSaveBeforeExport()
    if (!saved) {
      toast.error('Could not save the latest changes. Please retry before exporting.')
      return
    }
    if (exportFormat === 'pdf') {
      await exportPdf()
      return
    }
    await exportScorm()
  }

  return (
    <section className="rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] p-4">
      <h2 className="text-sm font-semibold uppercase text-[var(--lux-muted-soft)]">Export Configuration</h2>
      <fieldset disabled={readOnly}>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <RadioGroup
            label="Export format"
            value={exportFormat}
            options={[['scorm', 'SCORM (.zip)'], ['pdf', 'PDF']]}
            onChange={(value) => setExportFormat(value as 'scorm' | 'pdf')}
          />
          {exportFormat === 'scorm' ? (
            <>
              <RadioGroup label="SCORM Version" value={scorm.version} options={[['scorm_1_2', 'SCORM 1.2'], ['scorm_2004_3rd', 'SCORM 2004 3rd Ed.']]} onChange={(value) => updateScorm({ version: value as ScormSettings['version'] })} />
              <Field label="Passing Score (%)"><PercentageInput value={scorm.passingScore} onCommit={(passingScore) => updateScorm({ passingScore })} /></Field>
              <Field label="Course Identifier"><input value={scorm.courseIdentifier} onChange={(e) => updateScorm({ courseIdentifier: e.target.value })} className={inputClass} /></Field>
              <Field label="Course Title for LMS"><input value={scorm.lmsTitle} onChange={(e) => updateScorm({ lmsTitle: e.target.value })} className={inputClass} /></Field>
              <RadioGroup label="Launch Behavior" value={scorm.launchBehavior} options={[['new_window', 'new window'], ['same_window', 'same window']]} onChange={(value) => updateScorm({ launchBehavior: value as ScormSettings['launchBehavior'] })} />
            </>
          ) : (
            <>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">PDF Theme Mode</p>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={(document.theme?.themeMode ?? 'dark') === 'dark' ? 'primary' : 'secondary'}
                    onClick={() => onUpdateDocument((current) => updateCourseTheme(current, { themeMode: 'dark' }))}
                  >
                    Dark
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={(document.theme?.themeMode ?? 'dark') === 'light' ? 'primary' : 'secondary'}
                    onClick={() => onUpdateDocument((current) => updateCourseTheme(current, { themeMode: 'light' }))}
                  >
                    Light
                  </Button>
                </div>
              </div>
              <div className="space-y-2 sm:col-span-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-[var(--lux-muted-soft)]">PDF Accent Color</p>
                <div className="flex flex-wrap gap-3">
                  {COURSE_THEME_PRESETS.map((preset) => {
                    const active = (document.theme?.accentColor ?? DEFAULT_COURSE_THEME.accentColor) === preset.accent
                    return (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => onUpdateDocument((current) => updateCourseTheme(current, { accentColor: preset.accent }))}
                        className="flex items-center gap-2 rounded-full border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] px-3 py-1.5 text-xs font-semibold"
                      >
                        <span
                          className="h-3 w-3 rounded-full"
                          style={{
                            backgroundColor: preset.accent,
                            boxShadow: active ? `0 0 0 2px ${preset.accent}` : 'none',
                          }}
                        />
                        {preset.label}
                      </button>
                    )
                  })}
                </div>
              </div>
            </>
          )}
        </div>
      </fieldset>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="sm" onClick={onExport} loading={exporting} disabled={!scenarioId}>
          {exportFormat === 'pdf' ? 'Export as PDF' : 'Export as SCORM .zip'}
        </Button>
      </div>
    </section>
  )
}
