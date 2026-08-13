/** Typed wrappers over the `player_api.php` actions this app uses. */

import { TIMEOUT_COLD, xtreamGet, type RequestOptions } from './client';
import {
  normalizeCategory,
  normalizeChannel,
  normalizeMovie,
  normalizeMovieDetail,
  normalizeProgramme,
  normalizeSeries,
  normalizeSeriesDetail,
} from './normalize';
import type {
  Catalogue,
  Category,
  Channel,
  Movie,
  MovieDetail,
  Programme,
  Series,
  SeriesDetail,
  Session,
} from '@/types/domain';
import type {
  RawCategory,
  RawLiveStream,
  RawMovie,
  RawSeries,
  RawSeriesInfo,
  RawShortEpg,
  RawVodInfo,
} from '@/types/raw';

const list = (opts: RequestOptions = {}): RequestOptions => ({
  ...opts,
  expectArray: true,
});

export function getMovieCategories(
  s: Session,
  opts?: RequestOptions,
): Promise<Category[]> {
  return xtreamGet<RawCategory[]>(s, 'get_vod_categories', {}, list(opts)).then((r) =>
    r.map(normalizeCategory),
  );
}

export function getSeriesCategories(
  s: Session,
  opts?: RequestOptions,
): Promise<Category[]> {
  return xtreamGet<RawCategory[]>(s, 'get_series_categories', {}, list(opts)).then((r) =>
    r.map(normalizeCategory),
  );
}

export function getLiveCategories(
  s: Session,
  opts?: RequestOptions,
): Promise<Category[]> {
  return xtreamGet<RawCategory[]>(s, 'get_live_categories', {}, list(opts)).then((r) =>
    r.map(normalizeCategory),
  );
}

export function getLiveStreams(s: Session, opts?: RequestOptions): Promise<Channel[]> {
  return xtreamGet<RawLiveStream[]>(s, 'get_live_streams', {}, list(opts)).then((r) =>
    r.map(normalizeChannel),
  );
}

/**
 * What is on now and next for one channel.
 *
 * Cheap and safe to call repeatedly: it reads the server's in-memory guide and
 * never touches R2 or a connection slot. Unlike the list actions the healthy
 * response is an *object* (`{"epg_listings": [...]}`), including for a channel
 * id the server has never heard of — so there is no not-found case to handle,
 * just an empty list.
 *
 * Programmes come back in broadcast order, already filtered to those that have
 * not finished. They are re-sorted here anyway, because the caller's whole job
 * is deciding which one is "now".
 */
export function getShortEpg(
  s: Session,
  streamId: number,
  limit = 2,
  opts?: RequestOptions,
): Promise<Programme[]> {
  return xtreamGet<RawShortEpg>(
    s,
    'get_short_epg',
    { stream_id: streamId, limit },
    opts,
  ).then((r) =>
    (r?.epg_listings ?? [])
      .map(normalizeProgramme)
      .sort((a, b) => a.startSec - b.startSec),
  );
}

export function getMovies(s: Session, opts?: RequestOptions): Promise<Movie[]> {
  return xtreamGet<RawMovie[]>(s, 'get_vod_streams', {}, list(opts)).then((r) =>
    r.map(normalizeMovie),
  );
}

export function getSeries(s: Session, opts?: RequestOptions): Promise<Series[]> {
  return xtreamGet<RawSeries[]>(s, 'get_series', {}, list(opts)).then((r) =>
    r.map(normalizeSeries),
  );
}

/** Throws NotFoundError for an unknown id -- which the server reports as a 200
 *  carrying `{"info":{},"movie_data":{}}`. */
export function getMovieDetail(
  s: Session,
  id: number,
  fallback?: Movie,
  opts?: RequestOptions,
): Promise<MovieDetail> {
  return xtreamGet<RawVodInfo>(s, 'get_vod_info', { vod_id: id }, opts).then((r) =>
    normalizeMovieDetail(r, fallback),
  );
}

export function getSeriesDetail(
  s: Session,
  id: number,
  fallback?: Series,
  opts?: RequestOptions,
): Promise<SeriesDetail> {
  return xtreamGet<RawSeriesInfo>(s, 'get_series_info', { series_id: id }, opts).then(
    (r) => normalizeSeriesDetail(r, id, fallback),
  );
}

/**
 * The whole catalogue in one shot.
 *
 * Six requests, once per session, sharing a single cold-start budget: the
 * server's scan cache is stale-while-revalidate, so only the first call to
 * arrive after expiry actually blocks on an R2 listing -- the other five ride
 * along behind it. Live channels come out of that same scan (`live.m3u` is one
 * more key in the bucket), which is why they belong in this batch rather than
 * in a fetch of their own on the Live screen.
 *
 * The guide is *not* here. It ages in minutes rather than the catalogue's five,
 * and asking for every channel up front would be one request per channel for a
 * screen the user may never open -- so store/epg.ts fetches it per visible row.
 */
export async function getCatalogue(
  s: Session,
  opts: RequestOptions = {},
): Promise<Catalogue> {
  const cold: RequestOptions = { ...opts, timeoutMs: opts.timeoutMs ?? TIMEOUT_COLD };
  const [movieCategories, movies, seriesCategories, series, liveCategories, channels] =
    await Promise.all([
      getMovieCategories(s, cold),
      getMovies(s, cold),
      getSeriesCategories(s, cold),
      getSeries(s, cold),
      getLiveCategories(s, cold),
      getLiveStreams(s, cold),
    ]);
  return {
    movies,
    series,
    channels,
    movieCategories,
    seriesCategories,
    liveCategories,
    fetchedAt: Date.now(),
  };
}
