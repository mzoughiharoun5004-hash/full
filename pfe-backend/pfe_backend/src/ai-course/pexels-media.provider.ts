import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { CourseBlock } from 'src/scenario/course-document.types';

const PEXELS_URL = 'https://api.pexels.com/v1';

type PexelsMedia = { assetUrl: string; metadata: Record<string, unknown> };

@Injectable()
export class PexelsMediaProvider {
  // Shared across every request this process handles (Nest providers are singletons by
  // default), so this genuinely caps real concurrent Pexels traffic app-wide rather than
  // just within one course generation.
  private readonly gate = new Semaphore(4);
  // De-dupes identical searches (e.g. repeated "education learning" fallback blocks, or
  // near-identical AI keyword sets across lessons) so they don't re-hit the API or the
  // hourly quota. Failures/empty results are cached briefly so a transient outage doesn't
  // get retried in a tight loop; successful lookups are kept much longer.
  private readonly cache = new Map<
    string,
    { value: PexelsMedia | null; expiresAt: number }
  >();
  private static readonly HIT_TTL_MS = 6 * 60 * 60 * 1000;
  private static readonly MISS_TTL_MS = 10 * 60 * 1000;

  constructor(private readonly config: ConfigService) {}

  async findForBlock(block: CourseBlock): Promise<PexelsMedia | null> {
    if (block.type !== 'image' && block.type !== 'video') return null;
    const apiKey = this.config.get<string>('PEXELS_API_KEY')?.trim();
    if (!apiKey) return null;

    const query = this.queryFor(block);
    if (!query) return null;

    const cacheKey = `${block.type}:${query.toLowerCase()}`;
    const cached = this.cache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const path = block.type === 'image' ? 'search' : 'videos/search';
    const response = await this.get(
      `${PEXELS_URL}/${path}?query=${encodeURIComponent(query)}&orientation=landscape&per_page=1`,
      apiKey,
    );
    const result = response
      ? block.type === 'image'
        ? this.photoResult(response)
        : this.videoResult(response)
      : null;

    this.cache.set(cacheKey, {
      value: result,
      expiresAt:
        Date.now() +
        (result
          ? PexelsMediaProvider.HIT_TTL_MS
          : PexelsMediaProvider.MISS_TTL_MS),
    });
    return result;
  }

  private async get(
    url: string,
    apiKey: string,
  ): Promise<Record<string, unknown> | null> {
    const release = await this.gate.acquire();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(url, {
        headers: { Authorization: apiKey },
        signal: controller.signal,
      });
      if (!response.ok) return null;
      const payload: unknown = await response.json();
      return isRecord(payload) ? payload : null;
    } catch {
      return null;
    } finally {
      clearTimeout(timeout);
      release();
    }
  }

  private photoResult(payload: Record<string, unknown>): PexelsMedia | null {
    const photo = first(payload.photos);
    const src = isRecord(photo?.src) ? photo.src : null;
    const assetUrl =
      text(src?.large2x) ?? text(src?.large) ?? text(src?.original);
    return assetUrl
      ? { assetUrl, metadata: this.metadata(photo, 'Photo') }
      : null;
  }

  private videoResult(payload: Record<string, unknown>): PexelsMedia | null {
    const video = first(payload.videos);
    const files = Array.isArray(video?.video_files)
      ? video.video_files.filter(isRecord)
      : [];
    const mp4 = files
      .filter((file) => text(file.file_type) === 'video/mp4' && text(file.link))
      .sort((a, b) => Number(b.width ?? 0) - Number(a.width ?? 0))[0];
    const assetUrl = mp4 ? text(mp4.link) : undefined;
    return assetUrl
      ? { assetUrl, metadata: this.metadata(video, 'Video') }
      : null;
  }

  private metadata(
    item: Record<string, unknown> | undefined,
    kind: 'Photo' | 'Video',
  ): Record<string, unknown> {
    const creator = isRecord(item?.user) ? item.user : null;
    const creatorName = text(creator?.name) ?? 'Pexels creator';
    return {
      mediaProvider: 'pexels',
      mediaAttribution: `${kind} by ${creatorName} on Pexels`,
      mediaAttributionUrl: text(item?.url) ?? 'https://www.pexels.com',
      mediaCreatorUrl: text(creator?.url),
    };
  }

  private queryFor(block: CourseBlock): string {
    const source =
      block.type === 'image'
        ? block.content
        : [block.title, block.content].filter(Boolean).join(' ');
    return (source ?? '')
      .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 120);
  }
}

// Bounds real concurrent network calls (shared across all callers of this provider),
// so one big course generation can't fire dozens of simultaneous Pexels requests.
class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async acquire(): Promise<() => void> {
    if (this.active < this.max) {
      this.active += 1;
      return () => this.release();
    }
    return new Promise((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve(() => this.release());
      });
    });
  }

  private release(): void {
    this.active -= 1;
    const next = this.queue.shift();
    if (next) next();
  }
}

function first(value: unknown): Record<string, unknown> | undefined {
  return Array.isArray(value) && isRecord(value[0]) ? value[0] : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}
