/**
 * The startup screen.
 *
 * The native splash (expo-splash-screen) shows the mark on a flat background
 * while the JS bundle loads; this screen takes over from it and animates the
 * same mark while `restore()` reads the keystore. Because both draw the mark on
 * #0B0D10, the handover is invisible -- the logo simply comes to life.
 *
 * Held for a minimum beat on purpose: `restore()` usually settles in well under
 * 200ms, and a logo that flashes for one frame reads as a glitch rather than as
 * branding.
 */

import { Image } from 'expo-image';
import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, Text, View } from 'react-native';
import { Palette, Type } from './platform';

const GLOW = require('@/assets/images/logo-glow.png') as number;

export function BrandSplash() {
  const markScale = useRef(new Animated.Value(0.82)).current;
  const markOpacity = useRef(new Animated.Value(0)).current;
  const wordOpacity = useRef(new Animated.Value(0)).current;
  const wordSpread = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(markOpacity, {
          toValue: 1,
          duration: 420,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(markScale, {
          toValue: 1,
          duration: 620,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
      ]),
      // BOTH of these must stay on the JS driver, because both are applied to
      // the same Animated.Text. `letterSpacing` has no native animated
      // implementation, and mixing drivers on one node throws at runtime:
      // "Attempting to run JS driven animation on animated node that has been
      // moved to native earlier". The mark above is a different node, so it is
      // free to use the native driver.
      Animated.parallel([
        Animated.timing(wordOpacity, {
          toValue: 1,
          duration: 320,
          useNativeDriver: false,
        }),
        Animated.timing(wordSpread, {
          toValue: 1,
          duration: 520,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
    ]).start();
  }, [markOpacity, markScale, wordOpacity, wordSpread]);

  return (
    <View style={styles.root}>
      <Animated.View
        style={{ opacity: markOpacity, transform: [{ scale: markScale }] }}
      >
        <Image source={GLOW} style={styles.glow} contentFit="contain" />
      </Animated.View>

      <Animated.Text
        style={[
          styles.wordmark,
          {
            opacity: wordOpacity,
            letterSpacing: wordSpread.interpolate({
              inputRange: [0, 1],
              outputRange: [2, 10],
            }),
          },
        ]}
      >
        MANZAR
      </Animated.Text>
    </View>
  );
}

/** The wordmark on its own, for headers and the login screen. */
export function Wordmark({ size = Type.heading }: { size?: number }) {
  return (
    <Text style={[styles.inlineWordmark, { fontSize: size }]}>
      MANZAR
    </Text>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.background,
  },
  glow: { width: 260, height: 260 },
  wordmark: {
    marginTop: -28,
    color: Palette.brand,
    fontSize: 34,
    fontWeight: '900',
  },
  inlineWordmark: {
    color: Palette.brand,
    fontWeight: '900',
    letterSpacing: 2,
  },
});
