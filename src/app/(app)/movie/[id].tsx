/**
 * Movie detail.
 *
 * The list response (`get_vod_streams`) hardcodes plot, cast, director, genre,
 * year and rating to empty strings, so everything below the title only exists
 * after the `get_vod_info` call this screen makes. That is why the screen
 * renders from the cached list entry first and fills in as the detail lands,
 * rather than showing a spinner over the whole page.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getMovieDetail } from '@/api/endpoints';
import { NotFoundError } from '@/api/errors';
import { useCatalogue } from '@/store/catalogue';
import { useDownloads } from '@/store/downloads';
import { useFavorites } from '@/store/favorites';
import { useTitleOpenAd } from '@/hooks/useTitleOpenAd';
import { useProgress, movieKey } from '@/store/progress';
import { useSession } from '@/store/session';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { MediaRow } from '@/ui/MediaRow';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from '@/ui/platform';
import type { MovieDetail } from '@/types/domain';

const RELATED_COUNT = 20;

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export default function MovieDetailScreen() {
  useTitleOpenAd();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const movieId = Number(id);
  const session = useSession((s) => s.session);
  const data = useCatalogue((s) => s.data);
  const cached = useCatalogue((s) => s.movieById(movieId));
  const resumeAt = useProgress((s) => s.resumeAt(movieKey(movieId)));
  const isFavorite = useFavorites((s) => s.isFavorite('movie', movieId));
  const toggleFavorite = useFavorites((s) => s.toggle);

  const key = movieKey(movieId);
  const download = useDownloads((s) => s.entries[key]);
  const enqueue = useDownloads((s) => s.enqueue);
  const cancelDownload = useDownloads((s) => s.cancel);
  const retryDownload = useDownloads((s) => s.retry);

  const [detail, setDetail] = useState<MovieDetail | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    getMovieDetail(session, movieId, cached)
      .then((d) => !cancelled && setDetail(d))
      .catch((err) => {
        if (cancelled) return;
        setError(
          err instanceof NotFoundError
            ? 'This title is no longer in your library.'
            : 'Could not load the details for this title.',
        );
      });
    return () => {
      cancelled = true;
    };
  }, [session, movieId, cached]);

  const title = detail?.displayName ?? cached?.displayName ?? '';
  const poster = detail?.posterUrl ?? cached?.posterUrl ?? null;
  const quality = detail?.qualityLabel ?? cached?.qualityLabel ?? null;
  const ext = detail?.ext ?? cached?.ext ?? 'mp4';

  /** Other titles from the same category, straight out of the cached
   *  catalogue -- no extra request. */
  const related = useMemo(() => {
    if (!data || !cached) return [];
    return data.movies
      .filter((m) => m.categoryId === cached.categoryId && m.id !== movieId)
      .slice(0, RELATED_COUNT);
  }, [data, cached, movieId]);

  const play = (fromStart: boolean) =>
    router.push({
      pathname: '/player',
      params: {
        kind: 'movie',
        id: String(movieId),
        ext,
        title: detail?.name ?? cached?.name ?? '',
        posterUrl: poster ?? undefined,
        // A finished download plays from disk: no stream URL, no connection
        // slot, works with the network off.
        localUri: download?.status === 'done' ? (download.fileUri ?? undefined) : undefined,
        ...(fromStart ? { restart: '1' } : {}),
      },
    });

  const onDownload = () => {
    if (!session) return;
    if (!download) {
      enqueue(session, {
        key,
        kind: 'movie',
        id: String(movieId),
        ext,
        title: detail?.displayName ?? cached?.displayName ?? '',
        posterUrl: poster,
      });
      return;
    }
    if (download.status === 'done') play(false);
    else if (download.status === 'failed') retryDownload(session, key);
    else cancelDownload(key);
  };

  const downloadLabel = !download
    ? 'Download'
    : download.status === 'done'
      ? 'Downloaded'
      : download.status === 'failed'
        ? 'Retry download'
        : download.status === 'queued'
          ? 'Waiting…'
          : download.bytesTotal > 0
            ? `${Math.round((download.bytesWritten / download.bytesTotal) * 100)}%  ·  Cancel`
            : 'Downloading…';

  const downloadIcon: keyof typeof Ionicons.glyphMap = !download
    ? 'download-outline'
    : download.status === 'done'
      ? 'checkmark-circle'
      : download.status === 'failed'
        ? 'refresh'
        : 'close';

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.hero}>
        {poster ? (
          <Image
            source={{ uri: poster }}
            style={styles.poster}
            contentFit="cover"
            cachePolicy="memory-disk"
          />
        ) : (
          <View style={[styles.poster, styles.posterEmpty]} />
        )}

        <View style={styles.meta}>
          <Text style={styles.title}>{title}</Text>

          <View style={styles.badges}>
            {detail?.rating && detail.rating !== '0' ? (
              <Badge text={`★ ${detail.rating}`} accent />
            ) : null}
            {detail?.releaseDate ? <Badge text={detail.releaseDate} /> : null}
            {detail?.duration ? <Badge text={detail.duration} /> : null}
            {quality ? <Badge text={quality} /> : null}
            {detail?.audioCodec ? <Badge text={detail.audioCodec} /> : null}
            {download?.status === 'done' ? <Badge text="Offline" accent /> : null}
          </View>

          {detail?.genre ? (
            <View style={styles.badges}>
              {detail.genre
                .split(/[,/]/)
                .map((g) => g.trim())
                .filter(Boolean)
                .slice(0, 4)
                .map((g) => (
                  <Badge key={g} text={g} />
                ))}
            </View>
          ) : null}

          {!detail ? (
            <ActivityIndicator style={styles.spinner} color={Palette.accent} />
          ) : (
            <>
              {detail.plot ? <Text style={styles.plot}>{detail.plot}</Text> : null}
              {detail.director ? <Meta label="Director" value={detail.director} /> : null}
              {detail.cast ? <Meta label="Cast" value={detail.cast} /> : null}
            </>
          )}

          <FocusSection autoFocus style={styles.actions}>
            {resumeAt > 0 ? (
              <Action
                label={`▶  Resume ${formatTime(resumeAt)}`}
                primary
                preferFocus
                onPress={() => play(false)}
              />
            ) : null}
            <Action
              label={resumeAt > 0 ? 'Start over' : '▶  Play'}
              primary={resumeAt === 0}
              preferFocus={resumeAt === 0}
              onPress={() => play(true)}
            />
            <Action
              icon={isFavorite ? 'checkmark' : 'add'}
              label="My List"
              onPress={() => toggleFavorite('movie', movieId)}
            />
            <Action icon={downloadIcon} label={downloadLabel} onPress={onDownload} />
          </FocusSection>

          {download?.status === 'failed' && download.error ? (
            <Text style={styles.downloadError}>{download.error}</Text>
          ) : null}
        </View>
      </View>

      {related.length > 0 ? (
        <View style={styles.related}>
          <MediaRow
            title="More like this"
            items={related.map((m) => ({
              key: `rel-${m.id}`,
              title: m.displayName,
              posterUrl: m.posterUrl,
              qualityLabel: m.qualityLabel,
            }))}
            onSelect={(i) => router.push(`/movie/${related[i].id}`)}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

function Badge({ text, accent }: { text: string; accent?: boolean }) {
  return (
    <View style={[styles.badge, accent && styles.badgeAccent]}>
      <Text style={[styles.badgeText, accent && styles.badgeTextAccent]}>{text}</Text>
    </View>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <Text style={styles.metaLine}>
      <Text style={styles.metaLabel}>{label}: </Text>
      {value}
    </Text>
  );
}

function Action({
  label,
  icon,
  onPress,
  primary,
  preferFocus,
}: {
  label: string;
  icon?: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  primary?: boolean;
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
        <View
          style={[
            styles.action,
            primary && styles.actionPrimary,
            focused && styles.actionFocused,
          ]}
        >
          {icon ? (
            <Ionicons
              name={icon}
              size={16}
              color={primary ? Palette.text : Palette.textSecondary}
            />
          ) : null}
          <Text style={styles.actionText}>{label}</Text>
        </View>
      )}
    </Focusable>
  );
}

const POSTER_W = IS_TV ? 300 : 140;

const styles = StyleSheet.create({
  content: { padding: OVERSCAN.horizontal, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  error: { color: Palette.danger, fontSize: Type.body, textAlign: 'center' },
  hero: { flexDirection: IS_TV ? 'row' : 'column', gap: 24 },
  poster: {
    width: POSTER_W,
    height: POSTER_W / (2 / 3),
    borderRadius: Layout.radius,
    backgroundColor: Palette.surface,
  },
  posterEmpty: { backgroundColor: Palette.surfaceRaised },
  meta: { flex: 1 },
  title: { color: Palette.text, fontSize: Type.title, fontWeight: '700' },
  badges: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  badge: {
    backgroundColor: Palette.surfaceRaised,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  badgeAccent: { backgroundColor: Palette.brandDeep },
  badgeText: { color: Palette.textSecondary, fontSize: Type.caption },
  badgeTextAccent: { color: Palette.text, fontWeight: '700' },
  spinner: { marginTop: 20, alignSelf: 'flex-start' },
  plot: {
    color: Palette.textSecondary,
    fontSize: Type.body,
    lineHeight: Type.body * 1.5,
    marginTop: 16,
  },
  metaLine: { color: Palette.textSecondary, fontSize: Type.caption, marginTop: 8 },
  metaLabel: { color: Palette.textMuted },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginTop: 24 },
  actionOuter: { marginRight: 12, marginBottom: 12 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Layout.radius,
    paddingHorizontal: 20,
    paddingVertical: IS_TV ? 14 : 10,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  actionPrimary: { backgroundColor: Palette.brand },
  actionFocused: { borderColor: Palette.focus },
  actionText: { color: Palette.text, fontSize: Type.body, fontWeight: '600' },
  downloadError: { color: Palette.danger, fontSize: Type.caption, marginTop: -4 },
  related: { marginTop: 32, marginHorizontal: -OVERSCAN.horizontal },
});
