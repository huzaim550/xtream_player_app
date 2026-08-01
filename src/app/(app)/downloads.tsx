/**
 * Downloads.
 *
 * Reached from the account menu rather than a tab -- it is a place you visit
 * occasionally, unlike My List. Every record carries its own title, poster and
 * extension, so this screen renders *and plays* with no catalogue, no session
 * and no network: exactly the situation it exists for.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { formatBytes } from '@/api/download';
import { useDownloads, type DownloadEntry } from '@/store/downloads';
import { useSession } from '@/store/session';
import { EmptyState } from '@/ui/EmptyState';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from '@/ui/platform';

export default function DownloadsScreen() {
  const router = useRouter();
  const session = useSession((s) => s.session);
  const entries = useDownloads((s) => s.entries);
  const list = useDownloads((s) => s.list);
  const cancel = useDownloads((s) => s.cancel);
  const retry = useDownloads((s) => s.retry);
  const remove = useDownloads((s) => s.remove);
  const bytesUsed = useDownloads((s) => s.bytesUsed);

  // `entries` in the dep list is what re-renders the rows as bytes tick up.
  const rows = useMemo(() => list(), [list, entries]);
  const used = useMemo(() => bytesUsed(), [bytesUsed, entries]);

  if (rows.length === 0) {
    return (
      <EmptyState
        icon="download-outline"
        title="No downloads yet"
        body="Downloaded titles play without a connection and stay inside this app."
        actionLabel="Browse movies"
        onAction={() => router.navigate('/(app)/movies')}
      />
    );
  }

  const play = (e: DownloadEntry) =>
    router.push({
      pathname: '/player',
      params: {
        kind: e.kind,
        id: e.id,
        ext: e.ext,
        title: e.title,
        posterUrl: e.posterUrl ?? undefined,
        seriesId: e.seriesId != null ? String(e.seriesId) : undefined,
        seriesName: e.seriesName,
        season: e.season != null ? String(e.season) : undefined,
        episodeNum: e.episodeNum != null ? String(e.episodeNum) : undefined,
        // The whole point: no stream URL is built, so this costs no connection
        // slot and works with the network off.
        localUri: e.fileUri ?? undefined,
      },
    });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.title}>Downloads</Text>
      <Text style={styles.storage}>
        {rows.length} {rows.length === 1 ? 'title' : 'titles'} · {formatBytes(used)} used
        on this device
      </Text>

      <FocusSection autoFocus>
        {rows.map((e, i) => (
          <DownloadRow
            key={e.key}
            entry={e}
            preferFocus={i === 0}
            onPlay={() => play(e)}
            onCancel={() => cancel(e.key)}
            onRetry={() => session && retry(session, e.key)}
            onDelete={() => remove(e.key)}
          />
        ))}
      </FocusSection>
    </ScrollView>
  );
}

function DownloadRow({
  entry,
  onPlay,
  onCancel,
  onRetry,
  onDelete,
  preferFocus,
}: {
  entry: DownloadEntry;
  onPlay: () => void;
  onCancel: () => void;
  onRetry: () => void;
  onDelete: () => void;
  preferFocus?: boolean;
}) {
  const label = entry.seriesName
    ? `${entry.seriesName} · S${entry.season}E${entry.episodeNum}`
    : entry.title;

  // bytesTotal is -1 when the server sent no Content-Length; show bytes so far
  // rather than a progress bar that would sit at zero the whole way.
  const known = entry.bytesTotal > 0;
  const pct = known ? entry.bytesWritten / entry.bytesTotal : 0;

  const status =
    entry.status === 'done'
      ? formatBytes(entry.bytesWritten || entry.bytesTotal)
      : entry.status === 'failed'
        ? (entry.error ?? 'Failed')
        : entry.status === 'queued'
          ? 'Waiting…'
          : known
            ? `${Math.round(pct * 100)}%  ·  ${formatBytes(entry.bytesWritten)} of ${formatBytes(entry.bytesTotal)}`
            : `${formatBytes(entry.bytesWritten)} downloaded`;

  const primary =
    entry.status === 'done' ? onPlay : entry.status === 'failed' ? onRetry : onCancel;

  return (
    <View style={styles.rowWrap}>
      <Focusable
        onPress={primary}
        showFocusRing={false}
        hasTVPreferredFocus={preferFocus}
        containerStyle={styles.rowOuter}
      >
        {({ focused }) => (
          <View style={[styles.row, focused && styles.rowFocused]}>
            {entry.posterUrl ? (
              <Image
                source={{ uri: entry.posterUrl }}
                style={styles.thumb}
                contentFit="cover"
                cachePolicy="memory-disk"
              />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )}

            <View style={styles.rowBody}>
              <Text style={styles.rowTitle} numberOfLines={1}>
                {label}
              </Text>
              <Text
                style={[
                  styles.rowStatus,
                  entry.status === 'failed' && styles.rowStatusFailed,
                  entry.status === 'done' && styles.rowStatusDone,
                ]}
                numberOfLines={2}
              >
                {status}
              </Text>

              {entry.status === 'downloading' && known ? (
                <View style={styles.track}>
                  <View style={[styles.fill, { width: `${Math.round(pct * 100)}%` }]} />
                </View>
              ) : null}
            </View>

            <Ionicons
              name={
                entry.status === 'done'
                  ? 'play-circle'
                  : entry.status === 'failed'
                    ? 'refresh-circle'
                    : 'close-circle'
              }
              size={30}
              color={entry.status === 'done' ? Palette.brand : Palette.textMuted}
            />
          </View>
        )}
      </Focusable>

      {/* A separate control, because deleting a finished download and playing
          it are both one press away and must not be the same press. */}
      <Focusable onPress={onDelete} showFocusRing={false} accessibilityLabel="Delete">
        {({ focused }) => (
          <View style={[styles.delete, focused && styles.deleteFocused]}>
            <Ionicons name="trash-outline" size={18} color={Palette.danger} />
          </View>
        )}
      </Focusable>
    </View>
  );
}

const THUMB_W = IS_TV ? 74 : 54;

const styles = StyleSheet.create({
  content: { padding: OVERSCAN.horizontal, paddingBottom: 40 },
  title: { color: Palette.text, fontSize: Type.title, fontWeight: '700' },
  storage: { color: Palette.textMuted, fontSize: Type.caption, marginTop: 4, marginBottom: 18 },

  rowWrap: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 },
  rowOuter: { flex: 1 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    padding: 10,
    borderRadius: Layout.radius,
    backgroundColor: Palette.surface,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  rowFocused: { backgroundColor: Palette.surfaceRaised, borderColor: Palette.focus },
  thumb: {
    width: THUMB_W,
    height: THUMB_W / Layout.posterAspect,
    borderRadius: 6,
    backgroundColor: Palette.surfaceRaised,
  },
  thumbEmpty: { backgroundColor: Palette.surfaceRaised },
  rowBody: { flex: 1 },
  rowTitle: { color: Palette.text, fontSize: Type.body, fontWeight: '600' },
  rowStatus: { color: Palette.textMuted, fontSize: Type.caption, marginTop: 4 },
  rowStatusFailed: { color: Palette.danger },
  rowStatusDone: { color: Palette.textSecondary },
  track: {
    height: 4,
    borderRadius: 2,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  fill: { height: '100%', backgroundColor: Palette.brand },

  delete: {
    width: 44,
    height: 44,
    borderRadius: Layout.radius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  deleteFocused: { borderColor: Palette.focus, backgroundColor: Palette.surfaceRaised },
});
