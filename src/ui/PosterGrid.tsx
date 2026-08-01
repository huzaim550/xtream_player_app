/**
 * The poster grid, shared by Movies, Series, Search and Favourites.
 *
 * Most of what is here exists to keep D-pad focus and list virtualisation from
 * fighting each other -- see the comments on the FlatList props, each of which
 * is load-bearing on TV and inert on a phone.
 */

import { useCallback, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { FocusSection } from './FocusSection';
import { PosterCard } from './PosterCard';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from './platform';

export interface PosterGridItem {
  key: string;
  title: string;
  posterUrl: string | null;
  qualityLabel?: string | null;
  progress?: number;
  watched?: boolean;
}

export interface PosterGridProps {
  items: PosterGridItem[];
  onSelect: (index: number) => void;
  onLongPress?: (index: number) => void;
  emptyMessage?: string;
  header?: React.ReactElement | null;
}

export function PosterGrid({
  items,
  onSelect,
  onLongPress,
  emptyMessage = 'Nothing here yet.',
  header,
}: PosterGridProps) {
  const listRef = useRef<FlatList<PosterGridItem>>(null);

  // The native focus engine does not reliably scroll a virtualised list to keep
  // the focused row visible, so drive it from the focus event instead.
  const scrollToFocused = useCallback((index: number) => {
    if (!IS_TV) return;
    listRef.current?.scrollToIndex({
      index,
      viewPosition: 0.5,
      animated: true,
    });
  }, []);

  if (items.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{emptyMessage}</Text>
      </View>
    );
  }

  return (
    <FocusSection autoFocus style={styles.flex}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(it) => it.key}
        numColumns={Layout.gridColumns}
        ListHeaderComponent={header}
        contentContainerStyle={styles.content}
        columnWrapperStyle={Layout.gridColumns > 1 ? styles.row : undefined}
        // Clipped subviews cannot hold focus. If the focused card gets clipped
        // away mid-scroll the focus engine drops it, which on a TV is
        // indistinguishable from the app freezing.
        removeClippedSubviews={false}
        // The first D-pad Down needs somewhere already rendered to land.
        initialNumToRender={Layout.gridColumns * 2}
        windowSize={IS_TV ? 11 : 5}
        // scrollToIndex on a not-yet-measured row would otherwise throw.
        onScrollToIndexFailed={({ index }) => {
          setTimeout(
            () => listRef.current?.scrollToIndex({ index, viewPosition: 0.5 }),
            120,
          );
        }}
        renderItem={({ item, index }) => (
          <PosterCard
            title={item.title}
            posterUrl={item.posterUrl}
            qualityLabel={item.qualityLabel}
            progress={item.progress}
            watched={item.watched}
            onPress={() => onSelect(index)}
            onLongPress={onLongPress ? () => onLongPress(index) : undefined}
            onFocusEnter={() => scrollToFocused(index)}
            // Exactly one preferred focus per screen. Two is a race, and the
            // loser silently wins about half the time.
            hasTVPreferredFocus={index === 0}
          />
        )}
      />
    </FocusSection>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: {
    paddingHorizontal: OVERSCAN.horizontal - Layout.gap / 2,
    paddingVertical: OVERSCAN.vertical,
  },
  row: { justifyContent: 'flex-start' },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: OVERSCAN.horizontal,
  },
  emptyText: {
    color: Palette.textMuted,
    fontSize: Type.body,
    textAlign: 'center',
  },
});
