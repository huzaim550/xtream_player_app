/**
 * Typed wrappers over the `player_api.php` actions this app uses.
 *
 * Live TV (`get_live_streams`, `get_short_epg`, ...) is intentionally absent:
 * the server implements it, but v1 of this client is movies and series only.
 */

import { TIMEOUT_COLD, xtreamGet, type RequestOptions } from './client';
import {
  normalizeCategory,
  normalizeMovie,
  normalizeMovieDetail,
  normalizeSeries,
  normalizeSeriesDetail,
} from './normalize';
import type {
  Catalogue,
  Category,
  Movie,
  MovieDetail,
  Series,
  SeriesDetail,
  Session,
} from '@/types/domain';
import type {
  RawCategory,
  RawMovie,
  RawSeries,
  RawSeriesInfo,
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
 * Four requests, once per session, sharing a single cold-start budget: the
 * server's scan cache is stale-while-revalidate, so only the first call to
 * arrive after expiry actually blocks on an R2 listing -- the other three ride
 * along behind it.
 */
export async function getCatalogue(
  s: Session,
  opts: RequestOptions = {},
): Promise<Catalogue> {
  const cold: RequestOptions = { ...opts, timeoutMs: opts.timeoutMs ?? TIMEOUT_COLD };
  const [movieCategories, movies, seriesCategories, series] = await Promise.all([
    getMovieCategories(s, cold),
    getMovies(s, cold),
    getSeriesCategories(s, cold),
    getSeries(s, cold),
  ]);
  return {
    movies,
    series,
    movieCategories,
    seriesCategories,
    fetchedAt: Date.now(),
  };
}
