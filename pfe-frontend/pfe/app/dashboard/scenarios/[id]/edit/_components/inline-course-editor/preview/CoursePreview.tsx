import { useEffect, useMemo, useState } from 'react'
import { Download, GitBranch, X, Moon, Sun } from 'lucide-react'
import { toast } from 'react-hot-toast'
import { SidebarToggleButton } from '@/components/layout/SidebarToggleButton'
import { cn } from '@/lib/utils'
import { getApiErrorMessage, scormApi } from '@/lib/api'
import type { CourseDocument, CoursePage } from '@/types'
import {
  branchingDecisionBlockTypes,
} from '../courseEditorModel'
import { PreviewPage } from './PreviewPage'
import { previewLessonToPage } from './previewHelpers'
import { COURSE_THEME_PRESETS, updateCourseTheme } from '../shared/courseTheme'
import { uploadedAssetUrl } from '../shared/mediaHelpers'

function pageHasBranchingContent(page: CoursePage): boolean {
  return (page.blocks ?? []).some((block) => branchingDecisionBlockTypes.includes(block.type))
}

export function CoursePreview({
  document,
  scenarioId,
  onClose,
  onUpdateDocument,
  onSaveBeforeExport,
}: {
  document: CourseDocument
  scenarioId?: string
  onClose: () => void
  onUpdateDocument: (updater: (document: CourseDocument) => CourseDocument) => void
  onSaveBeforeExport: () => Promise<boolean>
}) {
  const [exporting, setExporting] = useState(false)
  const pages = useMemo(() => document.pages.length ? document.pages : (document.lessons ?? []).map(previewLessonToPage), [document.lessons, document.pages])
  const [currentPageIndex, setCurrentPageIndex] = useState(0)
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    if (typeof window === 'undefined') return false
    return window.localStorage.getItem('course-preview-sidebar') === 'collapsed'
  })
  const accentColor = document.theme?.accentColor ?? '#0F6B4A'
  const previewMode = document.theme?.themeMode ?? 'dark'
  const courseCoverImageUrl = document.theme?.coverImageUrl ? uploadedAssetUrl(document.theme.coverImageUrl) : ''
  const activePageIndex = Math.min(currentPageIndex, Math.max(0, pages.length - 1))
  const currentPage = pages[activePageIndex]
  const previousPage = activePageIndex > 0 ? pages[activePageIndex - 1] : null
  const nextPage = activePageIndex < pages.length - 1 ? pages[activePageIndex + 1] : null

  const openPage = (index: number) => {
    if (!pages.length) return
    setCurrentPageIndex(Math.max(0, Math.min(index, pages.length - 1)))
  }

  useEffect(() => {
    window.localStorage.setItem('course-preview-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded')
  }, [sidebarCollapsed])

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-3 backdrop-blur-sm sm:p-5 lux-scrollbar" data-preview-theme={previewMode}>
      <div className="mx-auto max-w-7xl overflow-hidden rounded-lg border border-[var(--lux-line)] bg-[var(--lux-bg)] text-[var(--lux-text-strong)] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[var(--lux-line)] bg-[var(--lux-surface)] px-5 py-4">
          <div className="min-w-0">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[var(--lux-primary-muted)]">Export preview</p>
            <h1 className="mt-1 truncate text-xl font-bold">{document.title}</h1>
            {document.description?.trim() && (
            <p className="mt-1 max-w-xl truncate text-xs text-[var(--lux-muted)]">{document.description}</p>
            )}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center gap-1.5 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-2.5 py-1.5" title="Change preview theme">
              {COURSE_THEME_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => onUpdateDocument((current) => updateCourseTheme(current, { accentColor: preset.accent }))}
                  title={`${preset.label} theme`}
                  aria-label={`Switch to ${preset.label} theme`}
                  className="h-4 w-4 rounded-full transition-transform hover:scale-125 focus:outline-none"
                  style={{
                    background: preset.accent,
                    boxShadow: accentColor === preset.accent
                      ? `0 0 0 2px var(--lux-surface), 0 0 0 3.5px ${preset.accent}`
                      : 'none',
                  }}
                />
              ))}
            </div>
            <button
              type="button"
              onClick={() => onUpdateDocument((current) => updateCourseTheme(current, { themeMode: previewMode === 'dark' ? 'light' : 'dark' }))}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] text-[var(--lux-text-strong)] transition-colors hover:bg-[var(--lux-elevated)]"
              title={`Switch to ${previewMode === 'dark' ? 'light' : 'dark'} mode`}
              aria-label={`Switch to ${previewMode === 'dark' ? 'light' : 'dark'} mode`}
            >
              {previewMode === 'dark' ? <Sun size={15} /> : <Moon size={15} />}
            </button>
            <button
              type="button"
              onClick={async () => {
                if (!scenarioId) {
                  toast.error('Save the course before exporting.')
                  return
                }
                setExporting(true)
                try {
                  const saved = await onSaveBeforeExport()
                  if (!saved) {
                    toast.error('Could not save the latest changes. Please retry before exporting.')
                    return
                  }
                  const response = await scormApi.export(scenarioId)
                  const url = URL.createObjectURL(response.data)
                  const a = window.document.createElement('a')
                  a.href = url
                  a.download = `${document.title.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.zip`
                  window.document.body.appendChild(a)
                  a.click()
                  window.document.body.removeChild(a)
                  URL.revokeObjectURL(url)
                } catch (error) {
                  toast.error(getApiErrorMessage(error, 'SCORM export failed'))
                } finally {
                  setExporting(false)
                }
              }}
              disabled={exporting || !scenarioId}
              className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-[var(--lux-line)] bg-[var(--lux-primary)] px-3 text-xs font-semibold text-[var(--lux-text-strong)] transition-colors hover:bg-[var(--lux-primary-hover)] disabled:cursor-not-allowed disabled:opacity-60"
              title="Download SCORM package"
              aria-label="Download SCORM package"
            >
              <Download size={14} />
              {exporting ? 'Exporting…' : 'Download'}
            </button>
            <button type="button" onClick={onClose} className="grid h-9 w-9 place-items-center rounded-full text-[var(--lux-muted)] hover:bg-[var(--lux-overlay-hover)] hover:text-[var(--lux-text-strong)]" aria-label="Close preview">
              <X size={18} />
            </button>
          </div>
        </div>
        <div
          className={cn(
            'grid h-[calc(100vh-8rem)] min-h-[520px] grid-rows-[minmax(140px,22vh)_minmax(0,1fr)] overflow-hidden lg:min-h-[620px] lg:grid-rows-1',
            sidebarCollapsed ? 'lg:grid-cols-[76px_minmax(0,1fr)]' : 'lg:grid-cols-[280px_minmax(0,1fr)]',
          )}
        >
          <aside
            className={cn(
              'flex min-h-0 flex-col border-b border-[var(--lux-line)] bg-[var(--lux-surface)] transition-all duration-300 ease-in-out lg:border-b-0 lg:border-r',
              sidebarCollapsed ? 'p-2 lg:p-3' : 'p-4',
            )}
          >
            <div className={cn('flex items-center gap-2', sidebarCollapsed ? 'justify-center' : 'justify-between')}>
              {!sidebarCollapsed && (
                <div
                  className={cn(
                    'min-w-0 flex-1 overflow-hidden rounded-lg border border-[var(--lux-line)] p-4',
                    courseCoverImageUrl ? 'bg-cover bg-center' : 'bg-[var(--lux-surface-soft)]',
                  )}
                  style={courseCoverImageUrl ? { backgroundImage: `linear-gradient(rgba(5, 12, 14, 0.52), rgba(5, 12, 14, 0.52)), url(${courseCoverImageUrl})` } : undefined}
                >
                  <p className={cn('text-sm font-extrabold leading-snug', courseCoverImageUrl && 'text-white drop-shadow')}>{document.title}</p>
                  {document.description?.trim() && (
                    <p className={cn(
                      'mt-2 line-clamp-4 text-xs leading-5',
                      courseCoverImageUrl ? 'text-white/80 drop-shadow' : 'text-[var(--lux-muted)]',
                    )}>
                      {document.description}
                    </p>
                  )}
                </div>
              )}
              <SidebarToggleButton
                direction={sidebarCollapsed ? 'expand' : 'collapse'}
                label={sidebarCollapsed ? 'Expand preview navigation' : 'Collapse preview navigation'}
                shortcut="Ctrl+["
                onClick={() => setSidebarCollapsed((current) => !current)}
                className={sidebarCollapsed ? 'shrink-0' : 'shrink-0 self-start'}
              />
            </div>
            <div className={cn('min-h-0 flex-1 space-y-2 overflow-y-auto lux-scrollbar', sidebarCollapsed ? 'mt-3 pr-0' : 'mt-4 pr-1')}>
              {pages.map((page, index) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => openPage(index)}
                  aria-label={`Go to page ${index + 1}: ${page.title}`}
                  className={cn(
                    'group relative flex w-full items-center rounded-lg border text-left text-sm transition-all duration-200',
                    sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'gap-3 px-3 py-2',
                    index === activePageIndex
                      ? `border-[var(--lux-primary-muted)]/40 bg-[var(--lux-primary)]/25 text-[var(--lux-text-strong)]`
                      : 'border-transparent text-[var(--lux-muted)] hover:border-[var(--lux-primary-muted)]/25 hover:text-[var(--lux-text-strong)]',
                  )}
                >
                  <span className="relative grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[var(--lux-elevated)] text-xs font-bold text-[var(--lux-text-strong)]">
                    {index + 1}
                    {pageHasBranchingContent(page) && (
                      <GitBranch
                        size={9}
                        strokeWidth={2.5}
                        className="absolute -bottom-1 -right-1 rounded-full bg-[var(--lux-primary)] p-[1.5px] text-white"
                      />
                    )}
                  </span>
                  <span
                    className={cn(
                      'transition-all duration-200 ease-in-out whitespace-nowrap overflow-hidden',
                      sidebarCollapsed ? 'max-w-0 opacity-0 w-0' : 'max-w-xs opacity-100 min-w-0 truncate flex-1',
                    )}
                  >
                    {page.title}
                  </span>
                  {sidebarCollapsed && (
                    <div className="pointer-events-none fixed left-[88px] z-50 hidden group-hover:flex group-focus-visible:flex items-center animate-in fade-in zoom-in-95 duration-150">
                      <div className="flex items-center gap-1.5 whitespace-nowrap rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface)] px-3 py-1.5 text-xs font-bold text-[var(--lux-text-strong)] shadow-xl">
                        {pageHasBranchingContent(page) && <GitBranch size={11} className="shrink-0 text-[var(--lux-primary-muted)]" />}
                        {page.title}
                      </div>
                    </div>
                  )}
                </button>
              ))}
            </div>
          </aside>
          <div className="overflow-y-auto bg-[var(--lux-bg)] p-4 sm:p-7 lux-scrollbar">
            {currentPage ? (
              <PreviewPage
                page={currentPage}
                pageNumber={activePageIndex + 1}
                totalPages={pages.length}
                accentColor={accentColor}
                previousLesson={previousPage ? { number: activePageIndex, title: previousPage.title } : null}
                nextLesson={nextPage ? { number: activePageIndex + 2, title: nextPage.title } : null}
                onOpenPreviousLesson={() => openPage(activePageIndex - 1)}
                onOpenNextLesson={() => openPage(activePageIndex + 1)}
                onOpenLessonById={(lessonId) => {
                  const destinationIndex = pages.findIndex((page) => page.id === lessonId)
                  if (destinationIndex >= 0) openPage(destinationIndex)
                }}
                getLessonTitle={(lessonId) => pages.find((page) => page.id === lessonId)?.title ?? 'Course item'}
              />
            ) : (
              <section className="mx-auto grid min-h-[420px] w-full max-w-[940px] place-items-center rounded-lg border border-[var(--lux-line)] bg-[var(--lux-surface-soft)] p-8 text-center text-[var(--lux-muted)]">
                No course pages yet.
              </section>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
