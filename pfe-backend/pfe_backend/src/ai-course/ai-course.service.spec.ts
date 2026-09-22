import { ConflictException } from '@nestjs/common';
import type { CourseDocument } from 'src/scenario/course-document.types';
import { AiCourseService } from './ai-course.service';

const document: CourseDocument = {
  schemaVersion: 1,
  id: 'course-1',
  title: 'Manual course',
  objectives: ['Learn the basics'],
  sections: [{ id: 'section-1', title: 'Content', lessonIds: ['lesson-1'] }],
  lessons: [
    {
      id: 'lesson-1',
      type: 'lesson',
      title: 'Introduction',
      blocks: [{ id: 'block-1', type: 'text', content: 'Original content' }],
    },
  ],
  pages: [],
  settings: { completionMode: 'pages', passingScore: 80, scormVersion: '1.2' },
  metadata: { version: 3 },
};

describe('AiCourseService', () => {
  const scenario = {
    id: 7,
    courseDocument: document,
    courseDocumentVersion: 3,
  };
  const scenarioService = {
    assertCanEditScenario: jest.fn(),
    updateCourseDocument: jest.fn(),
    create: jest.fn(),
  };
  const provider = {
    createOutline: jest.fn(),
    createDraft: jest.fn(),
    proposeEdit: jest.fn(),
  };
  const repository = {
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    findOne: jest.fn(),
  };
  const configService = {
    get: jest.fn((key: string, defaultVal: string) => defaultVal),
  };
  const service = new AiCourseService(
    scenarioService as never,
    provider as never,
    configService as never,
    repository as never,
  );

  beforeEach(() => jest.clearAllMocks());

  it('creates a proposal only against the current document version', async () => {
    scenarioService.assertCanEditScenario.mockResolvedValue(scenario);
    provider.proposeEdit.mockResolvedValue({
      summary: 'Simplified wording',
      patches: [],
    });

    await service.proposeEdit(
      7,
      3,
      'teacher',
      'Make it simpler',
      { type: 'lesson', lessonId: 'lesson-1' },
      document,
      3,
    );

    expect(provider.proposeEdit).toHaveBeenCalledWith(
      'Make it simpler',
      { type: 'lesson', lessonId: 'lesson-1' },
      document,
    );
    expect(repository.save).toHaveBeenCalledWith(
      expect.objectContaining({ status: 'proposed', courseDocumentVersion: 3 }),
    );
  });

  it('refuses a proposal based on an older course version', async () => {
    scenarioService.assertCanEditScenario.mockResolvedValue({
      ...scenario,
      courseDocumentVersion: 4,
    });

    await expect(
      service.proposeEdit(
        7,
        3,
        'teacher',
        'Rewrite',
        { type: 'course' },
        document,
        3,
      ),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(provider.proposeEdit).not.toHaveBeenCalled();
  });

  it('refuses a blank AI edit instruction before calling the provider', async () => {
    await expect(
      service.proposeEdit(
        7,
        3,
        'teacher',
        '   ',
        { type: 'course' },
        document,
        3,
      ),
    ).rejects.toThrow('Describe the AI change you want to make.');
    expect(scenarioService.assertCanEditScenario).not.toHaveBeenCalled();
    expect(provider.proposeEdit).not.toHaveBeenCalled();
  });

  it('applies a validated patch with the recorded optimistic-lock version', async () => {
    const changeSet = {
      id: 'change-1',
      status: 'proposed',
      scenario,
      requestedBy: { id: 3 },
      courseDocumentVersion: 3,
      proposal: {
        summary: 'Rewrite',
        patches: [
          {
            op: 'replace_block',
            lessonId: 'lesson-1',
            blockId: 'block-1',
            block: { id: 'block-1', type: 'text', content: 'Improved content' },
          },
        ],
      },
    };
    repository.findOne.mockResolvedValue(changeSet);
    scenarioService.assertCanEditScenario.mockResolvedValue(scenario);
    scenarioService.updateCourseDocument.mockResolvedValue({
      courseDocument: { ...document, metadata: { version: 4 } },
    });

    await service.apply('change-1', 3, 'teacher');

    expect(scenarioService.updateCourseDocument).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        lessons: [
          expect.objectContaining({
            blocks: [expect.objectContaining({ content: 'Improved content' })],
          }),
        ],
        pages: [
          expect.objectContaining({
            blocks: [expect.objectContaining({ content: 'Improved content' })],
          }),
        ],
      }),
      3,
      'teacher',
      3,
    );
    expect(changeSet.status).toBe('applied');
  });

  it('applies a remove_block patch and updates both lessons and pages', async () => {
    const changeSet = {
      id: 'change-2',
      status: 'proposed',
      scenario,
      requestedBy: { id: 3 },
      courseDocumentVersion: 3,
      proposal: {
        summary: 'Remove block',
        patches: [
          { op: 'remove_block', lessonId: 'lesson-1', blockId: 'block-1' },
        ],
      },
    };
    repository.findOne.mockResolvedValue(changeSet);
    scenarioService.assertCanEditScenario.mockResolvedValue(scenario);
    scenarioService.updateCourseDocument.mockResolvedValue({
      courseDocument: {
        ...document,
        lessons: [
          { id: 'lesson-1', type: 'lesson', title: 'Introduction', blocks: [] },
        ],
        metadata: { version: 4 },
      },
    });

    await service.apply('change-2', 3, 'teacher');

    expect(scenarioService.updateCourseDocument).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        lessons: [expect.objectContaining({ blocks: [] })],
        pages: [expect.objectContaining({ blocks: [] })],
      }),
      3,
      'teacher',
      3,
    );
    expect(changeSet.status).toBe('applied');
  });

  it('places an inserted lesson in the section of its insertion point', async () => {
    const multiSectionDocument: CourseDocument = {
      ...document,
      sections: [
        { id: 'section-1', title: 'First', lessonIds: ['lesson-1'] },
        { id: 'section-2', title: 'Second', lessonIds: ['lesson-2'] },
      ],
      lessons: [
        ...document.lessons,
        { id: 'lesson-2', type: 'lesson', title: 'Second lesson', blocks: [] },
      ],
    };
    const multiSectionScenario = {
      ...scenario,
      courseDocument: multiSectionDocument,
    };
    const changeSet = {
      id: 'change-3',
      status: 'proposed',
      scenario: multiSectionScenario,
      requestedBy: { id: 3 },
      courseDocumentVersion: 3,
      proposal: {
        summary: 'Add a lesson',
        patches: [
          {
            op: 'insert_lesson',
            afterLessonId: 'lesson-2',
            lesson: {
              id: 'lesson-3',
              type: 'lesson',
              title: 'New lesson',
              blocks: [],
            },
          },
        ],
      },
    };
    repository.findOne.mockResolvedValue(changeSet);
    scenarioService.assertCanEditScenario.mockResolvedValue(
      multiSectionScenario,
    );
    scenarioService.updateCourseDocument.mockResolvedValue({
      courseDocument: multiSectionDocument,
    });

    await service.apply('change-3', 3, 'teacher');

    expect(scenarioService.updateCourseDocument).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        sections: [
          expect.objectContaining({ lessonIds: ['lesson-1'] }),
          expect.objectContaining({ lessonIds: ['lesson-2', 'lesson-3'] }),
        ],
      }),
      3,
      'teacher',
      3,
    );
  });
});
