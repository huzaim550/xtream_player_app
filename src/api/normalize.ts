/**
 * The boundary between the server's wire format and the app's domain types.
 *
 * Every string-that-is-really-a-number, every ''-that-means-null, and every
 * ordering hazard is resolved here and nowhere else.
 */

import { NotFoundError } from './errors';
import type {
  Category,
  Channel,
  Episode,
  Movie,
  MovieDetail,
  Programme,
  Season,
  Series,
  SeriesDetail,
} from '@/types/domain';
import type {
  RawCategory,
  RawEpgListing,
  RawEpisode,
  RawLiveStream,
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

const B64_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

/**
 * Decode the base64 the guide arrives in, as UTF-8.
 *
 * Written out rather than reached for, because the two obvious shortcuts are
 * both wrong here:
 *
 *  - `atob` exists on Hermes but decodes to latin1, so every accented
 *    programme title ("Météo", "Nachrichten für Sie") comes out as mojibake --
 *    which is precisely the failure xtream/epg.py warns about in the comment
 *    above programme_json, just moved one step downstream.
 *  - `Buffer` is a Node global. React Native does not have one, and pulling in
 *    a polyfill for eleven lines of arithmetic is not a trade worth making.
 *
 * So: base64 to bytes, then bytes to a string by hand. Anything that is not
 * valid base64 decodes to '' rather than throwing -- a malformed programme
 * title should leave a row blank, never take the Live screen down with it.
 */
export function decodeBase64Utf8(input: string): string {
  const clean = (input ?? '').replace(/[^A-Za-z0-9+/]/g, '');
  if (!clean) return '';

  const bytes: number[] = [];
  for (let i = 0; i < clean.length; i += 4) {
    // A trailing group shorter than 4 characters is padding that was stripped
    // above; the missing sextets read as 0 and contribute no byte.
    let chunk = 0;
    let have = 0;
    for (let j = 0; j < 4; j++) {
      const ch = clean[i + j];
      // `ch === undefined` must be tested on its own: indexOf('') returns 0,
      // not -1, so a missing character would otherwise read as 'A' and
      // contribute a phantom byte -- decoding "Sport" as "Sport ".
      const idx = ch === undefined ? -1 : B64_ALPHABET.indexOf(ch);
      chunk = (chunk << 6) | (idx < 0 ? 0 : idx);
      if (idx >= 0) have++;
    }
    // n sextets carry n-1 whole bytes.
    for (let k = 0; k < have - 1; k++) {
      bytes.push((chunk >> (16 - 8 * k)) & 0xff);
    }
  }

  // UTF-8 by hand. Continuation bytes that never arrive, or a lead byte we do
  // not understand, become U+FFFD rather than derailing the whole string.
  let out = '';
  for (let i = 0; i < bytes.length; ) {
    const b = bytes[i];
    let cp: number;
    let len: number;
    if (b < 0x80) {
      cp = b;
      len = 1;
    } else if (b >= 0xc0 && b < 0xe0) {
      cp = b & 0x1f;
      len = 2;
    } else if (b >= 0xe0 && b < 0xf0) {
      cp = b & 0x0f;
      len = 3;
    } else if (b >= 0xf0 && b < 0xf8) {
      cp = b & 0x07;
      len = 4;
    } else {
      out += '�';
      i += 1;
      continue;
    }
    if (i + len > bytes.length) {
      out += '�';
      break;
    }
    for (let k = 1; k < len; k++) {
      cp = (cp << 6) | (bytes[i + k] & 0x3f);
    }
    out += String.fromCodePoint(cp);
    i += len;
  }
  return out;
}

/**
 * A live channel.
 *
 * `stream_icon` gets `posterOrNull` like every other artwork field, but it is
 * not the same kind of URL -- see the comment on `Channel.logoUrl`.
 */
export function normalizeChannel(raw: RawLiveStream): Channel {
  return {
    id: raw.stream_id,
    name: (raw.name ?? '').trim() || 'Channel',
    categoryId: String(raw.category_id),
    logoUrl: posterOrNull(raw.stream_icon),
    // Read, never constructed: this is the key that binds a channel to a
    // programme, and inventing it would silently unbind the guide.
    epgChannelId: raw.epg_channel_id ?? '',
  };
}

/**
 * One programme.
 *
 * The timestamps are the string fields, not the formatted `start`/`end` ones:
 * those are rendered in the server's UTC and would need parsing back out of a
 * display format, while `start_timestamp` is already the unix second we want.
 *
 * A channel with no real guide data still gets programmes -- the server fills
 * in placeholders titled after the channel itself (xtream/epg.py
 * _placeholders). There is no flag for that in this payload, so the Live screen
 * distinguishes them the only way it can: a placeholder's title equals the
 * channel name. That check belongs to the caller, not here.
 */
export function normalizeProgramme(raw: RawEpgListing): Programme {
  return {
    title: decodeBase64Utf8(raw.title),
    description: decodeBase64Utf8(raw.description),
    startSec: Number(raw.start_timestamp) || 0,
    stopSec: Number(raw.stop_timestamp) || 0,
  };
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
