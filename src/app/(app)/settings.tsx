/**
 * Account and diagnostics.
 *
 * Built early on purpose: when something misbehaves on a Fire Stick across the
 * room, this screen is the only debugging tool available. It answers "is the
 * server up", "am I out of connections", "how stale is my library", and "where
 * is my password actually stored".
 */

import * as Application from 'expo-application';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { privacyOptionsRequired, showPrivacyOptions } from '@/ads';
import { formatBytes } from '@/api/download';
import { health } from '@/api/client';
import { SELF_UPDATES } from '@/distribution';
import { formatUpdateSize, openUpdateDownload, useAppUpdate } from '@/hooks/useAppUpdate';
import { adsOn, useAds } from '@/store/ads';
import { useCatalogue } from '@/store/catalogue';
import { downloadedBytes, useDownloads } from '@/store/downloads';
import { useProgress } from '@/store/progress';
import { useSession } from '@/store/session';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from '@/ui/platform';
import type { RawHealth } from '@/types/raw';

const NEVER_EXPIRES = 2147483647;

export default function SettingsScreen() {
  const router = useRouter();
  const session = useSession((s) => s.session);
  const account = useSession((s) => s.account);
  const signOut = useSession((s) => s.signOut);
  const degraded = useSession((s) => s.credentialStorageDegraded);
  const data = useCatalogue((s) => s.data);
  const refresh = useCatalogue((s) => s.refresh);
  const loading = useCatalogue((s) => s.loading);
  const clearProgress = useProgress((s) => s.clearAll);
  const downloadEntries = useDownloads((s) => s.entries);
  const clearDownloads = useDownloads((s) => s.clearAll);
  // Derived from `downloadEntries`, not the store's bytesUsed() getter, so
  // "Clear downloads" drops it to zero without leaving the screen. See the note
  // in src/store/downloads.ts.
  const used = useMemo(() => downloadedBytes(downloadEntries), [downloadEntries]);

  const [probe, setProbe] = useState<RawHealth | null>(null);
  const [probeError, setProbeError] = useState<string | null>(null);
  const adsEnabled = useAds((s) => adsOn(s.config));
  const revalidate = useSession((s) => s.revalidate);
  // Everything this screen shows about the account -- connections in use,
  // expiry, status, whether ads are on -- comes from the handshake, which is
  // otherwise refreshed at most hourly. This is the screen people open *to
  // check* those values, so it asks again rather than showing an hour-old
  // answer with no way to tell it is old.
  useEffect(() => {
    void revalidate(true);
  }, [revalidate]);
  // Asked once per visit rather than stored: Google's answer depends on where
  // the device is, and it is only meaningful after the consent flow has run.
  const [privacyOptions, setPrivacyOptions] = useState(false);
  useEffect(() => {
    let live = true;
    void privacyOptionsRequired().then((need) => {
      if (live) setPrivacyOptions(need);
    });
    return () => {
      live = false;
    };
  }, []);
  // Null unless the build server is offering a higher versionCode than this
  // install. JS-only changes arrive over the air and never surface here.
  const update = useAppUpdate(SELF_UPDATES);

  const runProbe = async () => {
    if (!session) return;
    setProbeError(null);
    setProbe(null);
    try {
      setProbe(await health(session.baseUrl));
    } catch {
      setProbeError('Could not reach the server.');
    }
  };

  const ageMinutes = data ? Math.round((Date.now() - data.fetchedAt) / 60000) : null;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.h1}>Settings</Text>

      <Section title="Account">
        <Row label="Server" value={session?.baseUrl ?? '—'} />
        <Row label="Username" value={account?.username ?? '—'} />
        <Row label="Status" value={account?.status ?? '—'} />
        <Row
          label="Expires"
          value={
            !account || account.expDate >= NEVER_EXPIRES
              ? 'Never'
              : new Date(account.expDate * 1000).toLocaleDateString()
          }
        />
        <Row
          label="Connections"
          value={
            account ? `${account.activeConnections} of ${account.maxConnections}` : '—'
          }
        />
        {degraded ? (
          <Text style={styles.warn}>
            This device could not use secure storage, so your password is stored
            unencrypted in the app’s private data.
          </Text>
        ) : null}
      </Section>

      <Section title="Library">
        <Row
          label="Titles"
          value={data ? `${data.movies.length} movies · ${data.series.length} series` : '—'}
        />
        <Row
          label="Last updated"
          value={ageMinutes === null ? '—' : ageMinutes < 1 ? 'Just now' : `${ageMinutes} min ago`}
        />
      </Section>

      <Section title="Downloads">
        <Row label="Saved offline" value={`${Object.keys(downloadEntries).length} titles`} />
        <Row label="Storage used" value={formatBytes(used)} />
        <Text style={styles.hint}>
          Downloads are stored inside this app only. They are not visible to your
          gallery or other apps, and are removed if you uninstall Manzar, and can only be viewed inside it.
        </Text>
      </Section>

      {probe || probeError ? (
        <Section title="Server health">
          {probeError ? (
            <Text style={styles.warn}>{probeError}</Text>
          ) : probe ? (
            <>
              <Row label="Status" value={probe.status} />
              <Row label="Storage" value={probe.r2} />
              <Row
                label="Scanned"
                value={probe.library?.warm ? `${probe.library.titles} titles` : 'not warm'}
              />
            </>
          ) : null}
        </Section>
      ) : null}

      <Section title="App">
        {/* Stated plainly rather than left to be discovered. Ads are a property
            of the account, set by whoever runs the server, and "why does my
            player have adverts now" is otherwise a question only they can
            answer. */}
        <Row label="Ads on this account" value={adsEnabled ? 'On' : 'Off'} />
        {privacyOptions ? (
          // Google requires this to be reachable wherever the consent form
          // offers a choice, so it is rendered only when the SDK says so.
          <Action label="Ad privacy choices" onPress={() => void showPrivacyOptions()} />
        ) : null}
        <Row
          label="Version"
          value={`${Application.nativeApplicationVersion ?? '—'} (${
            Application.nativeBuildVersion ?? '—'
          })`}
        />
        {/* Which JS bundle is actually running.
            Without this there is no way to tell "the fix did not work" from
            "the fix never arrived" -- the version above comes from the APK and
            does not move when an update lands. `Bundle` reads `embedded` on a
            fresh install and the update's short id once one has been applied;
            an update downloads on one launch and applies on the next, so a
            bundle that still says `embedded` means the app has been opened
            once, not that the update failed. */}
        <Row
          label="Bundle"
          value={
            Updates.isEmbeddedLaunch
              ? 'embedded (as shipped in the APK)'
              : (Updates.updateId?.slice(0, 8) ?? 'unknown')
          }
        />
        {!Updates.isEmbeddedLaunch && Updates.createdAt ? (
          <Row label="Bundle built" value={Updates.createdAt.toLocaleString()} />
        ) : null}
        {/* The whole update block belongs to the sideloaded build. A Play build
            must not offer to fetch and install an APK -- that is a Device and
            Network Abuse violation -- and has nothing to say here anyway,
            because Play does the updating. IS_PLAY is a build-time literal, so
            this is dropped from the store bundle rather than merely hidden. */}
        {SELF_UPDATES && update ? (
          <Text style={styles.updateAvailable}>
            Version {update.versionName ?? update.versionCode} is available
            {formatUpdateSize(update.sizeBytes) ? ` · ${formatUpdateSize(update.sizeBytes)}` : ''}
          </Text>
        ) : SELF_UPDATES ? (
          <Text style={styles.hint}>
            Content and layout changes install themselves in the background. This checks for the
            larger updates that need a new install.
          </Text>
        ) : null}
      </Section>

      <FocusSection autoFocus style={styles.actions}>
        {SELF_UPDATES && update ? (
          <Action
            label={`Install version ${update.versionName ?? update.versionCode}`}
            preferFocus
            onPress={() => openUpdateDownload(update)}
          />
        ) : null}
        <Action
          label={loading ? 'Refreshing…' : 'Refresh library'}
          preferFocus={!update}
          onPress={() => session && refresh(session, { force: true })}
        />
        <Action label="Check server" onPress={runProbe} />
        <Action label="Diagnostics" onPress={() => router.push('/(app)/diagnostics')} />
        <Action label="Manage downloads" onPress={() => router.push('/(app)/downloads')} />
        <Action label="Privacy Policy" onPress={() => router.push('/(app)/privacy')} />
        <Action label="Clear watch history" onPress={() => void clearProgress()} />
        <Action
          label="Delete all downloads"
          danger
          onPress={() => void clearDownloads()}
        />
        <Action
          label="Sign out"
          danger
          onPress={async () => {
            await signOut();
            router.replace('/login');
          }}
        />
      </FocusSection>
    </ScrollView>
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
  content: { padding: OVERSCAN.horizontal, maxWidth: IS_TV ? 900 : undefined },
  h1: { color: Palette.text, fontSize: Type.title, fontWeight: '700', marginBottom: 20 },
  h2: {
    color: Palette.textSecondary,
    fontSize: Type.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
    marginBottom: 8,
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
  warn: { color: Palette.danger, fontSize: Type.caption, marginTop: 10 },
  // Informational, not an alarm -- hence accent blue rather than brand red,
  // which this codebase reserves for "act on this".
  updateAvailable: { color: Palette.accent, fontSize: Type.caption, marginTop: 10 },
  hint: {
    color: Palette.textMuted,
    fontSize: Type.caption,
    lineHeight: Type.caption * 1.5,
    marginTop: 10,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 8 },
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
});
