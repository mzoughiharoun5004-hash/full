import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Dirent } from 'node:fs';
import { readdir, readFile, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import {
  SCORM_UPLOAD_METADATA,
  SCORM_UPLOAD_ROOT,
} from './scorm-preview.service';

// Imported from the service that owns the write side of this directory, so
// the two can no longer drift apart.

// A package directory with no metadata file is either an upload still in
// flight or one whose process died mid-write. Give it a grace period before
// treating it as garbage.
const INCOMPLETE_UPLOAD_GRACE_MS = 60 * 60 * 1000;

export interface ScormCleanupResult {
  scanned: number;
  deleted: number;
  errors: number;
  freedBytes: number;
}

/** Only the fields cleanup needs; the full shape lives in scorm-preview.service.ts. */
interface ScormUploadMetadata {
  id?: string;
  originalName?: string;
  uploadedAt?: string;
}

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Prunes SCORM preview uploads (`/scorm/upload`) once they pass their TTL.
 *
 * Self-scheduling via `setInterval` rather than `@nestjs/schedule` so the
 * feature carries no extra dependency. Set `SCORM_CLEANUP_INTERVAL_MINUTES=0`
 * to disable the timer entirely (the service stays injectable so an admin
 * endpoint or a test can still call `cleanupOldUploads()` directly).
 */
@Injectable()
export class ScormCleanupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(ScormCleanupService.name);
  private timer: NodeJS.Timeout | null = null;
  private inFlight = false;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    const intervalMinutes = this.configService.get<number>(
      'scorm.cleanupIntervalMinutes',
      60,
    );

    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      this.logger.log(
        'SCORM upload cleanup is disabled (SCORM_CLEANUP_INTERVAL_MINUTES <= 0)',
      );
      return;
    }

    const intervalMs = intervalMinutes * 60 * 1000;
    this.timer = setInterval(() => void this.runSweep(), intervalMs);
    // Do not hold the event loop open just for the cleanup timer.
    this.timer.unref();

    this.logger.log(
      `SCORM upload cleanup scheduled every ${intervalMinutes} minute(s)`,
    );

    // Also sweep once at boot so a restart reclaims anything that expired
    // while the process was down.
    void this.runSweep();
  }

  onModuleDestroy(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Guards against overlapping sweeps on a slow disk. */
  private async runSweep(): Promise<void> {
    if (this.inFlight) {
      this.logger.debug('Skipping SCORM cleanup sweep: previous run is active');
      return;
    }

    this.inFlight = true;
    try {
      await this.cleanupOldUploads();
    } catch (error) {
      this.logger.error(`SCORM cleanup sweep failed: ${describeError(error)}`);
    } finally {
      this.inFlight = false;
    }
  }

  /**
   * Delete uploaded SCORM packages older than the TTL.
   *
   * @param ttlHours overrides `SCORM_UPLOAD_TTL_HOURS` (default 24).
   */
  async cleanupOldUploads(ttlHours?: number): Promise<ScormCleanupResult> {
    const ttl =
      ttlHours ?? this.configService.get<number>('scorm.uploadTtlHours', 24);
    const cutoff = Date.now() - ttl * 60 * 60 * 1000;

    const result: ScormCleanupResult = {
      scanned: 0,
      deleted: 0,
      errors: 0,
      freedBytes: 0,
    };

    let entries: Dirent<string>[];
    try {
      entries = await readdir(SCORM_UPLOAD_ROOT, { withFileTypes: true });
    } catch (error) {
      // Nothing has been uploaded yet: not an error worth reporting.
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return result;
      throw error;
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;

      result.scanned += 1;
      const packageDir = join(SCORM_UPLOAD_ROOT, entry.name);

      try {
        const metadata = await this.readMetadata(packageDir);

        if (!metadata) {
          await this.removeIfStale(packageDir, entry.name, result);
          continue;
        }

        const uploadedAt = Date.parse(metadata.uploadedAt ?? '');
        if (Number.isNaN(uploadedAt)) {
          this.logger.warn(
            `SCORM upload ${entry.name} has an unreadable uploadedAt; falling back to directory mtime`,
          );
          await this.removeIfStale(packageDir, entry.name, result, cutoff);
          continue;
        }

        if (uploadedAt >= cutoff) continue;

        const freed = await this.directorySize(packageDir);
        await rm(packageDir, { recursive: true, force: true });

        result.deleted += 1;
        result.freedBytes += freed;
        this.logger.log(
          `Deleted expired SCORM upload ${metadata.id ?? entry.name} (${metadata.originalName ?? 'unknown file'})`,
        );
      } catch (error) {
        result.errors += 1;
        this.logger.error(
          `Failed to process SCORM upload ${entry.name}: ${describeError(error)}`,
        );
      }
    }

    if (result.deleted || result.errors) {
      this.logger.log(
        `SCORM cleanup: ${result.scanned} scanned, ${result.deleted} deleted, ${result.errors} errors, ${result.freedBytes} bytes freed`,
      );
    }

    return result;
  }

  private async readMetadata(
    packageDir: string,
  ): Promise<ScormUploadMetadata | null> {
    try {
      const raw = await readFile(
        join(packageDir, SCORM_UPLOAD_METADATA),
        'utf8',
      );
      return JSON.parse(raw) as ScormUploadMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Fallback path for directories we cannot date from metadata: delete them
   * only once their mtime is older than `cutoff` (or the grace period).
   */
  private async removeIfStale(
    packageDir: string,
    name: string,
    result: ScormCleanupResult,
    cutoff = Date.now() - INCOMPLETE_UPLOAD_GRACE_MS,
  ): Promise<void> {
    const dirStat = await stat(packageDir);
    if (dirStat.mtime.getTime() >= cutoff) return;

    const freed = await this.directorySize(packageDir);
    await rm(packageDir, { recursive: true, force: true });

    result.deleted += 1;
    result.freedBytes += freed;
    this.logger.warn(`Deleted stale SCORM upload directory ${name}`);
  }

  private async directorySize(dirPath: string): Promise<number> {
    let total = 0;

    const entries = await readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dirPath, entry.name);
      try {
        if (entry.isDirectory()) {
          total += await this.directorySize(fullPath);
        } else {
          total += (await stat(fullPath)).size;
        }
      } catch {
        // A file that vanished mid-scan just does not count toward the total.
      }
    }

    return total;
  }
}
