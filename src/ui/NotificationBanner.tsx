/**
 * The newest unread announcement, as a strip under the header.
 *
 * The bell badge alone is too quiet for something worth saying -- on a TV
 * across the room it is a few pixels. This is the loud half: one line, always
 * dismissible, and never more than one at a time. Reading the inbox clears it,
 * so it cannot follow the user around.
 *
 * Sits in the same slot as the offline strip in (app)/_layout.tsx, and looks
 * like it on purpose: same shape, same weight, same place.
 */

import { Ionicons } from '@expo/vector-icons';
import { usePathname, useRouter } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';
import { useNotifications } from '@/store/notifications';
import { Focusable } from './Focusable';
import { Layout, OVERSCAN, Palette, Type } from './platform';

export function NotificationBanner() {
  const router = useRouter();
  const pathname = usePathname();
  // Returns the item itself, so the reference only changes when the answer
  // does -- which is exactly when this should re-render.
  const newest = useNotifications((s) => s.newestUnread());
  const markRead = useNotifications((s) => s.markRead);

  // The inbox is already showing it; a banner over the top would be noise.
  if (!newest || pathname === '/notifications') return null;

  return (
    <View style={styles.wrap}>
      <Focusable
        onPress={() => router.navigate('/(app)/notifications')}
        showFocusRing={false}
        containerStyle={styles.mainOuter}
      >
        {({ focused }) => (
          <View style={[styles.main, focused && styles.focused]}>
            <Ionicons
              name={newest.level === 'warning' ? 'warning' : 'megaphone'}
              size={16}
              color={newest.level === 'warning' ? Palette.danger : Palette.accent}
            />
            <Text style={styles.text} numberOfLines={1}>
              <Text style={styles.title}>{newest.title}</Text>
              {'  '}
              {newest.body}
            </Text>
          </View>
        )}
      </Focusable>

      <Focusable
        onPress={() => markRead(newest.id)}
        showFocusRing={false}
        accessibilityLabel="Dismiss"
      >
        {({ focused }) => (
          <View style={[styles.dismiss, focused && styles.focused]}>
            <Ionicons name="close" size={16} color={Palette.textMuted} />
          </View>
        )}
      </Focusable>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Palette.surfaceRaised,
    paddingHorizontal: OVERSCAN.horizontal,
    paddingVertical: 4,
    gap: 6,
  },
  mainOuter: { flex: 1 },
  main: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: Layout.radius,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  dismiss: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: Layout.radius,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  focused: { borderColor: Palette.focus, backgroundColor: Palette.surface },
  text: { flex: 1, color: Palette.textSecondary, fontSize: Type.caption },
  title: { color: Palette.text, fontWeight: '700' },
});
