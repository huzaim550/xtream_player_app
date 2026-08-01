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

export interface Catalogue {
  movies: Movie[];
  series: Series[];
  movieCategories: Category[];
  /** The server emits a single series bucket, so this is rarely worth a rail. */
  seriesCategories: Category[];
  fetchedAt: number;
}
