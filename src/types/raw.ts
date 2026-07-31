/**
 * Exact shapes the Xtream server sends, warts and all.
 *
 * The server is Xtream Codes-compatible, which means numbers arrive as strings,
 * ids change type between endpoints, and failure is reported inside a 200. Model
 * that faithfully here; `normalize.ts` is the only place allowed to clean it up.
 *
 * Source of truth: xtream/routes_player.py in the server repo.
 */

/** `player_api.php` with no `action` — the handshake. */
export interface RawUserInfo {
  username: string;
  password: string;
  message: string;
  /** 1 = ok. Arrives as a number, but a 0 here comes back with HTTP 200. */
  auth: number;
  status: 'Active' | 'Expired' | 'Disabled' | string;
  exp_date: string;
  is_trial: string;
  active_cons: string;
  created_at: string;
  max_connections: string;
  allowed_output_formats: string[];
}

export interface RawServerInfo {
  url: string;
  /** The *public* port (443), not the internal Flask one. */
  port: string;
  https_port: string;
  server_protocol: string;
  rtmp_port: string;
  timezone: string;
  timestamp_now: number;
  time_now: string;
}

export interface RawHandshake {
  user_info: RawUserInfo;
  server_info?: RawServerInfo;
}

/** The auth-failure envelope. Delivered with HTTP 200 — never 401. */
export interface RawAuthFailure {
  user_info: { auth: number; status: string; exp_date?: string };
}

export interface RawCategory {
  category_id: string;
  category_name: string;
  parent_id: number;
}

/** `get_vod_streams`. Note plot/cast/genre/year/rating are hardcoded empty here. */
export interface RawMovie {
  num: number;
  name: string;
  title: string;
  year: string;
  stream_type: 'movie';
  stream_id: number;
  /** Full absolute URL with an HMAC token, or '' when there is no artwork. */
  stream_icon: string;
  rating: string;
  rating_5based: number;
  added: string;
  plot: string;
  cast: string;
  director: string;
  genre: string;
  release_date: string;
  is_adult: string;
  category_id: string;
  category_ids: number[];
  container_extension: string;
  custom_sid: string;
  direct_source: string;
  /** Non-standard, parsed from the filename: "1080p · x265 · BluRay". */
  video_quality: string;
  video_codec: string;
}

export interface RawVodInfo {
  info: {
    name?: string;
    description?: string;
    /** May have the quality label appended after a blank line. */
    plot?: string;
    genre?: string;
    cast?: string;
    director?: string;
    releasedate?: string;
    release_date?: string;
    rating?: string;
    rating_5based?: number;
    duration?: string;
    duration_secs?: number;
    backdrop_path?: string[];
    youtube_trailer?: string;
    tmdb_id?: string;
    video_quality?: string;
    video_codec?: string;
    audio_codec?: string;
    movie_image?: string;
    cover_big?: string;
  };
  /** Empty object when the id is unknown — with HTTP 200. */
  movie_data: {
    stream_id?: number;
    name?: string;
    title?: string;
    year?: string;
    container_extension?: string;
    added?: string;
    category_id?: string;
    category_ids?: number[];
    custom_sid?: string;
    direct_source?: string;
  };
}

export interface RawSeries {
  num: number;
  name: string;
  title: string;
  year: string;
  stream_type: 'series';
  series_id: number;
  cover: string;
  /** Unlike movies, this one is actually populated in the list response. */
  plot: string;
  cast: string;
  director: string;
  genre: string;
  release_date: string;
  releaseDate: string;
  /** Always "now" — the server fakes it. Not a usable recency signal. */
  last_modified: string;
  rating: string;
  rating_5based: number;
  backdrop_path: string[];
  youtube_trailer: string;
  episode_run_time: string;
  category_id: string;
  category_ids: number[];
}

export interface RawEpisode {
  /** A string here, unlike movie stream_id. It is a URL path segment. */
  id: string;
  episode_num: number;
  title: string;
  season: number;
  container_extension: string;
  added: string;
  custom_sid: string;
  direct_source: string;
  info: { video_quality?: string };
}

export interface RawSeriesInfo {
  seasons: {
    season_number: number;
    name: string;
    air_date: string;
    episode_count: number;
    id: number;
    overview: string;
    cover: string;
    cover_big: string;
  }[];
  info: Partial<RawSeries> & { cover?: string };
  /** Keys are strings: {"1": [...], "2": [...]}. Sort them numerically. */
  episodes: Record<string, RawEpisode[]>;
}

/** `GET /` — a real readiness probe, 503 when degraded. */
export interface RawHealth {
  status: 'ok' | 'degraded' | 'setup';
  r2: 'ok' | 'unreachable' | 'unconfigured';
  library: {
    warm: boolean;
    titles: number;
    movies: number;
    series: number;
    live: number;
    age_secs: number;
  };
  epg: {
    sources: number;
    channels: number;
    programmes: number;
    fetched_at: number | null;
    last_error: string | null;
  };
}
