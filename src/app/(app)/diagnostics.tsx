/**
 * Diagnostics: app version, update state, and recent crashes.
 *
 * This screen exists because the alternative was the user saying "it crashed"
 * and someone guessing. Everything here is local -- no crash service, no
 * telemetry -- so the privacy policy stays accurate.
 */

import * as Updates from 'expo-updates';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SELF_UPDATES } from '@/distribution';
import { useCrashLog, type CrashRecord } from '@/store/crashLog';
import { EmptyState } from '@/ui/EmptyState';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from '@/ui/platform';

export default function DiagnosticsScreen() {
  const records = useCrashLog((s) => s.records);
  const clear = useCrashLog((s) => s.clear);
  const [updateNote, setUpdateNote] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  /**
   * Manual update check.
   *
   * The app also checks on its own at launch; this button exists so a fix can
   * be pulled in without force-quitting, which is exactly what you want when
   * someone is on the phone talking you through a bug.
   */
  const checkForUpdate = async () => {
    if (checking) return;
    setChecking(true);
    setUpdateNote(null);
    try {
      // In a dev client the updates module is disabled and throws rather than
      // returning "no update", so say so instead of showing a raw error.
      if (__DEV__ || !Updates.isEnabled) {
        setUpdateNote('Updates are disabled in development builds.');
        return;
      }
      const result = await Updates.checkForUpdateAsync();
      if (!result.isAvailable) {
        setUpdateNote('You are on the latest version.');
        return;
      }
      setUpdateNote('Downloading update…');
      await Updates.fetchUpdateAsync();
      setUpdateNote('Restarting…');
      await Updates.reloadAsync();
    } catch (err) {
      setUpdateNote(
        err instanceof Error ? `Update check failed: ${err.message}` : 'Update check failed.',
      );
    } finally {
      setChecking(false);
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Diagnostics</Text>

      <Section title="Version">
        <Row label="App version" value={Updates.runtimeVersion ?? '—'} />
        <Row label="Update channel" value={Updates.channel ?? 'not configured'} />
        <Row
          label="Bundle"
          value={
            Updates.isEmbeddedLaunch
              ? 'Shipped with the app'
              : (Updates.updateId?.slice(0, 8) ?? 'unknown')
          }
        />
        {Updates.createdAt ? (
          <Row label="Bundle date" value={Updates.createdAt.toLocaleString()} />
        ) : null}
      </Section>

      <FocusSection autoFocus style={styles.actions}>
        {/* Absent from the Play build: `updates.enabled` is false there (see
            app.config.ts), so this could only ever report that updates are
            switched off. Play does the updating. */}
        {SELF_UPDATES ? (
          <Action
            label={checking ? 'Checking…' : 'Check for updates'}
            preferFocus
            onPress={() => void checkForUpdate()}
          />
        ) : null}
        {records.length > 0 ? (
          <Action label="Clear crash log" danger onPress={() => void clear()} />
        ) : null}
      </FocusSection>

      {updateNote ? <Text style={styles.note}>{updateNote}</Text> : null}

      <Text style={styles.h2}>Recent crashes</Text>
      {records.length === 0 ? (
        <EmptyState
          icon="checkmark-circle-outline"
          title="No crashes recorded"
          body="If the app ever closes unexpectedly, the error will appear here so you can read it back."
        />
      ) : (
        <>
          <Text style={styles.hint}>
            Stored on this device only, and nothing is sent anywhere. Your password is
            stripped out before anything is written.
          </Text>
          {records.map((r) => (
            <Crash key={r.id} record={r} />
          ))}
        </>
      )}
    </ScrollView>
  );
}

function Crash({ record }: { record: CrashRecord }) {
  const [open, setOpen] = useState(false);
  return (
    <Focusable onPress={() => setOpen((v) => !v)} showFocusRing={false} style={styles.crashOuter}>
      {({ focused }) => (
        <View style={[styles.crash, focused && styles.crashFocused]}>
          <View style={styles.crashHead}>
            <Text style={[styles.badge, record.fatal && styles.badgeFatal]}>
              {record.fatal ? 'FATAL' : 'ERROR'}
            </Text>
            <Text style={styles.crashTime}>{new Date(record.at).toLocaleString()}</Text>
          </View>
          <Text style={styles.crashMessage} numberOfLines={open ? undefined : 2}>
            {record.message}
          </Text>
          {open && record.stack ? (
            <Text style={styles.stack} selectable>
              {record.stack}
            </Text>
          ) : null}
          <Text style={styles.expand}>{open ? 'Tap to collapse' : 'Tap for the stack trace'}</Text>
        </View>
      )}
    </Focusable>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.h2}>{title}</Text>
      {children}
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

function Action({
  label,
  onPress,
  danger,
  preferFocus,
}: {
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
      style={styles.actionOuter}
    >
      {({ focused }) => (
        <View style={[styles.action, focused && styles.actionFocused]}>
          <Text style={[styles.actionText, danger && styles.actionDanger]}>{label}</Text>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: OVERSCAN.horizontal,
    paddingBottom: 40,
    maxWidth: IS_TV ? 900 : undefined,
  },
  h1: { color: Palette.text, fontSize: Type.title, fontWeight: '700', marginBottom: 20 },
  h2: {
    color: Palette.textSecondary,
    fontSize: Type.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
    marginTop: 8,
  },
  section: { marginBottom: 24 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: Palette.surface,
  },
  rowLabel: { color: Palette.textMuted, fontSize: Type.body },
  rowValue: { color: Palette.text, fontSize: Type.body, flexShrink: 1 },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 4 },
  actionOuter: { marginRight: 12, marginBottom: 12 },
  action: {
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Layout.radius,
    paddingHorizontal: 20,
    paddingVertical: IS_TV ? 14 : 10,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  actionFocused: { borderColor: Palette.focus },
  actionText: { color: Palette.text, fontSize: Type.body, fontWeight: '600' },
  actionDanger: { color: Palette.danger },
  note: { color: Palette.textSecondary, fontSize: Type.caption, marginBottom: 12 },
  hint: {
    color: Palette.textMuted,
    fontSize: Type.caption,
    lineHeight: Type.caption * 1.5,
    marginBottom: 12,
  },
  crashOuter: { marginBottom: 10 },
  crash: {
    backgroundColor: Palette.surface,
    borderRadius: Layout.radius,
    padding: 14,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  crashFocused: { borderColor: Palette.focus, backgroundColor: Palette.surfaceRaised },
  crashHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  badge: {
    color: Palette.text,
    backgroundColor: Palette.textMuted,
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    overflow: 'hidden',
  },
  badgeFatal: { backgroundColor: Palette.brand },
  crashTime: { color: Palette.textMuted, fontSize: Type.caption },
  crashMessage: { color: Palette.text, fontSize: Type.caption, lineHeight: Type.caption * 1.5 },
  stack: {
    color: Palette.textMuted,
    fontSize: 10,
    lineHeight: 15,
    marginTop: 10,
    fontFamily: 'monospace',
  },
  expand: { color: Palette.accent, fontSize: Type.caption, marginTop: 10 },
});
