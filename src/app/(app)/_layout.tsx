/**
 * Navigation chrome.
 *
 * TV gets a persistent left rail; a phone gets bottom tabs. Both drive the same
 * routes, so screens never learn which one they are under.
 */

import { Ionicons } from '@expo/vector-icons';
import { Redirect, Slot, usePathname, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdsInit } from '@/hooks/useAdsInit';
import { useCatalogueSync } from '@/hooks/useCatalogueSync';
import { useNotificationSync } from '@/hooks/useNotificationSync';
import { useSession } from '@/store/session';
import type { AdSurface } from '@/types/domain';
import { AdBanner } from '@/ui/AdBanner';
import { AppHeader } from '@/ui/AppHeader';
import { NotificationBanner } from '@/ui/NotificationBanner';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from '@/ui/platform';

type IoniconName = keyof typeof Ionicons.glyphMap;

/**
 * Five items, deliberately.
 *
 * Settings and Downloads used to compete for a slot here. Both moved behind the
 * header avatar instead: Settings is rarely opened, and Downloads is somewhere
 * you visit occasionally rather than browse. My List earns a tab because it is
 * a browsing destination like the other four. Six tabs on a phone makes every
 * one of them too narrow to hit reliably.
 */
const NAV: readonly {
  href: '/(app)/home' | '/(app)/movies' | '/(app)/series' | '/(app)/search' | '/(app)/my-list';
  label: string;
  icon: IoniconName;
  iconActive: IoniconName;
}[] = [
  { href: '/(app)/home', label: 'Home', icon: 'home-outline', iconActive: 'home' },
  { href: '/(app)/movies', label: 'Movies', icon: 'film-outline', iconActive: 'film' },
  { href: '/(app)/series', label: 'Series', icon: 'tv-outline', iconActive: 'tv' },
  { href: '/(app)/search', label: 'Search', icon: 'search-outline', iconActive: 'search' },
  { href: '/(app)/my-list', label: 'My List', icon: 'bookmark-outline', iconActive: 'bookmark' },
] as const;

/**
 * Which of the five browsing surfaces this route is, for ad purposes.
 *
 * Null for everything else -- the pushed subpages (a title, Settings, the
 * privacy policy, Downloads) carry no banner. Settings and the policy in
 * particular must not: an ad beside the document explaining the app's data
 * handling is indefensible, whatever the server says.
 */
function adSurfaceFor(pathname: string): AdSurface | null {
  if (pathname.endsWith('/home')) return 'home';
  if (pathname.endsWith('/movies')) return 'movies';
  if (pathname.endsWith('/series')) return 'series';
  if (pathname.endsWith('/search')) return 'search';
  if (pathname.endsWith('/my-list')) return 'my_list';
  return null;
}

export default function AppLayout() {
  useCatalogueSync();
  useNotificationSync();
  useAdsInit();
  const router = useRouter();
  const pathname = usePathname();
  const insets = useSafeAreaInsets();
  const offline = useSession((s) => s.offline);
  const revalidate = useSession((s) => s.revalidate);

  // Re-handshake on foreground, rate-limited to hourly inside the store. This
  // is what keeps the Settings connection count honest and catches an account
  // that expired while the app sat in the background.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') void revalidate();
    });
    return () => sub.remove();
  }, [revalidate]);

  // Covers every way a session can end while inside the app: sign-out, an
  // expiry caught by revalidate, or a mid-session AuthError.
  const boot = useSession((s) => s.boot);
  if (boot !== 'signed-in') return <Redirect href="/login" />;

  const nav = (
    <FocusSection
      autoFocus
      style={[
        IS_TV ? styles.rail : styles.tabBar,
        !IS_TV && {
          paddingBottom: Math.max(insets.bottom, 10),
          paddingLeft: OVERSCAN.horizontal + insets.left,
          paddingRight: OVERSCAN.horizontal + insets.right,
        },
      ]}
    >
      {NAV.map((item) => {
        const active = pathname.startsWith(item.href.replace('/(app)', ''));
        return (
          <Focusable
            key={item.href}
            onPress={() => router.navigate(item.href)}
            showFocusRing={false}
            containerStyle={IS_TV ? styles.railItem : styles.tabItem}
          >
            {({ focused }) => (
              <View
                style={[
                  IS_TV ? styles.railInner : styles.tabInner,
                  focused && styles.navFocused,
                  active && styles.navActive,
                ]}
              >
                <Ionicons
                  name={active || focused ? item.iconActive : item.icon}
                  size={IS_TV ? 20 : 22}
                  color={
                    active ? Palette.brand : focused ? Palette.text : Palette.textMuted
                  }
                />
                <Text
                  style={[
                    styles.navLabel,
                    focused && styles.navLabelOn,
                    active && styles.navLabelActive,
                  ]}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </View>
            )}
          </Focusable>
        );
      })}
    </FocusSection>
  );

  return (
    <View style={IS_TV ? styles.tvRoot : styles.phoneRoot}>
      {IS_TV ? nav : null}
      <View style={styles.content}>
        <AppHeader />
        {offline ? (
          <Text style={styles.offline}>
            Offline — showing your saved library.
          </Text>
        ) : null}
        <NotificationBanner />
        <Slot />
        {/* Below the screen, above the tab bar. Mounted here rather than in
            each screen so a tab change does not cost an ad request, and so
            there is exactly one place that decides where ads appear. */}
        <AdBanner surface={adSurfaceFor(pathname)} />
      </View>
      {IS_TV ? null : nav}
    </View>
  );
}

const styles = StyleSheet.create({
  tvRoot: { flex: 1, flexDirection: 'row', backgroundColor: Palette.background },
  phoneRoot: { flex: 1, backgroundColor: Palette.background },
  content: { flex: 1 },

  rail: {
    width: 132,
    paddingTop: OVERSCAN.vertical,
    paddingLeft: 16,
    gap: 6,
    backgroundColor: Palette.surface,
  },
  railItem: { marginBottom: 2 },
  railInner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: Layout.radius,
  },

  tabBar: {
    flexDirection: 'row',
    backgroundColor: Palette.surface,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: Palette.surfaceRaised,
  },
  tabItem: { flex: 1 },
  tabInner: { alignItems: 'center', gap: 3, paddingVertical: 6, borderRadius: Layout.radius },

  navFocused: { backgroundColor: Palette.surfaceRaised },
  navActive: { backgroundColor: 'transparent' },
  navLabel: { color: Palette.textMuted, fontSize: Type.caption },
  navLabelOn: { color: Palette.text, fontWeight: '600' },
  navLabelActive: { color: Palette.brand, fontWeight: '700' },

  offline: {
    backgroundColor: Palette.surfaceRaised,
    color: Palette.textSecondary,
    fontSize: Type.caption,
    paddingVertical: 6,
    textAlign: 'center',
  },
});
