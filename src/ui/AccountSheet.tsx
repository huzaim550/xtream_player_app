/**
 * The profile menu.
 *
 * Everything that is about *you* rather than about the catalogue lives here:
 * account state, settings, the privacy policy, and sign-out. Putting it behind
 * the header avatar is what let the tab bar drop from six items to five once
 * Downloads arrived.
 *
 * Sign-out asks twice. On a TV a mis-aimed D-pad press is easy, and re-entering
 * a password on a remote is genuinely painful -- so the confirm step is not
 * ceremony, it is the difference between a slip and ten minutes of typing.
 */

import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSession } from '@/store/session';
import { Focusable } from './Focusable';
import { FocusSection } from './FocusSection';
import { Layout, OVERSCAN, Palette, Type } from './platform';

type IoniconName = keyof typeof Ionicons.glyphMap;

const NEVER_EXPIRES = 2147483647;

export function AccountSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession((s) => s.session);
  const account = useSession((s) => s.account);
  const signOut = useSession((s) => s.signOut);
  const [confirming, setConfirming] = useState(false);

  const go = (href: '/(app)/downloads' | '/(app)/settings' | '/(app)/privacy') => {
    onClose();
    setConfirming(false);
    router.navigate(href);
  };

  const expires =
    !account || account.expDate >= NEVER_EXPIRES
      ? 'Never expires'
      : `Expires ${new Date(account.expDate * 1000).toLocaleDateString()}`;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={() => {
        setConfirming(false);
        onClose();
      }}
    >
      {/* focusable={false} on purpose: the scrim is a touch dismiss target, not
          a control. On a remote there is nothing to reach here -- Back closes
          the modal via onRequestClose -- and a focusable full-screen overlay
          would swallow every D-pad press meant for the rows below. */}
      <Focusable
        focusable={false}
        showFocusRing={false}
        accessibilityLabel="Close"
        containerStyle={styles.scrim}
        style={styles.fill}
        onPress={() => {
          setConfirming(false);
          onClose();
        }}
      >
        <View style={styles.fill} />
      </Focusable>

      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <FocusSection autoFocus trapFocusDown trapFocusUp>
          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text style={styles.avatarText}>
                {(account?.username ?? session?.username ?? '?').slice(0, 1).toUpperCase()}
              </Text>
            </View>
            <View style={styles.identityText}>
              <Text style={styles.username} numberOfLines={1}>
                {account?.username ?? session?.username ?? 'Signed in'}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {account?.status ?? '—'} · {expires}
              </Text>
              <Text style={styles.meta} numberOfLines={1}>
                {account
                  ? `${account.activeConnections} of ${account.maxConnections} connections in use`
                  : '—'}
              </Text>
            </View>
          </View>

          <Row
            icon="download-outline"
            label="Downloads"
            preferFocus
            onPress={() => go('/(app)/downloads')}
          />
          <Row icon="settings-outline" label="Settings" onPress={() => go('/(app)/settings')} />
          <Row
            icon="shield-checkmark-outline"
            label="Privacy Policy"
            onPress={() => go('/(app)/privacy')}
          />

          {confirming ? (
            <View style={styles.confirm}>
              <Text style={styles.confirmText}>
                Sign out? Your downloads, saved titles and watch history stay on this
                device.
              </Text>
              <View style={styles.confirmRow}>
                <Focusable
                  onPress={() => setConfirming(false)}
                  showFocusRing={false}
                  containerStyle={styles.confirmButtonOuter}
                >
                  {({ focused }) => (
                    <View style={[styles.confirmButton, focused && styles.rowFocused]}>
                      <Text style={styles.rowLabel}>Cancel</Text>
                    </View>
                  )}
                </Focusable>
                <Focusable
                  onPress={async () => {
                    setConfirming(false);
                    onClose();
                    await signOut();
                    router.replace('/login');
                  }}
                  showFocusRing={false}
                  containerStyle={styles.confirmButtonOuter}
                >
                  {({ focused }) => (
                    <View
                      style={[
                        styles.confirmButton,
                        styles.confirmDanger,
                        focused && styles.rowFocused,
                      ]}
                    >
                      <Text style={styles.confirmDangerText}>Sign out</Text>
                    </View>
                  )}
                </Focusable>
              </View>
            </View>
          ) : (
            <Row
              icon="log-out-outline"
              label="Sign out"
              danger
              onPress={() => setConfirming(true)}
            />
          )}
        </FocusSection>
      </View>
    </Modal>
  );
}

function Row({
  icon,
  label,
  onPress,
  danger,
  preferFocus,
}: {
  icon: IoniconName;
  label: string;
  onPress: () => void;
  danger?: boolean;
  preferFocus?: boolean;
}) {
  return (
    <Focusable
      onPress={onPress}
      showFocusRing={false}
      hasTVPreferredFocus={preferFocus}
      style={styles.rowOuter}
    >
      {({ focused }) => (
        <View style={[styles.row, focused && styles.rowFocused]}>
          <Ionicons
            name={icon}
            size={20}
            color={danger ? Palette.danger : Palette.textSecondary}
          />
          <Text style={[styles.rowLabel, danger && styles.rowLabelDanger]}>{label}</Text>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  scrim: { flex: 1, backgroundColor: Palette.scrim },
  fill: { flex: 1 },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: Palette.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: OVERSCAN.horizontal,
    paddingTop: 20,
  },
  identity: { flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 18 },
  avatar: {
    width: 52,
    height: 52,
    borderRadius: Layout.radius + 2,
    backgroundColor: Palette.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: Palette.text, fontSize: 24, fontWeight: '800' },
  identityText: { flex: 1 },
  username: { color: Palette.text, fontSize: Type.heading, fontWeight: '700' },
  meta: { color: Palette.textMuted, fontSize: Type.caption, marginTop: 2 },

  rowOuter: { marginBottom: 4 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 14,
    paddingHorizontal: 12,
    borderRadius: Layout.radius,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  rowFocused: { backgroundColor: Palette.surfaceRaised, borderColor: Palette.focus },
  rowLabel: { color: Palette.text, fontSize: Type.body, fontWeight: '600' },
  rowLabelDanger: { color: Palette.danger },

  confirm: {
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Layout.radius,
    padding: 14,
    marginTop: 4,
  },
  confirmText: {
    color: Palette.textSecondary,
    fontSize: Type.caption,
    lineHeight: Type.caption * 1.5,
  },
  confirmRow: { flexDirection: 'row', gap: 10, marginTop: 12 },
  confirmButtonOuter: { flex: 1 },
  confirmButton: {
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: Layout.radius,
    backgroundColor: Palette.surface,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  confirmDanger: { backgroundColor: Palette.brand },
  confirmDangerText: { color: Palette.text, fontSize: Type.body, fontWeight: '700' },
});
