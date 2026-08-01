/**
 * Persistent top bar for the (app) group.
 *
 * Shows the brand mark on every tab root, and swaps to a back control on
 * pushed detail routes (movie/[id], series/[id]) -- one header, so those
 * screens need no header code of their own.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Focusable } from './Focusable';
import { IS_TV, OVERSCAN, Palette, Type } from './platform';

const LOGO = require('@/assets/images/logo-mark.png') as number;

const DETAIL_ROUTE = /^\/(movie|series)\//;

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const isDetail = DETAIL_ROUTE.test(pathname);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + (IS_TV ? 0 : 6) }]}>
      {isDetail ? (
        <Focusable
          onPress={() => router.back()}
          showFocusRing={false}
          style={styles.backOuter}
        >
          {({ focused }) => (
            <View style={[styles.backButton, focused && styles.backFocused]}>
              <Ionicons name="chevron-back" size={22} color={Palette.text} />
            </View>
          )}
        </Focusable>
      ) : (
        <View style={styles.brand}>
          <Image source={LOGO} style={styles.logo} contentFit="contain" />
          <Text style={styles.wordmark}>Xtream</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: OVERSCAN.horizontal,
    paddingBottom: 10,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 26, height: 26, borderRadius: 7 },
  wordmark: { color: Palette.text, fontSize: Type.heading, fontWeight: '700' },
  backOuter: { alignSelf: 'flex-start' },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
  },
  backFocused: { backgroundColor: Palette.surfaceRaised },
});
