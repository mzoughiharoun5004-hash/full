import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { Brackets } from 'typeorm';
import { StatutScenario } from 'src/common/enums';
import { Scenario } from './scenario.entity';
import { ScenarioService } from './scenario.service';

/**
 * Visibility filters are wrapped in a Brackets group so later `.andWhere(...)`
 * list filters AND with the whole `(A OR B OR C)` expression instead of
 * binding tighter than the last `orWhere` per normal SQL precedence. The
 * mocked query builder below doesn't execute Brackets internals (only real
 * TypeORM does, when it lowers the builder to SQL), so tests that need to
 * inspect the conditions *inside* a Brackets argument invoke its
 * `whereFactory` manually against a throwaway recording stub.
 */
function extractBracketConditions(bracket: Brackets): {
  where: unknown[][];
  orWhere: unknown[][];
} {
  const calls = { where: [] as unknown[][], orWhere: [] as unknown[][] };
  const stub = {
    where: (...args: unknown[]) => {
      calls.where.push(args);
      return stub;
    },
    orWhere: (...args: unknown[]) => {
      calls.orWhere.push(args);
      return stub;
    },
  };
  bracket.whereFactory(stub as never);
  return calls;
}

type RepoMock = {
  find: jest.Mock;
  findOne: jest.Mock;
  createQueryBuilder: jest.Mock;
  create: jest.Mock;
  save: jest.Mock;
  update: jest.Mock;
  remove: jest.Mock;
  manager: {
    getRepository: jest.Mock;
  };
};

function repoMock(): RepoMock {
  return {
    find: jest.fn(),
    findOne: jest.fn(),
    createQueryBuilder: jest.fn(),
    create: jest.fn((data: unknown) => data),
    save: jest.fn((data: unknown) => Promise.resolve(data)),
    update: jest.fn(() => Promise.resolve()),
    remove: jest.fn(() => Promise.resolve()),
    manager: {
      getRepository: jest.fn(),
    },
  };
}

type QueryBuilderMock = {
  leftJoinAndSelect: jest.Mock;
  leftJoin: jest.Mock;
  where: jest.Mock;
  orWhere: jest.Mock;
  andWhere: jest.Mock;
  orderBy: jest.Mock;
  addOrderBy: jest.Mock;
  take: jest.Mock;
  select: jest.Mock;
  addSelect: jest.Mock;
  distinct: jest.Mock;
  offset: jest.Mock;
  limit: jest.Mock;
  getMany: jest.Mock;
  getRawOne: jest.Mock;
  getRawMany: jest.Mock;
};

function queryBuilderMock(): QueryBuilderMock {
  const qb = {} as QueryBuilderMock;
  qb.leftJoinAndSelect = jest.fn(() => qb);
  qb.leftJoin = jest.fn(() => qb);
  qb.where = jest.fn(() => qb);
  qb.orWhere = jest.fn(() => qb);
  qb.andWhere = jest.fn(() => qb);
  qb.orderBy = jest.fn(() => qb);
  qb.addOrderBy = jest.fn(() => qb);
  qb.take = jest.fn(() => qb);
  qb.select = jest.fn(() => qb);
  qb.addSelect = jest.fn(() => qb);
  qb.distinct = jest.fn(() => qb);
  qb.offset = jest.fn(() => qb);
  qb.limit = jest.fn(() => qb);
  qb.getMany = jest.fn(() => Promise.resolve([]));
  qb.getRawOne = jest.fn(() => Promise.resolve({ count: '0' }));
  qb.getRawMany = jest.fn(() => Promise.resolve([]));
  return qb;
}

function scenarioStub(overrides: Partial<Scenario> = {}): Scenario {
  return {
    id: 10,
    titre: 'Draft scenario',
    description: null,
    objectif: null,
    niveau: null,
    dureeScenario: null,
    statut: StatutScenario.BROUILLON,
    courseDocument: {} as never,
    courseDocumentVersion: 1,
    scenarioDocument: {} as never,
    scenarioDocumentVersion: 1,
    createdAt: new Date(),
    updatedAt: new Date(),
    approvedAt: null,
    user: { id: 2 } as never,
    modules: [],
    ressources: [],
    rapports: [],
    shares: [],
    ...overrides,
  };
}

describe('ScenarioService', () => {
  let scenarioRepo: RepoMock;
  let shareRepo: RepoMock;
  let commentRepo: RepoMock;
  let queryBuilder: QueryBuilderMock;
  let userRepo: { findOne: jest.Mock };
  let service: ScenarioService;

  beforeEach(() => {
    scenarioRepo = repoMock();
    shareRepo = repoMock();
    commentRepo = repoMock();
    queryBuilder = queryBuilderMock();
    userRepo = {
      findOne: jest.fn(() =>
        Promise.resolve({
          previousLoginAt: new Date('2026-05-01T00:00:00.000Z'),
          lastLoginAt: new Date('2026-05-27T00:00:00.000Z'),
        }),
      ),
    };
    scenarioRepo.createQueryBuilder.mockReturnValue(queryBuilder);
    scenarioRepo.manager.getRepository.mockReturnValue(userRepo);
    service = new ScenarioService(
      scenarioRepo as never,
      shareRepo as never,
      repoMock() as never,
      commentRepo as never,
    );
  });

  it('filters admin lists so other users draft scenarios are not returned', async () => {
    queryBuilder.getMany.mockResolvedValueOnce([]);

    await service.findAll(1, 'admin');

    expect(queryBuilder.where).toHaveBeenCalledWith(expect.any(Brackets));
    const bracket = queryBuilder.where.mock.calls[0][0] as Brackets;
    const { where, orWhere } = extractBracketConditions(bracket);
    expect(where).toContainEqual([
      'user.id = :requesterId',
      { requesterId: 1 },
    ]);
    expect(orWhere).toContainEqual([
      'scenario.statut IN (:...visibleStatuses)',
      {
        visibleStatuses: expect.arrayContaining([
          StatutScenario.EN_COURS_VALIDATION,
          StatutScenario.APPROUVE,
          StatutScenario.EXPORTE,
          StatutScenario.ARCHIVE,
        ]),
      },
    ]);
    expect(orWhere).toContainEqual([
      'sharedWith.id = :requesterId',
      { requesterId: 1 },
    ]);
  });

  it('lists own scenarios plus shared scenarios for regular users', async () => {
    queryBuilder.getMany.mockResolvedValueOnce([]);

    await service.findAll(1, 'teacher');

    expect(queryBuilder.where).toHaveBeenCalledWith(expect.any(Brackets));
    const bracket = queryBuilder.where.mock.calls[0][0] as Brackets;
    const { where, orWhere } = extractBracketConditions(bracket);
    expect(where).toContainEqual([
      'user.id = :requesterId',
      { requesterId: 1 },
    ]);
    expect(orWhere).toContainEqual([
      'sharedWith.id = :requesterId',
      { requesterId: 1 },
    ]);
  });

  it('passes a public owner alias with listed scenarios', async () => {
    const scenario = scenarioStub({
      user: {
        id: 2,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        password: 'secret',
      } as never,
    });
    queryBuilder.getMany.mockResolvedValueOnce([scenario]);

    const [result] = await service.findAll(1, 'teacher');
    const owner = (result as Scenario & { author?: Record<string, unknown> })
      .author;

    expect(owner).toEqual(
      expect.objectContaining({
        id: 2,
        firstName: 'Ada',
        lastName: 'Lovelace',
        email: 'ada@example.com',
        name: 'Ada Lovelace',
      }),
    );
    expect((result as Scenario & { ownerName?: string }).ownerName).toBe(
      'Ada Lovelace',
    );
    expect(owner).not.toHaveProperty('password');
    expect(
      (result.user as never as { password?: string }).password,
    ).toBeUndefined();
  });

  it('uses a non-empty fallback owner name when first and last name are blank', async () => {
    const scenario = scenarioStub({
      user: {
        id: 3,
        firstName: '',
        lastName: '',
        email: 'teacher@example.com',
        password: 'secret',
      } as never,
    });
    queryBuilder.getMany.mockResolvedValueOnce([scenario]);

    const [result] = await service.findAll(1, 'teacher');
    const owner = (result as Scenario & { author?: Record<string, unknown> })
      .author;

    expect(owner).toEqual(
      expect.objectContaining({
        id: 3,
        name: 'teacher',
      }),
    );
    expect((result as Scenario & { ownerName?: string }).ownerName).toBe(
      'teacher',
    );
  });

  it('returns the requested notification messages for approvals since the previous login', async () => {
    const platformApproval = scenarioStub({
      id: 20,
      titre: 'Platform scenario',
      statut: StatutScenario.APPROUVE,
      approvedAt: new Date('2026-05-26T09:00:00.000Z'),
      user: { id: 3 } as never,
    });
    const ownApproval = scenarioStub({
      id: 21,
      titre: 'My approved scenario',
      statut: StatutScenario.APPROUVE,
      approvedAt: new Date('2026-05-27T09:00:00.000Z'),
      user: { id: 1 } as never,
    });
    const platformQuery = queryBuilderMock();
    const ownQuery = queryBuilderMock();
    scenarioRepo.createQueryBuilder
      .mockReturnValueOnce(platformQuery)
      .mockReturnValueOnce(ownQuery);
    platformQuery.getMany.mockResolvedValueOnce([platformApproval]);
    ownQuery.getMany.mockResolvedValueOnce([ownApproval]);

    const notifications = await service.getNotifications(1);

    expect(userRepo.findOne).toHaveBeenCalledWith({
      where: { id: 1 },
      select: ['id', 'previousLoginAt', 'lastLoginAt'],
    });
    expect(platformQuery.andWhere).toHaveBeenCalledWith(
      'scenario.approvedAt > :since',
      { since: new Date('2026-05-01T00:00:00.000Z') },
    );
    expect(ownQuery.andWhere).toHaveBeenCalledWith('user.id = :userId', {
      userId: 1,
    });
    expect(notifications).toEqual([
      expect.objectContaining({
        id: 'own-scenario-approved',
        message: 'admin approved your scenario',
        scenarioId: 21,
        scenarioTitle: 'My approved scenario',
      }),
      expect.objectContaining({
        id: 'platform-scenario-approved',
        message: 'a new scenario has been added',
        scenarioId: 20,
        scenarioTitle: 'Platform scenario',
      }),
    ]);
  });

  it('forbids admins from opening another user draft scenario', async () => {
    scenarioRepo.findOne.mockResolvedValueOnce(scenarioStub());
    shareRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.assertCanViewScenario(10, 1, 'admin'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(shareRepo.findOne).toHaveBeenCalledWith({
      where: { scenario: { id: 10 }, sharedWith: { id: 1 } },
    });
  });

  it('allows admin collaborators to open another user draft scenario', async () => {
    const draftScenario = scenarioStub();
    scenarioRepo.findOne.mockResolvedValueOnce(draftScenario);
    shareRepo.findOne.mockResolvedValueOnce({
      permission: 'edit',
      canEditContent: true,
      canEditStructure: true,
      canPublish: false,
    });

    await expect(service.assertCanViewScenario(10, 1, 'admin')).resolves.toBe(
      draftScenario,
    );
  });

  it('allows admins to open another user submitted scenario', async () => {
    const submittedScenario = scenarioStub({
      statut: StatutScenario.EN_COURS_VALIDATION,
    });
    scenarioRepo.findOne.mockResolvedValueOnce(submittedScenario);
    shareRepo.findOne.mockResolvedValueOnce(null);

    await expect(service.assertCanViewScenario(10, 1, 'admin')).resolves.toBe(
      submittedScenario,
    );
  });

  it('uses collaborator permissions when an admin has a share', async () => {
    const submittedScenario = scenarioStub({
      statut: StatutScenario.EN_COURS_VALIDATION,
    });
    scenarioRepo.findOne.mockResolvedValueOnce(submittedScenario);
    shareRepo.findOne.mockResolvedValueOnce({
      permission: 'view',
      canEditContent: false,
      canEditStructure: false,
      canPublish: false,
    });

    await expect(
      service.assertCanEditScenario(10, 1, 'admin'),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('forbids regular users from opening another user scenario without a share', async () => {
    const approvedScenario = scenarioStub({
      statut: StatutScenario.APPROUVE,
    });
    scenarioRepo.findOne.mockResolvedValueOnce(approvedScenario);
    shareRepo.findOne.mockResolvedValueOnce(null);

    await expect(
      service.assertCanViewScenario(10, 1, 'teacher'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(shareRepo.findOne).toHaveBeenCalledWith({
      where: { scenario: { id: 10 }, sharedWith: { id: 1 } },
    });
  });

  it('forbids shared collaborators from editing another user approved scenario', async () => {
    const approvedScenario = scenarioStub({
      statut: StatutScenario.APPROUVE,
    });
    scenarioRepo.findOne.mockResolvedValueOnce(approvedScenario);
    shareRepo.findOne.mockResolvedValueOnce({
      permission: 'edit',
      canEditContent: true,
      canEditStructure: true,
      canPublish: true,
    });

    await expect(
      service.assertCanEditScenario(10, 1, 'teacher'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(shareRepo.findOne).toHaveBeenCalledWith({
      where: { scenario: { id: 10 }, sharedWith: { id: 1 } },
    });
  });

  it('returns an approved owner-edited course to draft', async () => {
    const approvedScenario = scenarioStub({
      statut: StatutScenario.APPROUVE,
      user: { id: 2 } as never,
    });
    const savedScenario = scenarioStub({
      statut: StatutScenario.BROUILLON,
      user: { id: 2 } as never,
    });
    const courseDocument = {
      title: 'Edited course',
      description: 'Edited description',
      metadata: {},
    } as never;
    scenarioRepo.findOne
      .mockResolvedValueOnce(approvedScenario)
      .mockResolvedValueOnce(savedScenario);

    await service.updateCourseDocument(10, courseDocument, 2, 'teacher');

    expect(scenarioRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        statut: StatutScenario.BROUILLON,
        courseDocument: expect.objectContaining({
          title: 'Edited course',
          metadata: expect.objectContaining({
            source: 'course_engine',
          }),
        }),
      }),
    );
  });

  it('returns a submitted (in-review) course to draft when the owner edits it', async () => {
    const submittedScenario = scenarioStub({
      statut: StatutScenario.EN_COURS_VALIDATION,
      user: { id: 2 } as never,
    });
    const savedScenario = scenarioStub({
      statut: StatutScenario.BROUILLON,
      user: { id: 2 } as never,
    });
    const courseDocument = {
      title: 'Updated review course',
      description: 'Still in review',
      metadata: {},
    } as never;
    scenarioRepo.findOne
      .mockResolvedValueOnce(submittedScenario)
      .mockResolvedValueOnce(savedScenario);

    await service.updateCourseDocument(10, courseDocument, 2, 'teacher');

    expect(scenarioRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        statut: StatutScenario.BROUILLON,
        approvedAt: null,
        courseDocument: expect.objectContaining({
          title: 'Updated review course',
          metadata: expect.objectContaining({
            source: 'course_engine',
          }),
        }),
      }),
    );
  });

  it('returns a submitted (in-review) course to draft when an admin collaborator edits it', async () => {
    const submittedScenario = scenarioStub({
      statut: StatutScenario.EN_COURS_VALIDATION,
      user: { id: 2 } as never,
    });
    const savedScenario = scenarioStub({
      statut: StatutScenario.BROUILLON,
      user: { id: 2 } as never,
    });
    const courseDocument = {
      title: 'Admin collaborator course',
      description: 'Still submitted for review',
      metadata: {},
    } as never;
    scenarioRepo.findOne
      .mockResolvedValueOnce(submittedScenario)
      .mockResolvedValueOnce(savedScenario);
    shareRepo.findOne.mockResolvedValueOnce({
      permission: 'edit',
      canEditContent: true,
      canEditStructure: true,
      canPublish: false,
    });

    await service.updateCourseDocument(10, courseDocument, 1, 'admin');

    expect(shareRepo.findOne).toHaveBeenCalledWith({
      where: { scenario: { id: 10 }, sharedWith: { id: 1 } },
    });
    expect(scenarioRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        statut: StatutScenario.BROUILLON,
        approvedAt: null,
        courseDocument: expect.objectContaining({
          title: 'Admin collaborator course',
          metadata: expect.objectContaining({
            source: 'course_engine',
          }),
        }),
      }),
    );
  });

  it('persists an optimistic course-document update with the next version', async () => {
    const currentScenario = scenarioStub({
      courseDocumentVersion: 3,
      user: { id: 2 } as never,
    });
    const savedScenario = scenarioStub({
      courseDocumentVersion: 4,
      user: { id: 2 } as never,
    });
    const courseDocument = {
      title: 'Versioned course',
      description: 'Saved with optimistic locking',
      metadata: {},
    } as never;
    scenarioRepo.findOne
      .mockResolvedValueOnce(currentScenario)
      .mockResolvedValueOnce(savedScenario);
    scenarioRepo.update.mockResolvedValueOnce({ affected: 1 });

    await service.updateCourseDocument(10, courseDocument, 2, 'teacher', 3);

    expect(scenarioRepo.update).toHaveBeenCalledWith(
      { id: 10, courseDocumentVersion: 3 },
      expect.objectContaining({
        courseDocument: expect.objectContaining({
          title: 'Versioned course',
          metadata: expect.objectContaining({
            source: 'course_engine',
            version: 4,
          }),
        }),
        courseDocumentVersion: 4,
      }),
    );
  });

  it('creates an admin revoke comment directly on the course', async () => {
    const submittedScenario = scenarioStub({
      statut: StatutScenario.EN_COURS_VALIDATION,
    });
    const draftScenario = scenarioStub({
      statut: StatutScenario.BROUILLON,
    });
    scenarioRepo.findOne
      .mockResolvedValueOnce(submittedScenario)
      .mockResolvedValueOnce(draftScenario);

    await service.reject(10, 1, '  Missing learning goals.  ');

    expect(scenarioRepo.update).toHaveBeenCalledWith(10, {
      statut: StatutScenario.BROUILLON,
      approvedAt: null,
    });
    expect(commentRepo.create).toHaveBeenCalledWith({
      targetType: 'course',
      targetId: null,
      body: 'Missing learning goals.',
      mentions: null,
      scenario: { id: 10 },
      author: { id: 1 },
    });
    expect(commentRepo.save).toHaveBeenCalledWith(
      expect.objectContaining({
        targetType: 'course',
        body: 'Missing learning goals.',
        scenario: { id: 10 },
        author: { id: 1 },
      }),
    );
  });

  it('does not create a revoke comment when the admin leaves it empty', async () => {
    const submittedScenario = scenarioStub({
      statut: StatutScenario.EN_COURS_VALIDATION,
    });
    const draftScenario = scenarioStub({
      statut: StatutScenario.BROUILLON,
    });
    scenarioRepo.findOne
      .mockResolvedValueOnce(submittedScenario)
      .mockResolvedValueOnce(draftScenario);

    await service.reject(10, 1, '   ');

    expect(commentRepo.create).not.toHaveBeenCalled();
    expect(commentRepo.save).not.toHaveBeenCalled();
  });

  describe('lifecycle state machine', () => {
    it('submits only draft scenarios for validation', async () => {
      const draft = scenarioStub({
        statut: StatutScenario.BROUILLON,
        approvedAt: new Date('2026-01-01T00:00:00.000Z'),
      });
      const submitted = scenarioStub({
        statut: StatutScenario.EN_COURS_VALIDATION,
        approvedAt: null,
      });
      scenarioRepo.findOne
        .mockResolvedValueOnce(draft)
        .mockResolvedValueOnce(submitted);

      await service.submitForValidation(10);

      expect(scenarioRepo.update).toHaveBeenCalledWith(10, {
        statut: StatutScenario.EN_COURS_VALIDATION,
        approvedAt: null,
      });
    });

    it.each([
      StatutScenario.EN_COURS_VALIDATION,
      StatutScenario.APPROUVE,
      StatutScenario.EXPORTE,
      StatutScenario.ARCHIVE,
    ])('rejects submitting a scenario already %s', async (statut) => {
      scenarioRepo.findOne.mockResolvedValueOnce(scenarioStub({ statut }));

      await expect(service.submitForValidation(10)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(scenarioRepo.update).not.toHaveBeenCalled();
    });

    it('approves only a submitted scenario and stamps its approval time', async () => {
      const submitted = scenarioStub({
        statut: StatutScenario.EN_COURS_VALIDATION,
        approvedAt: null,
      });
      const approved = scenarioStub({
        statut: StatutScenario.APPROUVE,
        approvedAt: new Date(),
      });
      scenarioRepo.findOne
        .mockResolvedValueOnce(submitted)
        .mockResolvedValueOnce(approved);

      await service.approve(10);

      expect(scenarioRepo.update).toHaveBeenCalledWith(10, {
        statut: StatutScenario.APPROUVE,
        approvedAt: expect.any(Date),
      });
    });

    it.each([
      StatutScenario.BROUILLON,
      StatutScenario.APPROUVE,
      StatutScenario.EXPORTE,
      StatutScenario.ARCHIVE,
    ])('rejects approving a scenario already %s', async (statut) => {
      scenarioRepo.findOne.mockResolvedValueOnce(scenarioStub({ statut }));

      await expect(service.approve(10)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(scenarioRepo.update).not.toHaveBeenCalled();
    });

    it('exports only an approved scenario', async () => {
      const approved = scenarioStub({
        statut: StatutScenario.APPROUVE,
      });
      const exported = scenarioStub({
        statut: StatutScenario.EXPORTE,
      });
      scenarioRepo.findOne
        .mockResolvedValueOnce(approved)
        .mockResolvedValueOnce(exported);

      await service.exportScenario(10);

      expect(scenarioRepo.update).toHaveBeenCalledWith(10, {
        statut: StatutScenario.EXPORTE,
      });
    });

    it.each([
      StatutScenario.BROUILLON,
      StatutScenario.EN_COURS_VALIDATION,
      StatutScenario.EXPORTE,
      StatutScenario.ARCHIVE,
    ])('rejects exporting a scenario currently %s', async (statut) => {
      scenarioRepo.findOne.mockResolvedValueOnce(scenarioStub({ statut }));

      await expect(service.exportScenario(10)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(scenarioRepo.update).not.toHaveBeenCalled();
    });

    it.each(Object.values(StatutScenario))(
      'archives a scenario from %s',
      async (statut) => {
        const current = scenarioStub({ statut });
        const archived = scenarioStub({ statut: StatutScenario.ARCHIVE });
        scenarioRepo.findOne
          .mockResolvedValueOnce(current)
          .mockResolvedValueOnce(archived);

        await service.archive(10);

        expect(scenarioRepo.update).toHaveBeenCalledWith(10, {
          statut: StatutScenario.ARCHIVE,
        });
      },
    );

    it.each([
      StatutScenario.BROUILLON,
      StatutScenario.APPROUVE,
      StatutScenario.EXPORTE,
      StatutScenario.ARCHIVE,
    ])('rejects rejecting a scenario currently %s', async (statut) => {
      scenarioRepo.findOne.mockResolvedValueOnce(scenarioStub({ statut }));

      await expect(service.reject(10, 1)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(scenarioRepo.update).not.toHaveBeenCalled();
    });
  });

  describe('findAllPaginated filters', () => {
    it('combines mine/status/search list filters as AND-ed bracket groups', async () => {
      queryBuilder.getRawOne.mockResolvedValueOnce({ count: '1' });
      queryBuilder.getRawMany.mockResolvedValueOnce([{ id: 10 }]);
      queryBuilder.getMany.mockResolvedValueOnce([scenarioStub({ id: 10 })]);

      const result = await service.findAllPaginated(1, 'teacher', 1, 20, {
        mine: true,
        statuses: [StatutScenario.BROUILLON],
        search: 'intro',
      });

      expect(result).toEqual(
        expect.objectContaining({ total: 1, page: 1, limit: 20 }),
      );
      expect(result.items).toHaveLength(1);

      const andWhereCalls = queryBuilder.andWhere.mock.calls;
      expect(andWhereCalls).toContainEqual([
        'scenario.statut IN (:...filterStatuses)',
        { filterStatuses: [StatutScenario.BROUILLON] },
      ]);

      const mineBracket = andWhereCalls.find(
        ([arg]) => arg instanceof Brackets,
      )?.[0] as Brackets;
      expect(mineBracket).toBeInstanceOf(Brackets);
      const mineConditions = extractBracketConditions(mineBracket);
      expect(mineConditions.where).toContainEqual([
        'user.id = :requesterId',
        { requesterId: 1 },
      ]);
      expect(mineConditions.orWhere).toContainEqual([
        'sharedWith.id = :requesterId',
        { requesterId: 1 },
      ]);
    });

    it('returns an empty page without querying for rows when nothing matches', async () => {
      queryBuilder.getRawOne.mockResolvedValueOnce({ count: '0' });

      const result = await service.findAllPaginated(1, 'teacher', 1, 20, {
        search: 'nonexistent',
      });

      expect(result).toEqual({ items: [], total: 0, page: 1, limit: 20 });
      expect(queryBuilder.getRawMany).not.toHaveBeenCalled();
    });
  });
});
