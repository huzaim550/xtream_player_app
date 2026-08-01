/**
 * A horizontal, focusable row of poster cards.
 *
 * FlatList in the tvos fork already wraps its contents in a focus guide with
 * orientation-appropriate trapping, so focus will not leak sideways out of a
 * row -- don't wrap this in another FocusSection.
 */

import { useCallback, useRef } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';
import { PosterCard, type PosterCardProps } from './PosterCard';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from './platform';

export interface MediaRowItem extends Omit<PosterCardProps, 'onPress' | 'width'> {
  key: string;
}

export interface MediaRowProps {
  title: string;
  items: MediaRowItem[];
  onSelect: (index: number) => void;
  /** Set on the very first row of a screen so focus starts somewhere sensible. */
  preferFocus?: boolean;
}

export function MediaRow({ title, items, onSelect, preferFocus }: MediaRowProps) {
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
        data={items}
        keyExtractor={(it) => it.key}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.content}
        removeClippedSubviews={false}
        initialNumToRender={IS_TV ? 8 : 5}
        onScrollToIndexFailed={({ index }) => {
          setTimeout(
            () => listRef.current?.scrollToIndex({ index, viewPosition: 0.4 }),
            120,
          );
        }}
        renderItem={({ item, index }) => (
          <PosterCard
            {...item}
            onPress={() => onSelect(index)}
            onFocusEnter={() => scrollToFocused(index)}
            hasTVPreferredFocus={preferFocus && index === 0}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: Layout.rowGap },
  heading: {
    color: Palette.text,
    fontSize: Type.heading,
    fontWeight: '700',
    paddingHorizontal: OVERSCAN.horizontal,
    marginBottom: 8,
  },
  content: { paddingHorizontal: OVERSCAN.horizontal - Layout.gap / 2 },
});
