/**
 * The horizontal category rail, shared by Movies and Series.
 *
 * Lifted out of movies.tsx so the two browse screens cannot drift apart. The
 * "All" chip is synthesised here rather than by each caller, since every use of
 * a category rail wants one.
 */

import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { Focusable } from './Focusable';
import { FocusSection } from './FocusSection';
import { Layout, OVERSCAN, Palette, Type } from './platform';
import type { Category } from '@/types/domain';

/** The sentinel category id meaning "no filter". */
export const ALL_CATEGORIES = '__all__';

export interface CategoryChipsProps {
  categories: Category[];
  selected: string;
  onSelect: (categoryId: string) => void;
  /** Counts shown on each chip, keyed by category id. */
  counts?: Record<string, number>;
  totalCount?: number;
}

export function CategoryChips({
  categories,
  selected,
  onSelect,
  counts,
  totalCount,
}: CategoryChipsProps) {
  return (
    <FocusSection autoFocus style={styles.wrap}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.rail}
      >
        <Chip
          label="All"
          count={totalCount}
          active={selected === ALL_CATEGORIES}
          onPress={() => onSelect(ALL_CATEGORIES)}
        />
        {categories.map((c) => (
          <Chip
            key={c.id}
            label={c.name}
            count={counts?.[c.id]}
            active={selected === c.id}
            onPress={() => onSelect(c.id)}
          />
        ))}
      </ScrollView>
    </FocusSection>
  );
}

function Chip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count?: number;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Focusable onPress={onPress} showFocusRing={false} style={styles.chipOuter}>
      {({ focused }) => (
        <View
          style={[styles.chip, active && styles.chipActive, focused && styles.chipFocused]}
        >
          <Text style={[styles.chipText, active && styles.chipTextActive]}>
            {count === undefined ? label : `${label} (${count})`}
          </Text>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: OVERSCAN.vertical },
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
  chipActive: { backgroundColor: Palette.brand },
  chipFocused: { borderColor: Palette.focus },
  chipText: { color: Palette.textSecondary, fontSize: Type.caption },
  chipTextActive: { color: Palette.text, fontWeight: '700' },
});
