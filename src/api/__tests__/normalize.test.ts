/**
 * The wire-shape boundary.
 *
 * Every case below is a real hazard in this server's responses, documented in
 * AGENTS.md. They share a failure mode: none of them throw. Get one wrong and
 * the app renders confidently wrong data -- seasons in the order 1, 10, 2, or a
 * quality label glued onto the end of a plot -- which is exactly the kind of
 * bug a typechecker cannot see.
 */

import { NotFoundError } from '../errors';
import {
  cleanTitle,
  normalizeCategory,
  normalizeMovie,
  normalizeMovieDetail,
  normalizeSeries,
  normalizeSeriesDetail,
} from '../normalize';
import type { RawMovie, RawSeries, RawSeriesInfo, RawVodInfo } from '@/types/raw';

const rawMovie = (over: Partial<RawMovie> = {}): RawMovie =>
  ({
    num: 1,
    name: 'The Movie',
    title: 'The Movie',
    stream_id: 101,
    stream_icon: 'https://s/poster/movie/101?t=abc',
    added: '1700000000',
    category_id: '3',
    container_extension: 'mkv',
    video_quality: '1080p',
    video_codec: 'x265',
    ...over,
  }) as RawMovie;

describe('cleanTitle', () => {
  it('strips scene tags but keeps the real title', () => {
    expect(cleanTitle('The Movie (2019) 1080p BluRay x265 DTS')).toBe('The Movie (2019)');
  });

  it('replaces dots and underscores used as separators', () => {
    expect(cleanTitle('Some.Movie.Name.2020.720p.WEB-DL')).toBe('Some Movie Name 2020');
  });

  it('drops a trailing release-group tag', () => {
    expect(cleanTitle('Another Movie - RARBG')).toBe('Another Movie');
  });

  it('never returns empty, even when the name is nothing but noise', () => {
    // Falling through to '' would render a blank card with no way to tell what
    // it is; the original name is always more useful than nothing.
    expect(cleanTitle('1080p x265')).toBe('1080p x265');
  });
});

describe('normalizeMovie', () => {
  it("turns the server's empty-string poster into null", () => {
    // '' means "no artwork". Treating it as a URL gives a broken image box.
    expect(normalizeMovie(rawMovie({ stream_icon: '' })).posterUrl).toBeNull();
  });

  it('coerces `added` from a string to unix seconds', () => {
    expect(normalizeMovie(rawMovie()).addedAt).toBe(1700000000);
  });

  it('falls back to 0 when `added` is not a number, rather than NaN', () => {
    // NaN would poison the "Recently added" sort silently.
    expect(normalizeMovie(rawMovie({ added: 'nope' })).addedAt).toBe(0);
  });

  it('defaults a missing container extension to mp4', () => {
    expect(normalizeMovie(rawMovie({ container_extension: '' })).ext).toBe('mp4');
  });

  it('stringifies category_id so it compares against Category.id', () => {
    const m = normalizeMovie(rawMovie({ category_id: 7 as unknown as string }));
    expect(m.categoryId).toBe('7');
  });

  it('nulls empty quality and codec instead of rendering blank badges', () => {
    const m = normalizeMovie(rawMovie({ video_quality: '', video_codec: '' }));
    expect(m.qualityLabel).toBeNull();
    expect(m.videoCodec).toBeNull();
  });
});

describe('normalizeCategory / normalizeSeries', () => {
  it('stringifies a numeric category id', () => {
    const c = normalizeCategory({ category_id: 4, category_name: 'Action' } as never);
    expect(c).toEqual({ id: '4', name: 'Action' });
  });

  it('defaults a missing series plot to an empty string', () => {
    const s = normalizeSeries({
      series_id: 5,
      name: 'A Show',
      category_id: '1',
      cover: '',
    } as RawSeries);
    expect(s.plot).toBe('');
    expect(s.posterUrl).toBeNull();
  });
});

describe('normalizeMovieDetail', () => {
  it('throws NotFoundError for an unknown id', () => {
    // The server answers an unknown vod_id with HTTP 200 and
    // {"info":{},"movie_data":{}} -- the status code tells us nothing.
    expect(() => normalizeMovieDetail({ info: {}, movie_data: {} } as RawVodInfo)).toThrow(
      NotFoundError,
    );
  });

  it('splits the quality label back off the end of the plot', () => {
    // The server appends its quality label to the plot because that is the one
    // field every player renders. We have a badge for it.
    const detail = normalizeMovieDetail({
      info: { name: 'X', plot: 'A real plot.\n\n1080p', video_quality: '1080p' },
      movie_data: { stream_id: 9, name: 'X', container_extension: 'mp4' },
    } as unknown as RawVodInfo);
    expect(detail.plot).toBe('A real plot.');
  });

  it('leaves the plot alone when it does not end with the label', () => {
    const detail = normalizeMovieDetail({
      info: { name: 'X', plot: 'A real plot.', video_quality: '1080p' },
      movie_data: { stream_id: 9, name: 'X', container_extension: 'mp4' },
    } as unknown as RawVodInfo);
    expect(detail.plot).toBe('A real plot.');
  });

  it('fills gaps from the cached list entry', () => {
    const fallback = normalizeMovie(rawMovie());
    const detail = normalizeMovieDetail(
      {
        info: { name: 'The Movie' },
        movie_data: { stream_id: 101, name: 'The Movie', container_extension: '' },
      } as unknown as RawVodInfo,
      fallback,
    );
    expect(detail.ext).toBe('mkv');
    expect(detail.posterUrl).toBe(fallback.posterUrl);
    expect(detail.qualityLabel).toBe('1080p');
  });
});

describe('normalizeSeriesDetail', () => {
  const info = (): RawSeriesInfo =>
    ({
      info: { name: 'A Show', cover: '', plot: 'Plot' },
      // Season keys are STRINGS, and the server does not send them sorted.
      seasons: [
        { season_number: 2, name: 'Season 2' },
        { season_number: 10, name: 'Season 10' },
        { season_number: 1, name: 'Season 1' },
      ],
      episodes: {
        '10': [{ id: '1010', episode_num: 1, title: 'S10E1', container_extension: 'mkv' }],
        '2': [{ id: '201', episode_num: 1, title: 'S2E1', container_extension: 'mkv' }],
        '1': [
          { id: '103', episode_num: 3, title: 'Third', container_extension: 'mkv' },
          { id: '101', episode_num: 1, title: 'First', container_extension: 'mkv' },
        ],
      },
    }) as unknown as RawSeriesInfo;

  it('sorts seasons numerically, not lexically', () => {
    // A default string sort gives 1, 10, 2 -- and ships looking plausible.
    const d = normalizeSeriesDetail(info(), 5);
    expect(d.seasons.map((s) => s.number)).toEqual([1, 2, 10]);
  });

  it('sorts episodes within a season by episode number', () => {
    const d = normalizeSeriesDetail(info(), 5);
    expect(d.seasons[0].episodes.map((e) => e.episodeNum)).toEqual([1, 3]);
  });

  it('keeps episode ids as strings', () => {
    // They are URL path segments; coercing to a number loses leading zeroes.
    const d = normalizeSeriesDetail(info(), 5);
    expect(d.seasons[0].episodes[0].id).toBe('101');
    expect(typeof d.seasons[0].episodes[0].id).toBe('string');
  });

  it('treats `episodes` as the source of truth for which seasons exist', () => {
    const raw = info();
    // A season named in seasons[] but with no episodes must not appear...
    raw.seasons = [...(raw.seasons ?? []), { season_number: 99, name: 'Ghost' } as never];
    const d = normalizeSeriesDetail(raw, 5);
    expect(d.seasons.map((s) => s.number)).toEqual([1, 2, 10]);
  });

  it('still shows a season that has episodes but no seasons[] entry', () => {
    // ...and the reverse: episodes present, metadata missing, gets a name.
    const raw = info();
    raw.seasons = [];
    const d = normalizeSeriesDetail(raw, 5);
    expect(d.seasons.map((s) => s.name)).toEqual(['Season 1', 'Season 2', 'Season 10']);
  });

  it('survives an empty response by returning no seasons', () => {
    const d = normalizeSeriesDetail({} as RawSeriesInfo, 5, {
      id: 5,
      name: 'Cached',
      displayName: 'Cached',
      categoryId: '1',
      posterUrl: null,
      plot: 'From cache',
    });
    expect(d.seasons).toEqual([]);
    expect(d.name).toBe('Cached');
  });
});
