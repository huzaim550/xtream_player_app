/**
 * Series.
 *
 * The category rail only appears when there is more than one category to pick
 * from. The server's library scanner allocates a single "Series" bucket
 * (xtream/library.py cat_for), so today `get_series_categories` returns exactly
 * one entry and a rail would be dead chrome -- but the screen no longer assumes
 * that, so it stays correct if the server's bucketing ever changes.
 */

import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useCatalogue } from '@/store/catalogue';
import { ALL_CATEGORIES, CategoryChips } from '@/ui/CategoryChips';
import { PosterGrid } from '@/ui/PosterGrid';
import { Palette } from '@/ui/platform';

export default function SeriesScreen() {
  const router = useRouter();
  const data = useCatalogue((s) => s.data);
  const loading = useCatalogue((s) => s.loading);
  const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORIES);

  const categories = data?.seriesCategories ?? [];
  const showRail = categories.length > 1;

  const series = useMemo(() => {
    const all = data?.series ?? [];
    return !showRail || categoryId === ALL_CATEGORIES
      ? all
      : all.filter((s) => s.categoryId === categoryId);
  }, [data, categoryId, showRail]);

  const items = useMemo(
    () =>
      series.map((s) => ({
        key: String(s.id),
        title: s.displayName,
        posterUrl: s.posterUrl,
      })),
    [series],
  );

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const s of data?.series ?? []) {
      out[s.categoryId] = (out[s.categoryId] ?? 0) + 1;
    }
    return out;
  }, [data]);

  return (
    <View style={styles.flex}>
      {showRail ? (
        <CategoryChips
          categories={categories}
          selected={categoryId}
          onSelect={setCategoryId}
          counts={counts}
          totalCount={data?.series.length}
        />
      ) : null}

      <PosterGrid
        items={items}
        onSelect={(i) => router.push(`/series/${series[i].id}`)}
        emptyMessage={loading ? 'Loading your library…' : 'No series in your library.'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Palette.background },
});
