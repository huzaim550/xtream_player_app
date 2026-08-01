/**
 * Series.
 *
 * No category rail here, deliberately: the server's library scanner allocates a
 * single "Series" bucket (xtream/library.py cat_for), so `get_series_categories`
 * returns exactly one entry and a rail would be dead chrome.
 */

import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useCatalogue } from '@/store/catalogue';
import { PosterGrid } from '@/ui/PosterGrid';

export default function SeriesScreen() {
  const router = useRouter();
  const data = useCatalogue((s) => s.data);
  const loading = useCatalogue((s) => s.loading);

  const series = data?.series ?? [];
  const items = useMemo(
    () =>
      series.map((s) => ({
        key: String(s.id),
        title: s.displayName,
        posterUrl: s.posterUrl,
      })),
    [series],
  );

  return (
    <PosterGrid
      items={items}
      onSelect={(i) => router.push(`/series/${series[i].id}`)}
      emptyMessage={loading ? 'Loading your library…' : 'No series in your library.'}
    />
  );
}
