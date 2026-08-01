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
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useCatalogue } from '@/store/catalogue';
import { useProgress, movieKey } from '@/store/progress';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { PosterGrid } from '@/ui/PosterGrid';
import { Layout, OVERSCAN, Palette, Type } from '@/ui/platform';

const ALL = '__all__';

export default function MoviesScreen() {
  const router = useRouter();
  const data = useCatalogue((s) => s.data);
  const loading = useCatalogue((s) => s.loading);
  const entries = useProgress((s) => s.entries);
  const [categoryId, setCategoryId] = useState<string>(ALL);

  const movies = useMemo(() => {
    const all = data?.movies ?? [];
    return categoryId === ALL ? all : all.filter((m) => m.categoryId === categoryId);
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

  return (
    <View style={styles.flex}>
      <FocusSection autoFocus style={styles.railWrap}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.rail}
        >
          <CategoryChip
            label="All"
            active={categoryId === ALL}
            onPress={() => setCategoryId(ALL)}
          />
          {categories.map((c) => (
            <CategoryChip
              key={c.id}
              label={c.name}
              active={categoryId === c.id}
              onPress={() => setCategoryId(c.id)}
            />
          ))}
        </ScrollView>
      </FocusSection>

      <PosterGrid
        items={items}
        onSelect={(i) => router.push(`/movie/${movies[i].id}`)}
        emptyMessage={loading ? 'Loading your library…' : 'No movies in this category.'}
      />
    </View>
  );
}

function CategoryChip({
  label,
  active,
  onPress,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Focusable onPress={onPress} showFocusRing={false} style={styles.chipOuter}>
      {({ focused }) => (
        <View
          style={[
            styles.chip,
            active && styles.chipActive,
            focused && styles.chipFocused,
          ]}
        >
          <Text style={[styles.chipText, active && styles.chipTextActive]}>
            {label}
          </Text>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Palette.background },
  railWrap: { paddingTop: OVERSCAN.vertical },
  rail: { paddingHorizontal: OVERSCAN.horizontal, gap: 8 },
  chipOuter: { marginRight: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Palette.surface,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: Palette.surfaceRaised },
  chipFocused: { borderColor: Palette.focus },
  chipText: { color: Palette.textSecondary, fontSize: Type.caption },
  chipTextActive: { color: Palette.text, fontWeight: '600' },
});
