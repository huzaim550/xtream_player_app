/**
 * Persistent top bar for the (app) group.
 *
 * Shows the wordmark on every tab root, and swaps to a back control on pushed
 * detail routes (movie/[id], series/[id]) -- one header, so those screens need
 * no header code of their own.
 *
 * The avatar on the right is the entry point to everything account-shaped:
 * Settings, the privacy policy and sign-out all live behind it, which is what
 * keeps the tab bar down to five items.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { usePathname, useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/store/session';
import { AccountSheet } from './AccountSheet';
import { Focusable } from './Focusable';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from './platform';

const LOGO = require('@/assets/images/logo-mark.png') as number;

/** Routes that are pushed on top of a tab and therefore want a back control. */
const DETAIL_ROUTE = /^\/(movie|series)\//;
/** Routes reached from the account sheet rather than the tab bar. */
const SUBPAGE_ROUTE = /^\/(settings|privacy|downloads)$/;

export function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const username = useSession((s) => s.account?.username ?? s.session?.username ?? '');
  const [sheetOpen, setSheetOpen] = useState(false);

  const showBack = DETAIL_ROUTE.test(pathname) || SUBPAGE_ROUTE.test(pathname);

  return (
    <>
      <View style={[styles.wrap, { paddingTop: insets.top + (IS_TV ? 0 : 6) }]}>
        {showBack ? (
          <Focusable onPress={() => router.back()} showFocusRing={false} style={styles.side}>
            {({ focused }) => (
              <View style={[styles.iconButton, focused && styles.iconButtonFocused]}>
                <Ionicons name="chevron-back" size={22} color={Palette.text} />
              </View>
            )}
          </Focusable>
        ) : (
          <View style={styles.brand}>
            <Image source={LOGO} style={styles.logo} contentFit="contain" />
            <Text style={styles.wordmark}>MANZAR</Text>
          </View>
        )}

        <Focusable
          onPress={() => setSheetOpen(true)}
          showFocusRing={false}
          accessibilityLabel="Account"
          style={styles.side}
        >
          {({ focused }) => (
            <View style={[styles.avatar, focused && styles.avatarFocused]}>
              <Text style={styles.avatarText}>
                {(username || '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
          )}
        </Focusable>
      </View>

      <AccountSheet visible={sheetOpen} onClose={() => setSheetOpen(false)} />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: OVERSCAN.horizontal,
    paddingBottom: 10,
  },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  logo: { width: 26, height: 26, borderRadius: 7 },
  wordmark: {
    color: Palette.brand,
    fontSize: Type.heading,
    fontWeight: '900',
    letterSpacing: 2,
  },
  side: { alignSelf: 'center' },
  iconButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  iconButtonFocused: { backgroundColor: Palette.surfaceRaised, borderColor: Palette.focus },
  avatar: {
    width: 34,
    height: 34,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.brand,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  avatarFocused: { borderColor: Palette.focus },
  avatarText: { color: Palette.text, fontSize: Type.body, fontWeight: '800' },
});
