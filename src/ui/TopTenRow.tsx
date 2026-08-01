/**
 * The numbered row.
 *
 * The ranking is local, and the heading says so. The server has no popularity
 * signal at all to rank by: `get_vod_streams` hardcodes `rating` to "0" in the
 * list response, series `rating` is hardcoded everywhere, and series
 * `last_modified` is always the current time. Anything claiming to be a global
 * chart here would be invented, so this ranks what the user has actually
 * watched and saved, and falls back to newest-first when there is no history.
 */

import { useCallback, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { PosterCard } from './PosterCard';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from './platform';
import type { MediaRowItem } from './MediaRow';

export interface TopTenRowProps {
  title: string;
  items: MediaRowItem[];
  onSelect: (index: number) => void;
  preferFocus?: boolean;
}

export function TopTenRow({ title, items, onSelect, preferFocus }: TopTenRowProps) {
  const listRef = useRef<FlatList<MediaRowItem>>(null);

  const scrollToFocused = useCallback((index: number) => {
    if (!IS_TV) return;
    listRef.current?.scrollToIndex({ index, viewPosition: 0.4, animated: true });
  }, []);

  if (items.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.heading}>{title}</Text>
      <FlatList
        ref={listRef}
        horizontal
        data={items.slice(0, 10)}
        keyExtractor={(it) => it.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        removeClippedSubviews={false}
        initialNumToRender={IS_TV ? 6 : 4}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(
            () => listRef.current?.scrollToIndex({ index, viewPosition: 0.4 }),
            120,
          );
        }}
        renderItem={({ item, index }) => (
          <View style={styles.cell}>
            {/* Sits behind and left of the card, the way a chart numeral does.
                pointerEvents none so it never eats a tap meant for the card. */}
            <Text style={styles.numeral} pointerEvents="none">
              {index + 1}
            </Text>
            <PosterCard
              {...item}
              width={Layout.posterWidth}
              onPress={() => onSelect(index)}
              onFocusEnter={() => scrollToFocused(index)}
              hasTVPreferredFocus={preferFocus && index === 0}
            />
          </View>
        )}
      />
    </View>
  );
}

const NUMERAL_SIZE = IS_TV ? 150 : 92;

const styles = StyleSheet.create({
  wrap: { marginBottom: Layout.rowGap },
  heading: {
    color: Palette.text,
    fontSize: Type.heading,
    fontWeight: '700',
    paddingHorizontal: OVERSCAN.horizontal,
    marginBottom: 8,
  },
  content: {
    paddingHorizontal: OVERSCAN.horizontal - Layout.gap / 2,
    // Room for the numeral hanging off the left of the first card.
    paddingLeft: OVERSCAN.horizontal + NUMERAL_SIZE * 0.42,
  },
  cell: { flexDirection: 'row', alignItems: 'flex-end' },
  numeral: {
    // Pulled left so roughly half of it tucks behind the poster.
    marginRight: -NUMERAL_SIZE * 0.42,
    marginBottom: IS_TV ? 34 : 26,
    color: Palette.surfaceRaised,
    fontSize: NUMERAL_SIZE,
    lineHeight: NUMERAL_SIZE * 1.02,
    fontWeight: '900',
  },
});
