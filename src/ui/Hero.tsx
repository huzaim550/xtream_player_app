/**
 * The featured banner at the top of Home.
 *
 * The server never sends wide artwork: `backdrop_path` is hardcoded `[]` in
 * both get_vod_info and get_series_info, and there are no trailers either. All
 * we have is the 2:3 poster. So the banner is built by layering -- a blurred,
 * zoomed copy of the poster fills the panel, the crisp poster sits on top of
 * it, and a gradient melts the bottom edge into the page. That reads as
 * designed rather than as a cropped poster, which is what a naive
 * contentFit="cover" of 2:3 art into a 16:9 box gives you.
 *
 * Rotation stops whenever the user is involved -- a button focused, a finger on
 * the panel. A banner that advances under a D-pad user's cursor makes them
 * press Play on the wrong title.
 */

import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FlatList,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Focusable } from './Focusable';
import { FocusSection } from './FocusSection';
import { ABSOLUTE_FILL, Layout, OVERSCAN, Palette, Type } from './platform';

export interface HeroItem {
  key: string;
  kind: 'movie' | 'series';
  id: number;
  title: string;
  posterUrl: string | null;
  /** Short facts for the line under the title: year, genre, quality. */
  tags: string[];
  saved: boolean;
}

export interface HeroProps {
  items: HeroItem[];
  onPlay: (item: HeroItem) => void;
  onOpen: (item: HeroItem) => void;
  onToggleSave: (item: HeroItem) => void;
  /** Claims the first D-pad focus on the screen. Exactly one thing may. */
  preferFocus?: boolean;
}

export function Hero({ items, onPlay, onOpen, onToggleSave, preferFocus }: HeroProps) {
  const listRef = useRef<FlatList<HeroItem>>(null);
  const [index, setIndex] = useState(0);
  const [held, setHeld] = useState(false);
  // The hook, not Dimensions.get: a paged list whose page width is stale after
  // a rotation or a split-screen resize lands between slides.
  const { width } = useWindowDimensions();

  // One timer for the whole banner, restarted whenever the page or the hold
  // state changes. `held` in the dep list is what pauses and resumes it.
  useEffect(() => {
    if (held || items.length < 2) return;
    const t = setTimeout(() => {
      const next = (index + 1) % items.length;
      setIndex(next);
      listRef.current?.scrollToOffset({ offset: next * width, animated: true });
    }, Layout.heroRotateMs);
    return () => clearTimeout(t);
  }, [index, held, items.length, width]);

  const onMomentumEnd = useCallback(
    (e: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(e.nativeEvent.contentOffset.x / width);
      setIndex(page);
      setHeld(false);
    },
    [width],
  );

  if (items.length === 0) return null;

  return (
    <View style={{ height: Layout.heroHeight }}>
      <FlatList
        ref={listRef}
        data={items}
        keyExtractor={(it) => it.key}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        // Clipped subviews cannot hold focus; the same rule as every other
        // list in this app.
        removeClippedSubviews={false}
        onScrollBeginDrag={() => setHeld(true)}
        onMomentumScrollEnd={onMomentumEnd}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        renderItem={({ item, index: i }) => (
          <HeroSlide
            item={item}
            width={width}
            onPlay={onPlay}
            onOpen={onOpen}
            onToggleSave={onToggleSave}
            onHold={setHeld}
            preferFocus={preferFocus && i === 0}
          />
        )}
      />

      {items.length > 1 ? (
        <View style={styles.dots} pointerEvents="none">
          {items.map((it, i) => (
            <View key={it.key} style={[styles.dot, i === index && styles.dotOn]} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function HeroSlide({
  item,
  width,
  onPlay,
  onOpen,
  onToggleSave,
  onHold,
  preferFocus,
}: {
  item: HeroItem;
  width: number;
  onPlay: (item: HeroItem) => void;
  onOpen: (item: HeroItem) => void;
  onToggleSave: (item: HeroItem) => void;
  onHold: (held: boolean) => void;
  preferFocus?: boolean;
}) {
  const posterW = Layout.heroPosterWidth;
  const posterH = posterW / Layout.posterAspect;

  return (
    <View style={[styles.slide, { width, height: Layout.heroHeight }]}>
      {item.posterUrl ? (
        // StyleSheet.absoluteFill (the registered style), not our ABSOLUTE_FILL
        // object: expo-image's style is ImageStyle, which does not accept
        // ViewStyle's `overflow: 'scroll'`.
        <Image
          source={{ uri: item.posterUrl }}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          blurRadius={40}
          cachePolicy="memory-disk"
        />
      ) : null}
      {/* Knocks the blurred art back so white text stays readable over it. */}
      <View style={styles.wash} />

      <View style={styles.art}>
        <Focusable
          onPress={() => onOpen(item)}
          onFocusEnter={() => onHold(true)}
          onBlur={() => onHold(false)}
          style={{ width: posterW }}
        >
          {item.posterUrl ? (
            <Image
              source={{ uri: item.posterUrl }}
              style={[styles.poster, { width: posterW, height: posterH }]}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={200}
            />
          ) : (
            <View style={[styles.poster, styles.posterEmpty, { width: posterW, height: posterH }]}>
              <Text style={styles.posterEmptyText} numberOfLines={4}>
                {item.title}
              </Text>
            </View>
          )}
        </Focusable>
      </View>

      <LinearGradient
        colors={['transparent', 'rgba(11,13,16,0.75)', Palette.background]}
        locations={[0, 0.45, 1]}
        style={styles.fade}
      />

      <View style={styles.copy}>
        <Text style={styles.title} numberOfLines={2}>
          {item.title}
        </Text>
        {item.tags.length > 0 ? (
          <Text style={styles.tags} numberOfLines={1}>
            {item.tags.join('  ·  ')}
          </Text>
        ) : null}

        <FocusSection style={styles.buttons}>
          <HeroButton
            label="▶  Play"
            primary
            preferFocus={preferFocus}
            onPress={() => onPlay(item)}
            onHold={onHold}
          />
          <HeroButton
            label={item.saved ? '✓  My List' : '+  My List'}
            onPress={() => onToggleSave(item)}
            onHold={onHold}
          />
          <HeroButton label="Info" onPress={() => onOpen(item)} onHold={onHold} />
        </FocusSection>
      </View>
    </View>
  );
}

function HeroButton({
  label,
  onPress,
  onHold,
  primary,
  preferFocus,
}: {
  label: string;
  onPress: () => void;
  onHold: (held: boolean) => void;
  primary?: boolean;
  preferFocus?: boolean;
}) {
  return (
    <Focusable
      onPress={onPress}
      onFocusEnter={() => onHold(true)}
      onBlur={() => onHold(false)}
      showFocusRing={false}
      hasTVPreferredFocus={preferFocus}
      style={styles.buttonOuter}
    >
      {({ focused }) => (
        <View
          style={[
            styles.button,
            primary && styles.buttonPrimary,
            focused && styles.buttonFocused,
          ]}
        >
          <Text style={[styles.buttonText, primary && styles.buttonTextPrimary]}>
            {label}
          </Text>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  slide: { overflow: 'hidden', backgroundColor: Palette.surface },
  wash: { ...ABSOLUTE_FILL, backgroundColor: 'rgba(11,13,16,0.45)' },
  art: {
    position: 'absolute',
    top: OVERSCAN.vertical + 12,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  poster: {
    borderRadius: Layout.radius + 4,
    backgroundColor: Palette.surface,
  },
  posterEmpty: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    backgroundColor: Palette.surfaceRaised,
  },
  posterEmptyText: {
    color: Palette.textMuted,
    fontSize: Type.caption,
    textAlign: 'center',
  },
  fade: { position: 'absolute', left: 0, right: 0, bottom: 0, height: '62%' },
  copy: {
    position: 'absolute',
    left: OVERSCAN.horizontal,
    right: OVERSCAN.horizontal,
    bottom: 26,
  },
  title: {
    color: Palette.text,
    fontSize: Type.hero,
    fontWeight: '800',
    textAlign: 'center',
  },
  tags: {
    color: Palette.textSecondary,
    fontSize: Type.caption,
    marginTop: 6,
    textAlign: 'center',
  },
  buttons: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    marginTop: 14,
  },
  buttonOuter: { marginHorizontal: 5 },
  button: {
    backgroundColor: 'rgba(255,255,255,0.16)',
    borderRadius: Layout.radius,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  buttonPrimary: { backgroundColor: Palette.brand },
  buttonFocused: { borderColor: Palette.focus },
  buttonText: { color: Palette.text, fontSize: Type.body, fontWeight: '700' },
  buttonTextPrimary: { color: Palette.text },
  dots: {
    position: 'absolute',
    bottom: 8,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  dotOn: { backgroundColor: Palette.brand, width: 18 },
});
