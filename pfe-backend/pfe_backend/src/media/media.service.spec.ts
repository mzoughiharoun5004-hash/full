import { ForbiddenException } from '@nestjs/common';
import { TypeRessource } from 'src/common/enums';
import { Ressource } from 'src/ressource/ressource.entity';
import { MediaService } from './media.service';

type RepoMock = {
  findOne: jest.Mock;
  save: jest.Mock;
};

function repoMock(): RepoMock {
  return {
    findOne: jest.fn(),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
  };
}

function ressourceStub(overrides: Partial<Ressource> = {}): Ressource {
  return {
    id: 1,
    titre: 'Course video',
    type: TypeRessource.VIDEO,
    url: null as never,
    description: null as never,
    taille: null as never,
    scenario: undefined as never,
    module: undefined as never,
    uploadedBy: { id: 2 } as never,
    ...overrides,
  };
}

function fileStub(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'lesson.mp4',
    encoding: '7bit',
    mimetype: 'video/mp4',
    size: 2048,
    destination: 'uploads',
    filename: 'lesson.mp4',
    path: 'uploads/lesson.mp4',
    buffer: Buffer.alloc(0),
    stream: undefined as never,
    ...overrides,
  };
}

describe('MediaService', () => {
  let repo: RepoMock;
  let service: MediaService;

  beforeEach(() => {
    repo = repoMock();
    service = new MediaService(repo as never);
  });

  it('forbids attaching an upload to another users resource', async () => {
    repo.findOne.mockResolvedValueOnce(
      ressourceStub({ uploadedBy: { id: 3 } as never }),
    );

    await expect(
      service.attachFileToRessource(1, fileStub(), 2),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(repo.save).not.toHaveBeenCalled();
  });

  it('claims legacy unowned resources for the current uploader', async () => {
    const legacy = ressourceStub({ uploadedBy: null });
    repo.findOne.mockResolvedValueOnce(legacy);

    const result = await service.attachFileToRessource(1, fileStub(), 2);

    expect(result.uploadedBy).toEqual({ id: 2 });
    expect(result.url).toBe('/uploads/lesson.mp4');
    expect(repo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        uploadedBy: { id: 2 },
        url: '/uploads/lesson.mp4',
        taille: 2048,
      }),
    );
  });

  it('classifies a document upload as DOCUMENT rather than keeping the "mass" placeholder the frontend creates every resource with', async () => {
    // mediaApi.upload() in the frontend always creates the resource with
    // `type: 'mass'` first, then relies on this step to correct it from the
    // real file. A PDF/DOCX/etc. upload must not be left as MASS.
    const legacy = ressourceStub({ type: TypeRessource.MASS });
    repo.findOne.mockResolvedValueOnce(legacy);

    const result = await service.attachFileToRessource(
      1,
      fileStub({
        originalname: 'handout.pdf',
        filename: 'handout.pdf',
        mimetype: 'application/pdf',
      }),
      2,
    );

    expect(result.type).toBe(TypeRessource.DOCUMENT);
  });

  it('still classifies image/video/audio uploads correctly', async () => {
    repo.findOne.mockResolvedValueOnce(
      ressourceStub({ type: TypeRessource.MASS }),
    );
    const image = await service.attachFileToRessource(
      1,
      fileStub({
        originalname: 'photo.png',
        filename: 'photo.png',
        mimetype: 'image/png',
      }),
      2,
    );
    expect(image.type).toBe(TypeRessource.MASS);

    repo.findOne.mockResolvedValueOnce(
      ressourceStub({ type: TypeRessource.MASS }),
    );
    const audio = await service.attachFileToRessource(
      1,
      fileStub({
        originalname: 'clip.mp3',
        filename: 'clip.mp3',
        mimetype: 'audio/mpeg',
      }),
      2,
    );
    expect(audio.type).toBe(TypeRessource.AUDIO);
  });
});
