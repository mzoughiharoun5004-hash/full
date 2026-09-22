import { ForbiddenException } from '@nestjs/common';
import { TypeRessource } from 'src/common/enums';
import { Ressource } from './ressource.entity';
import { RessourceService } from './ressource.service';

type RepoMock = {
  find: jest.Mock;
  findOne: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  remove: jest.Mock;
};

function repoMock(): RepoMock {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
    update: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve()),
  };
}

function ressourceStub(overrides: Partial<Ressource> = {}): Ressource {
  return {
    id: 1,
    titre: 'Cover image',
    type: TypeRessource.MASS,
    url: '/uploads/cover.png',
    description: 'Course cover',
    taille: 1024,
    scenario: undefined as never,
    module: undefined as never,
    uploadedBy: { id: 2 } as never,
    ...overrides,
  };
}

describe('RessourceService', () => {
  let repo: RepoMock;
  let service: RessourceService;

  beforeEach(() => {
    repo = repoMock();
    service = new RessourceService(repo as never);
  });

  it('filters media library resources by uploader', async () => {
    repo.find.mockResolvedValueOnce([]);

    await service.findAll({ uploaderId: 2 });

    expect(repo.find).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { uploadedBy: { id: 2 } },
        relations: ['scenario', 'module', 'uploadedBy'],
      }),
    );
  });

  it('stores the uploader when creating a resource', async () => {
    await service.create(
      {
        titre: 'Uploaded slide',
        type: TypeRessource.DOCUMENT,
      },
      2,
    );

    expect(repo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        titre: 'Uploaded slide',
        uploadedBy: { id: 2 },
      }),
    );
  });

  it('forbids opening another users uploaded resource directly', async () => {
    repo.findOne.mockResolvedValueOnce(
      ressourceStub({ uploadedBy: { id: 3 } as never }),
    );

    await expect(service.findOne(1, 2)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
  });

  it('allows legacy resources without an uploader for backward compatibility', async () => {
    const legacy = ressourceStub({ uploadedBy: null });
    repo.findOne.mockResolvedValueOnce(legacy);

    await expect(service.findOne(1, 2)).resolves.toBe(legacy);
  });

  describe('scenario access checks', () => {
    let mockPolicy: { assertCanView: jest.Mock; assertCanEdit: jest.Mock };
    let mockModuleRepo: { findOne: jest.Mock };
    let guardedService: RessourceService;

    beforeEach(() => {
      mockPolicy = {
        assertCanView: jest.fn(),
        assertCanEdit: jest.fn(),
      };
      mockModuleRepo = {
        findOne: jest.fn(),
      };
      guardedService = new RessourceService(
        repo as never,
        mockModuleRepo as never,
        mockPolicy as never,
      );
    });

    it('verifies scenario view access in findByScenario', async () => {
      repo.find.mockResolvedValueOnce([]);
      mockPolicy.assertCanView.mockResolvedValueOnce({});

      await guardedService.findByScenario(10, 2, 'user');

      expect(mockPolicy.assertCanView).toHaveBeenCalledWith(10, 2, 'user');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { scenario: { id: 10 } },
        }),
      );
    });

    it('propagates forbidden error from access policy in findByScenario', async () => {
      mockPolicy.assertCanView.mockRejectedValueOnce(new ForbiddenException());

      await expect(
        guardedService.findByScenario(10, 2, 'user'),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('verifies module scenario view access in findByModule', async () => {
      mockModuleRepo.findOne.mockResolvedValueOnce({
        id: 5,
        scenario: { id: 10 },
      });
      repo.find.mockResolvedValueOnce([]);
      mockPolicy.assertCanView.mockResolvedValueOnce({});

      await guardedService.findByModule(5, 2, 'user');

      expect(mockModuleRepo.findOne).toHaveBeenCalledWith({
        where: { id: 5 },
        relations: ['scenario'],
      });
      expect(mockPolicy.assertCanView).toHaveBeenCalledWith(10, 2, 'user');
      expect(repo.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { module: { id: 5 } },
        }),
      );
    });

    it('allows co-author to view a resource linked to their scenario', async () => {
      const scenarioRes = ressourceStub({
        uploadedBy: { id: 99 } as never,
        scenario: { id: 10 } as never,
      });
      repo.findOne.mockResolvedValueOnce(scenarioRes);
      mockPolicy.assertCanView.mockResolvedValueOnce({});

      await expect(guardedService.findOne(1, 2, 'user')).resolves.toBe(
        scenarioRes,
      );
      expect(mockPolicy.assertCanView).toHaveBeenCalledWith(10, 2, 'user');
    });
  });
});
