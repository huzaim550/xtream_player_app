/**
 * Loading placeholders.
 *
 * A shimmering poster row tells the user the shape of what is coming; a centred
 * "Loading…" tells them nothing and makes a slow first catalogue fetch feel
 * broken. That matters here specifically: the first call after the server's
 * 300s scan cache expires blocks on an R2 listing, which through the Cloudflare
 * tunnel can take ~10s.
 *
 * One shared Animated.Value drives every block on screen, so the whole page
 * pulses in time and costs a single animation regardless of how many blocks
 * there are.
 */

import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import { Layout, OVERSCAN, Palette } from './platform';

function useShimmer() {
  const value = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(value, {
          toValue: 1,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(value, {
          toValue: 0,
          duration: 900,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [value]);
  return value.interpolate({ inputRange: [0, 1], outputRange: [0.35, 0.85] });
}

export function SkeletonBlock({ style }: { style?: ViewStyle }) {
  const opacity = useShimmer();
  return <Animated.View style={[styles.block, style, { opacity }]} />;
}

/** A stand-in for one MediaRow: heading bar plus a strip of poster shapes. */
export function SkeletonRow({ cards = 5 }: { cards?: number }) {
  const opacity = useShimmer();
  const height = Layout.posterWidth / Layout.posterAspect;

  return (
    <View style={styles.row}>
      <Animated.View style={[styles.block, styles.heading, { opacity }]} />
      <View style={styles.cards}>
        {Array.from({ length: cards }, (_, i) => (
          <Animated.View
            key={i}
            style={[
              styles.block,
              { width: Layout.posterWidth, height, marginRight: Layout.gap, opacity },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/** The whole Home screen while the catalogue is still loading. */
export function SkeletonHome() {
  const opacity = useShimmer();
  return (
    <View style={styles.home}>
      <Animated.View style={[styles.block, styles.hero, { opacity }]} />
      <SkeletonRow />
      <SkeletonRow />
    </View>
  );
}

const styles = StyleSheet.create({
  block: {
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Layout.radius,
  },
  home: { flex: 1 },
  hero: {
    height: Layout.heroHeight,
    borderRadius: 0,
    marginBottom: Layout.rowGap,
  },
  row: { marginBottom: Layout.rowGap },
  heading: {
    width: 180,
    height: 18,
    marginLeft: OVERSCAN.horizontal,
    marginBottom: 12,
  },
  cards: { flexDirection: 'row', paddingLeft: OVERSCAN.horizontal, overflow: 'hidden' },
});
