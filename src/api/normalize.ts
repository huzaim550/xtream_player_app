/**
 * The boundary between the server's wire format and the app's domain types.
 *
 * Every string-that-is-really-a-number, every ''-that-means-null, and every
 * ordering hazard is resolved here and nowhere else.
 */

import { NotFoundError } from './errors';
import type {
  Category,
  Episode,
  Movie,
  MovieDetail,
  Season,
  Series,
  SeriesDetail,
} from '@/types/domain';
import type {
  RawCategory,
  RawEpisode,
  RawMovie,
  RawSeries,
  RawSeriesInfo,
  RawVodInfo,
} from '@/types/raw';

/** '' means "no artwork". Never build a poster URL: the token is an HMAC of
 *  the server's secret key, so a hand-made URL is a guaranteed 403. */
function posterOrNull(url: string | undefined): string | null {
  const trimmed = url?.trim();
  return trimmed ? trimmed : null;
}

function textOrNull(v: string | undefined): string | null {
  const trimmed = v?.trim();
  return trimmed ? trimmed : null;
}

function toUnixSeconds(v: string | undefined): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * Release-name noise, for display only.
 *
 * The server falls back to the filename when a title has no .json sidecar
 * (xtream/library.py), so names arrive like
 * "The Movie (2019) 1080p BluRay x265 DTS". Strip the scene tokens for the UI
 * but keep the original for search -- someone typing "x265" should still match.
 */
const RELEASE_NOISE =
  /\b(2160p|1080p|720p|480p|4k|uhd|hdr10\+?|hdr|dolby ?vision|x264|x265|h\.?264|h\.?265|hevc|avc|aac|ac3|eac3|dts(?:-hd)?|truehd|atmos|bluray|blu-ray|brrip|bdrip|webrip|web-?dl|hdrip|dvdrip|hdtv|remux|proper|repack|extended|unrated|multi|dual ?audio|\d{3,4}mb|\d(?:\.\d)?gb)\b/gi;

export function cleanTitle(name: string): string {
  let out = name.replace(/\.[a-z0-9]{2,4}$/i, ''); // trailing extension
  out = out.replace(/[._]+/g, ' ');
  out = out.replace(RELEASE_NOISE, ' ');
  out = out.replace(/[-–—[\]{}]+\s*$/g, ' ');
  // A release group tag trailing after a dash: "... - RARBG"
  out = out.replace(/\s-\s*[A-Za-z0-9]+\s*$/, ' ');
  out = out.replace(/\(\s*\)|\[\s*\]/g, ' ');
  out = out.replace(/\s{2,}/g, ' ').trim();
  return out || name;
}

export function normalizeCategory(raw: RawCategory): Category {
  return { id: String(raw.category_id), name: raw.category_name };
}

export function normalizeMovie(raw: RawMovie): Movie {
  return {
    id: raw.stream_id,
    name: raw.name,
    displayName: cleanTitle(raw.name),
    categoryId: String(raw.category_id),
    posterUrl: posterOrNull(raw.stream_icon),
    ext: raw.container_extension || 'mp4',
    qualityLabel: textOrNull(raw.video_quality),
    videoCodec: textOrNull(raw.video_codec),
    addedAt: toUnixSeconds(raw.added),
  };
}

export function normalizeSeries(raw: RawSeries): Series {
  return {
    id: raw.series_id,
    name: raw.name,
    displayName: cleanTitle(raw.name),
    categoryId: String(raw.category_id),
    posterUrl: posterOrNull(raw.cover),
    plot: raw.plot ?? '',
  };
}

/**
 * The server appends its quality label to the plot after a blank line, because
 * the plot is the one free-text field every player renders. We have a proper
 * badge for it, so split it back off.
 */
function splitQualityFromPlot(
  plot: string | undefined,
  qualityLabel: string | null,
): string {
  const text = (plot ?? '').trim();
  if (!qualityLabel) return text;
  if (!text.endsWith(qualityLabel)) return text;
  return text.slice(0, text.length - qualityLabel.length).trim();
}

export function normalizeMovieDetail(raw: RawVodInfo, fallback?: Movie): MovieDetail {
  // A missing id is answered with {"info":{},"movie_data":{}} and HTTP 200.
  const streamId = raw?.movie_data?.stream_id;
  if (!streamId) {
    throw new NotFoundError('That title is no longer in your library.');
  }
  const info = raw.info ?? {};
  const data = raw.movie_data;
  const qualityLabel = textOrNull(info.video_quality) ?? fallback?.qualityLabel ?? null;
  const name = info.name || data.name || fallback?.name || '';
  const poster = posterOrNull(info.movie_image) ?? posterOrNull(info.cover_big);

  return {
    id: streamId,
    name,
    displayName: cleanTitle(name),
    ext: data.container_extension || fallback?.ext || 'mp4',
    posterUrl: poster ?? fallback?.posterUrl ?? null,
    plot: splitQualityFromPlot(info.plot ?? info.description, qualityLabel),
    genre: info.genre ?? '',
    cast: info.cast ?? '',
    director: info.director ?? '',
    releaseDate: info.releasedate || info.release_date || '',
    rating: info.rating ?? '',
    duration: info.duration ?? '',
    qualityLabel,
    videoCodec: textOrNull(info.video_codec) ?? fallback?.videoCodec ?? null,
    audioCodec: textOrNull(info.audio_codec),
  };
}

function normalizeEpisode(raw: RawEpisode, seriesId: number, season: number): Episode {
  return {
    id: String(raw.id),
    seriesId,
    season,
    episodeNum: Number(raw.episode_num) || 0,
    title: raw.title ?? '',
    ext: raw.container_extension || 'mp4',
    qualityLabel: textOrNull(raw.info?.video_quality),
  };
}

export function normalizeSeriesDetail(
  raw: RawSeriesInfo,
  seriesId: number,
  fallback?: Series,
): SeriesDetail {
  const episodesByKey = raw?.episodes ?? {};

  // `episodes` keys are strings. A default sort gives ["1","10","2"], which
  // silently ships a season list in the wrong order -- so compare numerically.
  // Treat `episodes` as the source of truth and use `seasons[]` only for names,
  // since a season present in one and missing from the other should still show.
  const seasonNames = new Map<number, string>();
  for (const s of raw?.seasons ?? []) {
    seasonNames.set(Number(s.season_number), s.name);
  }

  const seasons: Season[] = Object.keys(episodesByKey)
    .map(Number)
    .filter((n) => Number.isFinite(n))
    .sort((a, b) => a - b)
    .map((num) => ({
      number: num,
      name: seasonNames.get(num) ?? `Season ${num}`,
      episodes: (episodesByKey[String(num)] ?? [])
        .map((e) => normalizeEpisode(e, seriesId, num))
        .sort((a, b) => a.episodeNum - b.episodeNum),
    }));

  const info = raw?.info ?? {};
  const name = info.name || fallback?.name || '';

  return {
    id: seriesId,
    name,
    displayName: cleanTitle(name),
    posterUrl: posterOrNull(info.cover) ?? fallback?.posterUrl ?? null,
    plot: info.plot || fallback?.plot || '',
    seasons,
  };
}
