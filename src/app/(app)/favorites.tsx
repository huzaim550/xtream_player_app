/**
 * Saved titles.
 *
 * Favourites store ids only. Unlike watch progress, an id that no longer
 * resolves against the catalogue is harmless -- filter it out of the view and
 * keep it, in case the title comes back.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';
import { useCatalogue } from '@/store/catalogue';
import { useFavorites } from '@/store/favorites';
import { MediaRow } from '@/ui/MediaRow';
import { OVERSCAN, Palette, Type } from '@/ui/platform';

export default function FavoritesScreen() {
  const router = useRouter();
  const data = useCatalogue((s) => s.data);
  const favMovies = useFavorites((s) => s.movies);
  const favSeries = useFavorites((s) => s.series);

  const movies = useMemo(
    () => (data?.movies ?? []).filter((m) => favMovies.has(m.id)),
    [data, favMovies],
  );
  const series = useMemo(
    () => (data?.series ?? []).filter((s) => favSeries.has(s.id)),
    [data, favSeries],
  );

  if (movies.length === 0 && series.length === 0) {
    return (
      <Text style={styles.hint}>
        Nothing saved yet. Open any title and choose Save to keep it here.
      </Text>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <MediaRow
        title="Movies"
        preferFocus
        items={movies.map((m) => ({
          key: `m-${m.id}`,
          title: m.displayName,
          posterUrl: m.posterUrl,
          qualityLabel: m.qualityLabel,
        }))}
        onSelect={(i) => router.push(`/movie/${movies[i].id}`)}
      />
      <MediaRow
        title="Series"
        items={series.map((s) => ({
          key: `s-${s.id}`,
          title: s.displayName,
          posterUrl: s.posterUrl,
        }))}
        onSelect={(i) => router.push(`/series/${series[i].id}`)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingVertical: OVERSCAN.vertical },
  hint: {
    color: Palette.textMuted,
    fontSize: Type.body,
    textAlign: 'center',
    marginTop: 60,
    paddingHorizontal: OVERSCAN.horizontal,
  },
});
