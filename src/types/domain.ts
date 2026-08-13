/**
 * The shapes the app actually works with. Every coercion from the server's
 * wire format happens once, in `api/normalize.ts`. Nothing downstream of that
 * boundary should ever call parseInt on server data or check for '' posters.
 */

export interface Category {
  /** Kept as a string: it is both the API filter param and the join key. */
  id: string;
  name: string;
}

export interface Movie {
  id: number;
  /** As the server reports it — used for matching and search. */
  name: string;
  /** Release-name noise stripped. Display only; never match on this. */
  displayName: string;
  categoryId: string;
  /** null when the server sent '', i.e. there is no artwork. */
  posterUrl: string | null;
  /** Needed to build the stream URL. */
  ext: string;
  /** "1080p · x265 · BluRay" — the best playback diagnostic we get. */
  qualityLabel: string | null;
  videoCodec: string | null;
  /** Unix seconds. Real (R2 LastModified), unlike the series equivalent. */
  addedAt: number;
}

export interface Series {
  id: number;
  name: string;
  displayName: string;
  categoryId: string;
  posterUrl: string | null;
  plot: string;
}

export interface Episode {
  /** A string, because it is a URL path segment. */
  id: string;
  seriesId: number;
  season: number;
  episodeNum: number;
  title: string;
  ext: string;
  qualityLabel: string | null;
}

/** Minimal per-episode data threaded through the player route's `episodes`
 *  param, so it can offer next/previous episode across any number of hops
 *  with no further get_series_info call. */
export interface EpisodeNavEntry {
  id: string;
  ext: string;
  title: string;
  season: number;
  episodeNum: number;
}

export interface Season {
  number: number;
  name: string;
  episodes: Episode[];
}

export interface SeriesDetail {
  id: number;
  name: string;
  displayName: string;
  posterUrl: string | null;
  plot: string;
  /** Always ordered numerically — never by the server's string keys. */
  seasons: Season[];
}

export interface MovieDetail {
  id: number;
  name: string;
  displayName: string;
  ext: string;
  posterUrl: string | null;
  /** Quality label already split back out of the server's appended plot. */
  plot: string;
  genre: string;
  cast: string;
  director: string;
  releaseDate: string;
  rating: string;
  duration: string;
  qualityLabel: string | null;
  videoCodec: string | null;
  audioCodec: string | null;
}

/**
 * A live TV channel.
 *
 * Far thinner than a Movie, and that is the server's shape rather than an
 * omission: a channel is one line of `live.m3u`, so a name, a group and a logo
 * is all there is. Quality, plot and duration have no meaning here — what is on
 * right now comes from the guide instead (see `Programme` and store/epg.ts).
 */
export interface Channel {
  id: number;
  name: string;
  categoryId: string;
  /**
   * null when the playlist gave no `tvg-logo`.
   *
   * Unlike `Movie.posterUrl` this is a third-party address, not one served by
   * your own server — so it can be http (which the Play build blocks) or simply
   * dead, and the UI must render a channel with no logo as a normal case.
   */
  logoUrl: string | null;
  /** The guide key. Always "ch<id>" on this server, but read it, never build it. */
  epgChannelId: string;
}

/** One entry in the guide, with the base64 already decoded and the timestamps
 *  already numbers. Unix seconds, like everything else here. */
export interface Programme {
  title: string;
  description: string;
  startSec: number;
  stopSec: number;
}

export interface Session {
  baseUrl: string;
  username: string;
  password: string;
}

export interface AccountInfo {
  username: string;
  status: string;
  /** Unix seconds; 2147483647 means never. */
  expDate: number;
  maxConnections: number;
  activeConnections: number;
}

/**
 * The browsing screens that can carry a banner.
 *
 * Decided in the app, not on the server -- the per-account handshake flag this
 * used to mirror was removed. Adding a member here means adding it to SURFACES
 * in store/ads.ts and to adSurfaceFor in the (app) layout; nothing else reads
 * it, and a member missing from either is simply a screen with no banner.
 */
export type AdSurface = 'home' | 'movies' | 'series' | 'live' | 'search' | 'my_list';

/**
 * Ad settings for the signed-in account. Only exists when the server said this
 * user gets ads at all -- see store/ads.ts.
 */
export interface AdsConfig {
  bannerSurfaces: AdSurface[];
  /** 0 or 1: an interstitial after Play, before the picture starts. */
  preRoll: number;
  /** Breaks during a title, spread evenly. 1 = halfway. 0 = none. */
  midRollBreaks: number;
  /** Never interrupt a title shorter than this. */
  minTitleSeconds: number;
  minSecondsBetween: number;
  /** Interstitial while browsing, every N detail screens. 0 = off. */
  everyNOpens: number;
  /** Floor between any two interstitials of any kind. */
  interstitialMinSeconds: number;
}

export interface Catalogue {
  movies: Movie[];
  series: Series[];
  /**
   * Live channels. Empty until a `live.m3u` exists in the server's bucket, and
   * that is a perfectly normal state — the Live screen says so rather than
   * looking broken.
   */
  channels: Channel[];
  movieCategories: Category[];
  /** The server emits a single series bucket, so this is rarely worth a rail. */
  seriesCategories: Category[];
  /** Channel groups, from `group-title` in the playlist. */
  liveCategories: Category[];
  fetchedAt: number;
}
