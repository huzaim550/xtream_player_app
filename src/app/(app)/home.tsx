/**
 * Home: a featured banner, then a stack of rows.
 *
 * Built as a FlatList of row descriptors rather than a ScrollView of rows. With
 * a category per row and a poster list inside each, a ScrollView mounts every
 * card in the library on first paint; a FlatList mounts the two or three rows
 * that are actually on screen. It also gives us pull-to-refresh for free.
 *
 * Continue Watching renders straight from the progress store, which carries a
 * denormalised title/poster/extension per entry -- so it draws (and plays) with
 * no API call at all, including on a cold start with no network.
 */

import { useRouter } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useCatalogue } from '@/store/catalogue';
import { useDownloads } from '@/store/downloads';
import { useFavorites } from '@/store/favorites';
import { continueWatchingFrom, useProgress, movieKey } from '@/store/progress';
import { useSession } from '@/store/session';
import { Hero, type HeroItem } from '@/ui/Hero';
import { MediaRow, type MediaRowItem } from '@/ui/MediaRow';
import { SkeletonHome } from '@/ui/Skeleton';
import { TopTenRow } from '@/ui/TopTenRow';
import { OVERSCAN, Palette, Type } from '@/ui/platform';
import type { Movie, Series } from '@/types/domain';

const RECENT_COUNT = 20;
const HERO_COUNT = 5;

type Row =
  | { type: 'row'; key: string; title: string; items: MediaRowItem[]; onSelect: (i: number) => void }
  | { type: 'topten'; key: string; title: string; items: MediaRowItem[]; onSelect: (i: number) => void };

export default function HomeScreen() {
  const router = useRouter();
  const session = useSession((s) => s.session);
  const data = useCatalogue((s) => s.data);
  const loading = useCatalogue((s) => s.loading);
  const refresh = useCatalogue((s) => s.refresh);
  const entries = useProgress((s) => s.entries);
  const favMovies = useFavorites((s) => s.movies);
  const favSeries = useFavorites((s) => s.series);
  const toggleFavorite = useFavorites((s) => s.toggle);
  const downloads = useDownloads((s) => s.entries);
  const [refreshing, setRefreshing] = useState(false);

  // Derived from `entries` itself, not from the store's continueWatching()
  // getter -- see the note in src/store/downloads.ts. This is what re-renders
  // the row as progress is written.
  const resume = useMemo(() => continueWatchingFrom(entries), [entries]);

  const recent = useMemo(() => {
    // Movies only: the server fakes `last_modified` on series with the current
    // time, so there is no real recency signal for them to sort by.
    const movies = [...(data?.movies ?? [])];
    return movies.sort((a, b) => b.addedAt - a.addedAt).slice(0, RECENT_COUNT);
  }, [data]);

  const openMovie = useCallback((id: number) => router.push(`/movie/${id}`), [router]);
  const openSeries = useCallback((id: number) => router.push(`/series/${id}`), [router]);

  /**
   * Featured titles: newest movies and series that actually have artwork,
   * interleaved so the banner is not five films in a row. `''` means no
   * artwork, and a hero built around a placeholder box is worse than no hero.
   */
  const heroItems = useMemo<HeroItem[]>(() => {
    if (!data) return [];
    const movies = [...data.movies]
      .filter((m) => m.posterUrl)
      .sort((a, b) => b.addedAt - a.addedAt);
    const series = data.series.filter((s) => s.posterUrl);

    const out: HeroItem[] = [];
    for (let i = 0; out.length < HERO_COUNT && (i < movies.length || i < series.length); i++) {
      if (movies[i]) out.push(heroFromMovie(movies[i], favMovies.has(movies[i].id)));
      if (out.length < HERO_COUNT && series[i]) {
        out.push(heroFromSeries(series[i], favSeries.has(series[i].id)));
      }
    }
    return out;
  }, [data, favMovies, favSeries]);

  /**
   * The numbered row.
   *
   * The server offers nothing to rank by -- ratings are hardcoded "0" in every
   * list response and series `last_modified` is always now -- so this ranks
   * what *this user* has watched and saved, and says so in the heading. When
   * there is no history yet it falls back to newest, headed "Trending now".
   */
  const topTen = useMemo(() => {
    if (!data) return null;
    const byId = new Map(data.movies.map((m) => [m.id, m]));

    const watched = Object.values(entries)
      .filter((e) => e.kind === 'movie')
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .map((e) => byId.get(Number(e.id)))
      .filter((m): m is Movie => Boolean(m));

    const saved = data.movies.filter((m) => favMovies.has(m.id));

    const seen = new Set<number>();
    const ranked: Movie[] = [];
    for (const m of [...watched, ...saved]) {
      if (seen.has(m.id)) continue;
      seen.add(m.id);
      ranked.push(m);
    }

    const personal = ranked.length >= 3;
    const list = personal ? ranked.slice(0, 10) : recent.slice(0, 10);
    return {
      title: personal ? 'Top 10 for you' : 'Trending now',
      movies: list,
    };
  }, [data, entries, favMovies, recent]);

  const rows = useMemo<Row[]>(() => {
    if (!data) return [];
    const out: Row[] = [];

    if (resume.length > 0) {
      out.push({
        type: 'row',
        key: 'continue',
        title: 'Continue watching',
        items: resume.map((e) => ({
          key: e.key,
          title: e.seriesName
            ? `${e.seriesName} · S${e.season}E${e.episodeNum}`
            : e.title,
          posterUrl: e.posterUrl,
          progress: e.durationSec > 0 ? e.positionSec / e.durationSec : undefined,
        })),
        onSelect: (i) => {
          const e = resume[i];
          // Both stores key on movieKey/episodeKey, so a downloaded title
          // resumes from disk here too rather than re-opening a stream.
          const dl = downloads[e.key];
          router.push({
            pathname: '/player',
            params: {
              kind: e.kind,
              id: e.id,
              ext: e.ext,
              title: e.title,
              seriesId: e.seriesId != null ? String(e.seriesId) : undefined,
              season: e.season != null ? String(e.season) : undefined,
              episodeNum: e.episodeNum != null ? String(e.episodeNum) : undefined,
              seriesName: e.seriesName,
              posterUrl: e.posterUrl ?? undefined,
              localUri: dl?.status === 'done' ? (dl.fileUri ?? undefined) : undefined,
            },
          });
        },
      });
    }

    if (topTen && topTen.movies.length > 0) {
      out.push({
        type: 'topten',
        key: 'topten',
        title: topTen.title,
        items: topTen.movies.map((m) => movieItem(m, entries, `top-${m.id}`)),
        onSelect: (i) => openMovie(topTen.movies[i].id),
      });
    }

    out.push({
      type: 'row',
      key: 'recent',
      title: 'Recently added',
      items: recent.map((m) => movieItem(m, entries, `recent-${m.id}`)),
      onSelect: (i) => openMovie(recent[i].id),
    });

    // Series rows. The server buckets every show into a single category
    // (xtream/library.py cat_for), so this is usually one row called "Series" --
    // but it is written per-category so it stays right if that ever changes.
    for (const c of data.seriesCategories) {
      const inCategory = data.series.filter((s) => s.categoryId === c.id);
      if (inCategory.length === 0) continue;
      out.push({
        type: 'row',
        key: `sc-${c.id}`,
        title: data.seriesCategories.length === 1 ? 'Series' : c.name,
        items: inCategory.map((s) => ({
          key: `s-${s.id}`,
          title: s.displayName,
          posterUrl: s.posterUrl,
        })),
        onSelect: (i) => openSeries(inCategory[i].id),
      });
    }

    for (const c of data.movieCategories) {
      const inCategory = data.movies.filter((m) => m.categoryId === c.id);
      if (inCategory.length === 0) continue;
      out.push({
        type: 'row',
        key: `mc-${c.id}`,
        title: c.name,
        items: inCategory.map((m) => movieItem(m, entries, `${c.id}-${m.id}`)),
        onSelect: (i) => openMovie(inCategory[i].id),
      });
    }

    return out;
  }, [data, resume, topTen, recent, entries, downloads, router, openMovie, openSeries]);

  const onRefresh = useCallback(async () => {
    if (!session) return;
    setRefreshing(true);
    try {
      // `force` is what bypasses the 300s soft TTL that normally makes a
      // repeat refresh a no-op.
      await refresh(session, { force: true });
    } catch {
      // The store keeps the previous catalogue and surfaces its own error
      // state; a failed pull should not throw out of here.
    } finally {
      setRefreshing(false);
    }
  }, [session, refresh]);

  if (!data && loading) return <SkeletonHome />;
  if (!data) {
    return (
      <Text style={styles.status}>
        Nothing saved yet. Check your connection and pull down to retry.
      </Text>
    );
  }

  return (
    <FlatList
      data={rows}
      keyExtractor={(r) => r.key}
      // Clipped subviews cannot hold focus, and a dropped focus target reads
      // as a frozen screen on a D-pad.
      removeClippedSubviews={false}
      initialNumToRender={3}
      windowSize={5}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={Palette.brand}
          colors={[Palette.brand]}
          progressBackgroundColor={Palette.surface}
        />
      }
      ListHeaderComponent={
        <Hero
          items={heroItems}
          preferFocus={resume.length === 0}
          onPlay={(item) => {
            // Series have no playable stream of their own -- send those to the
            // detail screen to pick an episode.
            if (item.kind === 'series') {
              openSeries(item.id);
              return;
            }
            const movie = data.movies.find((m) => m.id === item.id);
            if (!movie) return;
            router.push({
              pathname: '/player',
              params: {
                kind: 'movie',
                id: String(movie.id),
                ext: movie.ext,
                title: movie.name,
                posterUrl: movie.posterUrl ?? undefined,
              },
            });
          }}
          onOpen={(item) =>
            item.kind === 'movie' ? openMovie(item.id) : openSeries(item.id)
          }
          onToggleSave={(item) => toggleFavorite(item.kind, item.id)}
        />
      }
      renderItem={({ item, index }) =>
        item.type === 'topten' ? (
          <TopTenRow title={item.title} items={item.items} onSelect={item.onSelect} />
        ) : (
          <MediaRow
            title={item.title}
            items={item.items}
            onSelect={item.onSelect}
            preferFocus={resume.length > 0 && index === 0}
          />
        )
      }
    />
  );
}

function movieItem(
  m: Movie,
  entries: Record<string, { finished: boolean }>,
  key: string,
): MediaRowItem {
  return {
    key,
    title: m.displayName,
    posterUrl: m.posterUrl,
    qualityLabel: m.qualityLabel,
    watched: entries[movieKey(m.id)]?.finished,
  };
}

function heroFromMovie(m: Movie, saved: boolean): HeroItem {
  return {
    key: `hm-${m.id}`,
    kind: 'movie',
    id: m.id,
    title: m.displayName,
    posterUrl: m.posterUrl,
    // The list response hardcodes year/genre/rating to empty strings, so
    // quality and codec are the only real facts available before get_vod_info.
    tags: [m.qualityLabel, m.videoCodec].filter((t): t is string => Boolean(t)),
    saved,
  };
}

function heroFromSeries(s: Series, saved: boolean): HeroItem {
  return {
    key: `hs-${s.id}`,
    kind: 'series',
    id: s.id,
    title: s.displayName,
    posterUrl: s.posterUrl,
    tags: ['Series'],
    saved,
  };
}

const styles = StyleSheet.create({
  content: { paddingBottom: OVERSCAN.vertical },
  status: {
    color: Palette.textMuted,
    fontSize: Type.body,
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: OVERSCAN.horizontal,
  },
});
