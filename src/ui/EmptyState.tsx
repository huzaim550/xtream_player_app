/**
 * The "nothing here yet" panel.
 *
 * Shared so an empty screen always offers a way out. A centred grey sentence
 * tells the user the screen is broken; an icon, a reason and a button tells
 * them what to do next.
 */

import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View } from 'react-native';
import { Focusable } from './Focusable';
import { FocusSection } from './FocusSection';
import { Layout, OVERSCAN, Palette, Type } from './platform';

export interface EmptyStateProps {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  body: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function EmptyState({ icon, title, body, actionLabel, onAction }: EmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Ionicons name={icon} size={54} color={Palette.textMuted} />
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>

      {actionLabel && onAction ? (
        <FocusSection autoFocus>
          <Focusable onPress={onAction} showFocusRing={false} style={styles.action}>
            {({ focused }) => (
              <View style={[styles.button, focused && styles.buttonFocused]}>
                <Text style={styles.buttonText}>{actionLabel}</Text>
              </View>
            )}
          </Focusable>
        </FocusSection>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: OVERSCAN.horizontal,
  },
  title: {
    color: Palette.text,
    fontSize: Type.heading,
    fontWeight: '700',
    marginTop: 16,
  },
  body: {
    color: Palette.textMuted,
    fontSize: Type.body,
    textAlign: 'center',
    marginTop: 8,
    maxWidth: 380,
  },
  action: { marginTop: 20 },
  button: {
    backgroundColor: Palette.brand,
    borderRadius: Layout.radius,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  buttonFocused: { borderColor: Palette.focus },
  buttonText: { color: Palette.text, fontSize: Type.body, fontWeight: '700' },
});
