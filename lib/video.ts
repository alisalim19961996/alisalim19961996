/**
 * Video links on a product page.
 *
 * The admin pastes whatever URL they copied from YouTube — watch links, share
 * links, Shorts, embeds, with or without a timestamp. All of them are reduced
 * to the 11-character video id, because storing the id is what lets the page
 * render a thumbnail facade and load the player only when the customer clicks.
 * Embedding the iframe directly would cost hundreds of kilobytes on a product
 * page that most visitors never press play on.
 */

const YOUTUBE_ID = /^[A-Za-z0-9_-]{11}$/;

/** Extract the video id from any common YouTube URL form, or null. */
export function extractYoutubeId(input: string): string | null {
  if (!input) return null;
  const trimmed = input.trim();

  // A bare id pasted on its own.
  if (YOUTUBE_ID.test(trimmed)) return trimmed;

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return null;
  }

  const host = url.hostname.replace(/^www\./, '').toLowerCase();

  // youtu.be/<id>
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return id && YOUTUBE_ID.test(id) ? id : null;
  }

  if (
    host !== 'youtube.com' &&
    host !== 'm.youtube.com' &&
    host !== 'youtube-nocookie.com'
  ) {
    return null;
  }

  // youtube.com/watch?v=<id>
  const queryId = url.searchParams.get('v');
  if (queryId && YOUTUBE_ID.test(queryId)) return queryId;

  // /embed/<id>, /shorts/<id>, /live/<id>, /v/<id>
  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length >= 2) {
    const [prefix, candidate] = segments;
    if (
      prefix &&
      candidate &&
      ['embed', 'shorts', 'live', 'v'].includes(prefix) &&
      YOUTUBE_ID.test(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

/** Privacy-preserving embed URL, only loaded after the customer clicks play. */
export function youtubeEmbedUrl(videoId: string): string {
  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0`;
}

/** Thumbnail served as the facade before the player loads. */
export function youtubeThumbnailUrl(videoId: string): string {
  return `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;
}

export function youtubeWatchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`;
}
