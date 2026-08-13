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

/**
 * A live channel.
 *
 * Both rules above apply unchanged -- and one more decision is worth writing
 * down, because `get_live_streams` hands us an alternative and taking it would
 * look like a simplification.
 *
 * Every channel arrives with a `direct_source`: the real upstream URL from
 * `live.m3u`. Playing that instead of this would be strictly worse in three
 * ways, and the server's own comment (routes_player.py) explains why it is
 * offered at all -- for third-party apps whose engines will not follow a 302.
 * We are not one of those:
 *
 *  1. `/live/...` records the play (xtream/stats.py record_play), exactly as
 *     `/movie` and `/series` do. A direct_source play is invisible to the
 *     server's stats, same trap as caching a presigned R2 link.
 *  2. For an HLS source the route does not redirect at all -- it fetches the
 *     playlist and rewrites relative child and segment URLs to absolute
 *     (serve_live / rewrite_hls). A raw upstream playlist full of relative
 *     paths is the classic "plays for two seconds then stalls" failure.
 *  3. An upstream URL is whatever the playlist author typed, which is often
 *     plain http. The Play build ships with cleartext off, so those would fail
 *     outright there while working in the sideloaded build -- the worst kind of
 *     difference between the two distributions.
 *
 * `.m3u8` because the server strips the extension and matches on the id alone,
 * and because the format hint is what nudges media3 towards its HLS extractor.
 * There is no per-channel extension to thread through, unlike movies.
 */
export function liveStreamUrl(session: Session, streamId: number): string {
  return `${session.baseUrl}/live/${enc(session.username)}/${enc(session.password)}/${streamId}.m3u8`;
}
