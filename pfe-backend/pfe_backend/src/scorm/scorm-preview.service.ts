import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import JSZip from 'jszip';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, posix, resolve, sep } from 'node:path';

// Exported so `scorm-cleanup.service.ts` can import these instead of keeping
// its own copy in sync by hand. This service owns the write side of the
// directory; the cleanup service owns the prune side.
export const SCORM_UPLOAD_ROOT = join(process.cwd(), 'uploads', 'scorm');
export const SCORM_UPLOAD_METADATA = '.scorm-viewer.json';

const MAX_SCORM_FILE_COUNT = 4000;
const MAX_SCORM_UNCOMPRESSED_SIZE = 750 * 1024 * 1024;

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

/**
 * Handles third-party SCORM packages that authors upload to preview
 * (`/scorm/upload` and the viewer shell), as opposed to packages this
 * application generates itself — that is `ScormBuildService`.
 *
 * Deliberately has no repository or `ScenarioService` dependency: nothing here
 * touches a scenario, which is what makes the zip-extraction safety rules below
 * testable in isolation.
 */
@Injectable()
export class ScormPreviewService {
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

  private escHtml(value: string): string {
    return (value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
}
