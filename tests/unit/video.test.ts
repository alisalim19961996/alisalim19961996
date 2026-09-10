import { describe, expect, it } from 'vitest';
import { extractYoutubeId, youtubeEmbedUrl, youtubeThumbnailUrl } from '@/lib/video';

const ID = 'dQw4w9WgXcQ';

describe('extractYoutubeId', () => {
  it('accepts every link shape an admin might paste', () => {
    expect(extractYoutubeId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(extractYoutubeId(`https://youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(extractYoutubeId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID);
    expect(extractYoutubeId(`https://youtu.be/${ID}`)).toBe(ID);
    expect(extractYoutubeId(`https://www.youtube.com/embed/${ID}`)).toBe(ID);
    expect(extractYoutubeId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID);
    expect(extractYoutubeId(`https://www.youtube.com/live/${ID}`)).toBe(ID);
  });

  it('ignores extra query parameters like timestamps and playlists', () => {
    expect(extractYoutubeId(`https://www.youtube.com/watch?v=${ID}&t=42s`)).toBe(ID);
    expect(extractYoutubeId(`https://youtu.be/${ID}?t=90`)).toBe(ID);
    expect(extractYoutubeId(`https://www.youtube.com/watch?list=PL123&v=${ID}`)).toBe(
      ID,
    );
  });

  it('tolerates surrounding whitespace from a careless paste', () => {
    expect(extractYoutubeId(`  https://youtu.be/${ID}  `)).toBe(ID);
  });

  it('accepts a bare id', () => {
    expect(extractYoutubeId(ID)).toBe(ID);
  });

  it('rejects anything that is not a YouTube video', () => {
    expect(extractYoutubeId('https://vimeo.com/123456')).toBeNull();
    expect(extractYoutubeId('https://www.youtube.com/@somechannel')).toBeNull();
    expect(extractYoutubeId('https://example.com/watch?v=' + ID)).toBeNull();
    expect(extractYoutubeId('not a url')).toBeNull();
    expect(extractYoutubeId('')).toBeNull();
  });

  it('rejects an id of the wrong length', () => {
    expect(extractYoutubeId('https://youtu.be/tooshort')).toBeNull();
  });
});

describe('embed helpers', () => {
  it('uses the no-cookie host so a product page does not set tracking cookies', () => {
    expect(youtubeEmbedUrl(ID)).toContain('youtube-nocookie.com');
  });

  it('builds a thumbnail url for the click-to-play facade', () => {
    expect(youtubeThumbnailUrl(ID)).toBe(`https://i.ytimg.com/vi/${ID}/hqdefault.jpg`);
  });
});
