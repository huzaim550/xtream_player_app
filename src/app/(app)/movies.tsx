/**
 * Movies, with a category rail.
 *
 * Cards show name, poster and quality label and nothing else -- not an
 * aesthetic choice: `get_vod_streams` hardcodes year, rating, plot, cast and
 * genre to empty strings, so those fields only exist after a `get_vod_info`
 * call on the detail screen.
 */

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCatalogue } from '@/store/catalogue';
import { useProgress, movieKey } from '@/store/progress';
import { ALL_CATEGORIES, CategoryChips } from '@/ui/CategoryChips';
import { PosterGrid } from '@/ui/PosterGrid';
import { Palette } from '@/ui/platform';

export default function MoviesScreen() {
  const router = useRouter();
  const data = useCatalogue((s) => s.data);
  const loading = useCatalogue((s) => s.loading);
  const entries = useProgress((s) => s.entries);
  const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORIES);

  const movies = useMemo(() => {
    const all = data?.movies ?? [];
    return categoryId === ALL_CATEGORIES
      ? all
      : all.filter((m) => m.categoryId === categoryId);
  }, [data, categoryId]);

  const items = useMemo(
    () =>
      movies.map((m) => {
        const p = entries[movieKey(m.id)];
        return {
          key: String(m.id),
          title: m.displayName,
          posterUrl: m.posterUrl,
          qualityLabel: m.qualityLabel,
          watched: p?.finished,
          progress:
            p && !p.finished && p.durationSec > 0
              ? p.positionSec / p.durationSec
              : undefined,
        };
      }),
    [movies, entries],
  );

  const categories = data?.movieCategories ?? [];

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const m of data?.movies ?? []) {
      out[m.categoryId] = (out[m.categoryId] ?? 0) + 1;
    }
    return out;
  }, [data]);

  return (
    <View style={styles.flex}>
      <CategoryChips
        categories={categories}
        selected={categoryId}
        onSelect={setCategoryId}
        counts={counts}
        totalCount={data?.movies.length}
      />

      <PosterGrid
        items={items}
        onSelect={(i) => router.push(`/movie/${movies[i].id}`)}
        emptyMessage={loading ? 'Loading your library…' : 'No movies in this category.'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Palette.background },
});
