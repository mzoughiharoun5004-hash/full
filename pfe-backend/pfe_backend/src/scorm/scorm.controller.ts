import {
  BadRequestException,
  Controller,
  Get,
  Param,
  ParseIntPipe,
  Post,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import type { Response } from 'express';
import {
  requesterFrom,
  type AuthenticatedRequest,
} from 'src/auth/authenticated-request';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import { ScenarioService } from 'src/scenario/scenario.service';
import { ScormService } from './scorm.service';
import { ScormPreviewService } from './scorm-preview.service';

@ApiTags('scorm')
@Controller('scorm')
export class ScormController {
  constructor(
    private readonly scormService: ScormService,
    private readonly scormPreviewService: ScormPreviewService,
    private readonly scenarioService: ScenarioService,
  ) {}

  @Post('upload')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Uploader un package SCORM zip pour le visualiser' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 250 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const isZip =
          file.originalname.toLowerCase().endsWith('.zip') ||
          file.mimetype === 'application/zip' ||
          file.mimetype === 'application/x-zip-compressed';
        if (!isZip) {
          return cb(
            new BadRequestException('Only .zip SCORM packages are supported.'),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadScorm(@UploadedFile() file: Express.Multer.File) {
    return this.scormPreviewService.uploadScormPackage(file);
  }

  @Get('uploads/:packageId')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Recuperer les metadonnees du package SCORM uploade',
  })
  async getUploadedScorm(@Param('packageId') packageId: string) {
    return this.scormPreviewService.getUploadedScormPackage(packageId);
  }

  @Get('uploads/:packageId/viewer')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({ summary: 'Afficher un package SCORM uploade' })
  async viewUploadedScorm(
    @Param('packageId') packageId: string,
    @Res() res: Response,
  ): Promise<void> {
    const html =
      await this.scormPreviewService.buildUploadedScormViewer(packageId);
    res.set({
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store',
    });
    res.end(html);
  }

  /**
   * GET /scenarios/:id/export/scorm
   * Returns a SCORM zip package for the given scenario (1.2 or 2004, per
   * the course's settings.scormVersion).
   */
  @Get(':id/export/scorm')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Exporter un scénario en package SCORM (.zip)',
  })
  async exportScorm(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    await this.scenarioService.assertCanViewScenario(
      id,
      requesterFrom(req).id,
      requesterFrom(req).role,
    );
    const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '')
      .split(',')[0]
      ?.trim();
    const proto = forwardedProto || req.protocol || 'http';
    const host = typeof req.get === 'function' ? req.get('host') : undefined;
    const assetBaseUrl = host ? `${proto}://${host}` : undefined;

    const buffer = await this.scormService.generateScormPackage(
      id,
      assetBaseUrl,
    );

    res.set({
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="scenario_${id}_scorm.zip"`,
      'Content-Length': buffer.length.toString(),
    });

    res.end(buffer);
  }

  @Get(':id/export/pdf')
  @UseGuards(AuthGuard)
  @ApiBearerAuth('access-token')
  @ApiOperation({
    summary: 'Exporter un scénario en PDF',
  })
  async exportPdf(
    @Param('id', ParseIntPipe) id: number,
    @Request() req: AuthenticatedRequest,
    @Res() res: Response,
  ): Promise<void> {
    await this.scenarioService.assertCanViewScenario(
      id,
      requesterFrom(req).id,
      requesterFrom(req).role,
    );
    const forwardedProto = String(req.headers['x-forwarded-proto'] ?? '')
      .split(',')[0]
      ?.trim();
    const proto = forwardedProto || req.protocol || 'http';
    const host = typeof req.get === 'function' ? req.get('host') : undefined;
    const assetBaseUrl = host ? `${proto}://${host}` : undefined;

    const buffer = await this.scormService.generatePdfPackage(id, assetBaseUrl);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="scenario_${id}_course.pdf"`,
      'Content-Length': buffer.length.toString(),
    });

    res.end(buffer);
  }
}
