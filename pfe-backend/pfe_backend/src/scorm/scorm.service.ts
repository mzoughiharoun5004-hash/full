import {
  BadRequestException,
  Injectable,
  NotFoundException,
  OnModuleDestroy,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import JSZip from 'jszip';
import PDFDocument from 'pdfkit';
import puppeteer from 'puppeteer';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve, sep } from 'node:path';
import { Scenario } from 'src/scenario/scenario.entity';
import { ScenarioService } from 'src/scenario/scenario.service';
import {
  CourseBlock,
  CourseDocument,
  CourseLesson,
  CoursePage,
  CourseTheme,
  QuizQuestion,
} from 'src/scenario/course-document.types';

type PdfCourseItem = NonNullable<CourseBlock['items']>[number];
type PdfChartRow = { label: string; value: number };
export type UploadedScormPackage = {
  id: string;
  title: string;
  originalName: string;
  launchPath: string;
  viewUrl: string;
  fileUrl: string;
  size: number;
  uploadedAt: string;
};

const SCORM_UPLOAD_ROOT = join(process.cwd(), 'uploads', 'scorm');
const SCORM_UPLOAD_METADATA = '.scorm-viewer.json';
const MAX_SCORM_FILE_COUNT = 4000;
const MAX_SCORM_UNCOMPRESSED_SIZE = 750 * 1024 * 1024;

@Injectable()
export class ScormService implements OnModuleDestroy {
  private browser: import('puppeteer').Browser | null = null;
  private browserLaunchPromise: Promise<import('puppeteer').Browser> | null =
    null;
  private readonly browserQueue: Array<() => void> = [];
  private readonly maxPdfConcurrency = 2;
  private pdfInFlight = 0;

  constructor(
    @InjectRepository(Scenario)
    private readonly scenarioRepo: Repository<Scenario>,
    private readonly scenarioService: ScenarioService,
  ) {}

  async uploadScormPackage(
    file: Express.Multer.File,
  ): Promise<UploadedScormPackage> {
    if (!file?.buffer?.length) {
      throw new BadRequestException('A SCORM zip file is required.');
    }
    if (!file.originalname.toLowerCase().endsWith('.zip')) {
      throw new BadRequestException('Only .zip SCORM packages are supported.');
    }

    let zip: JSZip;
    try {
      zip = await JSZip.loadAsync(file.buffer);
    } catch {
      throw new BadRequestException('The uploaded file is not a valid zip.');
    }

    const packageId = randomUUID();
    const packageRoot = this.uploadedPackageRoot(packageId);
    const extractedFiles = new Map<string, JSZip.JSZipObject>();

    for (const entry of Object.values(zip.files)) {
      if (entry.dir) continue;
      const normalizedName = this.normalizeZipEntryName(entry.name);
      if (!normalizedName || this.shouldSkipZipEntry(normalizedName)) continue;
      extractedFiles.set(normalizedName, entry);
    }

    if (extractedFiles.size === 0) {
      throw new BadRequestException(
        'The SCORM package does not contain files.',
      );
    }
    if (extractedFiles.size > MAX_SCORM_FILE_COUNT) {
      throw new BadRequestException(
        'The SCORM package contains too many files.',
      );
    }

    const manifest = await this.readManifestFromZip(extractedFiles);
    const launchPath = this.resolveLaunchPath(extractedFiles, manifest);
    if (!launchPath) {
      throw new BadRequestException(
        'Could not find a launch file in this SCORM package.',
      );
    }

    const title =
      this.extractManifestTitle(manifest?.content) ||
      file.originalname.replace(/\.zip$/i, '');
    let totalUncompressedSize = 0;

    await mkdir(packageRoot, { recursive: true });
    try {
      for (const [safePath, entry] of extractedFiles) {
        const content = await entry.async('nodebuffer');
        totalUncompressedSize += content.length;
        if (totalUncompressedSize > MAX_SCORM_UNCOMPRESSED_SIZE) {
          throw new BadRequestException(
            'The SCORM package is too large after extraction.',
          );
        }
        const destination = this.resolvePackageFile(packageRoot, safePath);
        await mkdir(dirname(destination), { recursive: true });
        await writeFile(destination, content);
      }

      const metadata: UploadedScormPackage = {
        id: packageId,
        title,
        originalName: file.originalname,
        launchPath,
        viewUrl: `/scorm/uploads/${packageId}/viewer`,
        fileUrl: `/uploads/scorm/${packageId}/${launchPath}`,
        size: file.size,
        uploadedAt: new Date().toISOString(),
      };
      await writeFile(
        join(packageRoot, SCORM_UPLOAD_METADATA),
        JSON.stringify(metadata, null, 2),
        'utf8',
      );
      return metadata;
    } catch (error) {
      await rm(packageRoot, { recursive: true, force: true });
      throw error;
    }
  }

  async getUploadedScormPackage(
    packageId: string,
  ): Promise<UploadedScormPackage> {
    if (!this.isValidUploadedPackageId(packageId)) {
      throw new NotFoundException('SCORM package not found.');
    }

    try {
      const content = await readFile(
        join(this.uploadedPackageRoot(packageId), SCORM_UPLOAD_METADATA),
        'utf8',
      );
      const metadata = JSON.parse(content) as UploadedScormPackage;
      if (!metadata.launchPath) {
        throw new Error('Missing launch file.');
      }
      return {
        ...metadata,
        id: packageId,
        viewUrl: `/scorm/uploads/${packageId}/viewer`,
        fileUrl: `/uploads/scorm/${packageId}/${metadata.launchPath}`,
      };
    } catch {
      throw new NotFoundException('SCORM package not found.');
    }
  }

  async buildUploadedScormViewer(packageId: string): Promise<string> {
    const metadata = await this.getUploadedScormPackage(packageId);
    const title = this.escHtml(metadata.title || metadata.originalName);
    const launchUrl = this.escHtml(metadata.fileUrl);

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${title}</title>
  <style>
    :root{color-scheme:dark;--bg:#0f171b;--surface:#162220;--line:rgba(246,240,230,.14);--text:#fff8ec;--muted:#b9ad9c;--primary:#83bfa1}
    *{box-sizing:border-box}
    html,body{width:100%;height:100%;margin:0;overflow:hidden;background:var(--bg);color:var(--text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif}
    .viewer{display:grid;height:100%;grid-template-rows:auto minmax(0,1fr);background:var(--bg)}
    .viewer-bar{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--line);background:var(--surface);padding:10px 14px}
    .viewer-title{min-width:0}
    .viewer-title strong{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
    .viewer-title span{display:block;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--muted);font-size:11px}
    .viewer-status{border:1px solid var(--line);border-radius:999px;padding:5px 9px;color:var(--primary);font-size:11px;font-weight:800;white-space:nowrap}
    iframe{display:block;width:100%;height:100%;border:0;background:#fff}
  </style>
</head>
<body>
  <main class="viewer">
    <header class="viewer-bar">
      <div class="viewer-title">
        <strong>${title}</strong>
        <span>${this.escHtml(metadata.launchPath)}</span>
      </div>
      <div class="viewer-status" id="scorm-status">SCORM ready</div>
    </header>
    <iframe id="scorm-frame" src="${launchUrl}" allow="fullscreen; autoplay; clipboard-read; clipboard-write" allowfullscreen></iframe>
  </main>
  <script>
    (function(){
      var statusEl=document.getElementById('scorm-status');
      var data={
        'cmi.core.lesson_status':'not attempted',
        'cmi.core.score.raw':'',
        'cmi.core.score.min':'0',
        'cmi.core.score.max':'100',
        'cmi.core.lesson_location':'',
        'cmi.suspend_data':'',
        'cmi.completion_status':'not attempted',
        'cmi.success_status':'unknown',
        'cmi.score.raw':'',
        'cmi.score.min':'0',
        'cmi.score.max':'100',
        'cmi.location':''
      };
      var lastError='0';
      function setStatus(value){if(statusEl)statusEl.textContent=value;}
      function getValue(key){lastError='0';return Object.prototype.hasOwnProperty.call(data,key)?String(data[key]):'';}
      function setValue(key,value){lastError='0';data[key]=String(value);if(/lesson_status|completion_status|success_status/.test(key)){setStatus(String(value));}return 'true';}
      window.API={
        LMSInitialize:function(){lastError='0';setStatus('SCORM 1.2 active');return 'true';},
        LMSFinish:function(){lastError='0';setStatus('Finished');return 'true';},
        LMSGetValue:getValue,
        LMSSetValue:setValue,
        LMSCommit:function(){lastError='0';return 'true';},
        LMSGetLastError:function(){return lastError;},
        LMSGetErrorString:function(code){return code==='0'?'No error':'SCORM runtime error';},
        LMSGetDiagnostic:function(code){return 'Diagnostic '+(code||lastError);}
      };
      window.API_1484_11={
        Initialize:function(){lastError='0';setStatus('SCORM 2004 active');return 'true';},
        Terminate:function(){lastError='0';setStatus('Finished');return 'true';},
        GetValue:getValue,
        SetValue:setValue,
        Commit:function(){lastError='0';return 'true';},
        GetLastError:function(){return lastError;},
        GetErrorString:function(code){return code==='0'?'No error':'SCORM runtime error';},
        GetDiagnostic:function(code){return 'Diagnostic '+(code||lastError);}
      };
    })();
  </script>
</body>
</html>`;
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

  async generatePdfPackage(
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
    return this.buildPdfWithChromium(course);
  }

  private async buildPdfWithChromium(course: CourseDocument): Promise<Buffer> {
    await this.acquireBrowserSlot();
    try {
      const browser = await this.getBrowser();
      const page = await browser.newPage();
      try {
        await page.setViewport({
          width: 1200,
          height: 1600,
          deviceScaleFactor: 1,
        });
        const html = this.buildPdfHtml(course);
        await page.setContent(html, { waitUntil: 'load' });
        await page.evaluate(async () => {
          const images = Array.from(document.images);
          await Promise.all(
            images.map((image) => {
              if (image.complete) return Promise.resolve();
              return new Promise<void>((resolve) => {
                image.addEventListener('load', () => resolve(), { once: true });
                image.addEventListener('error', () => resolve(), {
                  once: true,
                });
              });
            }),
          );
        });
        const pdf = await page.pdf({
          format: 'A4',
          printBackground: true,
          margin: {
            top: '14mm',
            right: '12mm',
            bottom: '14mm',
            left: '12mm',
          },
        });
        return Buffer.from(pdf);
      } finally {
        await page.close();
      }
    } finally {
      this.releaseBrowserSlot();
    }
  }

  private async acquireBrowserSlot(): Promise<void> {
    if (this.pdfInFlight < this.maxPdfConcurrency) {
      this.pdfInFlight += 1;
      return;
    }

    // A released slot is transferred directly to the next waiter, so the
    // in-flight count never briefly drops below its real occupancy.
    await new Promise<void>((resolve) => this.browserQueue.push(resolve));
  }

  private releaseBrowserSlot(): void {
    const next = this.browserQueue.shift();
    if (next) {
      next();
      return;
    }
    this.pdfInFlight = Math.max(0, this.pdfInFlight - 1);
  }

  private async getBrowser(): Promise<import('puppeteer').Browser> {
    if (this.browser?.connected) return this.browser;
    if (this.browserLaunchPromise) return this.browserLaunchPromise;

    this.browserLaunchPromise = puppeteer
      .launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
        ],
      })
      .then((browser) => {
        this.browser = browser;
        browser.on('disconnected', () => {
          if (this.browser === browser) this.browser = null;
        });
        return browser;
      })
      .finally(() => {
        this.browserLaunchPromise = null;
      });

    return this.browserLaunchPromise;
  }

  async onModuleDestroy(): Promise<void> {
    const browser = this.browser;
    this.browser = null;
    await browser?.close();
  }

  private buildPdfHtml(course: CourseDocument): string {
    const exportPages = course.pages?.length
      ? course.pages
      : (course.lessons ?? []).map((lesson) => this.lessonToPage(lesson));
    const pages = exportPages
      .map((page, index) => {
        const blocks = (page.blocks ?? [])
          .map((block) => this.renderPdfBlock(block, course))
          .join('');
        const scenario =
          page.type === 'branching_scenario'
            ? this.renderPdfScenarioPage(page)
            : '';
        const quiz = page.quiz ? this.renderPdfQuiz(page.quiz, course) : '';
        return `
          <section class="page-card page-card-static pdf-page-card">
            ${this.renderPdfPageTitle(page, index, exportPages.length, course)}
            ${blocks || scenario || quiz ? `${blocks}${scenario}${quiz}` : '<p class="summary">No content in this lesson.</p>'}
          </section>
        `;
      })
      .join('');

    const stylesheet = this.buildStylesheet(course.theme);
    const printEnhancements = `
      @page{size:A4;margin:14mm 12mm}
      @media print {
        .runtime-nav,.runtime-topbar,.runtime-shell{display:none !important}
        .block,.heading-block,.text-block,.items-block,.knowledge-check,.question-block,.gallery-block,.accordion-block,.tabs-block,.sorting-block,.flashcards-block,.chart-block,.media-block,.process-steps-block,.table-wrap,.pdf-static-card,.pdf-expanded-panel,.pdf-process-step,.pdf-flashcard-print{break-inside:avoid-page}
      }
      html,body{height:auto !important;min-height:0 !important;overflow:visible !important;background:var(--lux-bg) !important}
      body{font-size:14px;line-height:1.55;-webkit-print-color-adjust:exact;print-color-adjust:exact}
      button{cursor:default}
      .pdf-container{width:min(940px,100%);margin:0 auto}
      .pdf-course-header{margin:0 0 18px;padding:0 30px 18px;border-bottom:1px solid var(--lux-line)}
      .pdf-course-header .eyebrow{margin:0;color:var(--lux-primary-muted);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .pdf-course-header h1{margin:6px 0 0;color:var(--lux-text-strong);font-size:34px;line-height:1.12}
      .pdf-course-header p:not(.eyebrow){max-width:720px;margin:10px 0 0;color:var(--lux-muted);font-size:15px;line-height:1.65}
      .pdf-page-card{width:100%;margin:0;padding:22px 30px 26px;animation:none !important}
      .pdf-page-card + .pdf-page-card{margin-top:18px}
      .pdf-page-card>.eyebrow{margin:0;color:var(--lux-primary-muted);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}
      .pdf-page-card>h1{margin:6px 0 0;color:var(--lux-text-strong);font-size:30px;line-height:1.18}
      .pdf-page-card>.summary,.pdf-page-card .page-summary{margin-top:12px;color:var(--lux-muted);font-size:16px;line-height:1.7}
      .pdf-page-card .page-title-hero{margin-bottom:28px}
      .continue-wrap,.lesson-link,.tabs-arrow,.process-actions,.primary.continue{display:none !important}
      .block,.heading-block,.text-block,.items-block,.knowledge-check,.question-block,.gallery-block,.accordion-block,.tabs-block,.sorting-block,.flashcards-block,.chart-block,.media-block{border-top:1px solid var(--lux-line);padding-top:18px;margin-top:24px}
      .heading-block{border-top:0}
      .pdf-static-card,.pdf-expanded-panel{border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface);padding:14px 16px}
      .pdf-panel-kicker,.pdf-side-label{display:inline-flex;margin-bottom:10px;border-radius:999px;background:var(--lux-primary-soft);padding:4px 10px;color:var(--lux-primary-muted);font-size:11px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}
      .pdf-panel-title{margin:0 0 8px;color:var(--lux-text-strong);font-size:16px;font-weight:900}
      .pdf-muted{color:var(--lux-muted);font-size:13px;line-height:1.65}
      .pdf-two-up{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}
      .pdf-two-up figure{margin:0}
      .media-block img,.media-block video,.media-block iframe,.panel-media,.pdf-media{display:block;width:100%;max-width:100%;border:0;border-radius:10px}
      .media-block img,.panel-media:is(img),.pdf-media:is(img){max-height:520px;object-fit:contain}
      .media-link{display:block;margin-top:8px;color:var(--lux-primary-muted);font-weight:700;word-break:break-all}
      .attachment{break-inside:avoid-page;text-decoration:none}
      .pdf-flashcards-grid{display:grid;grid-template-columns:1fr;gap:16px;margin-top:20px}
      .pdf-flashcard-print{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;min-height:0;perspective:none;cursor:default;text-align:left}
      .pdf-flashcard-print .flashcard-face{position:relative;inset:auto;min-height:170px;backface-visibility:visible;-webkit-backface-visibility:visible;transform:none}
      .pdf-flashcard-print .flashcard-back{transform:none}
      .pdf-flashcard-print .fc-content{align-items:flex-start;justify-content:flex-start;padding:0 18px 22px;text-align:left;white-space:pre-wrap}
      .pdf-flashcard-print img{display:block;max-height:150px;width:100%;max-width:100%;margin:0 0 12px;object-fit:contain}
      .pdf-tabs-panels{display:grid;gap:12px;margin-top:14px}
      .tabs-block>h2+.pdf-tabs-panels,.tabs-block>.summary+.pdf-tabs-panels{margin-top:16px}
      .pdf-tabs-panels .tab-panel{margin-top:0}
      .accordion-panel,.tab-panel{display:block !important}
      .accordion-toggle.pdf-static-toggle{cursor:default}
      .accordion-chevron{display:none}
      .pdf-sorting-categories{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}
      .pdf-sorting-category{min-height:0;border-style:solid}
      .pdf-sorting-category ul,.pdf-values-list{margin:10px 0 0 18px;padding:0;color:var(--lux-muted);line-height:1.65}
      .pdf-process-stack{display:grid;gap:16px;margin-top:18px}
      .pdf-process-step{border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface-soft);padding:16px}
      .pdf-process-step .process-step-grid{grid-template-columns:minmax(0,1fr) minmax(180px,.7fr)}
      .choice.pdf-choice{break-inside:avoid-page;cursor:default}
      .pdf-correct-badge{margin-left:auto;border-radius:999px;background:var(--lux-primary-soft);padding:3px 8px;color:var(--lux-primary-muted);font-size:11px;font-weight:900;text-transform:uppercase}
      .table-wrap{width:100%;overflow:visible}
      .table-wrap table{width:100%;min-width:0;table-layout:auto}
      .table-wrap th,.table-wrap td{vertical-align:top}
      .chart-block h2{margin-bottom:14px}
      .chart-wrap,.chart-bars,.pie-list{break-inside:avoid-page}
      .chart-bars{height:220px}
      .chart-bar-fill{animation:none !important}
      .chart-bar-value{color:var(--lux-text-strong);font-size:12px;font-weight:900}
      .chart-explicit-values{margin-top:12px;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface-soft);padding:12px}
      .chart-explicit-values h3{margin:0 0 8px;color:var(--lux-text-strong);font-size:14px}
      .chart-explicit-values table{width:100%;border-collapse:collapse;font-size:13px}
      .chart-explicit-values th,.chart-explicit-values td{border-top:1px solid var(--lux-line);padding:7px 8px;text-align:left}
      .chart-explicit-values th{color:var(--lux-text-strong)}
      .chart-explicit-values td{color:var(--lux-muted)}
      .pdf-scenario-nodes{display:grid;gap:14px;margin-top:16px}
      .pdf-metadata-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}
      .pdf-metadata-grid div{border:1px solid var(--lux-line);border-radius:8px;background:var(--lux-surface-soft);padding:10px}
      .pdf-metadata-grid strong{display:block;color:var(--lux-text-strong);font-size:12px}
      .pdf-metadata-grid span{display:block;margin-top:3px;color:var(--lux-muted);font-size:12px;word-break:break-word}
      pre{white-space:pre-wrap;word-break:break-word}
    `;

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>${this.escHtml(course.title || 'Course')}</title>
  <style>${stylesheet}</style>
  <style>${printEnhancements}</style>
</head>
<body data-preview-theme="${course.theme?.themeMode === 'light' ? 'light' : 'dark'}">
  <main class="pdf-container">
    <header class="pdf-course-header">
      <p class="eyebrow">Course Export</p>
      <h1>${this.escHtml(course.title || 'Course')}</h1>
      ${course.description ? `<p>${this.escHtml(course.description)}</p>` : ''}
    </header>
    ${pages}
  </main>
</body>
</html>`;
  }

  private renderPdfPageTitle(
    page: CoursePage,
    index: number,
    total: number,
    course: CourseDocument,
  ): string {
    const label = `Lesson ${index + 1} of ${Math.max(total, index + 1)}`;
    const title = this.escHtml(page.title || `Lesson ${index + 1}`);
    const summary = page.summary
      ? `<p class="summary page-summary">${this.pdfMultiline(page.summary)}</p>`
      : '';
    const cover = page.coverImageUrl
      ? this.absoluteAssetUrl(page.coverImageUrl, course)
      : '';

    if (!cover) {
      return `<p class="eyebrow">${this.escHtml(label)}</p><h1>${title}</h1>${summary}`;
    }

    return `<header class="page-title-hero">
      <img src="${this.escHtml(cover)}" alt=""/>
      <div><p class="eyebrow">${this.escHtml(label)}</p><h1>${title}</h1>${summary}</div>
    </header>`;
  }

  private renderPdfBlock(block: CourseBlock, course: CourseDocument): string {
    const type = this.pdfBlockType(block);
    const title = String(block.title ?? '').trim();
    const content = String(block.content ?? '').trim();

    if (type === 'continue_button') return '';
    if (type === 'heading') return this.renderPdfHeadingBlock(block);
    if (type === 'paragraph' || type === 'text') {
      return `<div class="block text-block"><p>${this.pdfMultiline(content)}</p></div>`;
    }
    if (type === 'callout') return this.renderPdfCalloutBlock(block);
    if (type === 'statement') return this.renderPdfStatementBlock(block);
    if (type === 'quote') return this.renderPdfQuoteBlock(block, course);
    if (
      [
        'numbered_list',
        'list',
        'checklist',
        'ordering',
        'timeline',
        'lesson_summary',
      ].includes(type)
    ) {
      return this.renderPdfListBlock(block, course);
    }
    if (type === 'image_gallery' || type === 'gallery')
      return this.renderPdfGalleryBlock(block, course);
    if (
      [
        'image',
        'video',
        'audio',
        'embed',
        'attachment',
        'document',
        'file_download',
        'resource_link',
      ].includes(type)
    ) {
      return this.renderPdfMediaBlock(block, course);
    }
    if (type === 'code') {
      return `<pre class="code-block"><code>${this.escHtml(content || title)}</code></pre>`;
    }
    if (type === 'process_steps' || type === 'process')
      return this.renderPdfProcessStepsBlock(block, course);
    if (type === 'sorting_activity' || type === 'sorting')
      return this.renderPdfSortingBlock(block, course);
    if (type === 'accordion' || type === 'tabs')
      return this.renderPdfAccordionTabsBlock(block, course);
    if (type === 'flashcards')
      return this.renderPdfFlashcardsBlock(block, course);
    if (type === 'reveal') return this.renderPdfRevealBlock(block, course);
    if (type === 'before_after')
      return this.renderPdfBeforeAfterBlock(block, course);
    if (type === 'hotspot') return this.renderPdfHotspotBlock(block, course);
    if (type === 'labeled_graphic')
      return this.renderPdfLabeledGraphicBlock(block, course);
    if (type === 'table') return this.renderPdfTableBlock(block);
    if (type === 'chart') return this.renderPdfChartBlock(block);
    if (type === 'divider') {
      const label = this.pdfMetaString(block, 'label', '');
      return `<div class="divider-block"><span></span>${label ? `<em>${this.escHtml(label)}</em>` : ''}<span></span></div>`;
    }
    if (type === 'spacer') {
      const height = Math.max(
        8,
        Math.min(220, this.pdfMetaNumber(block, 'height', 48) || 48),
      );
      return `<div class="spacer-block" style="height:${height}px"></div>`;
    }
    if (type === 'button' || type === 'restart_button')
      return this.renderPdfButtonBlock(block, course);
    if (type === 'character_monologue')
      return this.renderPdfCharacterMonologueBlock(block, course);
    if (
      [
        'dialogue',
        'branching_dialogue',
        'choice_point',
        'consequence',
        'decision_recap',
        'branch_merge',
      ].includes(type)
    ) {
      return this.renderPdfDialogueBlock(block, course);
    }
    if (type === 'conditional_gate')
      return this.renderPdfConditionalGateBlock(block);
    if (type === 'glossary') return this.renderPdfGlossaryBlock(block);
    if (type === 'certificate')
      return this.renderPdfCertificateBlock(block, course);
    if (type === 'completion_message')
      return this.renderPdfCompletionMessageBlock(block, course);
    if (type === 'score_summary') return this.renderPdfScoreSummaryBlock(block);
    if (type === 'scenario')
      return this.renderPdfItemsBlock(block, course, 'Scenario');
    if (type === 'knowledge_check' || this.isPdfQuestionType(type)) return '';
    if (block.items?.length) return this.renderPdfItemsBlock(block, course);

    return `<section class="block interaction-block">${title ? `<h2>${this.escHtml(title)}</h2>` : ''}${content ? `<p class="summary">${this.pdfMultiline(content)}</p>` : ''}</section>`;
  }

  private renderPdfHeadingBlock(block: CourseBlock): string {
    const title = String(block.content || block.title || '').trim();
    const subtitle = this.pdfMetaString(block, 'subtitle', '');
    return `<div class="block heading-block">
      <h2 class="block-heading">${this.escHtml(title)}</h2>
      ${subtitle ? `<p class="block-subtitle">${this.pdfMultiline(subtitle)}</p>` : ''}
    </div>`;
  }

  private renderPdfCalloutBlock(block: CourseBlock): string {
    const styleLabel = this.statementStyleLabel(
      this.pdfMetaString(block, 'style', 'Info'),
    );
    const styleClass = this.statementStyleClass(styleLabel);
    const title = this.statementCalloutLabel(block.title, styleLabel);
    const content = String(block.content ?? '').trim();
    return `<aside class="block callout statement-${styleClass}">
      <strong>${this.escHtml(title)}</strong>
      <p>${this.pdfMultiline(content)}</p>
    </aside>`;
  }

  private renderPdfStatementBlock(block: CourseBlock): string {
    const styleMeta = this.pdfMetaString(block, 'style', 'Info');
    const styleLabel = this.statementStyleLabel(styleMeta);
    const styleClass = this.statementStyleClass(styleLabel);
    const callout = this.statementCalloutLabel(block.title, styleLabel);
    return `<section class="statement-block statement-${styleClass}">
      <div class="statement-label">${this.escHtml(callout)}</div>
      <p>${this.pdfMultiline(block.content || '')}</p>
    </section>`;
  }

  private renderPdfQuoteBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const body = String(block.content || block.title || '').trim();
    const attributionName = this.pdfMetaString(
      block,
      'attributionName',
      this.pdfMetaString(block, 'attribution', ''),
    );
    const attributionRole = this.pdfMetaString(block, 'attributionRole', '');
    const avatarUrl = this.pdfMetaString(block, 'avatarUrl', '');
    const imageUrl = this.pdfMetaString(block, 'imageUrl', '');
    const layout = this.pdfMetaString(block, 'layout', 'standard');
    const alignment = this.pdfMetaString(block, 'alignment', 'left');
    const spacing = this.pdfMetaString(block, 'spacing', 'normal');
    const showQuoteMark = this.pdfMetaBoolean(block, 'showQuoteMark', true);
    const showAvatar = this.pdfMetaBoolean(block, 'showAvatar', true);
    const overlayOpacity =
      Math.max(
        0,
        Math.min(90, this.pdfMetaNumber(block, 'overlayOpacity', 55)),
      ) / 100;
    const alignClass =
      alignment === 'center'
        ? 'quote-align-center'
        : alignment === 'right'
          ? 'quote-align-right'
          : 'quote-align-left';
    const spacingClass =
      spacing === 'compact'
        ? 'quote-spacing-compact'
        : spacing === 'wide'
          ? 'quote-spacing-wide'
          : 'quote-spacing-normal';
    const avatar =
      showAvatar && avatarUrl ? this.absoluteAssetUrl(avatarUrl, course) : '';
    const attribution = attributionName || attributionRole;
    const quoteContent = `<div class="quote-content ${alignClass} ${spacingClass}">
      ${showQuoteMark ? '<span class="quote-mark">&quot;</span>' : ''}
      <blockquote>${this.pdfMultiline(body)}</blockquote>
      ${showQuoteMark ? '<span class="quote-mark quote-mark-end">&quot;</span>' : ''}
      ${
        attribution
          ? `<figcaption>
        ${avatar ? `<img src="${this.escHtml(avatar)}" alt=""/>` : ''}
        <span>
          ${attributionName ? `<strong>${this.escHtml(attributionName)}</strong>` : ''}
          ${attributionRole ? `<em>${this.escHtml(attributionRole)}</em>` : ''}
        </span>
      </figcaption>`
          : ''
      }
    </div>`;

    if (layout === 'image' && imageUrl) {
      const image = this.absoluteAssetUrl(imageUrl, course);
      return `<figure class="quote-block quote-image" style="background-image:url('${this.cssString(image)}')">
        <div style="background:rgba(11,15,22,${overlayOpacity})">${quoteContent}</div>
      </figure>`;
    }

    return `<figure class="quote-block">${quoteContent}</figure>`;
  }

  private renderPdfListBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const type = this.pdfBlockType(block);
    const items = this.pdfVisibleItems(block);
    if (!items.length) return '';
    const isNumbered = [
      'numbered_list',
      'ordering',
      'timeline',
      'process_steps',
    ].includes(type);

    return `<section class="items-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : ''}
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      <div class="items-grid">
        ${items
          .map((item, index) => {
            const bullet = isNumbered
              ? this.escHtml(String(index + 1))
              : '&bull;';
            return `<article>
            <span>${bullet}</span>
            <div>
              ${item.title ? `<h3>${this.escHtml(item.title)}</h3>` : ''}
              ${item.content ? `<p>${this.pdfMultiline(item.content)}</p>` : ''}
              ${item.mediaUrl ? this.renderPdfMediaFromUrl(item.mediaUrl, course, item.title) : ''}
            </div>
          </article>`;
          })
          .join('')}
      </div>
    </section>`;
  }

  private renderPdfMediaBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const type = this.pdfBlockType(block);
    const displayUrl = this.pdfBlockUrl(block, course);
    const caption = this.pdfMetaString(
      block,
      'caption',
      this.pdfMetaString(block, 'label', ''),
    );
    const title = String(block.title || '').trim();

    if (type === 'image') {
      return `<figure class="media-block image-block">
        ${displayUrl ? `<img src="${this.escHtml(displayUrl)}" alt="${this.escHtml(this.pdfMetaString(block, 'alt', title))}"/>` : '<div class="empty-media">Image</div>'}
        ${caption ? `<figcaption>${this.escHtml(caption)}</figcaption>` : ''}
      </figure>`;
    }

    if (type === 'video') {
      return `<section class="media-block">
        ${title ? `<h2>${this.escHtml(title)}</h2>` : ''}
        ${displayUrl ? `<video controls src="${this.escHtml(displayUrl)}"></video><a class="media-link" href="${this.escHtml(displayUrl)}">${this.escHtml(displayUrl)}</a>` : '<div class="empty-media">Video</div>'}
        ${caption ? `<p class="summary">${this.pdfMultiline(caption)}</p>` : ''}
      </section>`;
    }

    if (type === 'audio') {
      return `<section class="media-block">
        ${title ? `<h2>${this.escHtml(title)}</h2>` : ''}
        ${displayUrl ? `<audio controls src="${this.escHtml(displayUrl)}"></audio><a class="media-link" href="${this.escHtml(displayUrl)}">${this.escHtml(displayUrl)}</a>` : '<div class="empty-media">Audio</div>'}
        ${caption ? `<p class="summary">${this.pdfMultiline(caption)}</p>` : ''}
      </section>`;
    }

    if (type === 'embed') {
      const src = displayUrl || this.pdfMetaString(block, 'iframe', '');
      return `<section class="media-block">
        ${title ? `<h2>${this.escHtml(title)}</h2>` : ''}
        ${src ? `<iframe src="${this.escHtml(src)}" title="${this.escHtml(title || 'Embedded content')}"></iframe><a class="media-link" href="${this.escHtml(src)}">${this.escHtml(src)}</a>` : '<div class="empty-media">Embed</div>'}
      </section>`;
    }

    return `<a class="attachment" href="${this.escHtml(displayUrl || '#')}" target="_blank" rel="noreferrer">
      <span class="attachment-icon">DL</span>
      <span>
        <strong>${this.escHtml(title || this.pdfMetaString(block, 'label', 'Open attachment'))}</strong>
        ${caption || displayUrl ? `<em>${this.escHtml(caption || displayUrl)}</em>` : ''}
      </span>
    </a>`;
  }

  private renderPdfGalleryBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const items = this.pdfVisibleItems(block);
    if (!items.length) return '';
    const rawColumns = this.pdfMetaNumber(
      block,
      'columns',
      this.pdfMetaString(block, 'layout', '').includes('2') ? 2 : 3,
    );
    const columns = Math.max(1, Math.min(4, rawColumns || 3));

    return `<section class="gallery-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : ''}
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      <div class="gallery-grid gallery-cols-${columns}">
        ${items
          .map((item) => {
            const mediaUrl = item.mediaUrl
              ? this.absoluteAssetUrl(item.mediaUrl, course)
              : '';
            const caption = item.title || item.content || '';
            return `<figure>
            <div>${mediaUrl ? `<img src="${this.escHtml(mediaUrl)}" alt="${this.escHtml(caption)}"/>` : '<span class="empty-media">Image</span>'}</div>
            ${caption ? `<figcaption>${this.escHtml(caption)}</figcaption>` : ''}
          </figure>`;
          })
          .join('')}
      </div>
    </section>`;
  }

  private renderPdfItemsBlock(
    block: CourseBlock,
    course: CourseDocument,
    fallbackTitle = '',
  ): string {
    const items = this.pdfVisibleItems(block);
    const title = String(block.title || fallbackTitle).trim();
    if (!items.length && !title && !block.content) return '';

    return `<section class="items-block">
      ${title ? `<h2>${this.escHtml(title)}</h2>` : ''}
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      ${
        items.length
          ? `<div class="items-grid">
        ${items
          .map(
            (item, index) => `<article>
          <span>${index + 1}</span>
          <div>
            ${item.title ? `<h3>${this.escHtml(item.title)}</h3>` : ''}
            ${item.content ? `<p>${this.pdfMultiline(item.content)}</p>` : ''}
            ${item.match ? `<p class="pdf-muted"><strong>Match:</strong> ${this.escHtml(item.match)}</p>` : ''}
            ${item.mediaUrl ? this.renderPdfMediaFromUrl(item.mediaUrl, course, item.title) : ''}
          </div>
        </article>`,
          )
          .join('')}
      </div>`
          : ''
      }
    </section>`;
  }

  private renderPdfFlashcardsBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const items = this.pdfVisibleItems(block).filter(
      (item) =>
        item.title?.trim() || item.content?.trim() || item.mediaUrl?.trim(),
    );
    if (!items.length) return '';

    return `<section class="flashcards-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : ''}
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      <div class="pdf-flashcards-grid">
        ${items
          .map((item) => {
            const mediaUrl = item.mediaUrl
              ? this.absoluteAssetUrl(item.mediaUrl, course)
              : '';
            const imageSide = item.match === 'back' ? 'back' : 'front';
            const frontImage =
              imageSide === 'front' && mediaUrl
                ? `<img src="${this.escHtml(mediaUrl)}" alt=""/>`
                : '';
            const backImage =
              imageSide === 'back' && mediaUrl
                ? `<img src="${this.escHtml(mediaUrl)}" alt=""/>`
                : '';
            return `<div class="pdf-flashcard-print">
            <div class="flashcard-face flashcard-front">
              <div class="fc-icon"><span class="pdf-side-label">Front</span></div>
              <div class="fc-content">${frontImage}<p>${this.pdfMultiline(item.title || '-')}</p></div>
            </div>
            <div class="flashcard-face flashcard-back">
              <div class="fc-icon"><span class="pdf-side-label">Back</span></div>
              <div class="fc-content">${backImage}<p>${this.pdfMultiline(item.content || '-')}</p></div>
            </div>
          </div>`;
          })
          .join('')}
      </div>
    </section>`;
  }

  private renderPdfAccordionTabsBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const items = this.pdfVisibleItems(block);
    if (!items.length) return '';
    const isTabs = this.pdfBlockType(block) === 'tabs';
    const title = String(block.title || '').trim();
    const content = String(block.content || '').trim();
    const renderPanelContent = (item: PdfCourseItem) => `
      ${item.mediaUrl ? this.renderPdfMediaFromUrl(item.mediaUrl, course, item.title) : ''}
      ${item.content ? `<p class="summary">${this.pdfMultiline(item.content)}</p>` : ''}
      ${item.match && !item.content ? `<p class="summary">${this.pdfMultiline(item.match)}</p>` : ''}
    `;

    if (isTabs) {
      return `<section class="tabs-block">
        ${title ? `<h2>${this.escHtml(title)}</h2>` : ''}
        ${content ? `<p class="summary">${this.pdfMultiline(content)}</p>` : ''}
        <div class="pdf-tabs-panels">
          ${items
            .map(
              (item) => `<article class="tab-panel pdf-expanded-panel">
            ${item.title ? `<h3 class="pdf-panel-title">${this.escHtml(item.title)}</h3>` : ''}
            ${renderPanelContent(item)}
          </article>`,
            )
            .join('')}
        </div>
      </section>`;
    }

    return `<section class="accordion-block">
      ${title ? `<h2>${this.escHtml(title)}</h2>` : ''}
      ${content ? `<p class="summary">${this.pdfMultiline(content)}</p>` : ''}
      <div class="accordion-list">
        ${items
          .map(
            (item) => `<article class="accordion-item open">
          <div class="accordion-toggle pdf-static-toggle">
            <span>${this.escHtml(item.title || 'Accordion item')}</span>
          </div>
          <div class="accordion-panel">${renderPanelContent(item)}</div>
        </article>`,
          )
          .join('')}
      </div>
    </section>`;
  }

  private renderPdfSortingBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const items = this.pdfVisibleItems(block).filter((item) =>
      item.title?.trim(),
    );
    if (!items.length) return '';
    const categories = Array.from(
      new Set(
        items
          .map((item) => item.match?.trim())
          .filter((value): value is string => Boolean(value)),
      ),
    );
    const uncategorized = items.filter((item) => !item.match?.trim());
    const instructions = String(
      block.content ||
        this.pdfMetaString(
          block,
          'instructions',
          'Sort each item into the correct category.',
        ),
    );

    return `<section class="sorting-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : ''}
      ${instructions ? `<p class="summary">${this.pdfMultiline(instructions)}</p>` : ''}
      <div class="pdf-sorting-categories">
        ${categories
          .map((category) => {
            const categoryItems = items.filter(
              (item) => item.match?.trim() === category,
            );
            return `<article class="sorting-category pdf-sorting-category">
            <strong>${this.escHtml(category)}</strong>
            <em>${categoryItems.length} item${categoryItems.length === 1 ? '' : 's'}</em>
            <ul>
              ${categoryItems.map((item) => `<li>${this.escHtml(item.title || '')}${item.content ? ` <span class="pdf-muted">- ${this.escHtml(item.content)}</span>` : ''}${item.mediaUrl ? this.renderPdfMediaFromUrl(item.mediaUrl, course, item.title) : ''}</li>`).join('')}
            </ul>
          </article>`;
          })
          .join('')}
        ${
          uncategorized.length
            ? `<article class="sorting-category pdf-sorting-category">
          <strong>Uncategorized</strong>
          <em>Items without a category</em>
          <ul>${uncategorized.map((item) => `<li>${this.escHtml(item.title || '')}</li>`).join('')}</ul>
        </article>`
            : ''
        }
      </div>
    </section>`;
  }

  private renderPdfProcessStepsBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const items = this.pdfVisibleItems(block);
    if (!items.length) return '';
    const introTitle = this.pdfMetaString(
      block,
      'introTitle',
      block.title || '',
    );
    const introText = this.pdfMetaString(
      block,
      'introText',
      block.content || '',
    );
    const introImageUrl = this.pdfMetaString(block, 'introImageUrl', '');
    const summaryTitle = this.pdfMetaString(
      block,
      'summaryTitle',
      'Process complete',
    );
    const summaryText = this.pdfMetaString(block, 'summaryText', '');

    return `<section class="process-steps-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : ''}
      <div class="pdf-process-stack">
        ${
          introTitle || introText || introImageUrl
            ? `<article class="process-card pdf-process-step">
          <span class="pdf-panel-kicker">Intro</span>
          ${introTitle ? `<h3>${this.escHtml(introTitle)}</h3>` : ''}
          ${introText ? `<p class="summary">${this.pdfMultiline(introText)}</p>` : ''}
          ${introImageUrl ? this.renderPdfMediaFromUrl(introImageUrl, course, introTitle) : ''}
        </article>`
            : ''
        }
        ${items
          .map(
            (item, index) => `<article class="process-card pdf-process-step">
          <div class="step-kicker"><span>${index + 1}</span><span>Step ${index + 1} of ${items.length}</span></div>
          <div class="process-step-grid">
            <div>
              ${item.title ? `<h3>${this.escHtml(item.title)}</h3>` : ''}
              ${item.content ? `<p class="summary">${this.pdfMultiline(item.content)}</p>` : ''}
            </div>
            ${item.mediaUrl ? `<div>${this.renderPdfMediaFromUrl(item.mediaUrl, course, item.title)}</div>` : ''}
          </div>
        </article>`,
          )
          .join('')}
        ${
          summaryTitle || summaryText
            ? `<article class="process-card pdf-process-step">
          <span class="pdf-panel-kicker">Summary</span>
          ${summaryTitle ? `<h3>${this.escHtml(summaryTitle)}</h3>` : ''}
          ${summaryText ? `<p class="summary">${this.pdfMultiline(summaryText)}</p>` : ''}
        </article>`
            : ''
        }
      </div>
    </section>`;
  }

  private renderPdfRevealBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const triggerLabel = this.pdfMetaString(
      block,
      'triggerLabel',
      block.title || 'Reveal',
    );
    const hiddenContent = this.pdfMetaString(block, 'hiddenContent', '');
    const items = this.pdfVisibleItems(block);
    return `<section class="block interaction-block">
      <h2>${this.escHtml(triggerLabel)}</h2>
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      <div class="pdf-expanded-panel">
        <span class="pdf-panel-kicker">Revealed content</span>
        ${hiddenContent ? `<p class="summary">${this.pdfMultiline(hiddenContent)}</p>` : ''}
        ${items.length ? this.renderPdfItemsBlock(block, course) : ''}
      </div>
    </section>`;
  }

  private renderPdfBeforeAfterBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const beforeImage = this.pdfMetaString(block, 'beforeImage', '');
    const afterImage = this.pdfMetaString(block, 'afterImage', '');
    const beforeLabel = this.pdfMetaString(block, 'beforeLabel', 'Before');
    const afterLabel = this.pdfMetaString(block, 'afterLabel', 'After');
    return `<section class="block interaction-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : ''}
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      <div class="pdf-two-up">
        <figure class="pdf-static-card">
          <span class="pdf-panel-kicker">${this.escHtml(beforeLabel)}</span>
          ${beforeImage ? this.renderPdfMediaFromUrl(beforeImage, course, beforeLabel) : '<div class="empty-media">Before image</div>'}
        </figure>
        <figure class="pdf-static-card">
          <span class="pdf-panel-kicker">${this.escHtml(afterLabel)}</span>
          ${afterImage ? this.renderPdfMediaFromUrl(afterImage, course, afterLabel) : '<div class="empty-media">After image</div>'}
        </figure>
      </div>
    </section>`;
  }

  private renderPdfHotspotBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const imageUrl = this.pdfMetaString(
      block,
      'imageUrl',
      block.assetUrl || '',
    );
    const regions = this.pdfMetaString(block, 'regions', '');
    return `<section class="block interaction-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : ''}
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      ${imageUrl ? this.renderPdfMediaFromUrl(imageUrl, course, block.title || 'Hotspot image') : '<div class="empty-media">Hotspot image</div>'}
      ${regions ? `<div class="pdf-expanded-panel"><span class="pdf-panel-kicker">Hotspot regions</span><p class="summary">${this.pdfMultiline(regions)}</p></div>` : ''}
      ${this.renderPdfItemsBlock(block, course)}
    </section>`;
  }

  private renderPdfLabeledGraphicBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const imageUrl = this.pdfMetaString(
      block,
      'imageUrl',
      block.assetUrl || '',
    );
    const items = this.pdfVisibleItems(block);
    return `<section class="block interaction-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : ''}
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      ${imageUrl ? this.renderPdfMediaFromUrl(imageUrl, course, block.title || 'Labeled graphic') : ''}
      ${
        items.length
          ? `<div class="items-grid">
        ${items
          .map(
            (item, index) => `<article>
          <span>${index + 1}</span>
          <div>
            ${item.title ? `<h3>${this.escHtml(item.title)}</h3>` : ''}
            ${item.content ? `<p>${this.pdfMultiline(item.content)}</p>` : ''}
            ${item.match ? `<p class="pdf-muted">${this.escHtml(item.match)}</p>` : ''}
          </div>
        </article>`,
          )
          .join('')}
      </div>`
          : ''
      }
    </section>`;
  }

  private renderPdfQuestionBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const check = block.knowledgeCheck;
    const question = String(
      block.title || check?.question || block.content || 'Question',
    );
    const options = block.items?.length
      ? block.items.map((item) => ({
          id: item.id,
          text: item.title || item.content || '',
          detail: item.match || '',
          isCorrect: String(item.content ?? '').toLowerCase() === 'true',
          feedback: item.match || '',
        }))
      : (check?.options ?? []).map((option) => ({
          id: option.id,
          text: option.text,
          detail: option.match || '',
          isCorrect: Boolean(option.isCorrect),
          feedback: option.feedback || '',
        }));
    const imageUrl = this.pdfMetaString(
      block,
      'imageUrl',
      block.assetUrl || '',
    );

    return `<section class="question-block">
      <h2>${this.escHtml(question)}</h2>
      ${block.content && block.title ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      ${imageUrl ? this.renderPdfMediaFromUrl(imageUrl, course, question) : ''}
      ${
        options.length
          ? `<div class="choices">
        ${options
          .map(
            (option) => `<div class="choice pdf-choice">
          <span class="choice-dot"></span>
          <span>${this.escHtml(option.text || '')}</span>
        </div>`,
          )
          .join('')}
      </div>`
          : ''
      }
    </section>`;
  }

  private renderPdfTableBlock(block: CourseBlock): string {
    const rows = this.parsePdfTable(
      this.pdfMetaString(block, 'data', '') ||
        this.pdfMetaString(block, 'tableData', '') ||
        block.content ||
        '',
    );
    const headerRow = this.pdfMetaBoolean(block, 'headerRow', true);
    if (!rows.length) {
      return `<pre>${this.escHtml(block.content || block.title || 'Table')}</pre>`;
    }

    return `<section class="block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : ''}
      <div class="table-wrap">
        <table>
          <tbody>
            ${rows
              .map(
                (row, rowIndex) => `<tr>
              ${row
                .map((cell) =>
                  rowIndex === 0 && headerRow
                    ? `<th>${this.escHtml(cell)}</th>`
                    : `<td>${this.escHtml(cell)}</td>`,
                )
                .join('')}
            </tr>`,
              )
              .join('')}
          </tbody>
        </table>
      </div>
    </section>`;
  }

  private renderPdfChartBlock(block: CourseBlock): string {
    const chartType = this.pdfMetaString(block, 'chartType', 'bar');
    const title = this.pdfMetaString(
      block,
      'chartTitle',
      block.title || 'Chart',
    );
    const axisLabels = this.pdfMetaString(block, 'axisLabels', '');
    const rows = this.pdfChartRows(block);
    const values = rows.map((row) => row.value);
    const max = Math.max(...values, 1);
    const chart =
      chartType === 'pie'
        ? this.renderPdfPieChart(rows)
        : chartType === 'line'
          ? this.renderPdfLineChart(rows, title)
          : this.renderPdfBarChart(rows, max);

    return `<section class="chart-block">
      <h2>${this.escHtml(title)}</h2>
      ${axisLabels ? `<p class="summary">${this.pdfMultiline(axisLabels)}</p>` : ''}
      ${chart}
      ${this.renderPdfChartValues(rows)}
    </section>`;
  }

  private renderPdfBarChart(rows: PdfChartRow[], max: number): string {
    return `<div class="chart-bars">
      ${rows
        .map((row) => {
          const heightPct = Math.max(6, (row.value / max) * 100);
          return `<div class="chart-bar-col">
          <div class="chart-bar-value">${this.escHtml(String(row.value))}</div>
          <div class="chart-bar-track"><div class="chart-bar-fill" style="height:${heightPct}%"></div></div>
          <div class="chart-bar-label">${this.escHtml(row.label)}</div>
        </div>`;
        })
        .join('')}
    </div>`;
  }

  private renderPdfLineChart(rows: PdfChartRow[], title: string): string {
    const width = 420;
    const height = 200;
    const padLeft = 40;
    const padTop = 16;
    const padRight = 16;
    const padBottom = 28;
    const innerWidth = width - padLeft - padRight;
    const innerHeight = height - padTop - padBottom;
    const values = rows.map((row) => row.value);
    const max = Math.max(...values, 1);
    const min = Math.min(...values, 0);
    const range = max - min || 1;
    const points = rows.map((row, index) => {
      const x = padLeft + (index / Math.max(rows.length - 1, 1)) * innerWidth;
      const y = padTop + (1 - (row.value - min) / range) * innerHeight;
      return { ...row, x, y };
    });
    const polyline = points.map((point) => `${point.x},${point.y}`).join(' ');

    return `<div class="chart-wrap">
      <svg viewBox="0 0 ${width} ${height}" style="width:100%;height:200px" aria-label="${this.escHtml(title)}">
        ${[0.25, 0.5, 0.75, 1].map((tick) => `<line x1="${padLeft}" y1="${padTop + (1 - tick) * innerHeight}" x2="${padLeft + innerWidth}" y2="${padTop + (1 - tick) * innerHeight}" stroke="var(--lux-line)" stroke-width="1"/>`).join('')}
        <polyline points="${this.escHtml(polyline)}" fill="none" stroke="var(--lux-primary)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
        ${points
          .map(
            (point) => `<g>
          <circle cx="${point.x}" cy="${point.y}" r="5" fill="var(--lux-primary)" />
          <text x="${point.x}" y="${Math.max(10, point.y - 10)}" text-anchor="middle" font-size="10" font-weight="700" fill="var(--lux-text-strong)">${this.escHtml(String(point.value))}</text>
        </g>`,
          )
          .join('')}
      </svg>
    </div>`;
  }

  private renderPdfPieChart(rows: PdfChartRow[]): string {
    const total =
      rows.reduce((sum, row) => sum + Math.max(0, row.value), 0) || 1;
    return `<div class="pie-list">
      ${rows
        .map((row, index) => {
          const pct = Math.round((Math.max(0, row.value) / total) * 100);
          const color =
            index === 0
              ? 'var(--lux-primary)'
              : `hsl(${(150 + index * 47) % 360}, 60%, 58%)`;
          return `<div class="pie-row">
          <span class="pie-swatch" style="background:${color}"></span>
          <span class="pie-label">${this.escHtml(row.label)}</span>
          <span class="pie-value">${this.escHtml(String(row.value))} (${pct}%)</span>
        </div>`;
        })
        .join('')}
    </div>`;
  }

  private renderPdfButtonBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const label = this.pdfMetaString(
      block,
      'label',
      block.content || block.title || 'Open link',
    );
    const alignmentRaw = this.pdfMetaString(block, 'alignment', 'center');
    const alignment =
      alignmentRaw === 'left' || alignmentRaw === 'right'
        ? alignmentRaw
        : 'center';
    const url = this.pdfBlockUrl(block, course) || '#';
    return `<div class="button-block align-${alignment}">
      <a class="primary" href="${this.escHtml(url)}">${this.escHtml(label)}</a>
    </div>`;
  }

  private renderPdfDialogueBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const items = this.pdfVisibleItems(block);
    return `<section class="block interaction-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : ''}
      ${block.content ? `<p class="dialogue">${this.pdfMultiline(block.content)}</p>` : ''}
      ${
        items.length
          ? `<div class="choices">
        ${items
          .map(
            (item) => `<div class="choice pdf-choice">
          <span class="choice-dot"></span>
          <span>
            ${item.title ? `<strong>${this.escHtml(item.title)}</strong>` : ''}
            ${item.content ? `<span class="pdf-muted"> ${this.escHtml(item.content)}</span>` : ''}
            ${item.match ? `<em class="pdf-muted"> ${this.escHtml(item.match)}</em>` : ''}
            ${item.mediaUrl ? this.renderPdfMediaFromUrl(item.mediaUrl, course, item.title) : ''}
          </span>
        </div>`,
          )
          .join('')}
      </div>`
          : ''
      }
    </section>`;
  }

  private renderPdfCharacterMonologueBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const characterName = this.pdfMetaString(
      block,
      'characterName',
      block.title || 'Character',
    );
    const emotion = this.pdfMetaString(block, 'emotion', '');
    const avatarUrl = this.pdfMetaString(block, 'avatarUrl', '');
    const avatar = avatarUrl ? this.absoluteAssetUrl(avatarUrl, course) : '';
    return `<section class="quote-block">
      <div class="pdf-static-card">
        ${avatar ? `<img class="pdf-media" src="${this.escHtml(avatar)}" alt="${this.escHtml(characterName)}" style="width:72px;height:72px;border-radius:999px;object-fit:cover;margin-bottom:12px"/>` : ''}
        <span class="pdf-panel-kicker">${this.escHtml(emotion || 'Monologue')}</span>
        <h2>${this.escHtml(characterName)}</h2>
        ${block.content ? `<p class="dialogue">${this.pdfMultiline(block.content)}</p>` : ''}
      </div>
    </section>`;
  }

  private renderPdfConditionalGateBlock(block: CourseBlock): string {
    const conditionType = this.pdfMetaString(block, 'conditionType', '');
    const target = this.pdfMetaString(block, 'target', '');
    const lockedMessage = this.pdfMetaString(block, 'lockedMessage', '');
    return `<section class="block interaction-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : '<h2>Conditional gate</h2>'}
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      <div class="pdf-metadata-grid">
        ${conditionType ? `<div><strong>Condition</strong><span>${this.escHtml(conditionType)}</span></div>` : ''}
        ${target ? `<div><strong>Target</strong><span>${this.escHtml(target)}</span></div>` : ''}
        ${lockedMessage ? `<div><strong>Locked message</strong><span>${this.escHtml(lockedMessage)}</span></div>` : ''}
      </div>
    </section>`;
  }

  private renderPdfGlossaryBlock(block: CourseBlock): string {
    const term = this.pdfMetaString(block, 'term', block.title || '');
    const definition = this.pdfMetaString(
      block,
      'definition',
      block.content || '',
    );
    const example = this.pdfMetaString(block, 'example', '');
    return `<section class="block interaction-block">
      <h2>${this.escHtml(term || 'Glossary')}</h2>
      ${definition ? `<p class="summary">${this.pdfMultiline(definition)}</p>` : ''}
      ${example ? `<p class="pdf-muted"><strong>Example:</strong> ${this.escHtml(example)}</p>` : ''}
    </section>`;
  }

  private renderPdfCertificateBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const logoUrl = this.pdfMetaString(block, 'logoUrl', '');
    const signatureUrl = this.pdfMetaString(block, 'signatureUrl', '');
    return `<section class="block interaction-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : '<h2>Certificate</h2>'}
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      <div class="pdf-two-up">
        ${logoUrl ? `<div class="pdf-static-card"><span class="pdf-panel-kicker">Logo</span>${this.renderPdfMediaFromUrl(logoUrl, course, 'Certificate logo')}</div>` : ''}
        ${signatureUrl ? `<div class="pdf-static-card"><span class="pdf-panel-kicker">Signature</span>${this.renderPdfMediaFromUrl(signatureUrl, course, 'Certificate signature')}</div>` : ''}
      </div>
    </section>`;
  }

  private renderPdfCompletionMessageBlock(
    block: CourseBlock,
    course: CourseDocument,
  ): string {
    const imageUrl = this.pdfMetaString(block, 'imageUrl', '');
    return `<section class="block interaction-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : '<h2>Completion message</h2>'}
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      ${imageUrl ? this.renderPdfMediaFromUrl(imageUrl, course, block.title || 'Completion image') : ''}
    </section>`;
  }

  private renderPdfScoreSummaryBlock(block: CourseBlock): string {
    const sourceQuiz = this.pdfMetaString(block, 'sourceQuiz', '');
    const passMessage = this.pdfMetaString(block, 'passMessage', '');
    const failMessage = this.pdfMetaString(block, 'failMessage', '');
    return `<section class="block interaction-block">
      ${block.title ? `<h2>${this.escHtml(block.title)}</h2>` : '<h2>Score summary</h2>'}
      ${block.content ? `<p class="summary">${this.pdfMultiline(block.content)}</p>` : ''}
      <div class="pdf-metadata-grid">
        ${sourceQuiz ? `<div><strong>Source quiz</strong><span>${this.escHtml(sourceQuiz)}</span></div>` : ''}
        ${passMessage ? `<div><strong>Pass message</strong><span>${this.escHtml(passMessage)}</span></div>` : ''}
        ${failMessage ? `<div><strong>Fail message</strong><span>${this.escHtml(failMessage)}</span></div>` : ''}
      </div>
    </section>`;
  }

  private renderPdfScenarioPage(page: CoursePage): string {
    const nodes = page.scenario?.nodes ?? [];
    if (!nodes.length) return '';
    return `<section class="scenario">
      <p class="eyebrow">Branching scenario</p>
      <div class="pdf-scenario-nodes">
        ${nodes
          .map(
            (node, index) => `<article class="pdf-static-card">
          <span class="pdf-panel-kicker">Node ${index + 1}</span>
          <h2>${this.escHtml(node.speaker || 'Scenario')}</h2>
          <p class="dialogue">${this.pdfMultiline(node.text || '')}</p>
          ${
            (node.choices ?? []).length
              ? `<div class="choices">
            ${(node.choices ?? [])
              .map(
                (choice) => `<div class="choice pdf-choice">
              <span class="choice-dot"></span>
              <span>${this.escHtml(choice.text || '')}${choice.feedback ? `<em class="pdf-muted"> - ${this.escHtml(choice.feedback)}</em>` : ''}${choice.nextNodeId ? `<small class="pdf-muted"> Next: ${this.escHtml(choice.nextNodeId)}</small>` : ''}</span>
            </div>`,
              )
              .join('')}
          </div>`
              : ''
          }
        </article>`,
          )
          .join('')}
      </div>
    </section>`;
  }

  private renderPdfQuiz(
    quiz: NonNullable<CoursePage['quiz']>,
    course: CourseDocument,
  ): string {
    const questions = (quiz.questions ?? []).map((question) =>
      this.normalizeQuizQuestion(question),
    );
    if (!questions.length) return '';
    const possibleScore = questions.reduce(
      (total, question) => total + (Number(question.points) || 1),
      0,
    );
    return `<section class="quiz-runtime">
      <div class="quiz-summary">
        <strong>Quiz</strong>
        <span>${questions.length} question${questions.length === 1 ? '' : 's'}${possibleScore ? `, ${possibleScore} point${possibleScore === 1 ? '' : 's'}` : ''}</span>
      </div>
      ${questions.map((question, index) => this.renderPdfQuizQuestion(question, index, course)).join('')}
    </section>`;
  }

  private renderPdfQuizQuestion(
    question: QuizQuestion,
    index: number,
    course: CourseDocument,
  ): string {
    const imageUrl = question.imageUrl
      ? this.absoluteAssetUrl(question.imageUrl, course)
      : '';
    return `<article class="quiz-question">
      <p class="eyebrow">Question ${index + 1}</p>
      <h2>${this.escHtml(question.text || 'Question')}</h2>
      ${imageUrl ? `<img class="quiz-question-image" src="${this.escHtml(imageUrl)}" alt=""/>` : ''}
      ${
        (question.options ?? []).length
          ? `<div class="quiz-choices">
        ${(question.options ?? [])
          .map(
            (option) => `<div class="quiz-option pdf-choice">
          <span class="choice-dot"></span>
          <span>${this.escHtml(option.text || '')}</span>
        </div>`,
          )
          .join('')}
      </div>`
          : ''
      }
    </article>`;
  }

  private renderPdfMediaFromUrl(
    url: string,
    course: CourseDocument,
    title = '',
  ): string {
    const src = this.absoluteAssetUrl(url, course);
    if (!src) return '';
    if (this.isVideoAsset(src)) {
      return `<video class="panel-media" controls src="${this.escHtml(src)}"></video><a class="media-link" href="${this.escHtml(src)}">${this.escHtml(src)}</a>`;
    }
    if (this.isAudioAsset(src)) {
      return `<audio class="panel-media" controls src="${this.escHtml(src)}"></audio><a class="media-link" href="${this.escHtml(src)}">${this.escHtml(src)}</a>`;
    }
    if (this.isPdfEmbeddableUrl(src)) {
      return `<iframe class="panel-media" src="${this.escHtml(src)}" title="${this.escHtml(title || 'Embedded media')}"></iframe><a class="media-link" href="${this.escHtml(src)}">${this.escHtml(src)}</a>`;
    }
    if (this.isImageAsset(src) || src.startsWith('data:image/')) {
      return `<img class="panel-media" src="${this.escHtml(src)}" alt="${this.escHtml(title || '')}"/>`;
    }
    return `<a class="attachment" href="${this.escHtml(src)}" target="_blank" rel="noreferrer">
      <span class="attachment-icon">DL</span>
      <span><strong>${this.escHtml(title || 'Open file')}</strong><em>${this.escHtml(src)}</em></span>
    </a>`;
  }

  private renderPdfChartValues(rows: PdfChartRow[]): string {
    if (!rows.length) return '';
    return `<div class="chart-explicit-values">
      <h3>Values</h3>
      <table>
        <thead><tr><th>Label</th><th>Value</th></tr></thead>
        <tbody>
          ${rows.map((row) => `<tr><td>${this.escHtml(row.label)}</td><td>${this.escHtml(String(row.value))}</td></tr>`).join('')}
        </tbody>
      </table>
    </div>`;
  }

  private pdfChartRows(block: CourseBlock): PdfChartRow[] {
    const meta = block.metadata ?? {};
    const rows = this.parseChartData(
      meta.data ?? meta.chartData ?? meta.values ?? block.content ?? '',
    ).slice(0, 12);

    if (rows.length) return rows;
    return [
      { label: 'Item 1', value: 40 },
      { label: 'Item 2', value: 70 },
      { label: 'Item 3', value: 55 },
    ];
  }

  private parsePdfTable(value: unknown): string[][] {
    if (Array.isArray(value)) {
      return value
        .map((row) => {
          if (Array.isArray(row)) {
            return row.map((cell) => String(cell ?? '').trim()).filter(Boolean);
          }
          return [String(row ?? '').trim()].filter(Boolean);
        })
        .filter((row) => row.length > 0);
    }

    const raw =
      typeof value === 'string'
        ? value.trim()
        : typeof value === 'number'
          ? String(value).trim()
          : '';
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) return this.parsePdfTable(parsed);
    } catch {
      // Plain CSV/tab text is handled below.
    }
    return raw
      .split('\n')
      .map((row) =>
        row
          .split(/\t|,/)
          .map((cell) => cell.trim())
          .filter(Boolean),
      )
      .filter((row) => row.length > 0);
  }

  private pdfBlockType(block: CourseBlock): string {
    const rawType = (block as unknown as Record<string, unknown>).type;
    return typeof rawType === 'string' ? rawType : '';
  }

  private pdfMetaString(
    block: CourseBlock,
    key: string,
    fallback = '',
  ): string {
    const value = block.metadata?.[key];
    if (typeof value === 'string') return value;
    if (typeof value === 'number' || typeof value === 'boolean')
      return String(value);
    return fallback;
  }

  private pdfMetaNumber(block: CourseBlock, key: string, fallback = 0): number {
    const value = block.metadata?.[key];
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }

  private pdfMetaBoolean(
    block: CourseBlock,
    key: string,
    fallback = false,
  ): boolean {
    const value = block.metadata?.[key];
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') return value === 'true';
    return fallback;
  }

  private pdfVisibleItems(block: CourseBlock): PdfCourseItem[] {
    return (block.items ?? []).filter((item) =>
      Boolean(
        item.title?.trim() ||
        item.content?.trim() ||
        item.mediaUrl?.trim() ||
        item.match?.trim(),
      ),
    );
  }

  private pdfBlockUrl(block: CourseBlock, course: CourseDocument): string {
    const type = this.pdfBlockType(block);
    const mediaTypes = new Set([
      'image',
      'video',
      'audio',
      'embed',
      'attachment',
      'document',
      'file_download',
      'resource_link',
      'button',
      'restart_button',
    ]);
    const contentAsUrl = mediaTypes.has(type)
      ? String(block.content ?? '').trim()
      : '';
    const url =
      String(block.assetUrl ?? '').trim() ||
      contentAsUrl ||
      this.pdfMetaString(block, 'fileUrl', '') ||
      this.pdfMetaString(block, 'url', '') ||
      (type === 'embed' ? this.pdfMetaString(block, 'iframe', '') : '');
    return url ? this.absoluteAssetUrl(url, course) : '';
  }

  private isPdfQuestionType(type: string): boolean {
    return [
      'multiple_choice',
      'multiple_select',
      'multiple_response',
      'true_false',
      'fill_blank',
      'matching',
      'hotspot',
      'short_answer',
      'likert',
      'rating_slider',
    ].includes(type);
  }

  private pdfMultiline(value: string): string {
    return this.escHtml(value).replace(/\n/g, '<br/>');
  }

  private cssString(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  }

  private statementStyleLabel(value: string): string {
    const normalized = String(value || 'Info')
      .replace(/^\s*[^A-Za-z0-9]*/, '')
      .trim();
    const lower = normalized.toLowerCase();
    if (lower === 'warning') return 'Warning';
    if (lower === 'tip') return 'Tip';
    if (lower === 'note') return 'Note';
    return 'Info';
  }

  private statementStyleClass(value: string): string {
    return this.statementStyleLabel(value).toLowerCase();
  }

  private statementCalloutLabel(title: unknown, styleLabel: string): string {
    const trimmed =
      typeof title === 'string'
        ? title.trim()
        : typeof title === 'number'
          ? String(title).trim()
          : '';
    return trimmed && !this.isDefaultStatementLabel(trimmed)
      ? this.statementTextLabel(trimmed)
      : this.statementStyleLabel(styleLabel);
  }

  private isDefaultStatementLabel(value: string): boolean {
    return ['info', 'warning', 'tip', 'note'].includes(
      this.statementTextKey(value),
    );
  }

  private statementTextLabel(value: string): string {
    const normalized = String(value || '')
      .replace(/^\s*[^A-Za-z0-9]*/, '')
      .trim();
    return normalized || String(value || '').trim();
  }

  private statementTextKey(value: string): string {
    return this.statementTextLabel(value).toLowerCase();
  }

  private async buildPdf(course: CourseDocument): Promise<Buffer> {
    const doc = new PDFDocument({
      size: 'A4',
      margins: { top: 48, right: 48, bottom: 48, left: 48 },
      compress: true,
    });
    const chunks: Buffer[] = [];
    const done = new Promise<Buffer>((resolve, reject) => {
      doc.on('data', (chunk: Buffer) => chunks.push(chunk));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
    });

    const accent = this.hexColor(course.theme?.accentColor, '#0F6B4A');
    const darkMode = course.theme?.themeMode !== 'light';
    const pageBg = darkMode ? '#0B1220' : '#F8FAFC';
    const titleColor = darkMode ? '#E2E8F0' : '#0F172A';
    const bodyColor = darkMode ? '#CBD5E1' : '#334155';
    const mutedColor = darkMode ? '#94A3B8' : '#64748B';
    const lessons = course.lessons?.length
      ? course.lessons
      : (course.pages ?? []).map((page) => ({
          id: page.id,
          type: page.type === 'quiz' ? 'quiz' : 'lesson',
          title: page.title,
          summary: page.summary,
          coverImageUrl: page.coverImageUrl,
          blocks: page.blocks ?? [],
          quiz: page.quiz,
          metadata: page.metadata,
        }));

    doc.rect(0, 0, doc.page.width, doc.page.height).fill(pageBg);
    doc
      .fillColor(accent)
      .font('Helvetica-Bold')
      .fontSize(28)
      .text(course.title || 'Course', 56, 88, {
        width: doc.page.width - 112,
      });
    if (course.description?.trim()) {
      doc
        .fillColor(bodyColor)
        .font('Helvetica')
        .fontSize(12)
        .text(course.description, 56, 138, {
          width: doc.page.width - 112,
        });
    }
    doc
      .strokeColor(accent)
      .lineWidth(3)
      .moveTo(56, 176)
      .lineTo(doc.page.width - 56, 176)
      .stroke();

    for (const [index, lesson] of lessons.entries()) {
      doc.addPage();
      doc.rect(0, 0, doc.page.width, doc.page.height).fill(pageBg);
      doc
        .fillColor(accent)
        .font('Helvetica-Bold')
        .fontSize(18)
        .text(
          `${index + 1}. ${lesson.title || `Lesson ${index + 1}`}`,
          56,
          64,
          {
            width: doc.page.width - 112,
          },
        );
      let y = doc.y + 8;
      if (lesson.summary?.trim()) {
        doc
          .fillColor(mutedColor)
          .font('Helvetica-Oblique')
          .fontSize(11)
          .text(lesson.summary, 56, y, {
            width: doc.page.width - 112,
          });
        y = doc.y + 10;
      }

      const blocks = lesson.blocks ?? [];
      for (const block of blocks) {
        if (y > doc.page.height - 90) {
          doc.addPage();
          doc.rect(0, 0, doc.page.width, doc.page.height).fill(pageBg);
          y = 64;
        }

        const blockTitle = String(block.title ?? '').trim();
        const blockContent = String(block.content ?? '').trim();
        if (blockTitle) {
          doc
            .fillColor(titleColor)
            .font('Helvetica-Bold')
            .fontSize(12)
            .text(blockTitle, 56, y, {
              width: doc.page.width - 112,
            });
          y = doc.y + 4;
        }

        if (block.type === 'chart') {
          const rows = this.parseChartData(
            block.metadata?.chartData ?? block.content ?? '',
          );
          if (rows.length) {
            doc
              .fillColor(bodyColor)
              .font('Helvetica')
              .fontSize(10)
              .text('Chart values:', 56, y, {
                width: doc.page.width - 112,
              });
            y = doc.y + 3;
            rows.forEach((row) => {
              doc
                .fillColor(bodyColor)
                .font('Helvetica')
                .fontSize(10)
                .text(`- ${row.label}: ${row.value}`, 68, y, {
                  width: doc.page.width - 124,
                });
              y = doc.y + 2;
            });
          }
        } else if (block.assetUrl) {
          const imageUrl = this.isImageAsset(block.assetUrl)
            ? this.absoluteAssetUrl(block.assetUrl, course)
            : null;
          if (imageUrl) {
            const image = await this.fetchImageBuffer(imageUrl);
            if (image) {
              try {
                const imageWidth = doc.page.width - 112;
                doc.image(image, 56, y, {
                  fit: [imageWidth, 260],
                  align: 'center',
                });
                y = doc.y + 8;
              } catch {
                doc
                  .fillColor(bodyColor)
                  .font('Helvetica')
                  .fontSize(10)
                  .text(`Image: ${imageUrl}`, 56, y, {
                    width: doc.page.width - 112,
                  });
                y = doc.y + 8;
              }
            } else {
              doc
                .fillColor(bodyColor)
                .font('Helvetica')
                .fontSize(10)
                .text(`Image: ${imageUrl}`, 56, y, {
                  width: doc.page.width - 112,
                });
              y = doc.y + 8;
            }
          } else {
            const fileUrl = this.absoluteAssetUrl(block.assetUrl, course);
            doc
              .fillColor(bodyColor)
              .font('Helvetica')
              .fontSize(10)
              .text(`File: ${fileUrl}`, 56, y, {
                width: doc.page.width - 112,
              });
            y = doc.y + 8;
          }
        } else if (block.items?.length) {
          block.items.forEach((item) => {
            const text =
              `${item.title ?? ''}${item.content ? `: ${item.content}` : ''}`.trim();
            if (!text) return;
            doc
              .fillColor(bodyColor)
              .font('Helvetica')
              .fontSize(11)
              .text(`- ${text}`, 68, y, {
                width: doc.page.width - 124,
              });
            y = doc.y + 3;
          });
        } else if (blockContent) {
          doc
            .fillColor(bodyColor)
            .font('Helvetica')
            .fontSize(11)
            .text(blockContent, 56, y, {
              width: doc.page.width - 112,
            });
          y = doc.y + 8;
        }
      }
    }

    doc.end();
    return done;
  }

  private parseChartData(
    value: unknown,
  ): Array<{ label: string; value: number }> {
    const fromArray = (arr: unknown[]) =>
      arr
        .map((item, index) => {
          if (item && typeof item === 'object') {
            const rec = item as Record<string, unknown>;
            const raw = Number(rec.value);
            return {
              label:
                typeof rec.label === 'string'
                  ? rec.label
                  : typeof rec.name === 'string'
                    ? rec.name
                    : `Item ${index + 1}`,
              value: Number.isFinite(raw) ? raw : 0,
            };
          }
          const raw = Number(item);
          return {
            label: `Item ${index + 1}`,
            value: Number.isFinite(raw) ? raw : 0,
          };
        })
        .filter((row) => row.label.trim().length > 0);

    if (Array.isArray(value)) return fromArray(value).slice(0, 30);
    if (typeof value !== 'string' || !value.trim()) return [];
    try {
      const parsed = JSON.parse(value) as unknown;
      if (Array.isArray(parsed)) return fromArray(parsed).slice(0, 30);
    } catch {
      // ignore parse failure
    }
    return value
      .split(/\n|;/)
      .map((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return null;
        const parts = trimmed.split(/,|\t|:/).map((part) => part.trim());
        const raw = Number(parts[1] ?? parts[0]);
        return {
          label: parts[1] ? parts[0] : `Item ${index + 1}`,
          value: Number.isFinite(raw) ? raw : 0,
        };
      })
      .filter((row): row is { label: string; value: number } => Boolean(row))
      .slice(0, 30);
  }

  private hexColor(value: unknown, fallback: string): string {
    const raw = typeof value === 'string' ? value.trim() : '';
    if (/^#[0-9a-fA-F]{6}$/.test(raw)) return raw;
    return fallback;
  }

  private isImageAsset(url: string): boolean {
    return /\.(png|jpe?g|gif|webp|svg)(\?|#|$)/i.test(url);
  }

  private isVideoAsset(url: string): boolean {
    return /\.(mp4|webm|ogg|ogv|mov)(\?|#|$)/i.test(url);
  }

  private isAudioAsset(url: string): boolean {
    return /\.(mp3|wav|m4a|aac|oga|ogg)(\?|#|$)/i.test(url);
  }

  private isPdfEmbeddableUrl(url: string): boolean {
    return (
      /^https?:\/\/(www\.)?(youtube\.com|youtu\.be|vimeo\.com)/i.test(url) ||
      /\.(pdf)(\?|#|$)/i.test(url)
    );
  }

  private absoluteAssetUrl(url: string, course: CourseDocument): string {
    if (!url) return '';
    if (
      url.startsWith('http://') ||
      url.startsWith('https://') ||
      url.startsWith('data:')
    )
      return url;
    const base = String(course.metadata?.assetBaseUrl ?? '').trim();
    if (!base) return url;
    return `${base}${url.startsWith('/') ? url : `/${url}`}`;
  }

  private async fetchImageBuffer(url: string): Promise<Buffer | null> {
    try {
      const response = await fetch(url);
      if (!response.ok) return null;
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch {
      return null;
    }
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

    function renderMediaBlock(block) {
      const displayUrl = blockUrl(block);
      const caption = metaString(block, 'caption', metaString(block, 'label', ''));
      if (block.type === 'image') {
        return '<figure class="media-block image-block">' +
          (displayUrl ? '<img src="' + esc(displayUrl) + '" alt="' + esc(metaString(block, 'alt', block.title || '')) + '"/>' : '<div class="empty-media">Image</div>') +
          (caption ? '<figcaption>' + esc(caption) + '</figcaption>' : '') +
          '</figure>';
      }
      if (block.type === 'video') return displayUrl ? '<section class="media-block"><video controls src="' + esc(displayUrl) + '"></video></section>' : '<div class="empty-media">Video</div>';
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

  private normalizeQuizQuestionType(
    type: unknown,
  ): 'multiple_choice' | 'multiple_response' | 'fill_blank' | 'matching' {
    if (type === 'multiple_response' || type === 'multiple_select') {
      return 'multiple_response';
    }
    if (type === 'fill_blank' || type === 'matching') return type;
    return 'multiple_choice';
  }

  private normalizeQuizQuestion(question: QuizQuestion): QuizQuestion {
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

  private quizQuestionsFromBlocks(blocks: CourseBlock[] = []): QuizQuestion[] {
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

  private normalizeQuiz(
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

  private normalizeCourseForExport(
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

  private ensureExportPages(course: CourseDocument): CoursePage[] {
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

  private lessonToPage(lesson: CourseLesson): CoursePage {
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

  private buildStylesheet(theme?: CourseTheme): string {
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

    return `:root,body[data-preview-theme="${isLight ? 'light' : 'dark'}"]{--lux-bg:${bg};--lux-bg-alt:${bgAlt};--lux-surface:${surface};--lux-surface-soft:${surfaceSoft};--lux-elevated:${elevated};--lux-text:${text};--lux-text-strong:${textStrong};--lux-muted:${muted};--lux-muted-soft:${mutedSoft};--lux-line:${line};--lux-line-strong:${lineStrong};--lux-primary:${accent};--lux-primary-hover:${primaryHover};--lux-primary-soft:${primarySoft};--lux-primary-muted:${primaryMuted};--lux-overlay:${isLight ? 'rgba(31,27,22,.045)' : 'rgba(246,240,230,.06)'};--lux-overlay-hover:${isLight ? 'rgba(31,27,22,.075)' : 'rgba(246,240,230,.09)'};--lux-scroll-track:${scrollTrack};--lux-scroll-thumb:${scrollThumb};--lux-scroll-thumb-hover:${scrollThumbHover};--bg:var(--lux-bg);--panel:var(--lux-surface);--card:var(--lux-surface-soft);--line:var(--lux-line);--text:var(--lux-text);--muted:var(--lux-muted);--accent:var(--lux-primary);color-scheme:${isLight ? 'light' : 'dark'}}
*{box-sizing:border-box}html{scroll-behavior:smooth}body{margin:0;min-height:100vh;overflow:hidden;background:var(--lux-bg);color:var(--lux-text);font-family:Inter,ui-sans-serif,system-ui,-apple-system,Segoe UI,sans-serif;-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale}button,input,select,textarea{font:inherit}button{cursor:pointer}.lux-scrollbar{scrollbar-color:var(--lux-scroll-thumb) var(--lux-scroll-track);scrollbar-gutter:stable;scrollbar-width:thin}.lux-scrollbar::-webkit-scrollbar{width:9px;height:9px}.lux-scrollbar::-webkit-scrollbar-track{background:var(--lux-scroll-track);border-radius:99px}.lux-scrollbar::-webkit-scrollbar-thumb{background:var(--lux-scroll-thumb);border:2px solid transparent;border-radius:99px;background-clip:padding-box}.lux-scrollbar:hover{scrollbar-color:var(--lux-scroll-thumb-hover) var(--lux-scroll-track)}.lux-scrollbar::-webkit-scrollbar-thumb:hover{background:var(--lux-scroll-thumb-hover);background-clip:padding-box}
@keyframes fade-up{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:translateY(0)}}@keyframes sorting-shake{0%,100%{transform:translateX(0)}20%,60%{transform:translateX(-7px)}40%,80%{transform:translateX(7px)}}@keyframes bar-rise{from{transform:scaleY(.08)}to{transform:scaleY(1)}}
.runtime-preview{height:100vh;overflow:auto;background:rgba(0,0,0,.70);padding:20px;backdrop-filter:blur(8px)}.runtime-frame{width:min(1280px,100%);height:calc(100vh - 40px);min-height:620px;margin:0 auto;overflow:hidden;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-bg);color:var(--lux-text-strong);box-shadow:0 25px 80px rgba(0,0,0,.35);display:flex;flex-direction:column}.runtime-topbar{display:flex;align-items:center;justify-content:space-between;gap:16px;border-bottom:1px solid var(--lux-line);background:var(--lux-surface);padding:16px 20px}.runtime-title{min-width:0}.runtime-title p{margin:0;color:var(--lux-primary-muted);font-size:12px;font-weight:800;letter-spacing:.08em;text-transform:uppercase}.runtime-title h1{margin:4px 0 0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--lux-text-strong);font-size:20px;line-height:1.25}.runtime-title span{display:block;max-width:640px;margin-top:4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--lux-muted);font-size:12px}.runtime-standard{display:inline-flex;border:1px solid var(--lux-line);border-radius:999px;background:var(--lux-surface-soft);padding:8px 12px;color:var(--lux-muted);font-size:12px;font-weight:800}.runtime-shell{display:grid;grid-template-columns:280px minmax(0,1fr);min-height:0;flex:1;overflow:hidden}.runtime-shell[data-sidebar="collapsed"]{grid-template-columns:76px minmax(0,1fr)}.runtime-nav{min-height:0;border-right:1px solid var(--lux-line);background:var(--lux-surface);padding:16px;display:flex;flex-direction:column;gap:16px;transition:padding .2s}.runtime-shell[data-sidebar="collapsed"] .runtime-nav{padding:12px}.runtime-nav-head{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.runtime-brand{min-width:0;flex:1;overflow:hidden;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface-soft);background-size:cover;background-position:center;padding:16px}.runtime-brand-title{font-size:14px;font-weight:900;line-height:1.35}.runtime-brand-description{margin:8px 0 0;color:var(--lux-muted);font-size:12px;font-weight:500;line-height:1.55}.runtime-brand.has-cover{min-height:126px;display:flex;flex-direction:column;justify-content:flex-end;color:#fff;text-shadow:0 1px 14px rgba(0,0,0,.55)}.runtime-brand.has-cover .runtime-brand-description{color:rgba(255,255,255,.82)}.runtime-shell[data-sidebar="collapsed"] .runtime-brand{display:none}.sidebar-toggle{display:grid;width:32px;height:32px;place-items:center;flex-shrink:0;border:1px solid var(--lux-line);border-radius:999px;background:var(--lux-surface-soft);color:var(--lux-text-strong)}.sidebar-toggle:hover{background:var(--lux-elevated)}.sidebar-toggle span{display:block;width:10px;height:10px;border-top:2px solid currentColor;border-left:2px solid currentColor;transform:rotate(-45deg)}.runtime-shell[data-sidebar="collapsed"] .sidebar-toggle span{transform:rotate(135deg)}#nav{min-height:0;flex:1;overflow:auto;padding-right:4px}.nav-item{width:100%;display:flex;align-items:center;gap:12px;border:1px solid transparent;border-radius:10px;background:transparent;color:var(--lux-muted);padding:9px 11px;text-align:left;transition:border-color .16s,background .16s,color .16s}.nav-item:hover{border-color:color-mix(in srgb,var(--lux-primary-muted) 25%,transparent);color:var(--lux-text-strong)}.nav-item.active{border-color:color-mix(in srgb,var(--lux-primary-muted) 40%,transparent);background:color-mix(in srgb,var(--lux-primary) 25%,transparent);color:var(--lux-text-strong)}.nav-index{display:grid;width:24px;height:24px;place-items:center;flex-shrink:0;border-radius:999px;background:var(--lux-elevated);color:var(--lux-text-strong);font-size:12px;font-weight:800}.nav-title{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}.runtime-shell[data-sidebar="collapsed"] .nav-item{justify-content:center;padding:10px 8px}.runtime-shell[data-sidebar="collapsed"] .nav-title,.runtime-shell[data-sidebar="collapsed"] .progress-label,.runtime-shell[data-sidebar="collapsed"] #progress-text{display:none}.progress-wrap{margin-top:auto}.progress-label,#progress-text{margin:0 0 6px;color:var(--lux-muted);font-size:12px;font-weight:700}.progress-track{height:7px;overflow:hidden;border-radius:999px;background:var(--lux-line)}#progress-fill{width:0;height:100%;background:linear-gradient(90deg,var(--lux-primary),var(--lux-primary-muted));transition:width .28s ease}.runtime-main{min-height:0;overflow:auto;background:var(--lux-bg);padding:28px;display:flex;justify-content:center}#page{width:min(940px,100%);flex:0 1 940px}.page-card{width:100%;padding:24px 32px;animation:fade-up .28s ease both}.page-card-static{animation:none}.eyebrow{margin:0;color:var(--lux-primary-muted);font-size:12px;font-weight:900;letter-spacing:.08em;text-transform:uppercase}h1{margin:6px 0 0;color:var(--lux-text-strong);font-size:30px;line-height:1.18}h2,.block-heading{margin:0;color:var(--lux-text-strong);font-size:24px;line-height:1.25}.block-subtitle,.summary,.text-block p,.dialogue{color:var(--lux-muted);line-height:1.7}.page-summary{margin-top:12px;font-size:16px}.page-title-hero{position:relative;display:flex;min-height:210px;align-items:flex-end;overflow:hidden;border:1px solid var(--lux-line);border-radius:10px;background:var(--lux-surface);background-size:cover;background-position:center;margin-bottom:28px;padding:0}.page-title-hero>img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:brightness(.54);border-radius:0}.page-title-hero>div{position:relative;width:100%;padding:34px;color:#fff;text-shadow:0 1px 16px rgba(0,0,0,.55)}.page-title-hero .eyebrow{color:rgba(255,255,255,.75)}.page-title-hero h1{color:#fff}.page-title-hero .summary{max-width:720px;color:rgba(255,255,255,.80)}
.block,.heading-block,.text-block,.items-block,.knowledge-check,.question-block,.gallery-block,.accordion-block,.tabs-block,.sorting-block,.flashcards-block,.chart-block,.media-block{border-top:1px solid var(--lux-line);padding-top:20px;margin-top:28px}.heading-block{border-top:0}.text-block p{margin:0;white-space:pre-wrap;font-size:16px}.callout{border:1px solid var(--lux-line);border-radius:10px;background:#fff;padding:16px}.callout strong{display:block;color:#000;font-size:14px}.callout p{margin:8px 0 0;white-space:pre-wrap;color:#000;font-size:16px;font-weight:800;line-height:1.7}.statement-block{margin-top:24px;border:1px solid var(--lux-line);border-radius:10px;background:#fff;padding:20px}.statement-warning{background:#fee2e2;border-color:#fca5a5}.statement-tip{background:#dcfce7;border-color:#86efac}.statement-note{background:#fef3c7;border-color:#facc15}.statement-label{display:inline-flex;margin-bottom:12px;border-radius:999px;background:rgba(15,23,42,.08);padding:5px 12px;color:#000;font-size:12px;font-weight:900;letter-spacing:.06em;text-transform:uppercase}.statement-block p{margin:0;white-space:pre-wrap;color:#000;font-size:20px;font-weight:900;line-height:1.55}.quote-block{margin:24px 0 0;padding-top:20px}.quote-block blockquote{margin:0;max-width:780px;white-space:pre-wrap;border:0;padding:0;color:var(--lux-text-strong);font-size:24px;font-weight:700;line-height:1.45}.quote-content{display:flex;flex-direction:column}.quote-spacing-compact{gap:8px;padding:16px 0}.quote-spacing-normal{gap:12px;padding:24px 0}.quote-spacing-wide{gap:20px;padding:32px 0}.quote-align-left{align-items:flex-start;text-align:left}.quote-align-center{align-items:center;text-align:center}.quote-align-right{align-items:flex-end;text-align:right}.quote-mark{color:var(--lux-primary-muted);font-size:52px;font-weight:900;line-height:.85}.quote-mark-end{align-self:flex-end}.quote-block figcaption{display:flex;align-items:center;gap:12px;color:var(--lux-text);font-size:14px}.quote-align-center figcaption{justify-content:center}.quote-align-right figcaption{flex-direction:row-reverse}.quote-block figcaption img{width:44px;height:44px;border:1px solid rgba(255,255,255,.20);border-radius:999px;object-fit:cover}.quote-block figcaption strong{display:block;color:var(--lux-text-strong)}.quote-block figcaption em{display:block;color:var(--lux-muted);font-style:normal}.quote-image{overflow:hidden;border-radius:10px;background-size:cover;background-position:center}.quote-image>div{padding:0 32px}
.items-grid{display:grid;gap:12px;margin-top:16px}.items-grid article{display:grid;grid-template-columns:auto minmax(0,1fr);gap:16px;border-radius:10px;background:transparent;padding:16px}.items-grid article>span{display:grid;width:36px;height:36px;place-items:center;border-radius:999px;background:var(--lux-primary-soft);color:var(--lux-primary-muted);font-size:14px;font-weight:900}.items-grid h3{margin:0;color:var(--lux-text-strong);font-size:16px}.items-grid p{margin:4px 0 0;white-space:pre-wrap;color:var(--lux-muted);font-size:14px;line-height:1.65}.media-block img,.media-block video,.media-block iframe,.panel-media{display:block;width:100%;max-width:100%;border:0;border-radius:10px}.media-block img{max-height:520px;object-fit:contain}.media-block iframe,.panel-media:is(iframe){aspect-ratio:16/9}.media-block figcaption,.gallery-grid figcaption{margin-top:8px;text-align:center;color:var(--lux-muted);font-size:14px}.empty-media{display:grid;min-height:180px;place-items:center;border:1px dashed var(--lux-line);border-radius:10px;background:var(--lux-surface);color:var(--lux-muted);font-size:14px}.attachment{display:flex;align-items:center;gap:12px;border-radius:10px;background:var(--lux-surface);padding:16px;color:var(--lux-text-strong);text-decoration:none;transition:background .16s}.attachment:hover{background:var(--lux-surface-soft)}.attachment-icon{display:grid;width:28px;height:28px;place-items:center;border-radius:8px;background:var(--lux-primary-soft);color:var(--lux-primary-muted);font-size:11px;font-weight:900}.attachment strong{display:block}.attachment em{display:block;margin-top:4px;color:var(--lux-muted);font-size:13px;font-style:normal}.button-block{display:flex;margin-top:24px}.button-block.align-center{justify-content:center}.button-block.align-left{justify-content:flex-start}.button-block.align-right{justify-content:flex-end}.primary{display:inline-flex;min-width:144px;align-items:center;justify-content:center;border:1px solid var(--lux-primary);border-radius:999px;background:var(--lux-primary);padding:10px 18px;color:#fff;font-size:14px;font-weight:800;text-decoration:none;transition:filter .16s,transform .16s}.primary:hover{filter:brightness(1.08);transform:translateY(-1px)}.primary:disabled{border-color:var(--lux-line);background:var(--lux-line);color:var(--lux-muted);cursor:not-allowed;filter:none;transform:none}.divider-block{display:flex;align-items:center;gap:16px;padding:12px 0;margin-top:24px}.divider-block span{height:1px;flex:1;background:var(--lux-line)}.divider-block em{color:var(--lux-muted);font-size:12px;font-style:normal;font-weight:800;letter-spacing:.06em;text-transform:uppercase}.code-block,pre{overflow:auto;border-radius:10px;background:var(--lux-bg-alt);padding:16px;color:var(--lux-text-strong);font-size:12px;line-height:1.65}.table-wrap{overflow:auto;border:1px solid var(--lux-line);border-radius:10px;background:transparent}.table-wrap table{min-width:100%;border-collapse:collapse;text-align:left;font-size:14px}.table-wrap tr{border-bottom:1px solid var(--lux-line)}.table-wrap tr:last-child{border-bottom:0}.table-wrap th,.table-wrap td{padding:10px 12px}.table-wrap th{color:var(--lux-text-strong);font-weight:800}.table-wrap td{color:var(--lux-muted)}
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

  private uploadedPackageRoot(packageId: string): string {
    return join(SCORM_UPLOAD_ROOT, packageId);
  }

  private isValidUploadedPackageId(packageId: string): boolean {
    return /^[0-9a-f-]{36}$/i.test(packageId);
  }

  private normalizeZipEntryName(entryName: string): string | null {
    const withoutNullBytes = entryName.replace(/\0/g, '');
    const normalized = posix
      .normalize(withoutNullBytes.replace(/\\/g, '/'))
      .replace(/^\/+/, '');

    if (
      !normalized ||
      normalized === '.' ||
      normalized === '..' ||
      normalized.startsWith('../') ||
      normalized.includes('/../') ||
      /^[a-z]:/i.test(normalized)
    ) {
      return null;
    }

    return normalized;
  }

  private shouldSkipZipEntry(entryName: string): boolean {
    const baseName = posix.basename(entryName);
    return (
      baseName === '.DS_Store' ||
      baseName === 'Thumbs.db' ||
      entryName.startsWith('__MACOSX/')
    );
  }

  private async readManifestFromZip(
    extractedFiles: Map<string, JSZip.JSZipObject>,
  ): Promise<{ path: string; content: string } | null> {
    const manifestEntry = Array.from(extractedFiles.entries()).find(([path]) =>
      path.toLowerCase().endsWith('imsmanifest.xml'),
    );
    if (!manifestEntry) return null;

    const [path, entry] = manifestEntry;
    return { path, content: await entry.async('string') };
  }

  private resolveLaunchPath(
    extractedFiles: Map<string, JSZip.JSZipObject>,
    manifest: { path: string; content: string } | null,
  ): string | null {
    const manifestLaunch = manifest
      ? this.resolveManifestLaunchPath(extractedFiles, manifest)
      : null;
    if (manifestLaunch) return manifestLaunch;

    return (
      this.findExistingZipPath(extractedFiles, ['index.html', 'index.htm']) ??
      this.findFirstHtmlPath(extractedFiles)
    );
  }

  private resolveManifestLaunchPath(
    extractedFiles: Map<string, JSZip.JSZipObject>,
    manifest: { path: string; content: string },
  ): string | null {
    const resourceHrefById = new Map<string, string>();
    const resourcePattern = /<resource\b[^>]*>/gi;
    for (const match of manifest.content.matchAll(resourcePattern)) {
      const tag = match[0];
      const identifier = this.readXmlAttribute(tag, 'identifier');
      const href = this.readXmlAttribute(tag, 'href');
      if (identifier && href) {
        resourceHrefById.set(identifier, href);
      }
    }

    const itemResourceMatch = manifest.content.match(
      /<item\b[^>]*\bidentifierref\s*=\s*["']([^"']+)["'][^>]*>/i,
    );
    const href = itemResourceMatch
      ? resourceHrefById.get(this.decodeXml(itemResourceMatch[1]))
      : Array.from(resourceHrefById.values())[0];

    if (!href) return null;

    const manifestDir = posix.dirname(manifest.path);
    const relativeLaunch =
      manifestDir === '.'
        ? this.normalizeZipEntryName(href)
        : this.normalizeZipEntryName(posix.join(manifestDir, href));

    if (!relativeLaunch) return null;
    return this.findExistingZipPath(extractedFiles, [relativeLaunch]);
  }

  private findExistingZipPath(
    extractedFiles: Map<string, JSZip.JSZipObject>,
    candidates: string[],
  ): string | null {
    const lowerPathMap = new Map<string, string>();
    for (const path of extractedFiles.keys()) {
      lowerPathMap.set(path.toLowerCase(), path);
    }

    for (const candidate of candidates) {
      const normalized = this.normalizeZipEntryName(candidate);
      if (!normalized) continue;
      const match = lowerPathMap.get(normalized.toLowerCase());
      if (match) return match;
    }

    return null;
  }

  private findFirstHtmlPath(
    extractedFiles: Map<string, JSZip.JSZipObject>,
  ): string | null {
    const htmlFiles = Array.from(extractedFiles.keys())
      .filter((path) => /\.html?$/i.test(path))
      .sort((a, b) => {
        const depthA = a.split('/').length;
        const depthB = b.split('/').length;
        return depthA - depthB || a.localeCompare(b);
      });
    return htmlFiles[0] ?? null;
  }

  private extractManifestTitle(content?: string): string | null {
    if (!content) return null;
    const match = content.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
    const title = match
      ? this.decodeXml(match[1]).replace(/\s+/g, ' ').trim()
      : '';
    return title || null;
  }

  private readXmlAttribute(tag: string, attributeName: string): string | null {
    const escapedName = attributeName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = tag.match(
      new RegExp(`\\b${escapedName}\\s*=\\s*["']([^"']+)["']`, 'i'),
    );
    return match ? this.decodeXml(match[1]) : null;
  }

  private resolvePackageFile(packageRoot: string, safePath: string): string {
    const destination = resolve(packageRoot, safePath);
    const root = resolve(packageRoot);
    if (destination !== root && !destination.startsWith(`${root}${sep}`)) {
      throw new BadRequestException('Invalid file path in SCORM package.');
    }
    return destination;
  }

  private decodeXml(value: string): string {
    return (value ?? '')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'")
      .replace(/&apos;/g, "'")
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&');
  }

  private escXml(value: string): string {
    return (value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  private escHtml(value: string): string {
    return (value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  private sortScenarioTree(scenario: Scenario): void {
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
