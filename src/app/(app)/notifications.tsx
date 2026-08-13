/**
 * The inbox.
 *
 * Reached from the bell in the header or the account menu. Everything here has
 * already been fetched, so it renders with no network -- which is the point:
 * an announcement you saw yesterday should still be readable on a train.
 *
 * Opening the screen marks everything read, but the "New" pills are computed
 * once on mount and stay put for the visit. Rows that shed their highlight
 * while you are still reading them would be worse than useless.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef } from 'react';
import { Linking, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useNotifications, type AppNotification } from '@/store/notifications';
import { EmptyState } from '@/ui/EmptyState';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { Layout, OVERSCAN, Palette, Type } from '@/ui/platform';

export default function NotificationsScreen() {
  const items = useNotifications((s) => s.items);
  const readIds = useNotifications((s) => s.readIds);
  const markAllRead = useNotifications((s) => s.markAllRead);
  const sync = useNotifications((s) => s.sync);

  // Captured before the effect below clears them.
  const wasUnread = useRef<Set<string> | null>(null);
  if (wasUnread.current === null) {
    wasUnread.current = new Set(items.filter((n) => !readIds.has(n.id)).map((n) => n.id));
  }

  useEffect(() => {
    markAllRead();
  }, [markAllRead]);

  if (items.length === 0) {
    return (
      <EmptyState
        icon="notifications-outline"
        title="No notifications"
        body="Announcements from Manzar show up here. There is nothing right now."
        actionLabel="Check again"
        onAction={() => void sync({ force: true })}
      />
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Notifications</Text>
      <Text style={styles.subtitle}>
        {items.length} {items.length === 1 ? 'message' : 'messages'}
      </Text>

      <FocusSection autoFocus>
        {items.map((item, i) => (
          <NotificationCard
            key={item.id}
            item={item}
            isNew={wasUnread.current?.has(item.id) ?? false}
            preferFocus={i === 0}
          />
        ))}
      </FocusSection>
    </ScrollView>
  );
}

/** "3 days ago" beats a timestamp for something that is mostly recent. */
function relativeTime(iso: string): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((Date.now() - then) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days} ${days === 1 ? 'day' : 'days'} ago`;
  return new Date(then).toLocaleDateString();
}

function NotificationCard({
  item,
  isNew,
  preferFocus,
}: {
  item: AppNotification;
  isNew: boolean;
  preferFocus?: boolean;
}) {
  const warning = item.level === 'warning';
  const link = item.linkUrl;

  const card = (focused: boolean) => (
    <View style={[styles.card, warning && styles.cardWarning, focused && styles.cardFocused]}>
      <View style={styles.cardHead}>
        <Ionicons
          name={warning ? 'warning-outline' : 'megaphone-outline'}
          size={18}
          color={warning ? Palette.danger : Palette.accent}
        />
        <Text style={styles.cardTitle}>{item.title}</Text>
        {isNew ? (
          <View style={styles.newPill}>
            <Text style={styles.newPillText}>NEW</Text>
          </View>
        ) : null}
      </View>

      <Text style={styles.cardBody}>{item.body}</Text>

      <View style={styles.cardFoot}>
        <Text style={styles.cardTime}>{relativeTime(item.createdAt)}</Text>
        {link ? <Text style={styles.cardLink}>Open link ›</Text> : null}
      </View>
    </View>
  );

  // A message with nothing to open is not a control. Making it focusable
  // anyway would give a remote a row that swallows OK and does nothing.
  if (!link) return <View style={styles.cardOuter}>{card(false)}</View>;

  return (
    <Focusable
      onPress={() => void Linking.openURL(link)}
      showFocusRing={false}
      hasTVPreferredFocus={preferFocus}
      containerStyle={styles.cardOuter}
    >
      {({ focused }) => card(focused)}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  content: { padding: OVERSCAN.horizontal, paddingBottom: 40 },
  title: { color: Palette.text, fontSize: Type.title, fontWeight: '700' },
  subtitle: { color: Palette.textMuted, fontSize: Type.caption, marginTop: 4, marginBottom: 18 },

  cardOuter: { marginBottom: 10 },
  card: {
    backgroundColor: Palette.surface,
    borderRadius: Layout.radius,
    padding: 14,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  cardWarning: { backgroundColor: Palette.surfaceRaised },
  cardFocused: { backgroundColor: Palette.surfaceRaised, borderColor: Palette.focus },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { color: Palette.text, fontSize: Type.body, fontWeight: '700', flexShrink: 1 },
  newPill: {
    backgroundColor: Palette.brand,
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  newPillText: { color: Palette.text, fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  cardBody: {
    color: Palette.textSecondary,
    fontSize: Type.caption,
    lineHeight: Type.caption * 1.5,
    marginTop: 8,
  },
  cardFoot: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  cardTime: { color: Palette.textMuted, fontSize: Type.caption },
  cardLink: { color: Palette.accent, fontSize: Type.caption, fontWeight: '600' },
});
