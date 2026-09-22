import { useCallback, useState, type ReactNode } from 'react'
import type { CourseBlock, CoursePage } from '@/types'
import { blockHasContent } from '../courseEditorModel'
import { PreviewBlock } from './PreviewBlock'
import { PreviewContinueBlock } from './PreviewContinueBlock'
import { PreviewLessonHeaderLink, PreviewLessonFooterLink } from './PreviewLessonLinks'
import { PreviewQuiz } from './PreviewQuiz'
import { PreviewScenario } from './PreviewScenario'
import { isPreviewAutoCompleteBlock, previewMetaString } from './previewHelpers'
import { uploadedAssetUrl } from '../shared/mediaHelpers'

export function PreviewPage({
  page,
  pageNumber,
  totalPages,
  accentColor,
  previousLesson,
  nextLesson,
  onOpenPreviousLesson,
  onOpenNextLesson,
  onOpenLessonById,
  getLessonTitle,
}: {
  page: CoursePage
  pageNumber: number
  totalPages: number
  accentColor: string
  previousLesson: { number: number; title: string } | null
  nextLesson: { number: number; title: string } | null
  onOpenPreviousLesson: () => void
  onOpenNextLesson: () => void
  onOpenLessonById: (lessonId: string) => void
  getLessonTitle: (lessonId: string) => string
}) {
  const blocks = page.blocks ?? []
  const [completedBlocks, setCompletedBlocks] = useState<Set<string>>(() => new Set())
  const [revealedContinueBlocks, setRevealedContinueBlocks] = useState<Set<string>>(() => new Set())

  const markBlockComplete = useCallback((blockId: string) => {
    setCompletedBlocks((current) => {
      if (current.has(blockId)) return current
      const next = new Set(current)
      next.add(blockId)
      return next
    })
  }, [])

  const revealContinueBlock = useCallback((blockId: string) => {
    setRevealedContinueBlocks((current) => {
      if (current.has(blockId)) return current
      const next = new Set(current)
      next.add(blockId)
      return next
    })
    markBlockComplete(blockId)
  }, [markBlockComplete])

  const isBlockComplete = useCallback((block: CourseBlock) => {
    if (block.type === 'continue_button') return revealedContinueBlocks.has(block.id)
    return isPreviewAutoCompleteBlock(block) || completedBlocks.has(block.id)
  }, [completedBlocks, revealedContinueBlocks])

  const renderedBlocks: ReactNode[] = []
  let contentLocked = false

  blocks.forEach((block, index) => {
    if (contentLocked) return
    if (!blockHasContent(block)) return

    if (block.type === 'continue_button') {
      const isRevealed = revealedContinueBlocks.has(block.id)
      const completionType = previewMetaString(block, 'completionType', 'None')
      const previousBlock = [...blocks.slice(0, index)].reverse().find((item) => item.type !== 'continue_button')
      const unlocked = completionType === 'None'
        || (completionType === 'Complete Block Directly Above' && (!previousBlock || isBlockComplete(previousBlock)))
        || (completionType === 'Complete All Blocks Above' && blocks.slice(0, index).every(isBlockComplete))

      renderedBlocks.push(
        <PreviewContinueBlock
          key={block.id}
          block={block}
          accentColor={accentColor}
          unlocked={unlocked}
          revealed={isRevealed}
          onReveal={() => revealContinueBlock(block.id)}
        />,
      )

      if (!isRevealed) contentLocked = true
      return
    }

    renderedBlocks.push(
      <PreviewBlock
        key={block.id}
        block={block}
        accentColor={accentColor}
        completed={isBlockComplete(block)}
        onComplete={() => markBlockComplete(block.id)}
        onOpenLessonById={onOpenLessonById}
        getLessonTitle={getLessonTitle}
      />,
    )
  })

  const pageHasLockedContinue = blocks.some((block) => block.type === 'continue_button' && !revealedContinueBlocks.has(block.id))
  const pageCoverImageUrl = page.coverImageUrl ? uploadedAssetUrl(page.coverImageUrl) : ''

  return (
    <section className="mx-auto w-full max-w-[940px] p-6 sm:p-8">
      {previousLesson && (
        <PreviewLessonHeaderLink
          lessonNumber={previousLesson.number}
          lessonTitle={previousLesson.title}
          onClick={onOpenPreviousLesson}
        />
      )}
      {pageCoverImageUrl ? (
        <header
          className="overflow-hidden rounded-lg border border-[var(--lux-line)] bg-cover bg-center px-5 py-10 shadow-sm sm:px-7 sm:py-12"
          style={{ backgroundImage: `linear-gradient(rgba(5, 12, 14, 0.52), rgba(5, 12, 14, 0.52)), url(${pageCoverImageUrl})` }}
        >
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-white/75">Lesson {pageNumber} of {totalPages}</p>
          <h2 className="mt-2 text-3xl font-bold leading-tight text-white drop-shadow">{page.title}</h2>
          {page.summary && <p className="mt-3 max-w-2xl text-base leading-7 text-white/80">{page.summary}</p>}
        </header>
      ) : (
        <>
          <p className="text-xs font-extrabold uppercase tracking-[0.08em] text-[var(--lux-primary-muted)]">Lesson {pageNumber} of {totalPages}</p>
          <h2 className="text-3xl font-bold leading-tight">{page.title}</h2>
          {page.summary && <p className="mt-3 text-base leading-7 text-[var(--lux-muted)]">{page.summary}</p>}
        </>
      )}
      <div className="mt-7 space-y-7">
        {page.type === 'branching_scenario' ? (
          <PreviewScenario page={page} />
        ) : page.type === 'quiz' ? (
          <PreviewQuiz page={page} accentColor={accentColor} />
        ) : renderedBlocks.length > 0 ? (
          renderedBlocks
        ) : (
          <p className="border-t border-[var(--lux-line)] pt-5 text-sm text-[var(--lux-muted)]">No content yet.</p>
        )}
      </div>
      {nextLesson && (
        <PreviewLessonFooterLink
          lessonNumber={nextLesson.number}
          lessonTitle={nextLesson.title}
          disabled={pageHasLockedContinue}
          onClick={onOpenNextLesson}
        />
      )}
    </section>
  )
}
