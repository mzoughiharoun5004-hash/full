import {
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TypeRessource } from 'src/common/enums';
import { Ressource } from 'src/ressource/ressource.entity';

@Injectable()
export class MediaService {
  constructor(
    @InjectRepository(Ressource)
    private readonly ressourceRepo: Repository<Ressource>,
  ) {}

  /**
   * After Multer saves the file to disk, update the linked Ressource record
   * with the file URL (relative path) and size in bytes.
   */
  async attachFileToRessource(
    ressourceId: number,
    file: Express.Multer.File,
    uploaderId?: number,
  ): Promise<Ressource> {
    const ressource = await this.ressourceRepo.findOne({
      where: { id: ressourceId },
      relations: ['uploadedBy'],
    });
    if (!ressource) {
      throw new NotFoundException(`Ressource #${ressourceId} introuvable`);
    }

    if (
      uploaderId &&
      ressource.uploadedBy &&
      Number(ressource.uploadedBy.id) !== Number(uploaderId)
    ) {
      throw new ForbiddenException(
        'You do not have access to this media asset.',
      );
    }

    // Store the relative path so it can be served statically
    ressource.url = `/uploads/${file.filename}`;
    ressource.taille = file.size;
    ressource.type = this.typeFromMime(file.mimetype);
    if (uploaderId && !ressource.uploadedBy) {
      ressource.uploadedBy = { id: uploaderId } as Ressource['uploadedBy'];
    }

    return this.ressourceRepo.save(ressource);
  }

  private typeFromMime(mimetype: string): TypeRessource {
    if (mimetype.startsWith('video/')) return TypeRessource.VIDEO;
    if (mimetype.startsWith('image/')) return TypeRessource.MASS;
    if (mimetype.startsWith('audio/')) return TypeRessource.AUDIO;
    // Every other mimetype accepted by the upload whitelist (pdf, doc/docx,
    // ppt/pptx, xls/xlsx, csv, txt) is a document. This used to fall back to
    // the ressource's *current* type, but that's always the 'mass' placeholder
    // the frontend sends at creation time (see mediaApi.upload in the
    // frontend's lib/api.ts) — so every non-audio/video/image upload was
    // silently stored as an image. Document uploads are the only case where
    // that fallback ever mattered, and they should always resolve to DOCUMENT.
    return TypeRessource.DOCUMENT;
  }
}
