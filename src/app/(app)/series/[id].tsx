/**
 * Series detail.
 *
 * Two things here are less obvious than they look:
 *
 * - The "Next episode" action resolves against watch progress, not against the
 *   season list. `lastEpisodeFor` gives the most recently *touched* episode; if
 *   it was finished we advance one, otherwise we resume it. That is why a show
 *   you half-watched offers Resume and a show you finished offers the next one.
 * - Every play passes the *following* episode's ids as params, so the player can
 *   auto-advance without calling get_series_info again from inside playback.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { getSeriesDetail } from '@/api/endpoints';
import { useCatalogue } from '@/store/catalogue';
import { useDownloads } from '@/store/downloads';
import { useFavorites } from '@/store/favorites';
import { lastEpisodeIn, useProgress, episodeKey } from '@/store/progress';
import { useTitleOpenAd } from '@/hooks/useTitleOpenAd';
import { useSession } from '@/store/session';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { MediaRow } from '@/ui/MediaRow';
import { SkeletonRow } from '@/ui/Skeleton';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from '@/ui/platform';
import type { Episode, SeriesDetail } from '@/types/domain';

const RELATED_COUNT = 20;

export default function SeriesDetailScreen() {
  useTitleOpenAd();
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const seriesId = Number(id);
  const session = useSession((s) => s.session);
  const data = useCatalogue((s) => s.data);
  const cached = useCatalogue((s) => s.seriesById(seriesId));
  const entries = useProgress((s) => s.entries);
  const isFavorite = useFavorites((s) => s.isFavorite('series', seriesId));
  const toggleFavorite = useFavorites((s) => s.toggle);
  const downloads = useDownloads((s) => s.entries);
  const enqueue = useDownloads((s) => s.enqueue);
  const cancelDownload = useDownloads((s) => s.cancel);

  const [detail, setDetail] = useState<SeriesDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [seasonIndex, setSeasonIndex] = useState(0);

  useEffect(() => {
    if (!session) return;
    let cancelled = false;
    getSeriesDetail(session, seriesId, cached)
      .then((d) => !cancelled && setDetail(d))
      .catch(() => !cancelled && setError('Could not load this show.'));
    return () => {
      cancelled = true;
    };
  }, [session, seriesId, cached]);

  // Derived from `entries` itself rather than the store's lastEpisodeFor()
  // getter -- see the note in src/store/downloads.ts.
  const resumeEntry = useMemo(() => lastEpisodeIn(entries, seriesId), [entries, seriesId]);

  /** Flat, in broadcast order -- the sequence "next episode" walks. */
  const ordered = useMemo(
    () => (detail ? detail.seasons.flatMap((s) => s.episodes) : []),
    [detail],
  );

  /**
   * What the primary button should do: resume the part-watched episode, or move
   * on to the one after the last finished one, or start at the beginning.
   */
  const upNext = useMemo(() => {
    if (ordered.length === 0) return null;
    if (!resumeEntry) return { episode: ordered[0], resuming: false };
    const at = ordered.findIndex((e) => e.id === resumeEntry.id);
    if (at === -1) return { episode: ordered[0], resuming: false };
    if (!resumeEntry.finished) return { episode: ordered[at], resuming: true };
    return at + 1 < ordered.length
      ? { episode: ordered[at + 1], resuming: false }
      : { episode: ordered[at], resuming: false };
  }, [ordered, resumeEntry]);

  const related = useMemo(() => {
    if (!data || !cached) return [];
    return data.series
      .filter((s) => s.categoryId === cached.categoryId && s.id !== seriesId)
      .slice(0, RELATED_COUNT);
  }, [data, cached, seriesId]);

  const poster = detail?.posterUrl ?? cached?.posterUrl ?? null;

  const play = (ep: Episode) => {
    const at = ordered.findIndex((e) => e.id === ep.id);
    const next = at >= 0 ? ordered[at + 1] : undefined;
    const dl = downloads[episodeKey(ep.id)];

    router.push({
      pathname: '/player',
      params: {
        kind: 'episode',
        id: ep.id,
        ext: ep.ext,
        title: ep.title,
        seriesId: String(seriesId),
        seriesName: detail?.name ?? cached?.name ?? '',
        season: String(ep.season),
        episodeNum: String(ep.episodeNum),
        posterUrl: poster ?? undefined,
        localUri: dl?.status === 'done' ? (dl.fileUri ?? undefined) : undefined,
        // Handed over so the player can auto-advance with no API call.
        nextId: next?.id,
        nextExt: next?.ext,
        nextTitle: next?.title,
        nextSeason: next ? String(next.season) : undefined,
        nextEpisodeNum: next ? String(next.episodeNum) : undefined,
      },
    });
  };

  const toggleEpisodeDownload = (ep: Episode) => {
    if (!session) return;
    const k = episodeKey(ep.id);
    const existing = downloads[k];
    if (existing && existing.status !== 'failed') {
      if (existing.status === 'done') play(ep);
      else cancelDownload(k);
      return;
    }
    enqueue(session, {
      key: k,
      kind: 'episode',
      id: ep.id,
      ext: ep.ext,
      title: ep.title,
      posterUrl: poster,
      seriesId,
      seriesName: detail?.displayName ?? cached?.displayName ?? '',
      season: ep.season,
      episodeNum: ep.episodeNum,
    });
  };

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.loading}>
        <SkeletonRow cards={3} />
        <SkeletonRow cards={3} />
      </View>
    );
  }

  const season = detail.seasons[seasonIndex];

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
          <Text style={styles.title}>{detail.displayName}</Text>
          <Text style={styles.counts}>
            {detail.seasons.length === 1
              ? `${ordered.length} episodes`
              : `${detail.seasons.length} seasons · ${ordered.length} episodes`}
          </Text>
          {detail.plot ? <Text style={styles.plot}>{detail.plot}</Text> : null}

          <FocusSection autoFocus style={styles.actions}>
            {upNext ? (
              <Action
                primary
                preferFocus
                label={`▶  ${upNext.resuming ? 'Resume' : 'Play'} S${upNext.episode.season}E${upNext.episode.episodeNum}`}
                onPress={() => play(upNext.episode)}
              />
            ) : null}
            <Action
              icon={isFavorite ? 'checkmark' : 'add'}
              label="My List"
              onPress={() => toggleFavorite('series', seriesId)}
            />
          </FocusSection>
        </View>
      </View>

      {detail.seasons.length > 1 ? (
        <FocusSection style={styles.seasonRail}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            {detail.seasons.map((s, i) => (
              <Focusable
                key={s.number}
                onPress={() => setSeasonIndex(i)}
                showFocusRing={false}
                style={styles.chipOuter}
              >
                {({ focused }) => (
                  <View
                    style={[
                      styles.chip,
                      i === seasonIndex && styles.chipActive,
                      focused && styles.chipFocused,
                    ]}
                  >
                    <Text style={styles.chipText}>{s.name}</Text>
                  </View>
                )}
              </Focusable>
            ))}
          </ScrollView>
        </FocusSection>
      ) : null}

      <FocusSection autoFocus style={styles.episodes}>
        {season?.episodes.map((ep) => {
          const p = entries[episodeKey(ep.id)];
          const pct = p && p.durationSec > 0 ? p.positionSec / p.durationSec : 0;
          const dl = downloads[episodeKey(ep.id)];

          return (
            <View key={ep.id} style={styles.epRow}>
              <Focusable onPress={() => play(ep)} showFocusRing={false} style={styles.epOuter}>
                {({ focused }) => (
                  <View style={[styles.ep, focused && styles.epFocused]}>
                    <Text style={styles.epNum}>{ep.episodeNum}</Text>
                    <View style={styles.epBody}>
                      <Text style={styles.epTitle} numberOfLines={1}>
                        {ep.title}
                      </Text>
                      {ep.qualityLabel ? (
                        <Text style={styles.epQuality}>{ep.qualityLabel}</Text>
                      ) : null}
                      {pct > 0 && !p?.finished ? (
                        <View style={styles.track}>
                          <View style={[styles.fill, { width: `${pct * 100}%` }]} />
                        </View>
                      ) : null}
                    </View>
                    {p?.finished ? <Text style={styles.check}>✓</Text> : null}
                  </View>
                )}
              </Focusable>

              <Focusable
                onPress={() => toggleEpisodeDownload(ep)}
                showFocusRing={false}
                accessibilityLabel={`Download episode ${ep.episodeNum}`}
              >
                {({ focused }) => (
                  <View style={[styles.epDownload, focused && styles.epDownloadFocused]}>
                    <Ionicons
                      name={
                        dl?.status === 'done'
                          ? 'checkmark-circle'
                          : dl?.status === 'failed'
                            ? 'refresh'
                            : dl
                              ? 'close'
                              : 'download-outline'
                      }
                      size={18}
                      color={dl?.status === 'done' ? Palette.brand : Palette.textMuted}
                    />
                    {dl && dl.status === 'downloading' && dl.bytesTotal > 0 ? (
                      <Text style={styles.epPct}>
                        {Math.round((dl.bytesWritten / dl.bytesTotal) * 100)}%
                      </Text>
                    ) : null}
                  </View>
                )}
              </Focusable>
            </View>
          );
        })}
      </FocusSection>

      {related.length > 0 ? (
        <View style={styles.related}>
          <MediaRow
            title="More like this"
            items={related.map((s) => ({
              key: `rel-${s.id}`,
              title: s.displayName,
              posterUrl: s.posterUrl,
            }))}
            onSelect={(i) => router.push(`/series/${related[i].id}`)}
          />
        </View>
      ) : null}
    </ScrollView>
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

const POSTER_W = IS_TV ? 260 : 130;

const styles = StyleSheet.create({
  content: { padding: OVERSCAN.horizontal, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  loading: { paddingTop: OVERSCAN.vertical },
  error: { color: Palette.danger, fontSize: Type.body },
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
  counts: { color: Palette.textMuted, fontSize: Type.caption, marginTop: 6 },
  plot: {
    color: Palette.textSecondary,
    fontSize: Type.body,
    lineHeight: Type.body * 1.5,
    marginTop: 12,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20 },
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

  seasonRail: { marginTop: 28 },
  chipOuter: { marginRight: 8 },
  chip: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 999,
    backgroundColor: Palette.surface,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  chipActive: { backgroundColor: Palette.brand },
  chipFocused: { borderColor: Palette.focus },
  chipText: { color: Palette.text, fontSize: Type.caption },

  episodes: { marginTop: 20 },
  epRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  epOuter: { flex: 1 },
  ep: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    padding: 14,
    borderRadius: Layout.radius,
    backgroundColor: Palette.surface,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  epFocused: { borderColor: Palette.focus, backgroundColor: Palette.surfaceRaised },
  epNum: {
    color: Palette.textMuted,
    fontSize: Type.heading,
    fontWeight: '700',
    minWidth: 34,
  },
  epBody: { flex: 1 },
  epTitle: { color: Palette.text, fontSize: Type.body },
  epQuality: { color: Palette.textMuted, fontSize: Type.caption, marginTop: 2 },
  epDownload: {
    width: 44,
    height: 44,
    borderRadius: Layout.radius,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.surface,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  epDownloadFocused: { borderColor: Palette.focus, backgroundColor: Palette.surfaceRaised },
  epPct: { color: Palette.textMuted, fontSize: 9, marginTop: 1 },
  track: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginTop: 8,
  },
  fill: { height: '100%', backgroundColor: Palette.brand, borderRadius: 2 },
  check: { color: Palette.success, fontSize: 18, fontWeight: '700' },

  related: { marginTop: 32, marginHorizontal: -OVERSCAN.horizontal },
});
