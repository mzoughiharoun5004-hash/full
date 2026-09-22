import { BadRequestException } from '@nestjs/common';
import { join, resolve } from 'node:path';
import JSZip from 'jszip';
import vm from 'node:vm';
import { StatutScenario } from 'src/common/enums';
import { CourseDocument } from 'src/scenario/course-document.types';
import { Scenario } from 'src/scenario/scenario.entity';
import { ScormBuildService } from './scorm-build.service';
import { ScormPdfService } from './scorm-pdf.service';
import { ScormPreviewService } from './scorm-preview.service';

jest.mock('puppeteer', () => ({
  __esModule: true,
  default: {
    launch: jest.fn(),
  },
}));

describe('ScormService', () => {
  const course: CourseDocument = {
    schemaVersion: 1,
    id: 'course-test',
    title: 'Export parity course',
    description: 'Course description shown in the export shell.',
    objectives: [],
    pages: [
      {
        id: 'lesson-1',
        type: 'lesson',
        title: 'Lesson 1',
        blocks: [
          {
            id: 'block-text',
            type: 'text',
            content: 'Visible lesson text',
          },
          {
            id: 'block-table',
            type: 'table',
            content: 'Name,Value\nAlpha,10',
          },
          {
            id: 'block-chart',
            type: 'chart',
            metadata: {
              data: '[{"label":"Alpha","value":10}]',
            },
          },
          {
            id: 'block-video',
            type: 'video',
            assetUrl: '/uploads/demo.mp4',
          },
        ],
      },
    ],
    lessons: [],
    settings: {
      completionMode: 'pages',
      passingScore: 80,
      scormVersion: '1.2',
    },
    theme: {
      accentColor: '#0F6B4A',
      fontPairing: 'modern',
      coverLayout: 'centered',
      navigationMode: 'continuous',
      lessonNumbers: true,
      sidebarEnabled: true,
    },
  };

  const scenario = {
    id: 42,
    titre: course.title,
    description: course.description,
    objectif: null,
    niveau: null,
    dureeScenario: null,
    statut: StatutScenario.APPROUVE,
    courseDocument: course,
    courseDocumentVersion: 1,
    scenarioDocument: null,
    scenarioDocumentVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    user: { id: 1 },
    modules: [],
    ressources: [],
    rapports: [],
  } as unknown as Scenario;

  it('exports a runtime that executes from extracted index data', async () => {
    const scenarioRepo = {
      findOne: jest.fn().mockResolvedValue(scenario),
    };
    const scenarioService = {
      resolveCourseDocumentForExport: jest.fn().mockReturnValue(course),
    };
    const service = new ScormBuildService(
      scenarioRepo as never,
      scenarioService as never,
    );

    const buffer = await service.generateScormPackage(
      scenario.id,
      'http://localhost:3001',
    );
    const zip = await JSZip.loadAsync(buffer);
    const runtime = await zip.file('runtime.js')?.async('string');
    const scorm = await zip.file('scorm.js')?.async('string');
    const courseData = await zip.file('course-data.js')?.async('string');

    expect(runtime).toContain('/\\.(mp4|webm|ogg)(\\?|#|$)/i');
    expect(runtime).toContain("split('\\n')");
    expect(runtime).toContain('/[\\s,;]+/');

    const nav = element();
    const page = element();
    const brand = element();
    const progressFill = element();
    const progressText = element();
    const document = {
      readyState: 'complete',
      querySelector: jest.fn((selector: string) => {
        if (selector === '.runtime-brand') return brand;
        if (selector === '#nav') return nav;
        if (selector === '#page') return page;
        if (selector === '#progress-fill') return progressFill;
        if (selector === '#progress-text') return progressText;
        return null;
      }),
      querySelectorAll: jest.fn(() => []),
      getElementById: jest.fn((id: string) =>
        id === 'course-data' ? { textContent: JSON.stringify(course) } : null,
      ),
      addEventListener: jest.fn(),
    };
    const window = {
      document,
      addEventListener: jest.fn(),
      setTimeout,
    };
    const sandbox = {
      window,
      document,
      console,
      location: { protocol: 'file:' },
      setTimeout,
    } as Record<string, unknown>;
    sandbox.globalThis = sandbox;
    (window as any).window = window;

    vm.createContext(sandbox);
    vm.runInContext(scorm ?? '', sandbox, { filename: 'scorm.js' });
    vm.runInContext(courseData ?? '', sandbox, { filename: 'course-data.js' });
    vm.runInContext(runtime ?? '', sandbox, { filename: 'runtime.js' });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(brand.innerHTML).toContain(
      'Course description shown in the export shell.',
    );
    expect(nav.innerHTML).toContain('Lesson 1');
    expect(page.innerHTML).toContain('Visible lesson text');
    expect(page.innerHTML).toContain('Alpha');
    expect(page.innerHTML).toContain('demo.mp4');
    expect(progressText.textContent).toBe('100%');
  });

  it('renders PDF tabs without duplicated labels and includes quiz prompts without answers or feedback', () => {
    const pdfCourse: CourseDocument = {
      ...course,
      pages: [
        {
          id: 'pdf-lesson',
          type: 'lesson',
          title: 'PDF lesson',
          blocks: [
            {
              id: 'tabs-block',
              type: 'tabs',
              title: 'Reference tabs',
              items: [
                { id: 'tab-a', title: 'Overview', content: 'Overview content' },
                { id: 'tab-b', title: 'Details', content: 'Details content' },
              ],
            },
            {
              id: 'question-block',
              type: 'knowledge_check',
              title: 'Hidden question prompt',
              knowledgeCheck: {
                type: 'multiple_choice',
                question: 'Hidden question prompt',
                options: [
                  {
                    id: 'correct',
                    text: 'Hidden correct answer',
                    isCorrect: true,
                    feedback: 'Hidden option feedback',
                  },
                ],
                correctFeedback: 'Hidden correct feedback',
                incorrectFeedback: 'Hidden incorrect feedback',
              },
            },
          ],
          quiz: {
            passingScore: 80,
            attempts: 1,
            showFeedback: true,
            randomizeQuestions: false,
            randomizeAnswers: false,
            questions: [
              {
                id: 'q1',
                type: 'multiple_choice',
                text: 'Hidden quiz question',
                points: 1,
                options: [
                  {
                    id: 'q1-a',
                    text: 'Hidden quiz answer',
                    isCorrect: true,
                  },
                ],
                feedback: 'Hidden quiz feedback',
              },
            ],
          },
        },
      ],
    };
    const scenarioRepo = { findOne: jest.fn() };
    const scenarioService = { resolveCourseDocumentForExport: jest.fn() };
    const service = new ScormPdfService(
      scenarioRepo as never,
      scenarioService as never,
    );

    const html = (service as any).buildPdfHtml(pdfCourse) as string;

    expect(html).toContain('Reference tabs');
    expect(html).toContain('Overview');
    expect(html).toContain('Overview content');
    expect(html).toContain('Details');
    expect(html).toContain('Details content');
    expect(html).not.toContain('pdf-tabs-list');
    expect(html).not.toContain('Tab 1');
    expect(html).not.toContain('Tab 2');
    expect(html).not.toContain('Hidden question prompt');
    expect(html).not.toContain('Hidden correct answer');
    expect(html).not.toContain('Hidden option feedback');
    expect(html).not.toContain('Hidden correct feedback');
    expect(html).not.toContain('Hidden incorrect feedback');
    expect(html).toContain('Hidden quiz question');
    expect(html).toContain('Hidden quiz answer');
    expect(html).not.toContain('isCorrect');
    expect(html).not.toContain('Hidden quiz feedback');
  });

  it('keeps PDF lessons in normal flow under the course title', () => {
    const pdfCourse: CourseDocument = {
      ...course,
      pages: [
        {
          id: 'first-lesson',
          type: 'lesson',
          title: 'First lesson',
          blocks: [{ id: 'first-text', type: 'text', content: 'First body' }],
        },
        {
          id: 'second-lesson',
          type: 'lesson',
          title: 'Second lesson',
          blocks: [{ id: 'second-text', type: 'text', content: 'Second body' }],
        },
      ],
    };
    const scenarioRepo = { findOne: jest.fn() };
    const scenarioService = { resolveCourseDocumentForExport: jest.fn() };
    const service = new ScormPdfService(
      scenarioRepo as never,
      scenarioService as never,
    );

    const html = (service as any).buildPdfHtml(pdfCourse) as string;

    expect(html).toContain('pdf-course-header');
    expect(html).not.toContain('pdf-cover');
    expect(html).not.toContain('break-before:page');
    expect(html.indexOf('Export parity course')).toBeLessThan(
      html.indexOf('First lesson'),
    );
    expect(html.indexOf('First body')).toBeLessThan(
      html.indexOf('Second lesson'),
    );
  });

  it('uses the selected statement type as the callout when title is empty', () => {
    const statementCourse: CourseDocument = {
      ...course,
      pages: [
        {
          id: 'statement-lesson',
          type: 'lesson',
          title: 'Statement lesson',
          blocks: [
            {
              id: 'statement-block',
              type: 'statement',
              title: '',
              content: 'Remember this.',
              metadata: { style: 'tip' },
            },
          ],
        },
      ],
    };
    const scenarioRepo = { findOne: jest.fn() };
    const scenarioService = { resolveCourseDocumentForExport: jest.fn() };
    const pdfService = new ScormPdfService(
      scenarioRepo as never,
      scenarioService as never,
    );
    const service = new ScormBuildService(
      scenarioRepo as never,
      scenarioService as never,
    );

    const html = (pdfService as any).buildPdfHtml(statementCourse) as string;
    const runtime = (service as any).buildRuntime() as string;

    expect(html).toContain('<div class="statement-label">Tip</div>');
    expect(html).toContain('statement-tip');
    expect(runtime).toContain('function renderStatementBlock');
    expect(runtime).toContain('statementStyleLabel(styleMeta)');
  });

  it('uses the selected callout type and color class when title is empty or default', () => {
    const calloutCourse: CourseDocument = {
      ...course,
      pages: [
        {
          id: 'callout-lesson',
          type: 'lesson',
          title: 'Callout lesson',
          blocks: [
            {
              id: 'warning-callout',
              type: 'callout',
              title: 'Info',
              content: 'Careful.',
              metadata: { style: 'Warning' },
            },
          ],
        },
      ],
    };
    const scenarioRepo = { findOne: jest.fn() };
    const scenarioService = { resolveCourseDocumentForExport: jest.fn() };
    const pdfService = new ScormPdfService(
      scenarioRepo as never,
      scenarioService as never,
    );
    const service = new ScormBuildService(
      scenarioRepo as never,
      scenarioService as never,
    );

    const html = (pdfService as any).buildPdfHtml(calloutCourse) as string;
    const runtime = (service as any).buildRuntime() as string;

    expect(html).toContain('callout statement-warning');
    expect(html).toContain('<strong>Warning</strong>');
    expect(html).not.toContain('<strong>Info</strong>');
    expect(runtime).toContain('statementStyleClass(styleLabel)');
  });

  it('exports preview theme, accent tokens, and stable lesson layout styles', async () => {
    const themedCourse: CourseDocument = {
      ...course,
      theme: {
        ...course.theme!,
        accentColor: '#7C3AED',
        themeMode: 'light',
      },
    };
    const scenarioRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ ...scenario, courseDocument: themedCourse }),
    };
    const scenarioService = {
      resolveCourseDocumentForExport: jest.fn().mockReturnValue(themedCourse),
    };
    const service = new ScormBuildService(
      scenarioRepo as never,
      scenarioService as never,
    );

    const buffer = await service.generateScormPackage(scenario.id);
    const zip = await JSZip.loadAsync(buffer);
    const index = await zip.file('index.html')?.async('string');
    const styles = await zip.file('styles.css')?.async('string');
    const runtime = await zip.file('runtime.js')?.async('string');
    const courseData = await zip.file('course-data.js')?.async('string');

    expect(index).toContain('data-preview-theme="light"');
    expect(styles).toContain('--lux-primary:#7C3AED');
    expect(styles).toContain(
      '--lux-primary-hover:color-mix(in srgb, #7C3AED 88%',
    );
    expect(styles).toContain(
      '--lux-primary-muted:color-mix(in srgb, #7C3AED 62%',
    );
    expect(styles).toContain('#page{width:min(940px,100%);flex:0 1 940px}');
    expect(styles).toContain('.page-card-static{animation:none}');
    expect(styles).toContain(
      '.lesson-link-previous{border-bottom:1px solid var(--lux-line);margin-bottom:32px;padding:0 16px 28px}',
    );
    expect(runtime).toContain('function scrollLessonToTop()');
    expect(runtime).toContain('function renderCurrentPageSoft()');
    expect(runtime).toContain(
      'renderPage(currentPage, { animate: false, preserveScroll: true, scrollTop: false })',
    );

    const page = element();
    const document = createRuntimeDocument(page, themedCourse);
    const window = {
      document,
      addEventListener: jest.fn(),
      setTimeout,
      scrollTo: jest.fn(),
    };
    const sandbox = {
      window,
      document,
      console,
      location: { protocol: 'file:' },
      setTimeout,
    } as Record<string, unknown>;
    sandbox.globalThis = sandbox;
    (window as any).window = window;

    vm.createContext(sandbox);
    vm.runInContext(
      'window.scormRuntime={init:function(){},get:function(){return ""},set:function(){},commit:function(){},finish:function(){}};',
      sandbox,
    );
    vm.runInContext(courseData ?? '', sandbox, { filename: 'course-data.js' });
    vm.runInContext(runtime ?? '', sandbox, { filename: 'runtime.js' });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(document.body.setAttribute).toHaveBeenCalledWith(
      'data-preview-theme',
      'light',
    );
    expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
      '--lux-primary',
      '#7C3AED',
    );
    expect(document.documentElement.style.setProperty).toHaveBeenCalledWith(
      '--lux-primary-muted',
      'color-mix(in srgb, #7C3AED 62%, var(--lux-text-strong))',
    );
  });

  it('keeps exported flashcards interactive after the final card completes the block', async () => {
    const flashcardCourse: CourseDocument = {
      ...course,
      pages: [
        {
          id: 'flashcards-lesson',
          type: 'lesson',
          title: 'Flashcards lesson',
          blocks: [
            {
              id: 'flip-block',
              type: 'flashcards',
              title: 'Flip cards',
              items: [
                { id: 'card-1', title: 'Front 1', content: 'Back 1' },
                { id: 'card-2', title: 'Front 2', content: 'Back 2' },
              ],
            },
          ],
        },
      ],
      lessons: [],
    };
    const scenarioRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ ...scenario, courseDocument: flashcardCourse }),
    };
    const scenarioService = {
      resolveCourseDocumentForExport: jest
        .fn()
        .mockReturnValue(flashcardCourse),
    };
    const service = new ScormBuildService(
      scenarioRepo as never,
      scenarioService as never,
    );

    const buffer = await service.generateScormPackage(scenario.id);
    const zip = await JSZip.loadAsync(buffer);
    const runtime = await zip.file('runtime.js')?.async('string');
    const courseData = await zip.file('course-data.js')?.async('string');

    const document = createFlashcardRuntimeDocument(flashcardCourse);
    const window = {
      document,
      addEventListener: jest.fn(),
      setTimeout,
      scrollTo: jest.fn(),
    };
    const sandbox = {
      window,
      document,
      console,
      location: { protocol: 'file:' },
      setTimeout,
    } as Record<string, unknown>;
    sandbox.globalThis = sandbox;
    (window as any).window = window;

    vm.createContext(sandbox);
    vm.runInContext(
      'window.scormRuntime={init:function(){},get:function(){return ""},set:function(){},commit:function(){},finish:function(){}};',
      sandbox,
    );
    vm.runInContext(courseData ?? '', sandbox, { filename: 'course-data.js' });
    vm.runInContext(runtime ?? '', sandbox, { filename: 'runtime.js' });

    await new Promise((resolve) => setTimeout(resolve, 20));

    let cards = document.__cards;
    expect(cards).toHaveLength(2);
    cards[0].__events.click();
    expect(cards[0].classList.contains('flipped')).toBe(true);
    cards[1].__events.click();

    await new Promise((resolve) => setTimeout(resolve, 20));

    cards = document.__cards;
    expect(cards).toHaveLength(2);
    expect(document.__page.innerHTML).toContain('page-card page-card-static');
    expect(cards[0].__events.click).toBeDefined();
    expect(cards[1].__events.click).toBeDefined();
    expect(cards[0].classList.contains('flipped')).toBe(true);

    cards[0].__events.click();
    expect(cards[0].classList.contains('flipped')).toBe(false);
  });

  it('omits blank editor blocks from the SCORM runtime while preserving layout and flashcards', async () => {
    const courseWithBlankBlocks: CourseDocument = {
      ...course,
      pages: [
        {
          id: 'lesson-empty-check',
          type: 'lesson',
          title: 'Blank block handling',
          blocks: [
            {
              id: 'empty-text',
              type: 'text',
              content: '',
            },
            {
              id: 'empty-chart',
              type: 'chart',
              metadata: {
                chartType: 'bar',
                data: JSON.stringify([
                  { label: 'Item 1', value: 40 },
                  { label: 'Item 2', value: 70 },
                  { label: 'Item 3', value: 55 },
                ]),
                axisLabels: '',
                chartTitle: '',
              },
            } as any,
            {
              id: 'empty-flashcards',
              type: 'flashcards',
              items: [
                {
                  id: 'blank-card-1',
                  title: '',
                  content: '',
                  mediaUrl: '',
                  match: '',
                },
                {
                  id: 'blank-card-2',
                  title: '',
                  content: '',
                  mediaUrl: '',
                  match: '',
                },
              ],
              metadata: {
                layout: 'grid',
                clickPrompt: 'Click to flip',
                imageSide: 'front',
              },
            },
            {
              id: 'divider',
              type: 'divider',
              metadata: { label: '' },
            },
            {
              id: 'real-flashcards',
              type: 'flashcards',
              title: 'Flashcards',
              items: [
                {
                  id: 'blank-card-3',
                  title: '',
                  content: '',
                  mediaUrl: '',
                  match: '',
                },
                {
                  id: 'real-card',
                  title: 'Front',
                  content: 'Back',
                  mediaUrl: '/uploads/card.png',
                  match: 'back',
                },
              ],
            },
            {
              id: 'continue',
              type: 'continue_button',
              metadata: {
                label: 'Continue',
                completionType: 'Complete All Blocks Above',
              },
            },
          ],
        },
      ],
      lessons: [],
    };
    const scenarioRepo = {
      findOne: jest.fn().mockResolvedValue({
        ...scenario,
        courseDocument: courseWithBlankBlocks,
      }),
    };
    const scenarioService = {
      resolveCourseDocumentForExport: jest
        .fn()
        .mockReturnValue(courseWithBlankBlocks),
    };
    const service = new ScormBuildService(
      scenarioRepo as never,
      scenarioService as never,
    );

    const buffer = await service.generateScormPackage(
      scenario.id,
      'http://localhost:3001',
    );
    const zip = await JSZip.loadAsync(buffer);
    const index = await zip.file('index.html')?.async('string');
    const runtime = await zip.file('runtime.js')?.async('string');
    const courseData = await zip.file('course-data.js')?.async('string');

    expect(index).not.toContain('Export preview');

    const page = element();
    const document = createRuntimeDocument(page, courseWithBlankBlocks);
    const window = {
      document,
      addEventListener: jest.fn(),
      setTimeout,
    };
    const sandbox = {
      window,
      document,
      console,
      location: { protocol: 'file:' },
      setTimeout,
    } as Record<string, unknown>;
    sandbox.globalThis = sandbox;
    (window as any).window = window;
    const suspend = JSON.stringify({
      currentPage: 0,
      completedBlocks: ['real-flashcards'],
    });

    vm.createContext(sandbox);
    vm.runInContext(
      `window.scormRuntime={init:function(){},get:function(key){return key==='suspend'?${JSON.stringify(suspend)}:''},set:function(){},commit:function(){},finish:function(){}};`,
      sandbox,
    );
    vm.runInContext(courseData ?? '', sandbox, { filename: 'course-data.js' });
    vm.runInContext(runtime ?? '', sandbox, { filename: 'runtime.js' });

    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(page.innerHTML).toContain('divider-block');
    expect(page.innerHTML).toContain('continue-wrap');
    expect(page.innerHTML).toContain('Flashcards');
    expect(page.innerHTML).toContain('Front');
    expect(page.innerHTML).toContain('Back');
    expect(page.innerHTML).toContain('http://localhost:3001/uploads/card.png');
    expect(page.innerHTML).not.toContain('data-block="continue" disabled');
    expect(page.innerHTML).not.toContain('Item 1');
    expect(page.innerHTML).not.toContain(
      '<div class="block text-block"><p></p></div>',
    );
    expect(page.innerHTML).not.toContain('empty-text');
    expect(page.innerHTML).not.toContain('empty-chart');
    expect(page.innerHTML).not.toContain('empty-flashcards');
    expect(page.innerHTML).not.toContain('blank-card-1');
  });

  it('exports canonical quiz questions with SCORM score and success reporting', async () => {
    const quizCourse: CourseDocument = {
      ...course,
      pages: [
        {
          id: 'quiz-1',
          type: 'quiz',
          title: 'Quiz lesson',
          blocks: [],
          quiz: {
            passingScore: 80,
            attempts: 1,
            showFeedback: true,
            randomizeQuestions: false,
            randomizeAnswers: false,
            questions: [
              {
                id: 'q-mc',
                type: 'multiple_choice',
                text: 'Pick one',
                points: 1,
                options: [
                  { id: 'a', text: 'A', isCorrect: true },
                  { id: 'b', text: 'B', isCorrect: false },
                ],
              },
              {
                id: 'q-mr',
                type: 'multiple_response',
                text: 'Pick many',
                points: 2,
                options: [
                  { id: 'a', text: 'A', isCorrect: true },
                  { id: 'b', text: 'B', isCorrect: true },
                ],
              },
              {
                id: 'q-fill',
                type: 'fill_blank',
                text: 'Fill it',
                points: 1,
                options: [{ id: 'answer', text: 'Done', isCorrect: true }],
              },
              {
                id: 'q-match',
                type: 'matching',
                text: 'Match it',
                points: 1,
                options: [
                  {
                    id: 'pair',
                    text: 'Prompt',
                    match: 'Match',
                    isCorrect: true,
                  },
                ],
              },
            ],
          },
        },
      ],
      lessons: [],
      settings: {
        ...course.settings,
        scormVersion: '2004',
      },
    };
    const scenarioRepo = {
      findOne: jest
        .fn()
        .mockResolvedValue({ ...scenario, courseDocument: quizCourse }),
    };
    const scenarioService = {
      resolveCourseDocumentForExport: jest.fn().mockReturnValue(quizCourse),
    };
    const service = new ScormBuildService(
      scenarioRepo as never,
      scenarioService as never,
    );

    const buffer = await service.generateScormPackage(scenario.id);
    const zip = await JSZip.loadAsync(buffer);
    const runtime = await zip.file('runtime.js')?.async('string');
    const scorm = await zip.file('scorm.js')?.async('string');
    const exportedCourse = JSON.parse(
      (await zip.file('course.json')?.async('string')) ?? '{}',
    ) as CourseDocument;

    expect(runtime).toContain('function evaluateQuizQuestion');
    expect(runtime).toContain('quizResults');
    expect(runtime).toContain("window.scormRuntime.set('score'");
    expect(scorm).toContain('cmi.success_status');
    expect(
      exportedCourse.pages[0].quiz?.questions.map((question) => question.type),
    ).toEqual([
      'multiple_choice',
      'multiple_response',
      'fill_blank',
      'matching',
    ]);
  });
});

describe('ScormPreviewService \u2014 zip extraction safety', () => {
  // Uploaded-package handling moved to ScormPreviewService, which takes no
  // repository or ScenarioService dependency.
  const buildService = () => new ScormPreviewService();

  describe('normalizeZipEntryName', () => {
    // Expected values were confirmed by executing the real posix.normalize()
    // pipeline against each input, not hand-traced, since normalize's
    // segment-collapsing behavior on adversarial input is easy to get wrong.
    const cases: Array<[string, string | null]> = [
      ['../../etc/passwd', null],
      ['../outside.txt', null],
      ['valid/path/file.html', 'valid/path/file.html'],
      ['./normal.html', 'normal.html'],
      ['a/b/../../../etc/passwd', null],
      ['C:\\Windows\\System32\\config', null],
      ['/etc/passwd', 'etc/passwd'],
      ['file.html\u0000', 'file.html'],
      ['content\\lesson\\index.html', 'content/lesson/index.html'],
      ['..', null],
      ['../', null],
      ['.', null],
      ['', null],
    ];

    it.each(cases)('normalizeZipEntryName(%j) -> %j', (input, expected) => {
      const service = buildService();
      expect((service as any).normalizeZipEntryName(input)).toBe(expected);
    });
  });

  describe('shouldSkipZipEntry', () => {
    it('skips macOS metadata and OS junk files', () => {
      const service = buildService();
      expect((service as any).shouldSkipZipEntry('__MACOSX/.hidden')).toBe(
        true,
      );
      expect((service as any).shouldSkipZipEntry('__MACOSX/._index.html')).toBe(
        true,
      );
      expect((service as any).shouldSkipZipEntry('assets/.DS_Store')).toBe(
        true,
      );
      expect((service as any).shouldSkipZipEntry('assets/Thumbs.db')).toBe(
        true,
      );
    });

    it('does not skip legitimate content files', () => {
      const service = buildService();
      expect((service as any).shouldSkipZipEntry('content/index.html')).toBe(
        false,
      );
      expect((service as any).shouldSkipZipEntry('imsmanifest.xml')).toBe(
        false,
      );
    });
  });

  describe('resolvePackageFile', () => {
    it('rejects a traversal path even if normalization were bypassed', () => {
      const service = buildService();
      const packageRoot = join('tmp', 'scorm-test', 'pkg-abc');
      expect(() =>
        (service as any).resolvePackageFile(packageRoot, '../../../etc/passwd'),
      ).toThrow(BadRequestException);
    });

    it('accepts valid nested paths and keeps them under packageRoot', () => {
      const service = buildService();
      const packageRoot = join('tmp', 'scorm-test', 'pkg-abc');
      const result = (service as any).resolvePackageFile(
        packageRoot,
        'nested/dir/file.txt',
      );
      expect(result).toBe(resolve(packageRoot, 'nested/dir/file.txt'));
      expect(result.startsWith(resolve(packageRoot))).toBe(true);
    });

    it('accepts a path that resolves to packageRoot itself', () => {
      const service = buildService();
      const packageRoot = join('tmp', 'scorm-test', 'pkg-abc');
      expect((service as any).resolvePackageFile(packageRoot, '.')).toBe(
        resolve(packageRoot),
      );
    });
  });

  describe('uploadScormPackage guard clauses', () => {
    it('rejects non-zip files', async () => {
      const service = buildService();
      await expect(
        service.uploadScormPackage({
          buffer: Buffer.from('not a zip'),
          originalname: 'course.txt',
          size: 9,
        } as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects an empty upload', async () => {
      const service = buildService();
      await expect(
        service.uploadScormPackage({
          buffer: Buffer.alloc(0),
          originalname: 'course.zip',
          size: 0,
        } as Express.Multer.File),
      ).rejects.toThrow(BadRequestException);
    });
  });
});

function element() {
  const classes = new Set<string>();
  return {
    innerHTML: '',
    textContent: '',
    scrollTop: 0,
    style: {} as Record<string, string>,
    dataset: {} as Record<string, string>,
    disabled: false,
    scrollTo: jest.fn(),
    addEventListener: jest.fn(),
    setAttribute: jest.fn(),
    querySelector: jest.fn(() => null),
    querySelectorAll: jest.fn(() => []),
    classList: {
      toggle: jest.fn((className: string) => {
        if (classes.has(className)) {
          classes.delete(className);
          return false;
        }
        classes.add(className);
        return true;
      }),
      add: jest.fn((className: string) => classes.add(className)),
      remove: jest.fn((className: string) => classes.delete(className)),
      contains: jest.fn((className: string) => classes.has(className)),
    },
  };
}

function createRuntimeDocument(
  page = element(),
  course: CourseDocument = {} as CourseDocument,
) {
  const nav = element();
  const brand = element();
  const progressFill = element();
  const progressText = element();
  const sidebarToggle = element();
  const runtimeShell = element();
  const body = { setAttribute: jest.fn() };
  const documentElement = {
    style: {
      setProperty: jest.fn(),
    },
  };

  return {
    readyState: 'complete',
    body,
    documentElement,
    querySelector: jest.fn((selector: string) => {
      if (selector === '.runtime-brand') return brand;
      if (selector === '#nav') return nav;
      if (selector === '#page') return page;
      if (selector === '#progress-fill') return progressFill;
      if (selector === '#progress-text') return progressText;
      if (selector === '#sidebar-toggle') return sidebarToggle;
      if (selector === '.runtime-shell') return runtimeShell;
      return null;
    }),
    querySelectorAll: jest.fn((selector: string) => [] as any[]),
    getElementById: jest.fn((id: string) =>
      id === 'course-data' ? { textContent: JSON.stringify(course) } : null,
    ),
    addEventListener: jest.fn(),
  };
}

type FakeFlashcardElement = ReturnType<typeof createFakeFlashcard>;

function createFlashcardRuntimeDocument(course: CourseDocument): any {
  const nav = element();
  const brand = element();
  const progressFill = element();
  const progressText = element();
  const sidebarToggle = element();
  const runtimeShell = element();
  const runtimeMain = element();
  const runtimePreview = element();
  const body = { setAttribute: jest.fn() };
  const documentElement = {
    style: {
      setProperty: jest.fn(),
    },
  };
  const state = {
    cards: [] as FakeFlashcardElement[],
  };
  const page = element() as ReturnType<typeof element> & {
    __html: string;
  };

  Object.defineProperty(page, 'innerHTML', {
    get() {
      return page.__html;
    },
    set(value: string) {
      page.__html = value;
      state.cards = parseFlashcards(value);
    },
  });
  page.__html = '';

  const document = {
    readyState: 'complete',
    body,
    documentElement,
    __cards: state.cards,
    __page: page,
    querySelector: jest.fn((selector: string) => {
      if (selector === '.runtime-brand') return brand;
      if (selector === '#nav') return nav;
      if (selector === '#page') return page;
      if (selector === '#progress-fill') return progressFill;
      if (selector === '#progress-text') return progressText;
      if (selector === '#sidebar-toggle') return sidebarToggle;
      if (selector === '.runtime-shell') return runtimeShell;
      if (selector === '.runtime-main') return runtimeMain;
      if (selector === '.runtime-preview') return runtimePreview;
      return null;
    }),
    querySelectorAll: jest.fn((selector: string) => {
      if (selector === '.flashcard') return state.cards;
      if (selector === '.nav-item') return [];
      if (selector === '.lesson-link[data-page]') return [];
      if (selector === '.continue') return [];
      return [];
    }),
    getElementById: jest.fn((id: string) =>
      id === 'course-data' ? { textContent: JSON.stringify(course) } : null,
    ),
    addEventListener: jest.fn(),
  } as ReturnType<typeof createRuntimeDocument> & {
    __cards: FakeFlashcardElement[];
    __page: typeof page;
  };

  Object.defineProperty(document, '__cards', {
    get() {
      return state.cards;
    },
  });

  return document;
}

function parseFlashcards(html: string): FakeFlashcardElement[] {
  const blockId =
    html.match(/class="flashcards-block" data-block-id="([^"]+)"/)?.[1] ?? '';
  const cardMatches = Array.from(
    html.matchAll(
      /class="([^"]*\bflashcard\b[^"]*)" tabindex="0" role="button" data-item-id="([^"]+)"/g,
    ),
  );
  const section = {
    dataset: { blockId },
    querySelectorAll: jest.fn((selector: string) =>
      selector === '.flashcard' ? cards : [],
    ),
  };
  const cards = cardMatches.map((match) =>
    createFakeFlashcard(
      match[2],
      section,
      match[1].split(/\s+/).includes('flipped'),
    ),
  );
  return cards;
}

function createFakeFlashcard(
  itemId: string,
  section: {
    dataset: Record<string, string>;
    querySelectorAll: jest.Mock;
  },
  flipped = false,
) {
  const classes = new Set<string>();
  if (flipped) classes.add('flipped');
  const card = {
    dataset: { itemId },
    __events: {} as Record<string, () => void>,
    closest: jest.fn((selector: string) =>
      selector === '.flashcards-block' ? section : null,
    ),
    setAttribute: jest.fn(),
    addEventListener: jest.fn((event: string, handler: () => void) => {
      card.__events[event] = handler;
    }),
    classList: {
      toggle: jest.fn((className: string) => {
        if (classes.has(className)) {
          classes.delete(className);
          return false;
        }
        classes.add(className);
        return true;
      }),
      add: jest.fn((className: string) => classes.add(className)),
      remove: jest.fn((className: string) => classes.delete(className)),
      contains: jest.fn((className: string) => classes.has(className)),
    },
  };
  return card;
}
