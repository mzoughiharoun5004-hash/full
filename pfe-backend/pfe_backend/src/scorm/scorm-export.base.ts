import { Scenario } from 'src/scenario/scenario.entity';
import {
  CourseBlock,
  CourseDocument,
  CourseLesson,
  CoursePage,
  CourseTheme,
  QuizQuestion,
} from 'src/scenario/course-document.types';

/**
 * Stateless helpers shared by the SCORM zip build (ScormBuildService) and the
 * PDF export (ScormPdfService): course normalization, the player stylesheet,
 * HTML escaping and the scenario-tree sort. Keep anything only one exporter
 * needs in that exporter, not here.
 */
export abstract class ScormExportBase {
  protected normalizeQuizQuestionType(
    type: unknown,
  ): 'multiple_choice' | 'multiple_response' | 'fill_blank' | 'matching' {
    if (type === 'multiple_response' || type === 'multiple_select') {
      return 'multiple_response';
    }
    if (type === 'fill_blank' || type === 'matching') return type;
    return 'multiple_choice';
  }

  protected normalizeQuizQuestion(question: QuizQuestion): QuizQuestion {
    const type = this.normalizeQuizQuestionType(question.type);
    const options = (question.options ?? []).map((option) => ({
      ...option,
      id: option.id || `option-${Math.random().toString(36).slice(2, 10)}`,
      text: option.text ?? '',
      match: option.match ?? '',
      isCorrect:
        type === 'fill_blank' || type === 'matching'
          ? true
          : Boolean(option.isCorrect),
    }));

    return {
      ...question,
      id: question.id || `question-${Math.random().toString(36).slice(2, 10)}`,
      type,
      text: question.text || 'Question',
      imageUrl: question.imageUrl ?? '',
      points:
        Number.isFinite(Number(question.points)) && Number(question.points) > 0
          ? Number(question.points)
          : 1,
      options,
      feedbackMode:
        question.feedbackMode === 'correct_incorrect'
          ? 'correct_incorrect'
          : 'any_response',
      feedback: question.feedback ?? '',
      correctFeedback: question.correctFeedback ?? '',
      incorrectFeedback: question.incorrectFeedback ?? '',
      caseSensitive: Boolean(question.caseSensitive),
    };
  }

  protected quizQuestionsFromBlocks(
    blocks: CourseBlock[] = [],
  ): QuizQuestion[] {
    return blocks
      .filter((block) =>
        [
          'multiple_choice',
          'multiple_select',
          'multiple_response',
          'fill_blank',
          'matching',
        ].includes(block.type),
      )
      .map((block) => {
        const type = this.normalizeQuizQuestionType(block.type);
        const metadata = block.metadata ?? {};
        const items = block.items ?? [];
        const acceptedAnswers =
          typeof metadata.acceptedAnswers === 'string'
            ? metadata.acceptedAnswers
                .split(/\n|,/)
                .map((answer) => answer.trim())
                .filter(Boolean)
            : [];
        const options =
          type === 'fill_blank'
            ? (acceptedAnswers.length
                ? acceptedAnswers
                : items
                    .map((item) => item.title || item.content || '')
                    .filter(Boolean)
              ).map((answer, index) => ({
                id: `answer-${index}`,
                text: answer,
                isCorrect: true,
              }))
            : items.map((item, index) => ({
                id: item.id || `option-${index}`,
                text: item.title || '',
                match: item.match || item.content || '',
                isCorrect: type === 'matching' ? true : item.content === 'true',
              }));

        return this.normalizeQuizQuestion({
          id: block.id,
          type,
          text: block.title || block.content || 'Question',
          points: Number(metadata.points ?? 1),
          options,
          feedback:
            typeof metadata.feedback === 'string' ? metadata.feedback : '',
          feedbackMode:
            metadata.correctFeedback || metadata.incorrectFeedback
              ? 'correct_incorrect'
              : 'any_response',
          correctFeedback:
            typeof metadata.correctFeedback === 'string'
              ? metadata.correctFeedback
              : '',
          incorrectFeedback:
            typeof metadata.incorrectFeedback === 'string'
              ? metadata.incorrectFeedback
              : '',
          caseSensitive: Boolean(metadata.caseSensitive),
        });
      });
  }

  protected normalizeQuiz(
    quiz: CoursePage['quiz'] | CourseLesson['quiz'] | undefined,
    blocks: CourseBlock[] = [],
  ): NonNullable<CoursePage['quiz']> {
    const legacyQuestions = this.quizQuestionsFromBlocks(blocks);
    const sourceQuestions = quiz?.questions?.length
      ? quiz.questions
      : legacyQuestions;

    return {
      passingScore:
        Number.isFinite(Number(quiz?.passingScore)) &&
        Number(quiz?.passingScore) > 0
          ? Number(quiz?.passingScore)
          : 80,
      timeLimitMinutes: quiz?.timeLimitMinutes,
      attempts: quiz?.attempts ?? 1,
      randomizeQuestions: quiz?.randomizeQuestions ?? false,
      randomizeAnswers: quiz?.randomizeAnswers ?? false,
      showFeedback: quiz?.showFeedback ?? true,
      questions: sourceQuestions.map((question) =>
        this.normalizeQuizQuestion(question),
      ),
    };
  }

  protected normalizeCourseForExport(
    course: CourseDocument,
    assetBaseUrl?: string,
  ): CourseDocument {
    // Exported SCORM zips may be opened outside the app origin, so relative
    // media references are anchored here while data/blob/http URLs are kept as-is.
    const normalizeUrl = (value: unknown): string => {
      const url = typeof value === 'string' ? value.trim() : '';
      if (!url) return '';
      if (
        url.startsWith('http') ||
        url.startsWith('data:') ||
        url.startsWith('blob:')
      )
        return url;
      const base = String(assetBaseUrl ?? '').trim();
      if (!base) return url;
      if (url.startsWith('/')) return `${base}${url}`;
      return `${base}/${url}`;
    };

    const normalizeBlock = (block: CourseBlock): CourseBlock => {
      const metadata = block.metadata ?? {};
      const fileUrl =
        typeof metadata.fileUrl === 'string' ? metadata.fileUrl : '';
      const url = typeof metadata.url === 'string' ? metadata.url : '';
      const mediaTypes = new Set([
        'image',
        'video',
        'audio',
        'embed',
        'attachment',
        'document',
        'file_download',
        'resource_link',
      ]);
      const contentAsUrl = mediaTypes.has(block.type)
        ? (block.content ?? '').trim()
        : '';

      const assetUrl =
        (block.assetUrl ?? '').trim() ||
        contentAsUrl ||
        fileUrl.trim() ||
        url.trim();

      return {
        ...block,
        assetUrl: assetUrl ? normalizeUrl(assetUrl) : undefined,
        items: block.items?.map((item) => ({
          ...item,
          mediaUrl: item.mediaUrl ? normalizeUrl(item.mediaUrl) : item.mediaUrl,
        })),
        metadata: {
          ...metadata,
          fileUrl: fileUrl ? normalizeUrl(fileUrl) : metadata.fileUrl,
          url: url ? normalizeUrl(url) : metadata.url,
          avatarUrl:
            typeof metadata.avatarUrl === 'string'
              ? normalizeUrl(metadata.avatarUrl)
              : metadata.avatarUrl,
          imageUrl:
            typeof metadata.imageUrl === 'string'
              ? normalizeUrl(metadata.imageUrl)
              : metadata.imageUrl,
          introImageUrl:
            typeof metadata.introImageUrl === 'string'
              ? normalizeUrl(metadata.introImageUrl)
              : metadata.introImageUrl,
        },
      };
    };

    const normalizeQuizAssetUrls = <
      T extends CoursePage['quiz'] | CourseLesson['quiz'] | undefined,
    >(
      quiz: T,
    ): T =>
      quiz
        ? {
            ...quiz,
            questions: (quiz.questions ?? []).map((question) => ({
              ...question,
              imageUrl: question.imageUrl
                ? normalizeUrl(question.imageUrl)
                : question.imageUrl,
            })),
          }
        : quiz;

    const exportPages = this.ensureExportPages(course);
    const courseMetadata = course.metadata ?? {};
    const normalizePage = (page: CoursePage): CoursePage => {
      const blocks = page.blocks?.map(normalizeBlock) ?? [];
      const hasQuiz = page.type === 'quiz' || Boolean(page.quiz);
      const quiz = hasQuiz
        ? this.normalizeQuiz(page.quiz, page.blocks ?? [])
        : page.quiz;
      return {
        ...page,
        coverImageUrl: page.coverImageUrl
          ? normalizeUrl(page.coverImageUrl)
          : page.coverImageUrl,
        blocks,
        quiz: normalizeQuizAssetUrls(quiz),
      };
    };
    const normalizeLesson = (lesson: CourseLesson): CourseLesson => {
      const blocks = lesson.blocks?.map(normalizeBlock) ?? [];
      const hasQuiz = lesson.type === 'quiz' || Boolean(lesson.quiz);
      const quiz = hasQuiz
        ? ({
            ...this.normalizeQuiz(lesson.quiz, lesson.blocks ?? []),
            timeLimitMinutes: lesson.quiz?.timeLimitMinutes,
          } as CourseLesson['quiz'])
        : lesson.quiz;
      return {
        ...lesson,
        coverImageUrl: lesson.coverImageUrl
          ? normalizeUrl(lesson.coverImageUrl)
          : lesson.coverImageUrl,
        blocks,
        quiz: normalizeQuizAssetUrls(quiz),
      };
    };

    return {
      ...course,
      theme: course.theme
        ? {
            ...course.theme,
            coverImageUrl: course.theme.coverImageUrl
              ? normalizeUrl(course.theme.coverImageUrl)
              : course.theme.coverImageUrl,
          }
        : course.theme,
      metadata: {
        ...courseMetadata,
        assetBaseUrl: assetBaseUrl ?? courseMetadata.assetBaseUrl,
      },
      pages: exportPages.map(normalizePage),
      lessons: (course.lessons ?? []).map(normalizeLesson),
    };
  }

  protected ensureExportPages(course: CourseDocument): CoursePage[] {
    // Lessons are the editor's canonical page source; legacy pages remain a
    // fallback for older course documents that predate the lessons model.
    const fromLessons = (course.lessons ?? []).map((lesson) =>
      this.lessonToPage(lesson),
    );
    const fromPages = course.pages ?? [];
    const lessonBlocks = fromLessons.reduce(
      (total, page) => total + (page.blocks?.length ?? 0),
      0,
    );
    const pageBlocks = fromPages.reduce(
      (total, page) => total + (page.blocks?.length ?? 0),
      0,
    );
    if (fromLessons.length && lessonBlocks >= pageBlocks) return fromLessons;
    if (fromPages.length) return fromPages;
    return fromLessons;
  }

  protected lessonToPage(lesson: CourseLesson): CoursePage {
    return {
      id: lesson.id,
      type: lesson.type === 'quiz' ? 'quiz' : 'lesson',
      title: lesson.title,
      summary: lesson.summary,
      coverImageUrl: lesson.coverImageUrl,
      blocks: lesson.blocks ?? [],
      quiz: lesson.quiz
        ? {
            passingScore: lesson.quiz.passingScore,
            timeLimitMinutes: lesson.quiz.timeLimitMinutes,
            attempts: lesson.quiz.attempts,
            randomizeQuestions: lesson.quiz.randomizeQuestions,
            randomizeAnswers: lesson.quiz.randomizeAnswers,
            showFeedback: lesson.quiz.showFeedback,
            questions: lesson.quiz.questions,
          }
        : undefined,
      metadata: lesson.metadata,
    };
  }

  protected buildStylesheet(theme?: CourseTheme): string {
    const isLight = theme?.themeMode === 'light';
    const accent = theme?.accentColor || '#0f6b4a';
    const bg = isLight ? '#F4EFE5' : '#111A1F';
    const bgAlt = isLight ? '#FBF7EF' : '#162220';
    const surface = isLight ? '#FFFDF8' : '#182420';
    const surfaceSoft = isLight ? '#F7F1E6' : '#1D2B27';
    const elevated = isLight ? '#F0E7D8' : '#22332E';
    const text = isLight ? '#1F1B16' : '#F6F0E6';
    const textStrong = isLight ? '#17130F' : '#FFF8EC';
    const muted = isLight ? '#756B5E' : '#B9AD9C';
    const mutedSoft = isLight ? '#9B8D7A' : '#8E9C93';
    const line = isLight ? '#DED4C2' : 'rgba(246, 240, 230, 0.12)';
    const lineStrong = isLight ? '#D8C592' : 'rgba(198, 167, 101, 0.30)';
    const primaryHover = `color-mix(in srgb, ${accent} 88%, ${textStrong})`;
    const primarySoft = `color-mix(in srgb, ${accent} 14%, transparent)`;
    const primaryMuted = `color-mix(in srgb, ${accent} 62%, ${textStrong})`;
    const scrollTrack = isLight
      ? 'rgba(31, 27, 22, 0.06)'
      : 'rgba(246, 240, 230, 0.06)';
    const scrollThumb = isLight
      ? 'rgba(117, 107, 94, 0.34)'
      : 'rgba(185, 173, 156, 0.36)';
    const scrollThumbHover = `color-mix(in srgb, ${accent} 64%, transparent)`;

    const statementInfoBg = surface;
    const statementInfoBorder = line;
    const statementInfoText = textStrong;
    const statementInfoBadgeBg = surfaceSoft;
    const statementInfoBadgeText = textStrong;
    const statementInfoBadgeBorder = line;

    const statementWarningBg = isLight ? '#fee2e2' : 'rgba(239,68,68,.12)';
    const statementWarningBorder = isLight ? '#fca5a5' : 'rgba(239,68,68,.38)';
    const statementWarningText = isLight ? '#7f1d1d' : '#fecaca';
    const statementWarningBadgeBg = isLight ? 'rgba(239,68,68,.18)' : 'rgba(239,68,68,.24)';
    const statementWarningBadgeText = isLight ? '#991b1b' : '#fca5a5';
    const statementWarningBadgeBorder = isLight ? 'rgba(239,68,68,.3)' : 'rgba(239,68,68,.35)';

    const statementTipBg = isLight ? '#dcfce7' : 'rgba(34,197,94,.12)';
    const statementTipBorder = isLight ? '#86efac' : 'rgba(34,197,94,.38)';
    const statementTipText = isLight ? '#14532d' : '#bbf7d0';
    const statementTipBadgeBg = isLight ? 'rgba(34,197,94,.18)' : 'rgba(34,197,94,.24)';
    const statementTipBadgeText = isLight ? '#166534' : '#86efac';
    const statementTipBadgeBorder = isLight ? 'rgba(34,197,94,.3)' : 'rgba(34,197,94,.35)';

    const statementNoteBg = isLight ? '#fef3c7' : 'rgba(245,158,11,.12)';
    const statementNoteBorder = isLight ? '#facc15' : 'rgba(245,158,11,.38)';
    const statementNoteText = isLight ? '#78350f' : '#fde68a';
    const statementNoteBadgeBg = isLight ? 'rgba(245,158,11,.18)' : 'rgba(245,158,11,.24)';
    const statementNoteBadgeText = isLight ? '#92400e' : '#fcd34d';
    const statementNoteBadgeBorder = isLight ? 'rgba(245,158,11,.3)' : 'rgba(245,158,11,.35)';

    return `:root,body[data-preview-theme="${isLight ? 'light' : 'dark'}"]{--lux-bg:${bg};--lux-bg-alt:${bgAlt};--lux-surface:${surface};--lux-surface-soft:${surfaceSoft};--lux-elevated:${elevated};--lux-text:${text};--lux-text-strong:${textStrong};--lux-muted:${muted};--lux-muted-soft:${mutedSoft};--lux-line:${line};--lux-line-strong:${lineStrong};--lux-primary:${accent};--lux-primary-hover:${primaryHover};--lux-primary-soft:${primarySoft};--lux-primary-muted:${primaryMuted};--lux-overlay:${isLight ? 'rgba(31,27,22,.045)' : 'rgba(246,240,230,.06)'};--lux-overlay-hover:${isLight ? 'rgba(31,27,22,.075)' : 'rgba(246,240,230,.09)'};--lux-scroll-track:${scrollTrack};--lux-scroll-thumb:${scrollThumb};--lux-scroll-thumb-hover:${scrollThumbHover};--statement-info-bg:${statementInfoBg};--statement-info-border:${statementInfoBorder};--statement-info-text:${statementInfoText};--statement-info-badge-bg:${statementInfoBadgeBg};--statement-info-badge-text:${statementInfoBadgeText};--statement-info-badge-border:${statementInfoBadgeBorder};--statement-warning-bg:${statementWarningBg};--statement-warning-border:${statementWarningBorder};--statement-warning-text:${statementWarningText};--statement-warning-badge-bg:${statementWarningBadgeBg};--statement-warning-badge-text:${statementWarningBadgeText};--statement-warning-badge-border:${statementWarningBadgeBorder};--statement-tip-bg:${statementTipBg};--statement-tip-border:${statementTipBorder};--statement-tip-text:${statementTipText};--statement-tip-badge-bg:${statementTipBadgeBg};--statement-tip-badge-text:${statementTipBadgeText};--statement-tip-badge-border:${statementTipBadgeBorder};--statement-note-bg:${statementNoteBg};--statement-note-border:${statementNoteBorder};--statement-note-text:${statementNoteText};--statement-note-badge-bg:${statementNoteBadgeBg};--statement-note-badge-text:${statementNoteBadgeText};--statement-note-badge-border:${statementNoteBadgeBorder};--bg:var(--lux-bg);--panel:var(--lux-surface);--card:var(--lux-surface-soft);--line:var(--lux-line);--text:var(--lux-text);--muted:var(--lux-muted);--accent:var(--lux-primary);color-scheme:${isLight ? 'light' : 'dark'}}body[data-preview-theme="dark"]{--statement-info-bg:#182420;--statement-info-border:rgba(246,240,230,.12);--statement-info-text:#FFF8EC;--statement-info-badge-bg:#1D2B27;--statement-info-badge-text:#FFF8EC;--statement-info-badge-border:rgba(246,240,230,.12);--statement-warning-bg:rgba(239,68,68,.12);--statement-warning-border:rgba(239,68,68,.38);--statement-warning-text:#fecaca;--statement-warning-badge-bg:rgba(239,68,68,.24);--statement-warning-badge-text:#fca5a5;--statement-warning-badge-border:rgba(239,68,68,.35);--statement-tip-bg:rgba(34,197,94,.12);--statement-tip-border:rgba(34,197,94,.38);--statement-tip-text:#bbf7d0;--statement-tip-badge-bg:rgba(34,197,94,.24);--statement-tip-badge-text:#86efac;--statement-tip-badge-border:rgba(34,197,94,.35);--statement-note-bg:rgba(245,158,11,.12);--statement-note-border:rgba(245,158,11,.38);--statement-note-text:#fde68a;--statement-note-badge-bg:rgba(245,158,11,.24);--statement-note-badge-text:#fcd34d;--statement-note-badge-border:rgba(245,158,11,.35)}body[data-preview-theme="light"]{--statement-info-bg:#FFFDF8;--statement-info-border:#DED4C2;--statement-info-text:#17130F;--statement-info-badge-bg:#F7F1E6;--statement-info-badge-text:#17130F;--statement-info-badge-border:#DED4C2;--statement-warning-bg:#fee2e2;--statement-warning-border:#fca5a5;--statement-warning-text:#7f1d1d;--statement-warning-badge-bg:rgba(239,68,68,.18);--statement-warning-badge-text:#991b1b;--statement-warning-badge-border:rgba(239,68,68,.3);--statement-tip-bg:#dcfce7;--statement-tip-border:#86efac;--statement-tip-text:#14532d;--statement-tip-badge-bg:rgba(34,197,94,.18);--statement-tip-badge-text:#166534;--statement-tip-badge-border:rgba(34,197,94,.3);--statement-note-bg:#fef3c7;--statement-note-border:#facc15;--statement-note-text:#78350f;--statement-note-badge-bg:rgba(245,158,11,.18);--statement-note-badge-text:#92400e;--statement-note-badge-border:rgba(245,158,11,.3)}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-height:100vh;overflow:hidden;background:var(--lux-bg);color:var(--lux-text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}button,input,select,textarea{font:inherit}button{cursor:pointer}.lux-scrollbar{scrollbar-color:var(--lux-scroll-thumb) var(--lux-scroll-track);scrollbar-gutter:stable;scrollbar-width:thin}.lux-scrollbar::-webkit-scrollbar{width:9px;height:9px}.lux-scrollbar::-webkit-scrollbar-track{background:var(--lux-scroll-track);border-radius:99px}.lux-scrollbar::-webkit-scrollbar-thumb{background:var(--lux-scroll-thumb);border:2px solid transparent;border-radius:99px;background-clip:padding-box}.lux-scrollbar:hover{scrollbar-color:var(--lux-scroll-thumb-hover) var(--lux-scroll-track)}.lux-scrollbar::-webkit-scrollbar-thumb:hover{background:var(--lux-scroll-thumb-hover);background-clip:padding-box}
@keyframes fade-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes sorting-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}@keyframes bar-rise{from{transform:scaleY(.08)}to{transform:scaleY(1)}}
.runtime-preview{height:100vh;overflow:auto;background:rgba(0,0,0,.70);padding:20px;backdrop-filter:blur(8px)}.runtime-frame{width:min(1280px,100%);height:calc(100vh - 40px);min-height:620px;margin:0 auto;overflow:hidden;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-bg);color:var(--lux-text-strong);box-shadow:0 25px 80px rgba(0,0,0,.35);display:flex;flex-direction:column}.runtime-topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--lux-line);background:var(--lux-surface);padding:16px 20px}.runtime-title{min-width:0}.runtime-title p{margin:0;color:var(--lux-primary-muted);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.runtime-title h1{margin:4px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--lux-text-strong);font-size:20px;line-height:1.25}.runtime-title span{display:block;max-width:640px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--lux-muted);font-size:12px}.runtime-standard{display:inline-flex;border:1px solid var(--lux-line);border-radius:999px;background:var(--lux-surface-soft);padding:8px 12px;color:var(--lux-muted);font-size:12px;font-weight:800}.runtime-shell{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:0;flex:1;overflow:hidden}.runtime-shell[data-sidebar="collapsed"]{grid-template-columns:76px minmax(0,1fr)}.runtime-nav{min-height:0;border-right:1px solid var(--lux-line);background:var(--lux-surface);padding:16px;display:flex;flex-direction:column;gap:16px;transition:padding .2s}.runtime-shell[data-sidebar="collapsed"] .runtime-nav{padding:12px}.runtime-nav-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.runtime-brand{min-width:0;flex:1;overflow:hidden;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface-soft);background-size:cover;background-position:center;padding:16px}.runtime-brand-title{font-size:14px;font-weight:900;line-height:1.35}.runtime-brand-description{margin:8px 0 0;color:var(--lux-muted);font-size:12px;font-weight:500;line-height:1.55}.runtime-brand.has-cover{min-height:126px;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;text-shadow:0 1px 14px rgba(0,0,0,.55)}.runtime-brand.has-cover .runtime-brand-description{color:rgba(255,255,255,.82)}.runtime-shell[data-sidebar="collapsed"] .runtime-brand{display:none}.sidebar-toggle{display:grid;width:32px;height:32px;place-items:center;flex-shrink:0;border:1px solid var(--lux-line);border-radius:999px;background:var(--lux-surface-soft);color:var(--lux-text-strong)}.sidebar-toggle:hover{background:var(--lux-elevated)}.sidebar-toggle span{display:block;width:10px;height:10px;border-top:2px solid currentColor;border-left:2px solid currentColor;transform:rotate(-45deg)}.runtime-shell[data-sidebar="collapsed"] .sidebar-toggle span{transform:rotate(135deg)}#nav{min-height:0;flex:1;overflow:auto;padding-right:4px}.nav-item{width:100%;display:flex;align-items:center;gap:12px;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--lux-muted);padding:9px 11px;text-align:left;transition:border-color .16s,background .16s,color .16s}.nav-item:hover{border-color:color-mix(in srgb,var(--lux-primary-muted) 25%,transparent);color:var(--lux-text-strong)}.nav-item.active{border-color:color-mix(in srgb,var(--lux-primary-muted) 40%,transparent);background:color-mix(in srgb,var(--lux-primary) 25%,transparent);color:var(--lux-text-strong)}.nav-index{display:grid;width:24px;height:24px;place-items:center;flex-shrink:0;border-radius:999px;background:var(--lux-elevated);color:var(--lux-text-strong);font-size:12px;font-weight:800}.nav-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.runtime-shell[data-sidebar="collapsed"] .nav-item{justify-content:center;padding:10px 8px}.runtime-shell[data-sidebar="collapsed"] .nav-title,.runtime-shell[data-sidebar="collapsed"] .progress-label,.runtime-shell[data-sidebar="collapsed"] #progress-text{display:block}.progress-wrap{margin-top:auto}.progress-label,#progress-text{margin:0 0 6px;color:var(--lux-muted);font-size:12px;font-weight:700}.progress-track{height:7px;overflow:hidden;border-radius:999px;background:var(--lux-line)}#progress-fill{width:0;height:100%;background:linear-gradient(90deg,var(--lux-primary),var(--lux-primary-muted));transition:width .28s ease}.runtime-main{min-height:0;overflow:auto;background:var(--lux-bg);padding:28px;display:flex;justify-content:center}#page{width:min(940px,100%);flex:0 1 940px}.page-card{width:100%;padding:24px 32px;animation:fade-up .28s ease both}.page-card-static{animation:none}.eyebrow{margin:0;color:var(--lux-primary-muted);font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}h1{margin:6px 0 0;color:var(--lux-text-strong);font-size:30px;line-height:1.18}h2,.block-heading{margin:0;color:var(--lux-text-strong);font-size:24px;line-height:1.25}.block-subtitle,.summary,.text-block p,.dialogue{color:var(--lux-muted);line-height:1.7}.page-summary{margin-top:12px;font-size:16px}.page-title-hero{position:relative;display:flex;min-height:210px;align-items:flex-end;overflow:hidden;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface);background-size:cover;background-position:center;margin-bottom:28px;padding:0}.page-title-hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.54);border-radius:0}.page-title-hero>div{position:relative;width:100%;padding:34px;color:#fff;text-shadow:0 1px 16px rgba(0,0,0,.55)}.page-title-hero .eyebrow{color:rgba(255,255,255,.75)}.page-title-hero h1{color:#fff}.page-title-hero .summary{max-width:720px;color:rgba(255,255,255,.80)}
.block,.heading-block,.text-block,.items-block,.knowledge-check,.question-block,.gallery-block,.accordion-block,.tabs-block,.sorting-block,.flashcards-block,.chart-block,.media-block{border-top:1px solid var(--lux-line);padding-top:20px;margin-top:28px}.heading-block{border-top:0}.text-block p{margin:0;white-space:pre-wrap;font-size:16px}.callout{border:1px solid var(--statement-info-border);border-radius:10px;background:var(--statement-info-bg);padding:16px}.callout strong{display:block;color:var(--statement-info-text);font-size:14px;font-weight:800}.callout p{margin:8px 0 0;white-space:pre-wrap;color:var(--statement-info-text);font-size:16px;font-weight:700;line-height:1.7}.statement-block{margin-top:24px;border:1px solid var(--statement-info-border);border-radius:10px;background:var(--statement-info-bg);padding:20px}.statement-info{background:var(--statement-info-bg);border-color:var(--statement-info-border)}.statement-warning{background:var(--statement-warning-bg);border-color:var(--statement-warning-border)}.statement-tip{background:var(--statement-tip-bg);border-color:var(--statement-tip-border)}.statement-note{background:var(--statement-note-bg);border-color:var(--statement-note-border)}.statement-label{display:inline-flex;margin-bottom:12px;border-radius:999px;border:1px solid var(--statement-info-badge-border);background:var(--statement-info-badge-bg);padding:5px 12px;color:var(--statement-info-badge-text);font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.statement-info .statement-label{background:var(--statement-info-badge-bg);color:var(--statement-info-badge-text);border-color:var(--statement-info-badge-border)}.statement-warning .statement-label{background:var(--statement-warning-badge-bg);color:var(--statement-warning-badge-text);border-color:var(--statement-warning-badge-border)}.statement-tip .statement-label{background:var(--statement-tip-badge-bg);color:var(--statement-tip-badge-text);border-color:var(--statement-tip-badge-border)}.statement-note .statement-label{background:var(--statement-note-badge-bg);color:var(--statement-note-badge-text);border-color:var(--statement-note-badge-border)}.statement-block p{margin:0;white-space:pre-wrap;color:var(--statement-info-text);font-size:20px;font-weight:900;line-height:1.55}.statement-info p{color:var(--statement-info-text)}.statement-warning p,.statement-warning strong{color:var(--statement-warning-text)}.statement-tip p,.statement-tip strong{color:var(--statement-tip-text)}.statement-note p,.statement-note strong{color:var(--statement-note-text)}.quote-block{margin:24px 0 0;padding-top:20px}.quote-block blockquote{margin:0;max-width:780px;white-space:pre-wrap;border:0;padding:0;color:var(--lux-text-strong);font-size:24px;font-weight:700;line-height:1.45}.quote-content{display:flex;flex-direction:column}.quote-spacing-compact{gap:8px;padding:16px 0}.quote-spacing-normal{gap:12px;padding:24px 0}.quote-spacing-wide{gap:20px;padding:32px 0}.quote-align-left{align-items:flex-start;text-align:left}.quote-align-center{align-items:center;text-align:center}.quote-align-right{align-items:flex-end;text-align:right}.quote-mark{color:var(--lux-primary-muted);font-size:52px;font-weight:900;line-height:.85}.quote-mark-end{align-self:flex-end}.quote-block figcaption{display:flex;align-items:center;gap:12px;color:var(--lux-text);font-size:14px}.quote-align-center figcaption{justify-content:center}.quote-align-right figcaption{flex-direction:row-reverse}.quote-block figcaption img{width:44px;height:44px;border:1px solid rgba(255,255,255,.20);border-radius:999px;object-fit:cover}.quote-block figcaption strong{display:block;color:var(--lux-text-strong)}.quote-block figcaption em{display:block;color:var(--lux-muted);font-style:normal}.quote-image{overflow:hidden;border-radius:10px;background-size:cover;background-position:center}.quote-image>div{padding:0 32px}
.items-grid{display:grid;gap:12px;margin-top:16px}.items-grid article{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;border-radius:10px;background:transparent;padding:16px}.items-grid article>span{display:grid;width:36px;height:36px;place-items:center;border-radius:999px;background:var(--lux-primary-soft);color:var(--lux-primary-muted);font-size:14px;font-weight:900}.items-grid h3{margin:0;color:var(--lux-text-strong);font-size:16px}.items-grid p{margin:4px 0 0;white-space:pre-wrap;color:var(--lux-muted);font-size:14px;line-height:1.65}.media-block img,.media-block video,.media-block iframe,.panel-media{display:block;width:100%;max-width:100%;border:0;border-radius:10px}.media-block img{max-height:520px;object-fit:contain}.media-block iframe,.panel-media:is(iframe){aspect-ratio:16/9}.media-block figcaption,.gallery-grid figcaption{margin-top:8px;text-align:center;color:var(--lux-muted);font-size:14px}.media-credit{margin-top:8px;text-align:center;color:var(--lux-muted);font-size:12px}.media-credit a{color:inherit;text-decoration:underline}.empty-media{display:grid;min-height:180px;place-items:center;border:1px dashed var(--lux-line);border-radius:10px;background:var(--lux-surface);color:var(--lux-muted);font-size:14px}.attachment{display:flex;align-items:center;gap:12px;border-radius:10px;background:var(--lux-surface);padding:16px;color:var(--lux-text-strong);text-decoration:none;transition:background .16s}.attachment:hover{background:var(--lux-surface-soft)}.attachment-icon{display:grid;width:28px;height:28px;place-items:center;border-radius:8px;background:var(--lux-primary-soft);color:var(--lux-primary-muted);font-size:11px;font-weight:900}.attachment strong{display:block}.attachment em{display:block;margin-top:4px;color:var(--lux-muted);font-size:13px;font-style:normal}.button-block{display:flex;margin-top:24px}.button-block.align-center{justify-content:center}.button-block.align-left{justify-content:flex-start}.button-block.align-right{justify-content:flex-end}.primary{display:inline-flex;min-width:144px;align-items:center;justify-content:center;border:1px solid var(--lux-primary);border-radius:999px;background:var(--lux-primary);padding:10px 18px;color:#fff;font-size:14px;font-weight:800;text-decoration:none;transition:filter .16s,transform .16s}.primary:hover{filter:brightness(1.08);transform:translateY(-1px)}.primary:disabled{border-color:var(--lux-line);background:var(--lux-line);color:var(--lux-muted);cursor:not-allowed;filter:none;transform:none}.divider-block{display:flex;align-items:center;gap:16px;padding:12px 0;margin-top:24px}.divider-block span{height:1px;flex:1;background:var(--lux-line)}.divider-block em{color:var(--lux-muted);font-size:12px;font-style:normal;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.code-block,pre{overflow:auto;border-radius:10px;background:var(--lux-bg-alt);padding:16px;color:var(--lux-text-strong);font-size:12px;line-height:1.65}.table-wrap{overflow:auto;border:1px solid var(--lux-line);border-radius:10px;background:transparent}.table-wrap table{min-width:100%;border-collapse:collapse;text-align:left;font-size:14px}.table-wrap tr{border-bottom:1px solid var(--lux-line)}.table-wrap tr:last-child{border-bottom:0}.table-wrap th,.table-wrap td{padding:10px 12px}.table-wrap th{color:var(--lux-text-strong);font-weight:800}.table-wrap td{color:var(--lux-muted)}
.gallery-grid{display:grid;gap:16px}.gallery-cols-1{grid-template-columns:1fr}.gallery-cols-2{grid-template-columns:repeat(2,minmax(0,1fr))}.gallery-cols-3{grid-template-columns:repeat(3,minmax(0,1fr))}.gallery-cols-4{grid-template-columns:repeat(4,minmax(0,1fr))}.gallery-grid figure{margin:0;border-radius:10px;background:transparent;padding:12px}.gallery-grid figure>div{overflow:hidden;border-radius:8px;background:var(--lux-surface-soft)}.gallery-grid img{display:block;width:100%;aspect-ratio:16/9;object-fit:contain;border-radius:8px}.choices{display:grid;gap:10px;margin-top:18px}.choice,.quiz-option{display:flex;align-items:center;gap:12px;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface);padding:12px;color:var(--lux-text-strong);text-align:left;transition:border-color .16s,background .16s}.choice:hover,.quiz-option:hover{border-color:var(--lux-primary-muted);background:var(--lux-surface-soft)}.choice-dot{width:12px;height:12px;flex-shrink:0;border-radius:999px;background:var(--lux-primary-muted)}.feedback{margin-top:12px;color:var(--lux-primary-muted);font-weight:700}
.continue-wrap{border-top:1px solid var(--lux-line);padding-top:20px;margin-top:28px}.continue-hint{margin:8px 0 0;color:var(--lux-muted);font-size:12px;font-weight:700}.lesson-link{width:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;border:0;background:transparent;color:var(--lux-muted);text-align:center;font:inherit;font-weight:800;text-transform:uppercase;letter-spacing:.04em;cursor:pointer;transition:background .18s,color .18s}.lesson-link:hover{background:var(--lux-surface-soft);color:var(--lux-primary)}.lesson-link:disabled{cursor:not-allowed;opacity:.4}.lesson-link:disabled:hover{background:transparent;color:var(--lux-muted)}.lesson-link-previous{border-bottom:1px solid var(--lux-line);margin-bottom:32px;padding:0 16px 28px}.lesson-link-next{border-top:1px solid var(--lux-line);margin-top:32px;padding:40px 16px}.lesson-link-label{font-size:14px}.lesson-link-chevron{width:18px;height:18px;border-bottom:2px solid currentColor;border-right:2px solid currentColor;transition:transform .16s}.lesson-link-chevron-up{margin-bottom:8px;transform:rotate(225deg)}.lesson-link-chevron-down{margin-top:8px;transform:rotate(45deg)}.lesson-link:hover .lesson-link-chevron-up{transform:rotate(225deg) translate(3px,3px)}.lesson-link:hover .lesson-link-chevron-down{transform:rotate(45deg) translate(3px,3px)}
.flashcards-grid{display:flex;flex-wrap:wrap;gap:20px;margin-top:20px}.flashcard{position:relative;display:flex;min-width:200px;min-height:240px;flex:1 1 220px;cursor:pointer;outline:none;perspective:1000px;text-align:center}.flashcard-inner{position:relative;width:100%;height:240px;min-height:100%;transform-style:preserve-3d;transition:transform .5s cubic-bezier(.4,0,.2,1)}.flashcard.flipped .flashcard-inner{transform:rotateY(180deg)}.flashcard-face{position:absolute;inset:0;display:flex;flex-direction:column;overflow:hidden;backface-visibility:hidden;-webkit-backface-visibility:hidden;border-top:3px solid var(--lux-primary);border-radius:2px;background:var(--lux-surface);box-shadow:0 1px 4px rgba(0,0,0,.10),0 0 0 1px rgba(0,0,0,.06)}.flashcard-back{transform:rotateY(180deg)}.fc-icon{display:flex;justify-content:flex-end;padding:12px;color:var(--lux-text-strong);opacity:.6}.flashcard-back .fc-icon{transform:rotateY(180deg)}.fc-content{display:flex;flex:1;align-items:center;justify-content:center;margin:0;padding:0 20px 32px;color:var(--lux-text-strong);font-size:18px;font-weight:400;line-height:1.55;text-align:center}.flashcard img{max-height:140px;width:auto;max-width:calc(100% - 40px);object-fit:contain}
.tabs-bar{display:flex;align-items:center;gap:8px;margin-top:20px}.tabs-scroll{display:flex;min-width:0;flex:1;gap:8px;overflow:auto;padding-bottom:4px}.tabs-toggle{min-width:max-content;border:1px solid var(--lux-line);border-radius:999px;background:transparent;padding:9px 16px;color:var(--lux-muted);font-size:14px;font-weight:800;transition:background .16s,border-color .16s,color .16s}.tabs-toggle.active{border-color:var(--lux-primary);background:var(--lux-primary);color:#fff}.tabs-arrow{display:grid;width:36px;height:36px;place-items:center;flex-shrink:0;border:1px solid var(--lux-line);border-radius:999px;background:transparent;color:var(--lux-muted)}.tabs-arrow:hover{border-color:var(--lux-primary-muted);color:var(--lux-text-strong)}.tab-panel{margin-top:20px;border-radius:10px;background:transparent;padding:16px}.accordion-list{margin-top:20px;overflow:hidden;border:1px solid var(--lux-line);border-radius:10px}.accordion-item{border-top:1px solid var(--lux-line);background:transparent}.accordion-item:first-child{border-top:0}.accordion-toggle{display:flex;width:100%;align-items:center;justify-content:space-between;gap:16px;border:0;background:transparent;padding:13px 16px;color:var(--lux-text-strong);text-align:left;font-weight:800;transition:background .16s}.accordion-toggle:hover{background:var(--lux-elevated)}.accordion-chevron{width:10px;height:10px;flex-shrink:0;border-bottom:2px solid currentColor;border-right:2px solid currentColor;transform:rotate(45deg);transition:transform .16s}.accordion-item.open .accordion-chevron{transform:rotate(225deg)}.accordion-panel{padding:0 16px 16px}
.sorting-grid{display:grid;grid-template-columns:minmax(0,.8fr) minmax(0,1.2fr);gap:20px;margin-top:20px}.sorting-items{display:grid;align-content:start;gap:8px}.sorting-label{margin:0;color:var(--lux-muted);font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.sorting-item{width:100%;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface-soft);padding:12px;color:var(--lux-text-strong);font-size:14px;font-weight:800;text-align:left;transition:border-color .16s,background .16s}.sorting-item:hover{border-color:color-mix(in srgb,var(--lux-primary-muted) 60%,transparent)}.sorting-item.selected{border-color:var(--lux-primary-muted);background:color-mix(in srgb,var(--lux-primary-muted) 15%,transparent)}.sorting-item.wrong{animation:sorting-shake .4s ease-in-out}.sorting-categories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.sorting-category{min-height:112px;border:1px dashed color-mix(in srgb,var(--lux-primary-muted) 45%,transparent);border-radius:10px;background:var(--lux-surface-soft);padding:16px;text-align:left;transition:border-color .16s,opacity .16s}.sorting-category:hover{border-color:var(--lux-primary-muted)}.sorting-category:disabled{cursor:not-allowed;opacity:.6}.sorting-category strong{display:block;color:var(--lux-text-strong);font-size:14px}.sorting-category em{display:block;margin-top:8px;color:var(--lux-muted);font-size:12px;font-style:normal}.sorting-category span{display:inline-flex;margin-top:12px;border-radius:999px;background:var(--lux-primary);padding:5px 10px;color:#fff;font-size:12px;font-weight:900}.sorting-complete{margin-top:20px;border:1px solid color-mix(in srgb,var(--lux-primary-muted) 40%,transparent);border-radius:10px;background:color-mix(in srgb,var(--lux-primary-muted) 10%,transparent);padding:16px}.sorting-complete p{margin:0;color:var(--lux-text-strong);font-weight:800}.sorting-complete span{display:block;margin-top:4px;color:var(--lux-muted);font-size:14px}
.process-steps-block{border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface);padding:20px;margin-top:28px}.process-card{margin-top:12px}.process-card h3{margin:0;color:var(--lux-text-strong);font-size:24px}.process-card p{margin-top:12px;white-space:pre-wrap;color:var(--lux-muted);font-size:14px;line-height:1.65}.process-actions{display:flex;justify-content:space-between;gap:12px;margin-top:20px}.secondary{display:inline-flex;align-items:center;justify-content:center;border:1px solid var(--lux-line);border-radius:999px;background:var(--lux-surface);padding:10px 16px;color:var(--lux-text-strong);font-weight:800}.secondary:hover{background:var(--lux-surface-soft)}.step-kicker{display:flex;align-items:center;gap:12px;color:var(--lux-muted);font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.step-kicker span:first-child{display:grid;width:32px;height:32px;place-items:center;border-radius:999px;background:var(--lux-primary);color:#fff}.process-step-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(220px,.8fr);gap:20px;margin-top:20px}
.chart-block h2{margin-bottom:14px}.chart-wrap,.chart-bars,.pie-list{border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface);padding:16px}.chart-bars{display:flex;align-items:flex-end;gap:10px;min-height:220px}.chart-bar-col{display:flex;min-width:0;flex:1;flex-direction:column;align-items:center;gap:10px}.chart-bar-track{position:relative;width:100%;height:160px;overflow:hidden;border-radius:10px;background:var(--lux-surface-soft)}.chart-bar-fill{position:absolute;right:0;bottom:0;left:0;background:var(--lux-primary);transform-origin:bottom;animation:bar-rise .55s ease both}.chart-bar-label{max-width:100%;overflow:hidden;color:var(--lux-muted);font-size:12px;text-align:center;text-overflow:ellipsis;white-space:nowrap}.pie-list{display:grid;gap:10px}.pie-row{display:flex;align-items:center;gap:10px}.pie-swatch{width:10px;height:10px;border-radius:999px}.pie-label{color:var(--lux-text-strong);font-weight:800}.pie-value{margin-left:auto;color:var(--lux-muted);font-weight:800}
.quiz-runtime{display:grid;gap:16px}.quiz-question{border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface);padding:20px}.quiz-question h2{margin:8px 0 0;font-size:20px}.quiz-question-image{display:block;width:100%;max-height:320px;object-fit:contain;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface-soft);margin-top:16px}.quiz-choices{display:grid;gap:8px;margin-top:16px}.quiz-text-answer,.matching-row select{width:100%;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface);color:var(--lux-text);padding:11px 12px;outline:0}.quiz-text-answer:focus,.matching-row select:focus{border-color:var(--lux-primary);box-shadow:0 0 0 3px var(--lux-primary-soft)}.matching-list{display:grid;gap:8px;margin-top:16px}.matching-row{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:10px;align-items:center;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface-soft);padding:12px}.matching-row span{font-weight:800;color:var(--lux-text-strong)}.quiz-actions{display:flex;flex-wrap:wrap;align-items:center;gap:12px;margin-top:16px}.quiz-actions span{color:var(--lux-muted);font-size:12px;font-weight:800}.quiz-feedback{display:none;margin-top:16px;border:1px solid var(--lux-line);border-radius:10px;padding:12px;font-size:14px}.quiz-feedback.correct{display:block;border-color:rgba(34,197,94,.45);background:rgba(34,197,94,.12);color:${isLight ? '#166534' : '#bbf7d0'}}.quiz-feedback.incorrect{display:block;border-color:rgba(239,68,68,.45);background:rgba(239,68,68,.12);color:${isLight ? '#991b1b' : '#fecaca'}}.quiz-summary{border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface);padding:20px;color:var(--lux-muted);display:flex;align-items:center;justify-content:space-between;gap:12px}.quiz-summary strong{color:var(--lux-text-strong)}.quiz-summary span{font-size:13px;font-weight:700}.scenario{border-top:1px solid var(--lux-line);padding-top:20px}.scenario h1{font-size:24px}.scenario .choice{border-color:var(--lux-line);background:var(--lux-surface)}
@media(max-width:900px){body{overflow:auto}.runtime-preview{height:auto;min-height:100vh;padding:12px}.runtime-frame{height:auto;min-height:calc(100vh - 24px)}.runtime-topbar{align-items:flex-start}.runtime-shell,.runtime-shell[data-sidebar="collapsed"]{grid-template-columns:1fr;grid-template-rows:minmax(180px,30vh) minmax(0,1fr)}.runtime-nav{border-right:0;border-bottom:1px solid var(--lux-line)}.runtime-shell[data-sidebar="collapsed"] .runtime-brand{display:block}.runtime-shell[data-sidebar="collapsed"] .nav-title,.runtime-shell[data-sidebar="collapsed"] .progress-label,.runtime-shell[data-sidebar="collapsed"] #progress-text{display:block}.runtime-main{overflow:visible;padding:16px}.page-card{padding:20px 8px}.sorting-grid,.process-step-grid{grid-template-columns:1fr}.gallery-cols-3,.gallery-cols-4{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:640px){.runtime-preview{padding:0}.runtime-frame{min-height:100vh;border-radius:0}.runtime-topbar{padding:14px}.runtime-standard{display:none}.page-card{padding:18px 0}.page-title-hero>div{padding:24px}.items-grid article{grid-template-columns:1fr}.gallery-cols-2,.gallery-cols-3,.gallery-cols-4,.sorting-categories,.matching-row{grid-template-columns:1fr}.quiz-summary{align-items:flex-start;flex-direction:column}.quote-block blockquote{font-size:21px}.flashcard{flex-basis:100%}}`;
  }

  protected escHtml(value: string): string {
    return (value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  protected sortScenarioTree(scenario: Scenario): void {
    scenario.modules?.sort((a, b) => a.ordre - b.ordre || a.id - b.id);
    scenario.modules?.forEach((module) => {
      module.sequences?.sort((a, b) => a.ordre - b.ordre || a.id - b.id);
      module.sequences?.forEach((sequence) => {
        sequence.activites?.sort((a, b) => a.ordre - b.ordre || a.id - b.id);
        // Mirrors ScenarioService.sortScenarioTree(): the export path has its
        // own copy of this method, so it needs the same quiz/question/answer
        // sort or exported SCORM/PDF packages fall back to DB return order.
        sequence.activites?.forEach((activite) => {
          activite.quiz?.questions?.sort(
            (a, b) => a.ordre - b.ordre || a.id - b.id,
          );
          activite.quiz?.questions?.forEach((question) => {
            question.reponses?.sort((a, b) => a.ordre - b.ordre || a.id - b.id);
          });
        });
      });
    });
  }
}
