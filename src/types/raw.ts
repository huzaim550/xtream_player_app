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

/**
 * Ad settings, for this account, as decided by the server.
 *
 * Optional and Manzar-specific: the server omits the whole key unless ads are
 * switched on for this user, so its absence is the normal case and means "no
 * ads". Everything here is already resolved server-side -- there is no
 * enabled/disabled flag to interpret, because a payload only exists when the
 * answer was yes.
 */
export interface RawAdsConfig {
  banner_surfaces?: unknown;
  player_pre_roll?: unknown;
  player_mid_roll_breaks?: unknown;
  player_min_title_seconds?: unknown;
  player_min_seconds_between?: unknown;
  interstitial_every_n_opens?: unknown;
  interstitial_min_seconds?: unknown;
}

export interface RawHandshake {
  user_info: RawUserInfo;
  server_info?: RawServerInfo;
  /** Absent for every account without ads, and for every older server. */
  manzar_ads?: RawAdsConfig;
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

/**
 * `get_live_streams`.
 *
 * Unlike movies and series, a live channel is not a file in the bucket — it is
 * a line in `live.m3u`, so everything here comes from that playlist's EXTINF
 * attributes (xtream/library.py parse_live_text).
 */
export interface RawLiveStream {
  num: number;
  name: string;
  stream_type: 'live';
  stream_id: number;
  /**
   * `tvg-logo` from the playlist, or '' when the line carried none.
   *
   * NOT one of our poster URLs: this is an arbitrary third-party address chosen
   * by whoever wrote the m3u, with no HMAC token and no guarantee of https.
   */
  stream_icon: string;
  /** Matches the `<channel id>` in /xmltv.php. Always "ch<stream_id>". */
  epg_channel_id: string;
  added: string;
  is_adult: string;
  thumbnail: string;
  category_id: string;
  category_ids: number[];
  custom_sid: string;
  /** Hardcoded 0 — this server has no catch-up. */
  tv_archive: number;
  tv_archive_duration: number;
  /** The channel's real upstream URL. Deliberately not what we play; see the
   *  comment on liveStreamUrl in api/streamUrl.ts. */
  direct_source: string;
}

/**
 * One programme from `get_short_epg` / `get_simple_data_table`.
 *
 * `title` and `description` are **base64**, not plain text (xtream/epg.py
 * programme_json says so outright: apps decode them blindly and render mojibake
 * if you send raw strings). Everything numeric is a string, as usual.
 */
export interface RawEpgListing {
  id: string;
  epg_id: string;
  /** base64 of UTF-8. */
  title: string;
  lang: string;
  start: string;
  end: string;
  /** base64 of UTF-8. */
  description: string;
  channel_id: string;
  start_timestamp: string;
  stop_timestamp: string;
  now_playing: number;
  has_archive: number;
}

export interface RawShortEpg {
  epg_listings: RawEpgListing[];
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
