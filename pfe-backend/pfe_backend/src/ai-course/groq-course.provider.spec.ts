import { GroqCourseProvider } from './groq-course.provider';

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
});
