/**
 * Stream URL construction.
 *
 * Two rules govern everything here, and both are about the server's behaviour
 * rather than our convenience:
 *
 * 1. These are the ONLY URLs ever handed to the video player. The server
 *    302-redirects them to a presigned R2 link, and records the play while
 *    doing so (xtream/stats.py record_play). Caching the presigned target
 *    instead skips the analytics and dies when the 6h signature expires.
 *
 * 2. Build them LAZILY, inside a play handler. Never on mount, never in a list
 *    renderer, never as a prefetch. Every *request* to one of these grabs a
 *    connection slot that the server holds for 30 minutes and never explicitly
 *    releases (xtream/state.py CONN_WINDOW), against a max_connections of 2.
 */

import type { Session } from '@/types/domain';

const enc = encodeURIComponent;

export function movieStreamUrl(session: Session, streamId: number, ext: string): string {
  return `${session.baseUrl}/movie/${enc(session.username)}/${enc(session.password)}/${streamId}.${ext}`;
}

export function episodeStreamUrl(
  session: Session,
  episodeId: string,
  ext: string,
): string {
  return `${session.baseUrl}/series/${enc(session.username)}/${enc(session.password)}/${enc(episodeId)}.${ext}`;
}
