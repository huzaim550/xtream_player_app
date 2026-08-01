/**
 * Home: Continue Watching, then Recently Added, then a row per movie category.
 *
 * Continue Watching renders straight from the progress store, which carries a
 * denormalised title/poster/extension per entry -- so it draws (and plays) with
 * no API call at all, including on a cold start with no network.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useCatalogue } from '@/store/catalogue';
import { useProgress, movieKey } from '@/store/progress';
import { MediaRow } from '@/ui/MediaRow';
import { OVERSCAN, Palette, Type } from '@/ui/platform';

const RECENT_COUNT = 20;

export default function HomeScreen() {
  const router = useRouter();
  const data = useCatalogue((s) => s.data);
  const loading = useCatalogue((s) => s.loading);
  const continueWatching = useProgress((s) => s.continueWatching);
  const entries = useProgress((s) => s.entries);

  // `entries` is in the dep list so the row re-renders as progress is written.
  const resume = useMemo(() => continueWatching(), [continueWatching, entries]);

  const recent = useMemo(() => {
    // Movies only: the server fakes `last_modified` on series with the current
    // time, so there is no real recency signal for them to sort by.
    const movies = [...(data?.movies ?? [])];
    return movies.sort((a, b) => b.addedAt - a.addedAt).slice(0, RECENT_COUNT);
  }, [data]);

  const byCategory = useMemo(() => {
    if (!data) return [];
    return data.movieCategories
      .map((c) => ({
        category: c,
        movies: data.movies.filter((m) => m.categoryId === c.id),
      }))
      .filter((g) => g.movies.length > 0);
  }, [data]);

  if (!data && loading) {
    return <Text style={styles.status}>Loading your library…</Text>;
  }
  if (!data) {
    return <Text style={styles.status}>Nothing saved yet. Check your connection.</Text>;
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      {resume.length > 0 ? (
        <MediaRow
          title="Continue watching"
          preferFocus
          items={resume.map((e) => ({
            key: e.key,
            title: e.seriesName
              ? `${e.seriesName} · S${e.season}E${e.episodeNum}`
              : e.title,
            posterUrl: e.posterUrl,
            progress: e.durationSec > 0 ? e.positionSec / e.durationSec : undefined,
          }))}
          onSelect={(i) => {
            const e = resume[i];
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
              },
            });
          }}
        />
      ) : null}

      <MediaRow
        title="Recently added"
        preferFocus={resume.length === 0}
        items={recent.map((m) => {
          const p = entries[movieKey(m.id)];
          return {
            key: `recent-${m.id}`,
            title: m.displayName,
            posterUrl: m.posterUrl,
            qualityLabel: m.qualityLabel,
            watched: p?.finished,
          };
        })}
        onSelect={(i) => router.push(`/movie/${recent[i].id}`)}
      />

      {byCategory.map((group) => (
        <MediaRow
          key={group.category.id}
          title={group.category.name}
          items={group.movies.map((m) => ({
            key: `${group.category.id}-${m.id}`,
            title: m.displayName,
            posterUrl: m.posterUrl,
            qualityLabel: m.qualityLabel,
            watched: entries[movieKey(m.id)]?.finished,
          }))}
          onSelect={(i) => router.push(`/movie/${group.movies[i].id}`)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: OVERSCAN.vertical },
  status: {
    color: Palette.textMuted,
    fontSize: Type.body,
    textAlign: 'center',
    marginTop: 60,
  },
});
