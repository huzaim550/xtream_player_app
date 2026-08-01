import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { getMovieDetail } from '@/api/endpoints';
import { NotFoundError } from '@/api/errors';
import { useCatalogue } from '@/store/catalogue';
import { useFavorites } from '@/store/favorites';
import { useProgress, movieKey } from '@/store/progress';
import { useSession } from '@/store/session';
import { Focusable } from '@/ui/Focusable';
import { FocusSection } from '@/ui/FocusSection';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from '@/ui/platform';
import type { MovieDetail } from '@/types/domain';

function formatTime(sec: number): string {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export default function MovieDetailScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const movieId = Number(id);
  const session = useSession((s) => s.session);
  const cached = useCatalogue((s) => s.movieById(movieId));
  const resumeAt = useProgress((s) => s.resumeAt(movieKey(movieId)));
  const isFavorite = useFavorites((s) => s.isFavorite('movie', movieId));
  const toggleFavorite = useFavorites((s) => s.toggle);

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

  const play = (fromStart: boolean) =>
    router.push({
      pathname: '/player',
      params: {
        kind: 'movie',
        id: String(movieId),
        ext,
        title: detail?.name ?? cached?.name ?? '',
        posterUrl: poster ?? undefined,
        ...(fromStart ? { restart: '1' } : {}),
      },
    });

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
            {quality ? <Badge text={quality} /> : null}
            {detail?.releaseDate ? <Badge text={detail.releaseDate} /> : null}
            {detail?.duration ? <Badge text={detail.duration} /> : null}
            {detail?.audioCodec ? <Badge text={detail.audioCodec} /> : null}
          </View>

          {!detail ? (
            <ActivityIndicator style={styles.spinner} color={Palette.accent} />
          ) : (
            <>
              {detail.plot ? <Text style={styles.plot}>{detail.plot}</Text> : null}
              {detail.genre ? <Meta label="Genre" value={detail.genre} /> : null}
              {detail.director ? <Meta label="Director" value={detail.director} /> : null}
              {detail.cast ? <Meta label="Cast" value={detail.cast} /> : null}
            </>
          )}

          <FocusSection autoFocus style={styles.actions}>
            {resumeAt > 0 ? (
              <Action
                label={`Resume from ${formatTime(resumeAt)}`}
                primary
                preferFocus
                onPress={() => play(false)}
              />
            ) : null}
            <Action
              label={resumeAt > 0 ? 'Start over' : 'Play'}
              primary={resumeAt === 0}
              preferFocus={resumeAt === 0}
              onPress={() => play(true)}
            />
            <Action
              label={isFavorite ? '★ Saved' : '☆ Save'}
              onPress={() => toggleFavorite('movie', movieId)}
            />
          </FocusSection>
        </View>
      </View>
    </ScrollView>
  );
}

function Badge({ text }: { text: string }) {
  return (
    <View style={styles.badge}>
      <Text style={styles.badgeText}>{text}</Text>
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

const POSTER_W = IS_TV ? 300 : 140;

const styles = StyleSheet.create({
  content: { padding: OVERSCAN.horizontal },
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
  badgeText: { color: Palette.textSecondary, fontSize: Type.caption },
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
});
