import { Injectable } from '@nestjs/common';
import { ScormBuildService } from './scorm-build.service';
import { ScormPdfService } from './scorm-pdf.service';

// Compatibility facade for controller and external consumers. Export concerns live in
// focused services so package building and PDF rendering can evolve independently.
@Injectable()
export class ScormService {
  constructor(
    private readonly scormBuildService: ScormBuildService,
    private readonly scormPdfService: ScormPdfService,
  ) {}

  generateScormPackage(
    scenarioId: number,
    assetBaseUrl?: string,
  ): Promise<Buffer> {
    return this.scormBuildService.generateScormPackage(
      scenarioId,
      assetBaseUrl,
    );
  }

  generatePdfPackage(
    scenarioId: number,
    assetBaseUrl?: string,
  ): Promise<Buffer> {
    return this.scormPdfService.generatePdfPackage(scenarioId, assetBaseUrl);
  }
}
