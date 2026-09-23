import { GroqCourseProvider, buildPatchSchema } from './groq-course.provider';

describe('GroqCourseProvider', () => {
  const provider = new GroqCourseProvider(
    { get: jest.fn() } as never,
    { findForBlock: jest.fn().mockResolvedValue(null) } as never,
  );

  it('adds the platform authoring tools missing from an AI draft', () => {
    const document = (
      provider as unknown as {
        mapDraft(
          value: unknown,
          brief: { language: string; audience: string },
        ): {
          lessons: Array<{
            blocks: Array<{
              type: string;
              assetUrl?: string;
              items?: unknown[];
              metadata?: Record<string, unknown>;
            }>;
          }>;
        };
      }
    ).mapDraft(
      {
        title: 'Email safety',
        description: 'A practical introduction to safer email habits.',
        objectives: ['Recognize suspicious messages'],
        estimatedMinutes: 15,
        lessons: [
          {
            title: 'Spot the signs',
            summary: 'Recognize common warning signs.',
            estimatedMinutes: 15,
            blocks: [
              {
                type: 'heading',
                title: 'Warning signs',
                content: 'Look closely before acting.',
                items: [],
              },
              {
                type: 'text',
                title: null,
                content: 'Attackers rely on urgency and confusion.',
                items: [],
              },
            ],
          },
        ],
      },
      { language: 'English', audience: 'New learners' },
    );

    const blocks = document.lessons.flatMap((lesson) => lesson.blocks);
    expect(blocks.map((block) => block.type)).toEqual(
      expect.arrayContaining([
        'text',
        'list',
        'image',
        'video',
        'process_steps',
        'flashcards',
        'sorting_activity',
        'lesson_summary',
        'continue_button',
      ]),
    );
    // Image blocks use loremflickr for keyword-aware CC-licensed photos
    expect(blocks.find((block) => block.type === 'image')?.assetUrl).toMatch(
      /^https:\/\/loremflickr\.com\//,
    );
    expect(
      blocks.find((block) => block.type === 'video')?.metadata
        ?.aiGeneratedStoryboard,
    ).toBe(true);
    expect(
      blocks.find((block) => block.type === 'video')?.metadata
        ?.youtubeSearchUrl,
    ).toMatch(/^https:\/\/www\.youtube\.com\/results/);
    // Video blocks get a CC0 sample placeholder so <video> renders immediately
    expect(blocks.find((block) => block.type === 'video')?.assetUrl).toMatch(
      /^https:\/\//,
    );
  });

  it('keeps fallback authoring blocks within the editor block limit', () => {
    const document = (
      provider as unknown as {
        mapDraft(
          value: unknown,
          brief: { language: string; audience: string },
        ): { lessons: Array<{ blocks: Array<{ type: string }> }> };
      }
    ).mapDraft(
      {
        title: 'Email safety',
        description: 'A practical introduction to safer email habits.',
        objectives: ['Recognize suspicious messages'],
        estimatedMinutes: 15,
        lessons: [
          {
            title: 'Spot the signs',
            summary: 'Recognize common warning signs.',
            estimatedMinutes: 15,
            blocks: Array.from({ length: 16 }, (_, index) => ({
              type: 'heading',
              title: `Heading ${index}`,
              content: `Content ${index}`,
              items: [],
            })),
          },
        ],
      },
      { language: 'English', audience: 'New learners' },
    );

    expect(document.lessons[0]?.blocks).toHaveLength(16);
  });

  describe('buildPatchSchema', () => {
    it('gives block-scope patches one array per allowed op, no patches property and no anyOf', () => {
      const schema = buildPatchSchema({
        type: 'block',
        lessonId: 'lesson-1',
        blockId: 'block-1',
      }) as {
        properties: Record<
          string,
          { type?: string; items?: { required?: string[] } }
        >;
        required: string[];
      };

      // This is the actual fix: Groq's strict mode kept failing with
      // "missing properties: blockId, block, afterBlockId, blocks, changes"
      // because every op's fields lived on one shared object — first as a
      // top-level `anyOf` of differently-required alternatives, then as a
      // single flat object with every field nullable. Both shapes made the
      // model drop fields instead of nulling them as the object's required
      // list grew (worst at course scope, the union of all 6 ops' fields).
      // There is no `patches` property and no `anyOf` anywhere now: each
      // allowed op gets its own top-level array holding only that op's own
      // small, fully-required item shape, and an empty array is how the
      // model says "no patches of this kind".
      expect(schema.properties).not.toHaveProperty('patches');
      expect(schema.properties).not.toHaveProperty('anyOf');
      expect(Object.keys(schema.properties).sort()).toEqual(
        ['remove_block', 'replace_block', 'summary'].sort(),
      );
      expect(schema.required.sort()).toEqual(
        ['remove_block', 'replace_block', 'summary'].sort(),
      );
      expect(
        [...(schema.properties.replace_block.items?.required ?? [])].sort(),
      ).toEqual(['block', 'blockId', 'lessonId'].sort());
      expect(
        [...(schema.properties.remove_block.items?.required ?? [])].sort(),
      ).toEqual(['blockId', 'lessonId'].sort());
    });

    it('exposes one array per operation for course scope, all required', () => {
      const schema = buildPatchSchema({ type: 'course' }) as {
        properties: Record<string, unknown>;
        required: string[];
      };

      expect(Object.keys(schema.properties).sort()).toEqual(
        [
          'insert_blocks',
          'insert_lesson',
          'remove_block',
          'replace_block',
          'replace_lesson',
          'summary',
          'update_metadata',
        ].sort(),
      );
      // Every property Groq's strict mode is told about must also be
      // required, or the request is rejected before generation even starts.
      expect(schema.required.sort()).toEqual(
        Object.keys(schema.properties).sort(),
      );
    });
  });

  describe('validateProposal', () => {
    it('parses the per-op-array shape Groq now returns and re-attaches op', () => {
      const document = {
        lessons: [
          {
            id: 'lesson-1',
            type: 'lesson' as const,
            title: 'Intro',
            blocks: [
              { id: 'block-1', type: 'text' as const, content: 'Old content' },
            ],
          },
        ],
      };
      // Mirrors what Groq now returns: one key per op allowed at this scope,
      // each an array of that op's own item shape with no `op` field and no
      // shared nullable fields — the model fills in the array(s) for the
      // operation(s) it wants and leaves the rest `[]`. `op` itself is never
      // part of the model's output; flattenPatchGroups re-attaches it.
      const raw = {
        summary: 'Add a follow-up block',
        replace_block: [],
        remove_block: [],
        replace_lesson: [],
        insert_blocks: [
          {
            lessonId: 'lesson-1',
            afterBlockId: 'block-1',
            blocks: [
              {
                type: 'text',
                title: 'Follow-up',
                content: 'More detail.',
                items: [],
              },
            ],
          },
        ],
      };

      const result = (
        provider as unknown as {
          validateProposal(
            value: unknown,
            scope: unknown,
            document: unknown,
          ): {
            summary: string;
            patches: Array<{
              op: string;
              lessonId?: string;
              afterBlockId?: string;
              blocks?: unknown[];
            }>;
          };
        }
      ).validateProposal(
        raw,
        { type: 'lesson', lessonId: 'lesson-1' },
        document,
      );

      expect(result.patches).toHaveLength(1);
      expect(result.patches[0]).toMatchObject({
        op: 'insert_blocks',
        lessonId: 'lesson-1',
        afterBlockId: 'block-1',
      });
      expect(result.patches[0].blocks).toHaveLength(1);
    });
  });
});
