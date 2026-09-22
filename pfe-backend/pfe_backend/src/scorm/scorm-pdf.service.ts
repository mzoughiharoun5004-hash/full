import { Injectable, NotFoundException, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import puppeteer from 'puppeteer';
import { Scenario } from 'src/scenario/scenario.entity';
import { ScenarioService } from 'src/scenario/scenario.service';
import {
  CourseBlock,
  CourseDocument,
  CoursePage,
  QuizQuestion,
} from 'src/scenario/course-document.types';
import { ScormExportBase } from './scorm-export.base';

type PdfCourseItem = NonNullable<CourseBlock['items']>[number];
type PdfChartRow = { label: string; value: number };

@Injectable()
export class ScormPdfService
  extends ScormExportBase
  implements OnModuleDestroy
{
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
  ) {
    super();
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
        ${this.pdfMediaCredit(block)}
      </figure>`;
    }

    if (type === 'video') {
      return `<section class="media-block">
        ${title ? `<h2>${this.escHtml(title)}</h2>` : ''}
        ${displayUrl ? `<video controls src="${this.escHtml(displayUrl)}"></video><a class="media-link" href="${this.escHtml(displayUrl)}">${this.escHtml(displayUrl)}</a>` : '<div class="empty-media">Video</div>'}
        ${caption ? `<p class="summary">${this.pdfMultiline(caption)}</p>` : ''}
        ${this.pdfMediaCredit(block)}
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

  // Mirrors ScormBuildService's embedded-runtime mediaCredit() so Pexels
  // attribution shows up in the PDF export the same way it does in the SCORM
  // zip export and the live editor preview.
  private pdfMediaCredit(block: CourseBlock): string {
    const attribution = this.pdfMetaString(block, 'mediaAttribution', '');
    if (!attribution) return '';
    const url = this.pdfMetaString(block, 'mediaAttributionUrl', '');
    const label = this.escHtml(attribution);
    return `<p class="media-credit">${url ? `<a href="${this.escHtml(url)}" target="_blank" rel="noreferrer">${label}</a>` : label}</p>`;
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
}
