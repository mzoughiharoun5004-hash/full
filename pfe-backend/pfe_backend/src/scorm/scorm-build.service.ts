import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import JSZip from 'jszip';
import { Repository } from 'typeorm';
import { Scenario } from 'src/scenario/scenario.entity';
import { ScenarioService } from 'src/scenario/scenario.service';
import { CourseDocument } from 'src/scenario/course-document.types';
import { ScormExportBase } from './scorm-export.base';

@Injectable()
export class ScormBuildService extends ScormExportBase {
  constructor(
    @InjectRepository(Scenario)
    private readonly scenarioRepo: Repository<Scenario>,
    private readonly scenarioService: ScenarioService,
  ) {
    super();
  }

  async generateScormPackage(
    scenarioId: number,
    assetBaseUrl?: string,
  ): Promise<Buffer> {
    const scenario = await this.scenarioRepo.findOne({
      where: { id: scenarioId },
      relations: [
        'user',
        'modules',
        'modules.sequences',
        'modules.sequences.activites',
        'modules.sequences.activites.quiz',
        'modules.sequences.activites.quiz.questions',
        'modules.sequences.activites.quiz.questions.reponses',
      ],
    });

    if (!scenario) {
      throw new NotFoundException(`Scenario #${scenarioId} not found`);
    }

    this.sortScenarioTree(scenario);
    const course = this.normalizeCourseForExport(
      this.scenarioService.resolveCourseDocumentForExport(scenario),
      assetBaseUrl,
    );
    const zip = new JSZip();

    zip.file('imsmanifest.xml', this.buildManifest(scenario, course));
    zip.file('index.html', this.buildIndexHtml(course));
    zip.file('course.json', JSON.stringify(course, null, 2));
    zip.file('course-data.js', this.buildCourseDataJs(course));
    zip.file('runtime.js', this.buildRuntime());
    zip.file('scorm.js', this.buildScormWrapper(course.settings.scormVersion));
    zip.file('styles.css', this.buildStylesheet(course.theme));

    return zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    });
  }
  private buildManifest(scenario: Scenario, course: CourseDocument): string {
    const scorm = this.courseScormSettings(course);
    const courseIdentifier =
      typeof scorm.courseIdentifier === 'string'
        ? scorm.courseIdentifier
        : undefined;
    const uid = this.scormIdentifier(
      courseIdentifier ?? `SCO_${scenario.id}_${Date.now()}`,
    );
    const lmsTitle = typeof scorm.lmsTitle === 'string' ? scorm.lmsTitle : '';
    const title = this.escXml(lmsTitle.trim() || course.title);
    const files = [
      'index.html',
      'course.json',
      'course-data.js',
      'runtime.js',
      'scorm.js',
      'styles.css',
    ]
      .map((file) => `<file href="${file}"/>`)
      .join('\n      ');

    return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${uid}" version="1.1"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
    http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">
  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>${course.settings.scormVersion === '2004' ? '2004 4th Edition' : '1.2'}</schemaversion>
  </metadata>
  <organizations default="ORG_001">
    <organization identifier="ORG_001" structure="hierarchical">
      <title>${title}</title>
      ${course.pages
        .map(
          (page, index) => `
      <item identifier="ITEM_${index}" identifierref="RESOURCE_SCO" parameters="page=${index}">
        <title>${this.escXml(page.title)}</title>
      </item>`,
        )
        .join('')}
    </organization>
  </organizations>
  <resources>
    <resource identifier="RESOURCE_SCO" type="webcontent" adlcp:scormtype="sco" href="index.html">
      ${files}
    </resource>
  </resources>
</manifest>`;
  }

  private courseScormSettings(course: CourseDocument): Record<string, unknown> {
    const scorm = course.metadata?.scorm;
    return scorm && typeof scorm === 'object'
      ? (scorm as Record<string, unknown>)
      : {};
  }

  private scormIdentifier(value: string): string {
    const normalized = String(value ?? '')
      .trim()
      .replace(/[^A-Za-z0-9_.-]+/g, '_');
    return normalized || `SCO_${Date.now()}`;
  }

  private buildIndexHtml(course: CourseDocument): string {
    const previewTheme = course.theme?.themeMode === 'light' ? 'light' : 'dark';
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${this.escHtml(course.title)}</title>
  <link rel="stylesheet" href="styles.css"/>
</head>
<body data-preview-theme="${previewTheme}">
  <div id="app" class="runtime-preview">
    <div class="runtime-frame">
      <header class="runtime-topbar">
        <div class="runtime-title">
          <h1>${this.escHtml(course.title)}</h1>
          ${
            course.description?.trim()
              ? `<span>${this.escHtml(course.description)}</span>`
              : ''
          }
        </div>
        <div class="runtime-topbar-actions">
          <span class="runtime-standard">SCORM ${this.escHtml(course.settings.scormVersion)}</span>
        </div>
      </header>
      <div class="runtime-shell" data-sidebar="expanded">
        <aside class="runtime-nav">
          <div class="runtime-nav-head">
            <div class="runtime-brand">${this.escHtml(course.title)}</div>
            <button id="sidebar-toggle" class="sidebar-toggle" type="button" aria-label="Collapse navigation" aria-expanded="true">
              <span aria-hidden="true"></span>
            </button>
          </div>
          <div id="nav" class="lux-scrollbar"></div>
          <div class="progress-wrap">
            <div class="progress-label">Progress</div>
            <div class="progress-track"><div id="progress-fill"></div></div>
            <div id="progress-text">0%</div>
          </div>
        </aside>
        <main class="runtime-main lux-scrollbar">
          <div id="page"></div>
        </main>
      </div>
    </div>
  </div>
  <script type="application/json" id="course-data">${this.embedCourseJson(course)}</script>
  <script src="scorm.js"></script>
  <script src="course-data.js"></script>
  <script src="runtime.js"></script>
</body>
</html>`;
  }

  // The runtime is emitted as plain browser JavaScript so exported packages work
  // after extraction or inside an LMS without a bundler, server, or module loader.
  private buildRuntime(): string {
    return `(() => {
  let course = null;
  let currentPage = 0;
  let visited = new Set();
  let revealedContinue = new Set();
  let completedBlocks = new Set();
  let score = 0;
  let possibleScore = 0;
  let quizResults = {};
  let accentColor = '#0f6b4a';
  let sidebarCollapsed = false;

  // UI state for completion-related interactive blocks (kept in-memory)
  const accordionTabsState = {};
  const sortingState = {};
  const processStepsState = {};
  const flashcardsState = {};

  const qs = (selector) => document.querySelector(selector);
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
  const normalizeUrl = (value) => {
    const url = String(value ?? '').trim();
    if (!url) return '';
    if (url.startsWith('http') || url.startsWith('data:') || url.startsWith('blob:')) return url;
    const base = String(course?.metadata?.assetBaseUrl ?? '').trim();
    if (!base) return url;
    if (url.startsWith('/')) return base + url;
    return base + '/' + url;
  };
  function applyTheme() {
    const theme = course?.theme || {};
    const mode = theme.themeMode === 'light' ? 'light' : 'dark';
    accentColor = theme.accentColor || '#0f6b4a';
    document.body?.setAttribute('data-preview-theme', mode);
    const root = document.documentElement?.style;
    if (!root || typeof root.setProperty !== 'function') return;
    root.setProperty('--lux-primary', accentColor);
    root.setProperty('--lux-primary-hover', 'color-mix(in srgb, ' + accentColor + ' 88%, var(--lux-text-strong))');
    root.setProperty('--lux-primary-soft', 'color-mix(in srgb, ' + accentColor + ' 14%, transparent)');
    root.setProperty('--lux-primary-muted', 'color-mix(in srgb, ' + accentColor + ' 62%, var(--lux-text-strong))');
    root.setProperty('--lux-scroll-thumb-hover', 'color-mix(in srgb, ' + accentColor + ' 64%, transparent)');
    root.setProperty('--accent', accentColor);
  }
  const metaString = (block, key, fallback = '') => {
    const meta = block?.metadata || {};
    const value = meta ? meta[key] : undefined;
    return typeof value === 'string' ? value : fallback;
  };
  const statementStyleLabel = (value) => {
    const normalized = String(value || 'Info').replace(/^\\s*[^A-Za-z0-9]*/, '').trim();
    const lower = normalized.toLowerCase();
    if (lower === 'warning') return 'Warning';
    if (lower === 'tip') return 'Tip';
    if (lower === 'note') return 'Note';
    return 'Info';
  };
  const statementStyleClass = (value) => statementStyleLabel(value).toLowerCase();
  const statementTextLabel = (value) => {
    const normalized = String(value || '').replace(/^\\s*[^A-Za-z0-9]*/, '').trim();
    return normalized || String(value || '').trim();
  };
  const statementCalloutLabel = (title, styleLabel) => {
    const trimmed = String(title || '').trim();
    const defaultLabels = ['info', 'warning', 'tip', 'note'];
    return trimmed && !defaultLabels.includes(statementTextLabel(trimmed).toLowerCase())
      ? statementTextLabel(trimmed)
      : statementStyleLabel(styleLabel);
  };
  const metaNumber = (block, key, fallback = 0) => {
    const value = block?.metadata ? block.metadata[key] : undefined;
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  };
  const metaBoolean = (block, key, fallback = false) => {
    const value = block?.metadata ? block.metadata[key] : undefined;
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    return fallback;
  };
  const blockUrl = (block) => {
    const mediaTypes = ['image', 'video', 'audio', 'embed', 'attachment', 'document', 'file_download', 'resource_link'];
    const useContent = mediaTypes.includes(block?.type);
    return normalizeUrl(
      block?.assetUrl ||
        (useContent ? block?.content : '') ||
        metaString(block, 'fileUrl') ||
        metaString(block, 'url') ||
        (block?.type === 'embed' ? metaString(block, 'iframe') : ''),
    );
  };

  function lessonToPage(lesson) {
    return {
      id: lesson.id,
      type: lesson.type === 'quiz' ? 'quiz' : 'lesson',
      title: lesson.title,
      summary: lesson.summary,
      coverImageUrl: lesson.coverImageUrl,
      blocks: lesson.blocks || [],
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

  function pageBlockCount(pages) {
    return pages.reduce((total, page) => total + ((page && page.blocks) ? page.blocks.length : 0), 0);
  }

  function resolvePages(data) {
    const lessons = Array.isArray(data.lessons) ? data.lessons : [];
    const fromLessons = lessons.map(lessonToPage);
    const fromPages = Array.isArray(data.pages) ? data.pages : [];
    if (fromLessons.length && pageBlockCount(fromLessons) >= pageBlockCount(fromPages)) {
      return fromLessons;
    }
    if (fromPages.length) return fromPages;
    return fromLessons;
  }

  function loadCourseDataFromDom() {
    if (window.__SCORM_COURSE__) return window.__SCORM_COURSE__;
    const embedded = document.getElementById('course-data');
    if (embedded && embedded.textContent && embedded.textContent.trim()) {
      return JSON.parse(embedded.textContent);
    }
    return null;
  }

  async function loadCourseData() {
    const fromDom = loadCourseDataFromDom();
    if (fromDom) return fromDom;
    if (location.protocol === 'file:') {
      throw new Error(
        'Course data could not be read from this page. Re-export the SCORM zip, extract every file, and open index.html from that folder.',
      );
    }
    const response = await fetch('course.json');
    if (!response.ok) {
      throw new Error('course.json could not be loaded (HTTP ' + response.status + ')');
    }
    return response.json();
  }

  function showLoadError(message) {
    const main = qs('#page');
    if (!main) return;
    const fileHint =
      location.protocol === 'file:'
        ? '<p class="summary">Tip: from the extracted folder run <code>npx serve .</code> and open the http:// URL, or upload the zip to your LMS.</p>'
        : '<p class="summary">Open index.html from the extracted SCORM folder, or launch it from your LMS.</p>';
    main.innerHTML =
      '<section class="page-card"><p class="summary">' +
      esc(message) +
      '</p>' +
      fileHint +
      '</section>';
  }

  async function init() {
    try {
      const data = await loadCourseData();
      course = { ...data, pages: resolvePages(data) };
      if (!course.pages.length) {
        showLoadError('This course has no lessons or pages to display.');
        return;
      }
      applyTheme();
      if (!window.scormRuntime) {
        throw new Error('scorm.js did not load. Keep index.html, course-data.js, runtime.js, and scorm.js in the same folder.');
      }
      window.scormRuntime.init(course.settings?.scormVersion || '1.2');
      restoreState();
      if (currentPage >= course.pages.length) currentPage = 0;
      bindSidebarToggle();
      renderBrand();
      renderNav();
      renderPage(currentPage);
    } catch (error) {
      const message =
        error && error.message ? String(error.message) : 'Failed to load course data.';
      showLoadError(message);
    }
  }

  function restoreState() {
    const suspend = window.scormRuntime.get('suspend');
    if (!suspend) return;
    try {
      const state = JSON.parse(suspend);
      currentPage = Number.isInteger(state.currentPage) ? state.currentPage : 0;
      visited = new Set(Array.isArray(state.visited) ? state.visited : []);
      revealedContinue = new Set(
        Array.isArray(state.revealedContinue) ? state.revealedContinue : [],
      );
      completedBlocks = new Set(
        Array.isArray(state.completedBlocks) ? state.completedBlocks : [],
      );
      score = Number(state.score) || 0;
      possibleScore = Number(state.possibleScore) || 0;
      quizResults = state.quizResults && typeof state.quizResults === 'object' ? state.quizResults : {};
    } catch {
      currentPage = 0;
    }
  }

  function quizTotals() {
    return Object.values(quizResults || {}).reduce((total, result) => {
      if (!result || !result.submitted) return total;
      total.score += Number(result.score) || 0;
      total.possible += Number(result.possible) || 0;
      return total;
    }, { score: 0, possible: 0 });
  }

  function hasQuizPages() {
    return (course?.pages || []).some((page) => page?.type === 'quiz' && page.quiz && Array.isArray(page.quiz.questions) && page.quiz.questions.length > 0);
  }

  function allQuizPagesSubmitted() {
    const quizPages = (course?.pages || []).filter((page) => page?.type === 'quiz' && page.quiz && Array.isArray(page.quiz.questions) && page.quiz.questions.length > 0);
    return quizPages.every((page) => Boolean(quizResults?.[page.id]?.submitted));
  }

  function allQuizPagesPassed() {
    const quizPages = (course?.pages || []).filter((page) => page?.type === 'quiz' && page.quiz && Array.isArray(page.quiz.questions) && page.quiz.questions.length > 0);
    return quizPages.every((page) => Boolean(quizResults?.[page.id]?.submitted) && Boolean(quizResults?.[page.id]?.passed));
  }

  function coursePassingScore() {
    const raw = Number(course?.settings?.passingScore ?? course?.publish?.passingScore ?? 80);
    return Number.isFinite(raw) ? raw : 80;
  }

  function courseCompletionPolicy() {
    const settings = course?.settings || {};
    const publish = course?.publish || {};
    const rawThreshold = Number(settings.completionPercentage ?? publish.completionPercentage ?? 100);
    return {
      mode: settings.completionMode === 'score' ? 'score' : 'pages',
      completionPercentage: Number.isFinite(rawThreshold) ? Math.min(100, Math.max(1, rawThreshold)) : 100,
      requireQuizPass: Boolean(settings.requireQuizPass),
      tracking: publish.tracking === 'completion' || publish.tracking === 'quiz_score' || publish.tracking === 'completion_and_score'
        ? publish.tracking
        : 'completion_and_score',
    };
  }

  function setLmsCompletion(complete, rawScore) {
    const hasScore = Number.isFinite(rawScore);
    const passed = hasScore ? rawScore >= coursePassingScore() : undefined;
    const version = typeof window.scormRuntime.version === 'function' ? window.scormRuntime.version() : '1.2';
    if (version === '2004') {
      window.scormRuntime.set('status', complete ? 'completed' : 'incomplete');
      if (complete && hasScore) window.scormRuntime.set('success', passed ? 'passed' : 'failed');
      return;
    }
    if (!complete) {
      window.scormRuntime.set('status', 'incomplete');
      return;
    }
    window.scormRuntime.set('status', hasScore ? (passed ? 'passed' : 'failed') : 'completed');
  }

  function saveState() {
    if (!window.scormRuntime || typeof window.scormRuntime.set !== 'function') return;
    try {
      const quizScore = quizTotals();
      const totalScore = score + quizScore.score;
      const totalPossible = possibleScore + quizScore.possible;
      const payload = JSON.stringify({
        currentPage,
        visited: Array.from(visited),
        revealedContinue: Array.from(revealedContinue),
        completedBlocks: Array.from(completedBlocks),
        score,
        possibleScore,
        quizResults,
      });
      window.scormRuntime.set('location', String(currentPage));
      window.scormRuntime.set('suspend', payload);
      const progress = course.pages.length ? Math.round((visited.size / course.pages.length) * 100) : 0;
      const rawScore = totalPossible ? Math.round((totalScore / totalPossible) * 100) : progress;
      const quizComplete = !hasQuizPages() || allQuizPagesSubmitted();
      const quizPassComplete = !hasQuizPages() || allQuizPagesPassed();
      const policy = courseCompletionPolicy();
      const pagesComplete = progress >= policy.completionPercentage;
      // No scorable content means there's nothing to fail: treat as vacuously met
      // rather than permanently blocking completion (previously hard-coded false).
      const scoreComplete = totalPossible ? rawScore >= coursePassingScore() : true;
      let complete = policy.mode === 'score' ? scoreComplete : pagesComplete;
      if (policy.requireQuizPass) {
        // Every quiz must individually clear its own passing score, not just the
        // blended aggregate - otherwise a learner can fail a quiz below its own
        // threshold and still pass the course on average.
        complete = complete && quizComplete && quizPassComplete && scoreComplete;
      } else if (policy.tracking === 'quiz_score') {
        complete = scoreComplete;
      } else if (policy.tracking === 'completion') {
        complete = pagesComplete;
      } else {
        complete = complete && quizComplete;
      }
      window.scormRuntime.set('score', rawScore);
      window.scormRuntime.set('scoreMin', 0);
      window.scormRuntime.set('scoreMax', 100);
      setLmsCompletion(complete, policy.tracking === 'completion' ? undefined : totalPossible ? rawScore : undefined);
      if (typeof window.scormRuntime.commit === 'function') {
        window.scormRuntime.commit();
      }
    } catch {
      // Offline file preview may not have a SCORM API.
    }
  }

  function renderBrand() {
    const brand = qs('.runtime-brand');
    if (!brand) return;
    const cover = normalizeUrl(course?.theme?.coverImageUrl);
    const title = course?.title || 'Course';
    const description = String(course?.description || '').trim();
    brand.innerHTML =
      '<div class="runtime-brand-title">' + esc(title) + '</div>' +
      (description ? '<p class="runtime-brand-description">' + esc(description) + '</p>' : '');
    brand.classList.toggle('has-cover', Boolean(cover));
    brand.style.backgroundImage = cover
      ? 'linear-gradient(rgba(5, 12, 14, 0.58), rgba(5, 12, 14, 0.58)), url("' + cover.replace(/"/g, '\\"') + '")'
      : '';
  }

  function renderSidebarState() {
    const shell = qs('.runtime-shell');
    const toggle = qs('#sidebar-toggle');
    shell?.setAttribute('data-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
    toggle?.setAttribute('aria-expanded', String(!sidebarCollapsed));
    toggle?.setAttribute('aria-label', sidebarCollapsed ? 'Expand navigation' : 'Collapse navigation');
  }

  function bindSidebarToggle() {
    try {
      sidebarCollapsed = window.localStorage?.getItem('course-preview-sidebar') === 'collapsed';
    } catch {
      sidebarCollapsed = false;
    }
    renderSidebarState();
    qs('#sidebar-toggle')?.addEventListener('click', () => {
      sidebarCollapsed = !sidebarCollapsed;
      try {
        window.localStorage?.setItem('course-preview-sidebar', sidebarCollapsed ? 'collapsed' : 'expanded');
      } catch {
        // LMS preview frames may disallow localStorage.
      }
      renderSidebarState();
    });
  }

  function renderNav() {
    const nav = qs('#nav');
    if (!nav) return;
    nav.innerHTML = course.pages.map((page, index) =>
      '<button class="nav-item" data-index="' + index + '" title="' + esc(page.title) + '">' +
      '<span class="nav-index">' + (index + 1) + '</span><span class="nav-title">' + esc(page.title) + '</span></button>'
    ).join('');
    document.querySelectorAll('.nav-item').forEach((button) => {
      button.addEventListener('click', () => renderPage(Number(button.dataset.index)));
    });
  }

  function scrollLessonToTop() {
    const targets = [qs('.runtime-main'), qs('.runtime-preview')].filter(Boolean);
    targets.forEach((target) => {
      if (typeof target.scrollTo === 'function') target.scrollTo({ top: 0, left: 0, behavior: 'auto' });
      else target.scrollTop = 0;
    });
    if (typeof window.scrollTo === 'function') window.scrollTo({ top: 0, left: 0, behavior: 'auto' });
  }

  function captureScrollState() {
    return {
      main: qs('.runtime-main')?.scrollTop || 0,
      preview: qs('.runtime-preview')?.scrollTop || 0,
      windowX: Number(window.pageXOffset || 0),
      windowY: Number(window.pageYOffset || 0),
    };
  }

  function restoreScrollState(state) {
    const main = qs('.runtime-main');
    const preview = qs('.runtime-preview');
    if (main) main.scrollTop = state.main || 0;
    if (preview) preview.scrollTop = state.preview || 0;
    if (typeof window.scrollTo === 'function') {
      window.scrollTo(state.windowX || 0, state.windowY || 0);
    }
  }

  function renderCurrentPageSoft() {
    renderPage(currentPage, { animate: false, preserveScroll: true, scrollTop: false });
  }

  function renderPage(index, options = {}) {
    if (!course?.pages?.length) {
      showLoadError('This course has no lessons or pages to display.');
      return;
    }
    const nextPage = Math.max(0, Math.min(index, course.pages.length - 1));
    const pageChanged = nextPage !== currentPage;
    currentPage = nextPage;
    const page = course.pages[currentPage];
    if (!page) return;
    const scrollState = options.preserveScroll ? captureScrollState() : null;
    const animate = options.animate !== false;
    visited.add(page.id);
    document.querySelectorAll('.nav-item').forEach((item) => {
      item.classList.toggle('active', Number(item.dataset.index) === currentPage);
    });
    const pageHasLockedContinue = (page.blocks || []).some(
      (b) => b && b.type === 'continue_button' && !revealedContinue.has(b.id),
    );
    try {
      qs('#page').innerHTML =
        '<section class="page-card' + (animate ? '' : ' page-card-static') + '">' +
        renderPreviousLessonLink() +
        renderPageBody(page) +
        renderNextLessonLink(pageHasLockedContinue) +
        '</section>';
      bindInteractions(page);
      if (scrollState) restoreScrollState(scrollState);
      if (pageChanged && options.scrollTop !== false) scrollLessonToTop();
      updateProgress();
      saveState();
    } catch (error) {
      const message = error && error.message ? String(error.message) : 'Could not render this page.';
      showLoadError(message);
    }
  }

  function defaultItemsFor(type) {
    if (['list', 'numbered_list', 'checklist', 'lesson_summary', 'ordering', 'process_steps'].includes(type)) {
      return [{ title: '', content: '' }, { title: '', content: '' }];
    }
    if (['accordion', 'tabs', 'flashcards'].includes(type)) {
      return [{ title: '', content: '', match: '', mediaUrl: '' }, { title: '', content: '', match: '', mediaUrl: '' }];
    }
    if (['timeline', 'sorting_activity', 'sorting', 'matching'].includes(type)) {
      return [{ title: '', content: '', match: '' }, { title: '', content: '', match: '' }];
    }
    if (['multiple_choice', 'multiple_select'].includes(type)) {
      return [{ title: '', content: 'false' }, { title: '', content: 'false' }];
    }
    if (type === 'true_false') {
      return [{ title: 'True', content: 'false' }, { title: 'False', content: 'false' }];
    }
    if (type === 'image_gallery') {
      return [{ title: '', mediaUrl: '', content: '' }, { title: '', mediaUrl: '', content: '' }];
    }
    return [];
  }

  function defaultMetadataFor(type) {
    const questionTypes = ['multiple_choice', 'multiple_select', 'multiple_response', 'fill_blank', 'matching', 'true_false', 'hotspot', 'short_answer', 'likert', 'rating_slider'];
    const questionDefaults = questionTypes.includes(type)
      ? { points: 1, hint: '', required: true, shuffle: false, allowRetry: true, maxAttempts: 1, correctFeedback: '', incorrectFeedback: '', partialFeedback: '' }
      : {};
    const defaults = {
      heading: { level: 'H2', subtitle: '' },
      callout: { style: 'Info' },
      statement: { style: 'Info' },
      quote: { attributionName: '', attributionRole: '', avatarUrl: '', showQuoteMark: true, showAvatar: true, layout: 'standard', imageUrl: '', overlayOpacity: 55, alignment: 'left', spacing: 'normal' },
      divider: { style: 'solid', label: '' },
      image: { caption: '', alt: '', width: 'medium' },
      image_gallery: { layout: '2-col grid' },
      video: { autoplay: false, caption: '' },
      audio: { transcript: '' },
      embed: { height: 420, iframe: '' },
      dialogue: { bubbleStyle: 'Chat' },
      character_monologue: { characterName: '', avatarUrl: '', emotion: 'neutral', alignment: 'left' },
      branching_dialogue: { bubbleStyle: 'Chat' },
      fill_blank: { acceptedAnswers: '', caseSensitive: false },
      true_false: { correctAnswer: 'True', explanation: '' },
      matching: { instructions: '' },
      hotspot: { imageUrl: '', regions: '' },
      short_answer: { keywords: '', manualReview: false },
      likert: { scaleSize: 5, lowLabel: 'Strongly disagree', highLabel: 'Strongly agree' },
      rating_slider: { min: 0, max: 10, step: 1, minLabel: '', maxLabel: '' },
      choice_point: { destinationMode: 'lesson' },
      consequence: { imageUrl: '', label: 'Result:' },
      decision_recap: { autoPopulate: true, intro: '' },
      branch_merge: { internalLabel: '' },
      conditional_gate: { conditionType: 'viewed lesson', target: '', lockedMessage: '' },
      timeline: { orientation: 'vertical' },
      checklist: { showProgress: true },
      reveal: { triggerLabel: 'Reveal', hiddenContent: '' },
      accordion: { behavior: 'single' },
      tabs: { overflowArrows: true },
      flashcards: { layout: 'grid', clickPrompt: 'Click to flip', imageSide: 'front' },
      sorting_activity: { graded: false, instructions: 'Sort each item into the correct category.', completionMessage: 'All items sorted.' },
      before_after: { beforeImage: '', afterImage: '', beforeLabel: 'Before', afterLabel: 'After' },
      table: { rows: 3, columns: 3, headerRow: true },
      chart: { chartType: 'bar', data: JSON.stringify([{ label: 'Item 1', value: 40 }, { label: 'Item 2', value: 70 }, { label: 'Item 3', value: 55 }]), axisLabels: '', chartTitle: '' },
      resource_link: { url: '', icon: '' },
      file_download: { fileUrl: '', label: '', description: '' },
      glossary: { term: '', definition: '', example: '' },
      process_steps: { introTitle: 'Process overview', introText: '', introImageUrl: '', startLabel: 'Start', summaryTitle: 'Process complete', summaryText: '', restartLabel: 'Start Again' },
      continue_button: { label: 'Continue', alignment: 'center', completionType: 'None', lockedHint: 'Complete the required activity above to continue.', unlockedHint: 'Ready to continue.' },
      score_summary: { sourceQuiz: '', passMessage: '', failMessage: '' },
      certificate: { logoUrl: '', signatureUrl: '' },
      completion_message: { imageUrl: '' },
      restart_button: { label: 'Restart', scope: 'entire course' },
    };
    return { ...questionDefaults, ...(defaults[type] || {}) };
  }

  function itemText(value) {
    return String(value ?? '').trim();
  }

  function visibleInteractionItems(block) {
    return (block?.items || []).filter((item) =>
      itemText(item?.title) || itemText(item?.content) || itemText(item?.mediaUrl) || itemText(item?.match),
    );
  }

  function visibleFlashcardItems(block) {
    return (block?.items || []).filter((item) =>
      itemText(item?.title) || itemText(item?.content) || itemText(item?.mediaUrl),
    );
  }

  function blockRequiresUserCompletion(block) {
    if (!block) return false;
    if (block.type === 'flashcards') return visibleFlashcardItems(block).length > 0;
    if (block.type === 'accordion' || block.type === 'tabs' || block.type === 'process_steps') return visibleInteractionItems(block).length > 0;
    if (block.type === 'sorting_activity' || block.type === 'sorting') {
      return (block.items || []).some((item) => itemText(item?.title) && itemText(item?.match));
    }
    return true;
  }

  function valuesEqual(a, b) {
    if (a === b) return true;
    if (typeof a === 'number' || typeof b === 'number') {
      const an = Number(a);
      const bn = Number(b);
      return Number.isFinite(an) && Number.isFinite(bn) && an === bn;
    }
    if (typeof a === 'boolean' || typeof b === 'boolean') {
      return String(a) === String(b);
    }
    return false;
  }

  function itemDiffersFromDefault(item, fallback) {
    const def = fallback || {};
    return itemText(item?.title) !== itemText(def.title) ||
      itemText(item?.content) !== itemText(def.content) ||
      itemText(item?.mediaUrl) !== itemText(def.mediaUrl) ||
      itemText(item?.match) !== itemText(def.match);
  }

  function hasKnowledgeCheckContent(block) {
    const check = block?.knowledgeCheck || block?.metadata?.knowledgeCheck;
    if (!check || typeof check !== 'object') return false;
    if (itemText(check.question)) return true;
    return Array.isArray(check.options) && check.options.some((option) =>
      itemText(option?.text) || itemText(option?.feedback) || Boolean(option?.isCorrect),
    );
  }

  function blockHasContent(block) {
    if (!block) return false;
    if (block.type === 'continue_button') return true;
    if (block.type === 'divider' || block.type === 'spacer') return true;

    const hasText = Boolean(itemText(block.title) || itemText(block.content) || itemText(block.assetUrl));
    const defaultItems = defaultItemsFor(block.type);
    const hasItems = (block.items || []).some((item, index) => itemDiffersFromDefault(item, defaultItems[index]));
    const defaultMeta = defaultMetadataFor(block.type);
    const metadata = block.metadata || {};
    const skipMetaKeys = ['style', 'level', 'width', 'layout', 'required', 'shuffle', 'allowRetry', 'points', 'showQuoteMark', 'showAvatar', 'overlayOpacity', 'alignment', 'spacing', 'behavior', 'overflowArrows', 'items'];
    const hasMetadata = Object.entries(metadata).some(([key, value]) => {
      if (skipMetaKeys.includes(key)) return false;
      if (valuesEqual(value, defaultMeta[key])) return false;
      return value !== undefined && value !== null && value !== '';
    });

    return hasText || hasItems || hasMetadata || hasKnowledgeCheckContent(block);
  }

  function renderPageTitle(page) {
    const cover = normalizeUrl(page?.coverImageUrl);
    const lessonNumber = currentPage + 1;
    const totalLessons = course?.pages?.length || lessonNumber;
    const label = 'Lesson ' + lessonNumber + ' of ' + totalLessons;
    const summary = page.summary ? '<p class="summary page-summary">' + esc(page.summary) + '</p>' : '';
    if (!cover) {
      return '<p class="eyebrow">' + esc(label) + '</p><h1>' + esc(page.title) + '</h1>' + summary;
    }
    return '<header class="page-title-hero">' +
      '<img src="' + esc(cover) + '" alt=""/>' +
      '<div><p class="eyebrow">' + esc(label) + '</p><h1>' + esc(page.title) + '</h1>' + summary + '</div>' +
      '</header>';
  }

  function renderPageBody(page) {
    if (page.type === 'branching_scenario') return renderScenario(page);
    if (page.type === 'quiz') return renderQuiz(page);

    const blocks = page.blocks || [];

    const isPreviewAutoCompleteBlock = (block) =>
      !['accordion', 'tabs', 'flashcards', 'sorting_activity', 'sorting', 'process_steps', 'continue_button'].includes(block?.type);

    const isBlockComplete = (block) => {
      if (!block) return false;
      if (block.type === 'continue_button') return revealedContinue.has(block.id);
      if (!blockRequiresUserCompletion(block)) return true;
      if (isPreviewAutoCompleteBlock(block)) return true;
      return completedBlocks.has(block.id);
    };

    const renderContinueButton = (block, unlocked, revealed) => {
      const completionLabel = metaString(block, 'label', block.content || block.title || 'Continue');
      const alignmentRaw = metaString(block, 'alignment', 'center');
      const alignment = alignmentRaw === 'left' || alignmentRaw === 'right' ? alignmentRaw : 'center';

      const hint = revealed
        ? metaString(block, 'unlockedHint', 'Content unlocked.')
        : unlocked
          ? metaString(block, 'unlockedHint', 'Ready to continue.')
          : metaString(block, 'lockedHint', 'Complete the required activity above to continue.');

      const disabled = (!unlocked || revealed);
      const label = revealed ? 'Unlocked' : completionLabel;
      const disabledAttr = disabled ? ' disabled' : '';
      const styleAttr = unlocked && !revealed ? ' style="background:' + esc(accentColor) + '"' : '';

      return (
        '<section class="continue-wrap" style="text-align:' + esc(alignment) + '">' +
        '<button type="button" class="primary continue" data-block="' + esc(block.id) + '"' + disabledAttr + styleAttr + '>' + esc(label) + '</button>' +
        '<p class="continue-hint">' + esc(hint) + '</p>' +
        '</section>'
      );
    };

    const rendered = [];
    let contentLocked = false;

    for (let i = 0; i < blocks.length; i += 1) {
      const block = blocks[i];
      if (contentLocked) break;
      if (!blockHasContent(block)) continue;

      if (block.type === 'continue_button') {
        const revealed = revealedContinue.has(block.id);
        const completionType = metaString(block, 'completionType', 'None');
        const blocksAbove = blocks.slice(0, i).filter(blockHasContent);
        const previousBlock = [...blocksAbove].reverse().find((item) => item.type !== 'continue_button');

        const unlocked =
          completionType === 'None' ||
          (completionType === 'Complete Block Directly Above' && (!previousBlock || isBlockComplete(previousBlock))) ||
          (completionType === 'Complete All Blocks Above' && blocksAbove.every(isBlockComplete));

        rendered.push(renderContinueButton(block, unlocked, revealed));

        if (!revealed) contentLocked = true;
        continue;
      }

      rendered.push(renderBlock(block));
    }

    return renderPageTitle(page) + rendered.join('');
  }

  function renderBlock(block) {
    const title = String(block.title || '').trim();
    const content = String(block.content || '').trim();
    if (block.type === 'heading') {
      const subtitle = metaString(block, 'subtitle', '');
      return '<div class="block heading-block"><h2 class="block-heading">' + esc(content || title) + '</h2>' +
        (subtitle ? '<p class="block-subtitle">' + esc(subtitle) + '</p>' : '') +
        '</div>';
    }
    if (block.type === 'paragraph' || block.type === 'text') return '<div class="block text-block"><p>' + esc(content || '') + '</p></div>';
    if (block.type === 'quote') return renderQuoteBlock(block);
    if (block.type === 'statement') {
      return renderStatementBlock(block);
    }
    if (['numbered_list', 'list', 'checklist', 'ordering', 'timeline', 'lesson_summary'].includes(block.type)) return renderListBlock(block);
    if (block.type === 'image_gallery' || block.type === 'gallery') return renderGalleryBlock(block);
    if (['image', 'video', 'audio', 'embed', 'attachment', 'document', 'file_download', 'resource_link'].includes(block.type)) return renderMediaBlock(block);
    if (block.type === 'code') return '<pre class="code-block"><code>' + esc(content || title) + '</code></pre>';
    if (block.type === 'callout') {
      const styleLabel = statementStyleLabel(metaString(block, 'style', 'Info'));
      return '<aside class="block callout statement-' + esc(statementStyleClass(styleLabel)) + '">' +
        '<strong>' + esc(statementCalloutLabel(title, styleLabel)) + '</strong>' +
        '<p>' + esc(content || '') + '</p></aside>';
    }
    if (block.type === 'process_steps') return renderProcessStepsBlock(block);
    if (block.type === 'sorting_activity' || block.type === 'sorting') return renderSortingBlock(block);
    if (block.type === 'accordion' || block.type === 'tabs') return renderAccordionTabsBlock(block);
    if (block.type === 'knowledge_check') return renderKnowledgeCheck(block);
    if (block.type === 'divider') {
      const label = metaString(block, 'label', '');
      return '<div class="divider-block"><span></span>' + (label ? '<em>' + esc(label) + '</em>' : '') + '<span></span></div>';
    }
    if (block.type === 'spacer') return '<div class="spacer-block" style="height:' + (metaNumber(block, 'height', 48) || 48) + 'px"></div>';
    if (block.type === 'button' || block.type === 'restart_button') {
      const label = metaString(block, 'label', content || title || 'Continue');
      const alignmentRaw = metaString(block, 'alignment', 'center');
      const alignment = alignmentRaw === 'left' || alignmentRaw === 'right' ? alignmentRaw : 'center';
      return '<div class="button-block align-' + esc(alignment) + '"><a class="primary" href="' + esc(blockUrl(block) || '#') + '">' + esc(label) + '</a></div>';
    }
    if (block.type === 'continue_button') return '<div class="continue-wrap"><button class="primary continue" data-block="' + esc(block.id) + '">' + esc(String(block.metadata?.label || block.content || block.title || 'Continue')) + '</button></div>';
    if (block.type === 'flashcards') return renderFlashcardsBlock(block);
    if (['multiple_choice', 'multiple_select', 'true_false', 'fill_blank', 'matching', 'hotspot', 'short_answer', 'likert', 'rating_slider'].includes(block.type)) return renderQuestionBlock(block);
    if (['choice_point', 'branching_dialogue'].includes(block.type)) return renderBranchingDecisionBlock(block);
    if (block.type === 'table') return renderTableBlock(block);
    if (block.type === 'chart') return renderChartBlock(block);
    if (Array.isArray(block.items) && block.items.length) return renderItemsBlock(block);
    return '<div class="block interaction-block"><h2>' + esc(title || '') + '</h2><p>' + esc(content || '') + '</p></div>';
  }

    function renderStatementBlock(block) {
      const styleMeta = metaString(block, 'style', 'Info');
      const styleLabel = statementStyleLabel(styleMeta);
      const callout = statementCalloutLabel(block.title, styleLabel);
      return '<section class="statement-block statement-' + esc(statementStyleClass(styleLabel)) + '">' +
        '<div class="statement-label">' + esc(callout) + '</div>' +
        '<p>' + esc(block.content || '') + '</p></section>';
    }

    function renderQuoteBlock(block) {
      const body = String(block.content || block.title || '').trim();
      const attributionName = metaString(block, 'attributionName', String(block.metadata?.attribution || ''));
      const attributionRole = metaString(block, 'attributionRole', '');
      const avatarUrl = metaString(block, 'avatarUrl', '');
      const imageUrl = metaString(block, 'imageUrl', '');
      const layout = metaString(block, 'layout', 'standard');
      const alignment = metaString(block, 'alignment', 'left');
      const spacing = metaString(block, 'spacing', 'normal');
      const showQuoteMark = metaBoolean(block, 'showQuoteMark', true);
      const showAvatar = metaBoolean(block, 'showAvatar', true);
      const overlayOpacity = Math.max(0, Math.min(90, metaNumber(block, 'overlayOpacity', 55))) / 100;
      const alignClass = alignment === 'center' ? 'quote-align-center' : alignment === 'right' ? 'quote-align-right' : 'quote-align-left';
      const spacingClass = spacing === 'compact' ? 'quote-spacing-compact' : spacing === 'wide' ? 'quote-spacing-wide' : 'quote-spacing-normal';
      const avatar = showAvatar && avatarUrl ? normalizeUrl(avatarUrl) : '';
      const attribution = attributionName || attributionRole;
      const quoteContent =
        '<div class="quote-content ' + alignClass + ' ' + spacingClass + '">' +
        (showQuoteMark ? '<span class="quote-mark">&quot;</span>' : '') +
        '<blockquote>' + esc(body) + '</blockquote>' +
        (showQuoteMark ? '<span class="quote-mark quote-mark-end">&quot;</span>' : '') +
        (attribution ? '<figcaption>' +
          (avatar ? '<img src="' + esc(avatar) + '" alt=""/>' : '') +
          '<span>' +
          (attributionName ? '<strong>' + esc(attributionName) + '</strong>' : '') +
          (attributionRole ? '<em>' + esc(attributionRole) + '</em>' : '') +
          '</span></figcaption>' : '') +
        '</div>';

      if (layout === 'image' && imageUrl) {
        return '<figure class="quote-block quote-image" style="background-image:url(' + esc(normalizeUrl(imageUrl)) + ')">' +
          '<div style="background:rgba(11,15,22,' + overlayOpacity + ')">' + quoteContent + '</div></figure>';
      }
      return '<figure class="quote-block">' + quoteContent + '</figure>';
    }

    function mediaCredit(block) {
      const attribution = metaString(block, 'mediaAttribution', '');
      if (!attribution) return '';
      const url = metaString(block, 'mediaAttributionUrl', '');
      const label = esc(attribution);
      return '<p class="media-credit">' + (url ? '<a href="' + esc(url) + '" target="_blank" rel="noreferrer">' + label + '</a>' : label) + '</p>';
    }

    function renderMediaBlock(block) {
      const displayUrl = blockUrl(block);
      const caption = metaString(block, 'caption', metaString(block, 'label', ''));
      if (block.type === 'image') {
        return '<figure class="media-block image-block">' +
          (displayUrl ? '<img src="' + esc(displayUrl) + '" alt="' + esc(metaString(block, 'alt', block.title || '')) + '"/>' : '<div class="empty-media">Image</div>') +
          (caption ? '<figcaption>' + esc(caption) + '</figcaption>' : '') +
          mediaCredit(block) +
          '</figure>';
      }
      if (block.type === 'video') {
        if (!displayUrl) return '<div class="empty-media">Video</div>';
        return '<section class="media-block"><video controls src="' + esc(displayUrl) + '"></video>' + mediaCredit(block) + '</section>';
      }
      if (block.type === 'audio') return displayUrl ? '<section class="media-block"><audio controls src="' + esc(displayUrl) + '"></audio></section>' : '<div class="empty-media">Audio</div>';
      if (block.type === 'embed') {
        const src = displayUrl || metaString(block, 'iframe');
        return src ? '<section class="media-block"><iframe src="' + esc(src) + '" title="' + esc(block.title || 'Embedded content') + '"></iframe></section>' : '<div class="empty-media">Embed</div>';
      }
      return '<a class="attachment" href="' + esc(displayUrl || '#') + '" target="_blank" rel="noreferrer">' +
        '<span class="attachment-icon">DL</span><span><strong>' + esc(block.title || metaString(block, 'label', 'Open attachment')) + '</strong>' +
        (caption || displayUrl ? '<em>' + esc(caption || displayUrl) + '</em>' : '') +
        '</span></a>';
    }

    function renderItemsBlock(block) {
      const validItems = (block.items || []).filter(item => item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim());
      if (!validItems.length) return '';
      return '<section class="items-block"><h2>' + esc(block.title || '') + '</h2><div class="items-grid">' +
        validItems.map((item, index) => '<article><span>' + (index + 1) + '</span><h3>' + esc(item.title || '') + '</h3><p>' + esc(item.content || '') + '</p></article>').join('') +
        '</div></section>';
    }

    function renderFlashcardsBlock(block) {
      const validItems = visibleFlashcardItems(block);
      if (!validItems.length) return '';
      const blockId = block.id;
      const state = flashcardsState[blockId] || (flashcardsState[blockId] = { flippedIds: new Set(), flippedOnce: new Set(), total: validItems.length });
      if (!state.flippedIds) state.flippedIds = new Set();
      if (!state.flippedOnce) state.flippedOnce = new Set();
      state.total = validItems.length;
      if (state.flippedOnce.size >= validItems.length) completedBlocks.add(blockId);

      return '<section class="flashcards-block" data-block-id="' + esc(blockId) + '">' +
        (block.title ? '<h2>' + esc(block.title || '') + '</h2>' : '') +
        (block.content ? '<p class="summary">' + esc(block.content || '') + '</p>' : '') +
        '<div class="flashcards-grid">' +
        validItems.map((item) => {
          const mediaUrl = item.mediaUrl ? normalizeUrl(item.mediaUrl) : '';
          const imageSide = item.match === 'back' ? 'back' : 'front';
          const flipped = state.flippedIds.has(item.id);
          return '<div class="flashcard' + (flipped ? ' flipped' : '') + '" tabindex="0" role="button" data-item-id="' + esc(item.id) + '" aria-pressed="' + (flipped ? 'true' : 'false') + '" aria-label="Flashcard: ' + esc(item.title || item.content || '') + '">' +
            '<div class="flashcard-inner">' +
              '<div class="flashcard-face flashcard-front">' +
                '<div class="fc-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg></div>' +
                (imageSide === 'front' && mediaUrl ? '<img src="' + esc(mediaUrl) + '" alt="" style="max-height:140px;object-fit:cover;border-radius:6px;margin:0 20px 15px;" />' : '') +
                '<p class="fc-content" style="padding-top:0">' + esc(item.title || '\\u2014') + '</p>' +
              '</div>' +
              '<div class="flashcard-face flashcard-back">' +
                '<div class="fc-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/><path d="M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/><path d="M16 21v-5h5"/></svg></div>' +
                (imageSide === 'back' && mediaUrl ? '<img src="' + esc(mediaUrl) + '" alt="" style="max-height:140px;object-fit:cover;border-radius:6px;margin:0 20px 15px;" />' : '') +
                '<p class="fc-content" style="padding-top:0">' + esc(item.content || '\u2014') + '</p>' +
              '</div>' +
            '</div>' +
          '</div>';
        }).join('') +
        '</div></section>';
    }

    function renderListBlock(block) {
      const items = (block.items || []).filter((item) => item && (item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim()));
      if (!items.length) return '';

      const isNumbered = ['numbered_list', 'ordering', 'timeline'].includes(block.type);
      return '<section class="items-block"><h2>' + esc(block.title || '') + '</h2><div class="items-grid">' +
        items.map((item, index) => {
          const bullet = isNumbered ? esc(String(index + 1)) : '&bull;';
          return '<article><span>' + bullet + '</span><div>' +
            (item.title ? '<h3>' + esc(item.title || '') + '</h3>' : '') +
            (item.content ? '<p>' + esc(item.content || '') + '</p>' : '') +
            (item.mediaUrl ? renderMediaFromUrl(item.mediaUrl, item.title) : '') +
            '</div></article>';
        }).join('') +
        '</div></section>';
    }

    function renderMediaFromUrl(url, title) {
      const src = normalizeUrl(url);
      if (!src) return '';
      if (/\\.(mp4|webm|ogg)(\\?|#|$)/i.test(src)) return '<video class="panel-media" controls src="' + esc(src) + '"></video>';
      if (/\\.(mp3|wav|m4a|aac|oga)(\\?|#|$)/i.test(src)) return '<audio class="panel-media" controls src="' + esc(src) + '"></audio>';
      if (/^https?:\\/\\/(www\\.)?(youtube\\.com|youtu\\.be|vimeo\\.com)/i.test(src)) return '<iframe class="panel-media" src="' + esc(src) + '" title="' + esc(title || 'Embedded media') + '"></iframe>';
      return '<img class="panel-media" src="' + esc(src) + '" alt="' + esc(title || '') + '" />';
    }

    function renderGalleryBlock(block) {
      const items = (block.items || []).filter((item) => item && (item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim()));
      if (!items.length) return '';
      const columns = Number(metaString(block, 'columns', 3)) || 3;
      const safeCols = Math.max(1, Math.min(4, columns));

      return '<section class="gallery-block"><h2>' + esc(block.title || '') + '</h2>' +
        '<div class="gallery-grid gallery-cols-' + safeCols + '">' +
        items.map((item) => {
          const mediaUrl = item.mediaUrl ? normalizeUrl(item.mediaUrl) : '';
          const caption = item.title || '';
          return '<figure><div>' +
            (mediaUrl ? '<img src="' + esc(mediaUrl) + '" alt="' + esc(caption) + '" />' : '<span class="empty-media">Image</span>') +
            '</div>' +
            (caption ? '<figcaption>' + esc(caption) + '</figcaption>' : '') +
            '</figure>';
        }).join('') +
        '</div></section>';
    }

    function renderQuestionBlock(block) {
      const options = block.items || [];
      const knowledgeOptions = block.knowledgeCheck?.options?.map((option) => ({ id: option.id, title: option.text, content: option.isCorrect ? 'true' : 'false' })) || [];
      const renderedOptions = options.length ? options : knowledgeOptions;
      return '<section class="question-block">' +
        '<h3>' + esc(block.title || block.knowledgeCheck?.question || 'Question') + '</h3>' +
        (block.content ? '<p class="summary">' + esc(block.content) + '</p>' : '') +
        (renderedOptions.length ? '<div class="choices">' + renderedOptions.map((opt) =>
          '<button class="choice" type="button">' +
          '<span class="choice-dot"></span>' +
          '<span>' + esc(opt.title || '') + '</span>' +
          '</button>'
        ).join('') + '</div>' : '') +
        '</section>';
    }

    function parsePreviewTable(value) {
      return String(value || '')
        .split('\\n')
        .map((row) => row.split(/\\t|,/).map((cell) => String(cell).trim()).filter(Boolean))
        .filter((row) => row.length > 0);
    }

    function renderTableBlock(block) {
      const rows = parsePreviewTable(block.content ?? '');
      if (!rows.length) return '<pre>' + esc(block.content || block.title || 'Table') + '</pre>';

      return '<div class="table-wrap"><table><tbody>' +
        rows.map((row, rowIndex) => {
          return '<tr>' + row.map((cell, cellIndex) => (rowIndex === 0
            ? '<th>' + esc(cell) + '</th>'
            : '<td>' + esc(cell) + '</td>')).join('') + '</tr>';
        }).join('') +
        '</tbody></table></div>';
    }

    function renderChartBlock(block) {
      const chartType = metaString(block, 'chartType', 'bar');
      const title = metaString(block, 'chartTitle', block.title || 'Chart');
      const axisLabels = metaString(block, 'axisLabels', '');
      const rawData = metaString(block, 'data', '');

      const chartData = (() => {
        // Supports JSON [{label,value},...] or legacy space/comma-separated numbers
        try {
          const parsed = JSON.parse(rawData);
          if (Array.isArray(parsed)) {
            const mapped = parsed
              .map((item, i) => {
                const obj = item || {};
                const label = String(obj.label ?? obj.name ?? ('Item ' + (i + 1)));
                const value = Number(obj.value ?? obj.y ?? 0);
                return { label, value };
              })
              .filter((d) => Number.isFinite(d.value))
              .slice(0, 12);
            if (mapped.length) return mapped;
          }
        } catch {
          // fall through
        }

        const numbers = String(rawData || '')
          .split(/[\\s,;]+/)
          .map((item) => Number(item))
          .filter((n) => Number.isFinite(n))
          .slice(0, 12);

        if (numbers.length) return numbers.map((v, i) => ({ label: 'Item ' + (i + 1), value: v }));
        return [
          { label: 'Item 1', value: 40 },
          { label: 'Item 2', value: 70 },
          { label: 'Item 3', value: 55 },
        ];
      })();

      const values = chartData.map((d) => d.value);
      const max = Math.max(...values, 1);

      if (chartType === 'pie') {
        const total = values.reduce((sum, v) => sum + Math.max(0, v), 0) || 1;
        return '<section class="chart-block"><h2>' + esc(title) + '</h2>' +
          '<div class="pie-list">' +
          chartData.map((d, i) => {
            const pct = Math.round((Math.max(0, d.value) / total) * 100);
            return '<div class="pie-row">' +
              '<span class="pie-swatch" style="background:' + esc(accentColor) + '"></span>' +
              '<span class="pie-label">' + esc(d.label) + '</span>' +
              '<span class="pie-value">' + pct + '%</span>' +
              '</div>';
          }).join('') +
          '</div></section>';
      }

      if (chartType === 'line') {
        const W = 420;
        const H = 200;
        const PAD_L = 40;
        const PAD_T = 16;
        const PAD_R = 16;
        const PAD_B = 28;
        const innerW = W - PAD_L - PAD_R;
        const innerH = H - PAD_T - PAD_B;
        const min = Math.min(...values, 0);
        const range = max - min || 1;

        const points = chartData.map((d, i) => {
          const x = PAD_L + (i / Math.max(chartData.length - 1, 1)) * innerW;
          const y = PAD_T + (1 - (d.value - min) / range) * innerH;
          return { x, y, label: d.label, value: d.value };
        });

        const polyline = points.map((p) => String(p.x) + ',' + String(p.y)).join(' ');

        return '<section class="chart-block"><h2>' + esc(title) + '</h2>' +
          (axisLabels ? '<p class="summary">' + esc(axisLabels) + '</p>' : '') +
          '<div class="chart-wrap">' +
          '<svg viewBox="0 0 ' + W + ' ' + H + '" style="width:100%;height:200px" aria-label="' + esc(title) + '">' +
          '<polyline points="' + esc(polyline) + '" fill="none" stroke="' + esc(accentColor) + '" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>' +
          points.map((p) => '<circle cx="' + p.x + '" cy="' + p.y + '" r="5" fill="' + esc(accentColor) + '" />').join('') +
          '</svg></div></section>';
      }

      // default bar
      return '<section class="chart-block"><h2>' + esc(title) + '</h2>' +
        (axisLabels ? '<p class="summary">' + esc(axisLabels) + '</p>' : '') +
        '<div class="chart-bars">' +
        chartData.map((d) => {
          const heightPct = Math.max(6, (d.value / max) * 100);
          return '<div class="chart-bar-col">' +
            '<div class="chart-bar-track">' +
            '<div class="chart-bar-fill" style="height:' + heightPct + '%"></div>' +
            '</div>' +
            '<div class="chart-bar-label">' + esc(d.label) + '</div>' +
            '</div>';
        }).join('') +
        '</div></section>';
    }

    function renderAccordionTabsBlock(block) {
      const items = (block.items || []).filter((item) => item && (item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim()));
      if (!items.length) return '';

      const isTabs = block.type === 'tabs';
      const state = accordionTabsState[block.id] || (accordionTabsState[block.id] = {
        openIds: new Set(),
        visitedIds: new Set(),
        activeItemId: '',
        allowMultiple: metaString(block, 'behavior', 'single') === 'multiple',
        totalItems: items.length,
      });
      state.allowMultiple = metaString(block, 'behavior', 'single') === 'multiple';
      state.totalItems = items.length;

      if (isTabs) {
        if (!state.activeItemId) state.activeItemId = items[0]?.id ?? '';
        if (!state.visitedIds.size) state.visitedIds.add(state.activeItemId);
      }

      if (items.length && state.visitedIds.size >= items.length) completedBlocks.add(block.id);

      const title = block.title || '';
      const content = block.content || '';
      const panelItem = items.find((it) => it.id === state.activeItemId) || items[0];
      const renderPanelContent = (item) =>
        (item.mediaUrl ? renderMediaFromUrl(item.mediaUrl, item.title) : '') +
        (item.content ? '<p class="summary" style="margin-top:10px">' + esc(item.content) + '</p>' : '');

      if (isTabs) {
        const active = panelItem;
        const showOverflowArrows = metaBoolean(block, 'overflowArrows', true);
        return '<section class="tabs-block"><h2>' + esc(title) + '</h2>' +
          (content ? '<p class="summary">' + esc(content) + '</p>' : '') +
          '<div class="tabs-bar">' +
          (showOverflowArrows ? '<button type="button" class="tabs-arrow tabs-scroll-left" aria-label="Scroll tabs left">&lt;</button>' : '') +
          '<div class="tabs-scroll lux-scrollbar">' +
          items.map((it) => {
            const selected = it.id === state.activeItemId;
            return '<button type="button" class="tabs-toggle' + (selected ? ' active' : '') + '" data-block-id="' + esc(block.id) + '" data-item-id="' + esc(it.id) + '">' + esc(it.title || '') + '</button>';
          }).join('') +
          '</div>' +
          (showOverflowArrows ? '<button type="button" class="tabs-arrow tabs-scroll-right" aria-label="Scroll tabs right">&gt;</button>' : '') +
          '</div>' +
          '<div class="tab-panel">' +
          (active.title ? '<h3 style="margin:0 0 8px 0">' + esc(active.title) + '</h3>' : '') +
          renderPanelContent(active) +
          '</div></section>';
      }

      // accordion
      return '<section class="accordion-block"><h2>' + esc(title) + '</h2>' +
        (content ? '<p class="summary">' + esc(content) + '</p>' : '') +
        '<div class="accordion-list">' +
        items.map((it) => {
          const open = state.openIds.has(it.id);
          const panelStyle = open ? '' : 'display:none';
          return '<article class="accordion-item' + (open ? ' open' : '') + '">' +
            '<button type="button" class="accordion-toggle" data-block-id="' + esc(block.id) + '" data-item-id="' + esc(it.id) + '">' +
            '<span>' + esc(it.title || '') + '</span>' +
            '<span class="accordion-chevron" aria-hidden="true"></span>' +
            '</button>' +
            '<div class="accordion-panel" style="' + panelStyle + ';padding:0 12px 12px 12px">' +
            renderPanelContent(it) +
            '</div>' +
            '</article>';
        }).join('') +
        '</div></section>';
    }

    function renderSortingBlock(block) {
      const items = (block.items || []).filter((item) => item && item.title?.trim());
      if (!items.length) return '';
      const categories = Array.from(
        new Set(items.map((it) => it.match?.trim()).filter((c) => Boolean(c))),
      ).slice(0, 4);

      const state = sortingState[block.id] || (sortingState[block.id] = {
        selectedItemId: null,
        selectedItemCategory: '',
        sortedIds: new Set(),
        wrongIds: new Set(),
        firstTryWrongIds: new Set(),
        totalItems: items.length,
      });
      state.totalItems = items.length;

      const completed = state.sortedIds.size === items.length;
      if (completed) completedBlocks.add(block.id);

      const instructions = block.content || metaString(block, 'instructions', 'Sort each item into the correct category.');

      if (completed) {
        const completionMessage = metaString(block, 'completionMessage', 'All items sorted.');
        const firstTryWrongCount = state.firstTryWrongIds.size || 0;
        return '<section class="sorting-block"><h2>' + esc(block.title || '') + '</h2>' +
          (instructions ? '<p class="summary">' + esc(instructions) + '</p>' : '') +
          '<div class="sorting-complete">' +
          '<p>' + esc(completionMessage) + '</p>' +
          '<span>First try score: ' + esc(String(items.length - firstTryWrongCount)) + ' / ' + esc(String(items.length)) + '</span>' +
          '</div></section>';
      }

      const unsortedItems = items.filter((it) => !state.sortedIds.has(it.id));

      return '<section class="sorting-block"><h2>' + esc(block.title || '') + '</h2>' +
        (instructions ? '<p class="summary">' + esc(instructions) + '</p>' : '') +
        '<div class="sorting-grid">' +
        '<div class="sorting-items">' +
        '<p class="sorting-label">Items</p>' +
        unsortedItems.map((it) => {
          const wrong = state.wrongIds.has(it.id);
          return '<button type="button" class="sorting-item' +
            (state.selectedItemId === it.id ? ' selected' : '') +
            (wrong ? ' wrong' : '') +
            '" data-block-id="' + esc(block.id) + '" data-item-id="' + esc(it.id) + '" data-item-category="' + esc((it.match?.trim() || '')) + '">' +
            esc(it.title.slice(0, 80)) +
            '</button>';
        }).join('') +
        '</div>' +
        '<div class="sorting-categories">' +
        categories.map((cat) => {
          const sortedCount = items.filter((it) => state.sortedIds.has(it.id) && (it.match?.trim() === cat)).length;
          const disabled = !state.selectedItemId;
          return '<button type="button" class="sorting-category" data-block-id="' + esc(block.id) + '" data-category="' + esc(cat) + '"' +
            (disabled ? ' disabled' : '') + '>' +
            '<strong>' + esc(cat) + '</strong>' +
            '<em>Select an item, then choose this target.</em>' +
            '<span>' + esc(String(sortedCount)) + ' sorted</span>' +
            '</button>';
        }).join('') +
        '</div>' +
        '</div></section>';
    }

    function renderProcessStepsBlock(block) {
      const items = (block.items || []).filter((item) => item && (item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim() || item.match?.trim()));
      if (!items.length) return '';

      const state = processStepsState[block.id] || (processStepsState[block.id] = { stepIndex: -1, totalSteps: items.length });
      const summaryIndex = items.length;
      state.totalSteps = items.length;
      const stepIndex = state.stepIndex;

      if (stepIndex === -1) {
        const introTitle = metaString(block, 'introTitle', block.title || '');
        const introText = block.content || metaString(block, 'introText', block.content || '');
        const introImageUrl = metaString(block, 'introImageUrl', '');
        return '<section class="process-steps-block"><h2>' + esc(block.title || '') + '</h2>' +
          '<div class="process-card">' +
          (introTitle ? '<h3>' + esc(introTitle) + '</h3>' : '') +
          (introText ? '<p class="summary">' + esc(introText) + '</p>' : '') +
          (introImageUrl ? renderMediaFromUrl(introImageUrl, introTitle) : '') +
          '<div class="process-actions">' +
          '<button type="button" class="process-start primary" data-block-id="' + esc(block.id) + '">' + esc(metaString(block, 'startLabel', 'Start')) + '</button>' +
          '</div>' +
          '</div></section>';
      }

      if (stepIndex === summaryIndex) {
        const summaryTitle = metaString(block, 'summaryTitle', 'Process complete');
        const summaryText = metaString(block, 'summaryText', '');
        return '<section class="process-steps-block"><h2>' + esc(block.title || '') + '</h2>' +
          '<div class="process-card">' +
          '<h3>' + esc(summaryTitle) + '</h3>' +
          (summaryText ? '<p class="summary">' + esc(summaryText) + '</p>' : '') +
          '<div class="process-actions">' +
          '<button type="button" class="process-restart secondary" data-block-id="' + esc(block.id) + '">' + esc(metaString(block, 'restartLabel', 'Start Again')) + '</button>' +
          '</div>' +
          '</div></section>';
      }

      const currentStep = items[Math.max(0, Math.min(stepIndex, items.length - 1))];
      const prevLabel = 'Previous';
      const nextLabel = (stepIndex === items.length - 1) ? 'Summary' : 'Next';

      if (stepIndex === summaryIndex) completedBlocks.add(block.id);

      return '<section class="process-steps-block"><h2>' + esc(block.title || '') + '</h2>' +
        '<div class="process-card">' +
        '<div class="step-kicker"><span>' + esc(String(stepIndex + 1)) + '</span><span>Step ' + esc(String(stepIndex + 1)) + ' of ' + esc(String(items.length)) + '</span></div>' +
        '<div class="process-step-grid"><div>' +
        (currentStep.title ? '<h3>' + esc(currentStep.title) + '</h3>' : '') +
        (currentStep.content ? '<p class="summary">' + esc(currentStep.content) + '</p>' : '') +
        '</div>' +
        (currentStep.mediaUrl ? '<div>' + renderMediaFromUrl(currentStep.mediaUrl, currentStep.title) + '</div>' : '') +
        '</div>' +
        '<div class="process-actions">' +
        '<button type="button" class="process-prev secondary" data-block-id="' + esc(block.id) + '">' + esc(prevLabel) + '</button>' +
        '<button type="button" class="process-next primary" data-block-id="' + esc(block.id) + '">' + esc(nextLabel) + '</button>' +
        '</div>' +
        '</div></section>';
    }

    function renderBranchingDecisionBlock(block) {
      const choices = (block.items || []).filter((item) => item && (item.title?.trim() || item.content?.trim()));
      if (!choices.length) return '';
      const isDialogue = block.type === 'branching_dialogue';
      return '<section class="branching-decision-block" data-block-id="' + esc(block.id) + '">' +
        '<p class="eyebrow">' + (isDialogue ? 'Branching dialogue' : 'Choice point') + '</p>' +
        (block.title ? '<h2>' + esc(block.title) + '</h2>' : '') +
        (block.content ? '<p class="summary">' + esc(block.content) + '</p>' : '') +
        '<div class="branching-choices choices">' +
        choices.map((choice) => {
          const destinationId = choice.match || '';
          const pageIndex = (course?.pages || []).findIndex((p) => p.id === destinationId);
          const destinationTitle = pageIndex >= 0 ? (course?.pages[pageIndex]?.title || 'Lesson ' + (pageIndex + 1)) : '';
          const linked = pageIndex >= 0;
          return '<button type="button" class="branching-choice choice' + (linked ? '' : ' disabled') + '" data-destination-page="' + pageIndex + '"' + (linked ? '' : ' disabled') + '>' +
            '<strong>' + esc(choice.title || '') + '</strong>' +
            (choice.content ? '<span>' + esc(choice.content) + '</span>' : '') +
            (linked ? '<em class="branching-dest">Continue to: ' + esc(destinationTitle) + '</em>' : '<em class="branching-dest">Destination unlinked</em>') +
            '</button>';
        }).join('') +
        '</div></section>';
    }

  function renderKnowledgeCheck(block) {
    const check = block.knowledgeCheck || block.metadata?.knowledgeCheck || {};
    return '<section class="knowledge-check"><h2>' + esc(check.question || block.title || '') + '</h2>' +
      '<div class="choices">' + (check.options || []).map((option) =>
        '<button class="choice" data-correct="' + (option.isCorrect ? '1' : '0') + '" data-feedback="' + esc(option.feedback || (option.isCorrect ? check.correctFeedback : check.incorrectFeedback) || '') + '">' + esc(option.text || '') + '</button>'
      ).join('') + '</div><div class="feedback"></div></section>';
  }

  function renderScenario(page) {
    const scenario = page.scenario || { nodes: [], startNodeId: '' };
    const startNode = scenario.nodes.find((node) => node.id === scenario.startNodeId) || scenario.nodes[0];
    if (!startNode) return renderPageTitle(page) + '<p class="summary">No scenario nodes yet.</p>';
    return renderPageTitle(page) + '<div class="scenario" data-page="' + esc(page.id) + '" data-node="' + esc(startNode.id) + '">' +
      renderScenarioNode(startNode, scenario.nodes) + '</div>';
  }

  function renderScenarioNode(node, nodes) {
    return '<p class="eyebrow">Branching scenario</p><h1>' + esc(node.speaker || 'Scenario') + '</h1>' +
      '<p class="dialogue">' + esc(node.text) + '</p>' +
      '<div class="choices">' + (node.choices || []).map((choice) =>
        '<button class="choice" data-next="' + esc(choice.nextNodeId || '') + '" data-score="' + (Number(choice.score) || 0) + '" data-feedback="' + esc(choice.feedback || '') + '">' + esc(choice.text) + '</button>'
      ).join('') + '</div><div class="feedback"></div>';
  }

  function normalizeQuizQuestionType(type) {
    if (type === 'multiple_response' || type === 'multiple_select') return 'multiple_response';
    if (type === 'fill_blank' || type === 'matching') return type;
    return 'multiple_choice';
  }

  function quizQuestionPoints(question) {
    const points = Number(question?.points);
    return Number.isFinite(points) && points > 0 ? points : 1;
  }

  function renderQuizAnswer(question, qi, quiz) {
    const type = normalizeQuizQuestionType(question.type);
    const options = Array.isArray(question.options) ? question.options : [];
    const inputType = type === 'multiple_response' ? 'checkbox' : 'radio';
    if (type === 'fill_blank') {
      return '<input class="quiz-text-answer" type="text" autocomplete="off" />';
    }
    if (type === 'matching') {
      const matches = options.map((option) => option.match || '').filter(Boolean);
      return '<div class="matching-list">' + options.map((option) =>
        '<div class="matching-row"><span>' + esc(option.text || '') + '</span><select data-match-for="' + esc(option.id || '') + '">' +
        '<option value="">Choose match</option>' +
        matches.map((match) => '<option value="' + esc(match) + '">' + esc(match) + '</option>').join('') +
        '</select></div>'
      ).join('') + '</div>';
    }
    const renderedOptions = options.map((option) =>
      '<label class="quiz-option"><input type="' + inputType + '" name="q' + qi + '" value="' + esc(option.id || '') + '"/> <span>' + esc(option.text || '') + '</span></label>'
    ).join('');
    return '<div class="choices quiz-choices">' + renderedOptions + '</div>';
  }

  function renderQuiz(page) {
    const quiz = page.quiz || { questions: [], passingScore: 80 };
    const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
    if (!questions.length) return renderPageTitle(page) + '<p class="summary">No quiz questions yet.</p>';
    return renderPageTitle(page) +
      '<div class="quiz-runtime" data-page="' + esc(page.id) + '">' +
      questions.map((question, qi) => {
        const questionImage = normalizeUrl(question.imageUrl);
        return (
        '<div class="question quiz-question" data-question-index="' + qi + '" data-question-id="' + esc(question.id || String(qi)) + '" data-type="' + esc(normalizeQuizQuestionType(question.type)) + '" data-points="' + quizQuestionPoints(question) + '">' +
        '<p class="eyebrow">Question ' + (qi + 1) + '</p><h2>' + esc(question.text || '') + '</h2>' +
        (questionImage ? '<img class="quiz-question-image" src="' + esc(questionImage) + '" alt=""/>' : '') +
        renderQuizAnswer(question, qi, quiz) +
        '<div class="quiz-actions"><button class="primary quiz-verify" type="button" data-question-index="' + qi + '">Verify</button><span>' + quizQuestionPoints(question) + ' point' + (quizQuestionPoints(question) === 1 ? '' : 's') + '</span></div>' +
        '<div class="feedback quiz-feedback"></div></div>'
        );
      }).join('') +
      '<div class="quiz-summary"><strong>Score 0 / ' + questions.reduce((sum, question) => sum + quizQuestionPoints(question), 0) + '</strong><span>Submit the quiz to report your final result.</span></div>' +
      '<button class="primary" id="submit-quiz" type="button">Submit quiz</button></div>';
  }

  function renderLessonLink(kind, pageIndex, disabled) {
    const page = course.pages[pageIndex];
    if (!page) return '';
    const disabledAttr = disabled ? ' disabled aria-disabled="true"' : '';
    return '<button type="button" class="lesson-link lesson-link-' + esc(kind) + '" data-page="' + pageIndex + '"' + disabledAttr + '>' +
      (kind === 'previous' ? '<span class="lesson-link-chevron lesson-link-chevron-up"></span>' : '') +
      '<span class="lesson-link-label">Lesson ' + (pageIndex + 1) + ' - ' + esc(page.title) + '</span>' +
      (kind === 'next' ? '<span class="lesson-link-chevron lesson-link-chevron-down"></span>' : '') +
      '</button>';
  }

  function renderPreviousLessonLink() {
    if (currentPage <= 0) return '';
    return renderLessonLink('previous', currentPage - 1, false);
  }

  function renderNextLessonLink(disabled) {
    if (currentPage >= course.pages.length - 1) return '';
    return renderLessonLink('next', currentPage + 1, disabled);
  }

  function bindInteractions(page) {
    document.querySelectorAll('.lesson-link[data-page]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        renderPage(Number(button.dataset.page));
      });
    });
    bindKnowledgeChecks();
    bindFlashcards();
    bindContinueButtons();
    bindAccordionTabs();
    bindSortingBlocks();
    bindProcessStepsBlocks();
    bindBranchingDecisionBlocks();
    if (page.type === 'branching_scenario') bindScenario(page);
    if (page.type === 'quiz') bindQuiz(page);
  }

  function bindBranchingDecisionBlocks() {
    document.querySelectorAll('.branching-choice[data-destination-page]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const targetPage = Number(button.dataset.destinationPage);
        if (Number.isInteger(targetPage) && targetPage >= 0 && targetPage < (course?.pages?.length || 0)) {
          renderPage(targetPage);
        }
      });
    });
  }

  function bindContinueButtons() {
    document.querySelectorAll('.continue').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const blockId = button.dataset.block;
        if (!blockId) return;
        revealedContinue.add(blockId);
        renderCurrentPageSoft();
      });
    });
  }

  function bindKnowledgeChecks() {
    document.querySelectorAll('.knowledge-check').forEach((check) => {
      check.addEventListener('click', (event) => {
        const target = event.target.closest('.choice');
        if (!target) return;
        possibleScore += 1;
        if (target.dataset.correct === '1') score += 1;
        const feedback = check.querySelector('.feedback');
        if (feedback) feedback.textContent = target.dataset.feedback || (target.dataset.correct === '1' ? 'Correct.' : 'Try again.');
        saveState();
      });
    });
  }

  function bindScenario(page) {
    const scenario = page.scenario || { nodes: [] };
    qs('.scenario')?.addEventListener('click', (event) => {
      const target = event.target.closest('.choice');
      if (!target) return;
      score += Number(target.dataset.score) || 0;
      possibleScore += 1;
      const feedback = qs('.scenario .feedback');
      if (feedback) feedback.textContent = target.dataset.feedback || '';
      const next = scenario.nodes.find((node) => node.id === target.dataset.next);
      if (next) qs('.scenario').innerHTML = renderScenarioNode(next, scenario.nodes);
      saveState();
    });
  }

  function collectQuizAnswer(container, question) {
    const type = normalizeQuizQuestionType(question.type);
    if (type === 'fill_blank') {
      return container.querySelector('.quiz-text-answer')?.value || '';
    }
    if (type === 'matching') {
      const pairs = {};
      container.querySelectorAll('select[data-match-for]').forEach((select) => {
        pairs[select.dataset.matchFor || ''] = select.value || '';
      });
      return pairs;
    }
    if (type === 'multiple_response') {
      return Array.from(container.querySelectorAll('input[type="checkbox"]:checked')).map((input) => input.value);
    }
    return container.querySelector('input[type="radio"]:checked')?.value || '';
  }

  function quizFeedback(question, correct) {
    if ((question.feedbackMode || 'any_response') === 'correct_incorrect') {
      return correct ? (question.correctFeedback || 'Correct.') : (question.incorrectFeedback || 'Incorrect.');
    }
    return question.feedback || '';
  }

  function evaluateQuizQuestion(question, answer) {
    const type = normalizeQuizQuestionType(question.type);
    const options = Array.isArray(question.options) ? question.options : [];
    const points = quizQuestionPoints(question);
    let answered = false;
    let correct = false;

    if (type === 'multiple_choice') {
      const selected = options.find((option) => option.id === answer);
      answered = Boolean(selected);
      correct = Boolean(selected?.isCorrect);
    } else if (type === 'multiple_response') {
      const selectedIds = new Set(Array.isArray(answer) ? answer : []);
      const correctIds = options.filter((option) => option.isCorrect).map((option) => option.id);
      answered = selectedIds.size > 0;
      correct = answered && selectedIds.size === correctIds.length && correctIds.every((id) => selectedIds.has(id));
    } else if (type === 'fill_blank') {
      const response = String(answer || '');
      const normalize = (value) => question.caseSensitive ? String(value || '').trim() : String(value || '').trim().toLocaleLowerCase();
      answered = Boolean(response.trim());
      correct = answered && options.some((option) => normalize(option.text) === normalize(response));
    } else {
      const pairs = answer && typeof answer === 'object' && !Array.isArray(answer) ? answer : {};
      answered = options.length > 0 && options.every((option) => Boolean(pairs[option.id]));
      correct = answered && options.every((option) => pairs[option.id] === (option.match || ''));
    }

    return {
      answered,
      correct,
      points: correct ? points : 0,
      possible: points,
      feedback: quizFeedback(question, correct),
    };
  }

  function renderQuizFeedback(container, result, showFeedback) {
    const feedback = container.querySelector('.quiz-feedback');
    if (!feedback) return;
    feedback.classList.remove('correct', 'incorrect');
    feedback.classList.add(result.correct ? 'correct' : 'incorrect');
    const status = result.correct ? 'Correct' : (result.answered ? 'Incorrect' : 'Incomplete');
    feedback.textContent = status + (showFeedback && result.feedback ? ': ' + result.feedback : '.');
  }

  function bindQuiz(page) {
    const quiz = page.quiz || { questions: [], passingScore: 80, showFeedback: true };
    const questions = Array.isArray(quiz.questions) ? quiz.questions : [];
    const showFeedback = quiz.showFeedback !== false;

    document.querySelectorAll('.quiz-verify').forEach((button) => {
      button.addEventListener('click', () => {
        const index = Number(button.dataset.questionIndex);
        const question = questions[index];
        const container = button.closest('.quiz-question');
        if (!question || !container) return;
        const result = evaluateQuizQuestion(question, collectQuizAnswer(container, question));
        const pageResult = quizResults[page.id] || { submitted: false, questions: {} };
        pageResult.questions = pageResult.questions || {};
        pageResult.questions[question.id || String(index)] = result;
        pageResult.submitted = false;
        quizResults[page.id] = pageResult;
        renderQuizFeedback(container, result, showFeedback);
        saveState();
      });
    });

    qs('#submit-quiz')?.addEventListener('click', () => {
      const pageResult = { submitted: true, score: 0, possible: 0, percent: 0, passed: false, questions: {} };
      document.querySelectorAll('.quiz-question').forEach((container) => {
        const index = Number(container.dataset.questionIndex);
        const question = questions[index];
        if (!question) return;
        const result = evaluateQuizQuestion(question, collectQuizAnswer(container, question));
        pageResult.questions[question.id || String(index)] = result;
        pageResult.score += result.points;
        pageResult.possible += result.possible;
        renderQuizFeedback(container, result, showFeedback);
      });
      pageResult.percent = pageResult.possible ? Math.round((pageResult.score / pageResult.possible) * 100) : 0;
      pageResult.passed = pageResult.percent >= Number(quiz.passingScore ?? coursePassingScore());
      quizResults[page.id] = pageResult;
      const summary = qs('.quiz-summary');
      if (summary) {
        summary.innerHTML = '<strong>Score ' + pageResult.score + ' / ' + pageResult.possible + '</strong><span>' + pageResult.percent + '% ' + (pageResult.passed ? 'passed' : 'failed') + '</span>';
      }
      saveState();
    });
  }

  function bindFlashcards() {
    document.querySelectorAll('.flashcard').forEach((card) => {
      const handler = () => {
        card.classList.toggle('flipped');
        const isFlipped = card.classList.contains('flipped');
        card.setAttribute('aria-pressed', String(isFlipped));

        const section = card.closest('.flashcards-block');
        const blockId = section?.dataset?.blockId || '';
        const itemId = card.dataset?.itemId || '';
        if (!blockId || !itemId) return;

        const state = flashcardsState[blockId] || (flashcardsState[blockId] = { flippedIds: new Set(), flippedOnce: new Set(), total: 0 });
        if (!state.flippedIds) state.flippedIds = new Set();
        if (!state.flippedOnce) state.flippedOnce = new Set();
        if (state.total <= 0) {
          state.total = section.querySelectorAll('.flashcard').length;
        }

        if (isFlipped) {
          state.flippedIds.add(itemId);
          state.flippedOnce.add(itemId);
        } else {
          state.flippedIds.delete(itemId);
        }
        if (!completedBlocks.has(blockId) && state.flippedOnce.size >= state.total && state.total > 0) {
          completedBlocks.add(blockId);
          saveState();
          window.setTimeout(renderCurrentPageSoft, 0);
          return;
        }
        saveState();
      };
      card.addEventListener('click', handler);
      card.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); handler(); }
      });
    });
  }

  function bindAccordionTabs() {
    document.querySelectorAll('.tabs-scroll-left').forEach((button) => {
      button.addEventListener('click', () => {
        button.parentElement?.querySelector('.tabs-scroll')?.scrollBy({ left: -180, behavior: 'smooth' });
      });
    });
    document.querySelectorAll('.tabs-scroll-right').forEach((button) => {
      button.addEventListener('click', () => {
        button.parentElement?.querySelector('.tabs-scroll')?.scrollBy({ left: 180, behavior: 'smooth' });
      });
    });

    // Tabs
    document.querySelectorAll('.tabs-toggle[data-block-id][data-item-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const blockId = button.dataset.blockId;
        const itemId = button.dataset.itemId;
        if (!blockId || !itemId) return;

        const state = accordionTabsState[blockId] || (accordionTabsState[blockId] = {
          openIds: new Set(),
          visitedIds: new Set(),
          activeItemId: '',
          allowMultiple: false,
          totalItems: 0,
        });
        state.activeItemId = itemId;
        state.visitedIds.add(itemId);

        if (state.totalItems > 0 && state.visitedIds.size >= state.totalItems) completedBlocks.add(blockId);
        renderCurrentPageSoft();
      });
    });

    // Accordion
    document.querySelectorAll('.accordion-toggle[data-block-id][data-item-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const blockId = button.dataset.blockId;
        const itemId = button.dataset.itemId;
        if (!blockId || !itemId) return;

        const state = accordionTabsState[blockId] || (accordionTabsState[blockId] = {
          openIds: new Set(),
          visitedIds: new Set(),
          activeItemId: '',
          allowMultiple: false,
          totalItems: 0,
        });

        if (!state.openIds) state.openIds = new Set();
        if (!state.visitedIds) state.visitedIds = new Set();

        // Mark visited (completion for accordion/tabs)
        state.visitedIds.add(itemId);

        if (state.openIds.has(itemId)) state.openIds.delete(itemId);
        else {
          if (!state.allowMultiple) state.openIds = new Set();
          state.openIds.add(itemId);
        }

        if (state.totalItems > 0 && state.visitedIds.size >= state.totalItems) completedBlocks.add(blockId);
        renderCurrentPageSoft();
      });
    });
  }

  function bindSortingBlocks() {
    document.querySelectorAll('.sorting-item[data-block-id][data-item-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const blockId = button.dataset.blockId;
        const itemId = button.dataset.itemId;
        if (!blockId || !itemId) return;

        const state = sortingState[blockId] || (sortingState[blockId] = {
          selectedItemId: null,
          selectedItemCategory: '',
          sortedIds: new Set(),
          wrongIds: new Set(),
          firstTryWrongIds: new Set(),
          totalItems: document.querySelectorAll('.sorting-item[data-block-id="' + blockId + '"]').length,
        });
        state.selectedItemId = itemId;
        state.selectedItemCategory = (button.dataset.itemCategory || '').trim();
        renderCurrentPageSoft();
      });
    });

    document.querySelectorAll('.sorting-category[data-block-id][data-category]').forEach((button) => {
      button.addEventListener('click', () => {
        if (button.disabled) return;
        const blockId = button.dataset.blockId;
        const category = button.dataset.category || '';
        if (!blockId || !category) return;

        const state = sortingState[blockId];
        if (!state || !state.selectedItemId) return;

        const selectedId = state.selectedItemId;
        const selectedCat = (state.selectedItemCategory || '').trim();

        if (selectedCat === category) {
          state.sortedIds.add(selectedId);
          state.selectedItemId = null;
          state.selectedItemCategory = '';

          if (state.totalItems > 0 && state.sortedIds.size >= state.totalItems) completedBlocks.add(blockId);
          renderCurrentPageSoft();
          return;
        }

        state.wrongIds.add(selectedId);
        state.firstTryWrongIds.add(selectedId);

        renderCurrentPageSoft();
        window.setTimeout(() => {
          state.wrongIds.delete(selectedId);
          renderCurrentPageSoft();
        }, 450);
      });
    });
  }

  function bindProcessStepsBlocks() {
    document.querySelectorAll('.process-start[data-block-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const blockId = button.dataset.blockId;
        if (!blockId) return;
        const state = processStepsState[blockId] || (processStepsState[blockId] = { stepIndex: -1, totalSteps: 0 });
        state.stepIndex = 0;
        if (state.totalSteps > 0 && state.stepIndex >= state.totalSteps) completedBlocks.add(blockId);
        renderCurrentPageSoft();
      });
    });

    document.querySelectorAll('.process-next[data-block-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const blockId = button.dataset.blockId;
        if (!blockId) return;
        const state = processStepsState[blockId] || (processStepsState[blockId] = { stepIndex: -1, totalSteps: 0 });
        state.stepIndex = Math.min(state.totalSteps, state.stepIndex + 1);
        if (state.totalSteps > 0 && state.stepIndex === state.totalSteps) completedBlocks.add(blockId);
        renderCurrentPageSoft();
      });
    });

    document.querySelectorAll('.process-prev[data-block-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const blockId = button.dataset.blockId;
        if (!blockId) return;
        const state = processStepsState[blockId] || (processStepsState[blockId] = { stepIndex: -1, totalSteps: 0 });
        state.stepIndex = Math.max(-1, state.stepIndex - 1);
        renderCurrentPageSoft();
      });
    });

    document.querySelectorAll('.process-restart[data-block-id]').forEach((button) => {
      button.addEventListener('click', () => {
        const blockId = button.dataset.blockId;
        if (!blockId) return;
        const state = processStepsState[blockId] || (processStepsState[blockId] = { stepIndex: -1, totalSteps: 0 });
        state.stepIndex = -1;
        renderCurrentPageSoft();
      });
    });
  }

  function updateProgress() {
    const progress = course.pages.length ? Math.round((visited.size / course.pages.length) * 100) : 0;
    qs('#progress-fill').style.width = progress + '%';
    qs('#progress-text').textContent = progress + '%';
  }

  window.addEventListener('beforeunload', () => window.scormRuntime?.finish?.());
  function boot() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => void init());
      return;
    }
    void init();
  }
  boot();
})();`;
  }

  private buildCourseDataJs(course: CourseDocument): string {
    return `window.__SCORM_COURSE__=${this.embedCourseJson(course)};`;
  }

  private embedCourseJson(course: CourseDocument): string {
    return JSON.stringify(course)
      .replace(/</g, '\\u003c')
      .replace(/\u2028/g, '\\u2028')
      .replace(/\u2029/g, '\\u2029');
  }

  private buildScormWrapper(version: '1.2' | '2004'): string {
    const is2004 = version === '2004';
    // LMS vendors expose either SCORM 1.2 or 2004 APIs on parent/opener frames.
    // The wrapper hides those key differences from runtime.js.
    return `window.scormRuntime=(function(){
  var api=null, initialized=false, version='${version}';
  function find(win){var attempts=0;while(win&&attempts<500){if(win.API_1484_11)return win.API_1484_11;if(win.API)return win.API;win=win.parent;attempts++;}return null;}
  function ensure(){if(api)return api;api=find(window)||find(window.opener);return api;}
  function call(name,args){var target=ensure();if(!target||typeof target[name]!=='function')return '';return target[name].apply(target,args||[]);}
  return {
    init:function(){if(initialized)return true;initialized=${is2004 ? "call('Initialize',[''])==='true'" : "call('LMSInitialize',[''])==='true'"};return initialized;},
    finish:function(){if(!initialized)return true;${is2004 ? "call('Terminate',['']);" : "call('LMSFinish',['']);"} initialized=false;return true;},
    commit:function(){return ${is2004 ? "call('Commit',[''])" : "call('LMSCommit',[''])"};},
    get:function(key){var map={status:${is2004 ? "'cmi.completion_status'" : "'cmi.core.lesson_status'"},success:${is2004 ? "'cmi.success_status'" : "'cmi.core.lesson_status'"},score:${is2004 ? "'cmi.score.raw'" : "'cmi.core.score.raw'"},scoreMin:${is2004 ? "'cmi.score.min'" : "'cmi.core.score.min'"},scoreMax:${is2004 ? "'cmi.score.max'" : "'cmi.core.score.max'"},suspend:'cmi.suspend_data',location:${is2004 ? "'cmi.location'" : "'cmi.core.lesson_location'"}};return ${is2004 ? "call('GetValue',[map[key]||key])" : "call('LMSGetValue',[map[key]||key])"};},
    set:function(key,value){var map={status:${is2004 ? "'cmi.completion_status'" : "'cmi.core.lesson_status'"},success:${is2004 ? "'cmi.success_status'" : "'cmi.core.lesson_status'"},score:${is2004 ? "'cmi.score.raw'" : "'cmi.core.score.raw'"},scoreMin:${is2004 ? "'cmi.score.min'" : "'cmi.core.score.min'"},scoreMax:${is2004 ? "'cmi.score.max'" : "'cmi.core.score.max'"},suspend:'cmi.suspend_data',location:${is2004 ? "'cmi.location'" : "'cmi.core.lesson_location'"}};return ${is2004 ? "call('SetValue',[map[key]||key,String(value)])" : "call('LMSSetValue',[map[key]||key,String(value)])"};},
    version:function(){return version;}
  };
})();`;
  }

  private escXml(value: string): string {
    return (value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
