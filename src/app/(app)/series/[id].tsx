import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getSeriesDetail } from '@/api/endpoints';
import { useCatalogue } from '@/store/catalogue';
import { useFavorites } from '@/store/favorites';
import { useProgress, episodeKey } from '@/store/progress';
import { useSession } from '@/store/session';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from '@/ui/platform';
import type { Episode, SeriesDetail } from '@/types/domain';

export default function SeriesDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const seriesId = Number(id);
  const session = useSession((s) => s.session);
  const cached = useCatalogue((s) => s.seriesById(seriesId));
  const entries = useProgress((s) => s.entries);
  const lastEpisodeFor = useProgress((s) => s.lastEpisodeFor);
  const isFavorite = useFavorites((s) => s.isFavorite('series', seriesId));
  const toggleFavorite = useFavorites((s) => s.toggle);

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

  const resumeEntry = useMemo(
    () => lastEpisodeFor(seriesId),
    [lastEpisodeFor, seriesId, entries],
  );

  const play = (ep: Episode) =>
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
        posterUrl: (detail?.posterUrl ?? cached?.posterUrl) ?? undefined,
      },
    });

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>{error}</Text>
      </View>
    );
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={Palette.accent} size="large" />
      </View>
    );
  }

  const season = detail.seasons[seasonIndex];
  const poster = detail.posterUrl ?? cached?.posterUrl ?? null;

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
          {detail.plot ? <Text style={styles.plot}>{detail.plot}</Text> : null}

          <FocusSection autoFocus style={styles.actions}>
            {resumeEntry ? (
              <Action
                primary
                preferFocus
                label={`Continue S${resumeEntry.season}E${resumeEntry.episodeNum}`}
                onPress={() => {
                  const ep = detail.seasons
                    .flatMap((s) => s.episodes)
                    .find((e) => e.id === resumeEntry.id);
                  if (ep) play(ep);
                }}
              />
            ) : null}
            <Action
              label={isFavorite ? '★ Saved' : '☆ Save'}
              preferFocus={!resumeEntry}
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
          return (
            <Focusable
              key={ep.id}
              onPress={() => play(ep)}
              showFocusRing={false}
              style={styles.epOuter}
            >
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
          );
        })}
      </FocusSection>
    </ScrollView>
  );
}

function Action({
  label,
  onPress,
  primary,
  preferFocus,
}: {
  label: string;
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
          <Text style={[styles.actionText, primary && styles.actionTextPrimary]}>
            {label}
          </Text>
        </View>
      )}
    </Focusable>
  );
}

const POSTER_W = IS_TV ? 260 : 130;

const styles = StyleSheet.create({
  content: { padding: OVERSCAN.horizontal },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
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
  plot: {
    color: Palette.textSecondary,
    fontSize: Type.body,
    lineHeight: Type.body * 1.5,
    marginTop: 12,
  },
  actions: { flexDirection: 'row', flexWrap: 'wrap', marginTop: 20 },
  actionOuter: { marginRight: 12, marginBottom: 12 },
  action: {
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Layout.radius,
    paddingHorizontal: 22,
    paddingVertical: IS_TV ? 14 : 10,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  actionPrimary: { backgroundColor: Palette.accent },
  actionFocused: { borderColor: Palette.focus },
  actionText: { color: Palette.text, fontSize: Type.body, fontWeight: '600' },
  actionTextPrimary: { color: '#04121F' },

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
  chipActive: { backgroundColor: Palette.surfaceRaised },
  chipFocused: { borderColor: Palette.focus },
  chipText: { color: Palette.text, fontSize: Type.caption },

  episodes: { marginTop: 20 },
  epOuter: { marginBottom: 8 },
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
  track: {
    height: 3,
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 2,
    marginTop: 8,
  },
  fill: { height: '100%', backgroundColor: Palette.accent, borderRadius: 2 },
  check: { color: Palette.success, fontSize: 18, fontWeight: '700' },
});
