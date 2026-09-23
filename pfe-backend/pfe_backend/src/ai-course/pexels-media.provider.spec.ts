import { PexelsMediaProvider } from './pexels-media.provider';

describe('PexelsMediaProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('selects a playable Pexels video and stores attribution metadata', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          videos: [
            {
              url: 'https://www.pexels.com/video/123/',
              user: { name: 'Ada Author', url: 'https://www.pexels.com/@ada/' },
              video_files: [
                {
                  file_type: 'video/mp4',
                  link: 'https://videos.pexels.com/large.mp4',
                  width: 1920,
                },
                {
                  file_type: 'video/mp4',
                  link: 'https://videos.pexels.com/small.mp4',
                  width: 640,
                },
              ],
            },
          ],
        }),
    }) as never;
    const provider = new PexelsMediaProvider({
      get: jest.fn().mockReturnValue('test-key'),
    } as never);

    const result = await provider.findForBlock({
      id: 'video-1',
      type: 'video',
      title: 'Teamwork',
      content: 'A team working together.',
    });

    expect(result).toEqual(
      expect.objectContaining({
        assetUrl: 'https://videos.pexels.com/large.mp4',
        metadata: expect.objectContaining({
          mediaProvider: 'pexels',
          mediaAttribution: 'Video by Ada Author on Pexels',
        }),
      }),
    );
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining(
        '/videos/search?query=Teamwork%20A%20team%20working%20together',
      ),
      expect.objectContaining({ headers: { Authorization: 'test-key' } }),
    );
  });

  it('reuses a cached result for a repeated identical query instead of calling Pexels again', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          photos: [
            {
              url: 'https://www.pexels.com/photo/456/',
              user: {
                name: 'Sam Shooter',
                url: 'https://www.pexels.com/@sam/',
              },
              src: { large2x: 'https://images.pexels.com/large2x.jpg' },
            },
          ],
        }),
    });
    global.fetch = fetchMock as never;
    const provider = new PexelsMediaProvider({
      get: jest.fn().mockReturnValue('test-key'),
    } as never);
    const block = {
      id: 'image-1',
      type: 'image',
      title: 'Team',
      content: 'team collaboration office meeting',
    } as never;

    const first = await provider.findForBlock(block);
    const second = await provider.findForBlock(block);

    expect(first).toEqual(second);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('caps concurrent Pexels requests so a burst of blocks does not fire unlimited parallel fetches', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const fetchMock = jest.fn().mockImplementation(async () => {
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return {
        ok: true,
        json: () =>
          Promise.resolve({
            photos: [
              {
                url: 'https://www.pexels.com/photo/1/',
                user: {},
                src: { large2x: 'https://images.pexels.com/x.jpg' },
              },
            ],
          }),
      };
    });
    global.fetch = fetchMock as never;
    const provider = new PexelsMediaProvider({
      get: jest.fn().mockReturnValue('test-key'),
    } as never);

    const blocks = Array.from({ length: 10 }, (_, index) => ({
      id: `image-${index}`,
      type: 'image',
      title: `Topic ${index}`,
      content: `unique search keywords ${index}`,
    })) as never[];

    await Promise.all(blocks.map((block) => provider.findForBlock(block)));

    expect(maxInFlight).toBeLessThanOrEqual(4);
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });
});
