import {
  Controller,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  ParseFilePipe,
  MaxFileSizeValidator,
  Param,
  ParseIntPipe,
  BadRequestException,
  Request,
  UnauthorizedException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname, join } from 'path';
import { existsSync, mkdirSync } from 'fs';
import {
  ApiBearerAuth,
  ApiBody,
  ApiConsumes,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { AuthGuard } from 'src/auth/guard/auth.guard';
import type { AuthenticatedRequest } from 'src/auth/authenticated-request';
import { RoleGuard } from 'src/role/role.guard';
import { MediaService } from './media.service';

const supportedUploadExtensions = new Set([
  '.jpg',
  '.jpeg',
  '.png',
  '.gif',
  '.webp',
  '.svg',
  '.mp4',
  '.webm',
  '.mov',
  '.mp3',
  '.wav',
  '.ogg',
  '.m4a',
  '.pdf',
  '.doc',
  '.docx',
  '.ppt',
  '.pptx',
  '.xls',
  '.xlsx',
  '.csv',
  '.txt',
]);

@ApiTags('media')
@UseGuards(AuthGuard, RoleGuard)
@ApiBearerAuth('access-token')
@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('upload/ressource/:ressourceId')
  @ApiOperation({ summary: 'Uploader un fichier et lier à une Ressource' })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: { file: { type: 'string', format: 'binary' } },
    },
  })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: (_req, _file, cb) => {
          const uploadDir = join(process.cwd(), 'uploads');
          if (!existsSync(uploadDir)) {
            mkdirSync(uploadDir, { recursive: true });
          }
          cb(null, uploadDir);
        },
        filename: (_req, file, cb) => {
          const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
          cb(
            null,
            `${uniqueSuffix}${extname(file.originalname).toLowerCase()}`,
          );
        },
      }),
      fileFilter: (_req, file, cb) => {
        const extension = extname(file.originalname).toLowerCase();
        if (!supportedUploadExtensions.has(extension)) {
          return cb(
            new BadRequestException(
              `Unsupported file type "${extension || file.mimetype}".`,
            ),
            false,
          );
        }
        cb(null, true);
      },
    }),
  )
  async uploadForRessource(
    @Param('ressourceId', ParseIntPipe) ressourceId: number,
    @Request() req: AuthenticatedRequest,
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }), // 100 MB
        ],
      }),
    )
    file: Express.Multer.File,
  ) {
    return this.mediaService.attachFileToRessource(
      ressourceId,
      file,
      this.requesterId(req),
    );
  }

  private requesterId(req: AuthenticatedRequest): number {
    const id = Number(req.decodedData.id);
    if (!Number.isFinite(id)) {
      throw new UnauthorizedException('Authenticated user id is required.');
    }
    return id;
  }
}
