/**
 * Playback.
 *
 * Four things here are load-bearing and easy to break:
 *  - the stream URL is built HERE, at play time, never earlier (connection slots)
 *  - no `headers` on the source (they would replay onto the presigned R2 redirect)
 *  - progress is flushed on background, not just unmount (the TV home button)
 *  - a `localUri` param wins over everything: a downloaded file plays straight
 *    off disk, which means no request, no connection slot, and no network
 *
 * Controls are split by platform in one place only -- Layout.useNativeControls.
 * media3's PlayerView already handles the D-pad correctly, and a custom overlay
 * that misses one remote key makes a TV look frozen, so TV keeps the native
 * transport while phones get src/ui/PlayerControls.tsx.
 */

import { useLocalSearchParams, useRouter } from 'expo-router';
import { useEventListener } from 'expo';
import { useKeepAwake } from 'expo-keep-awake';
import * as ScreenOrientation from 'expo-screen-orientation';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  BackHandler,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as IntentLauncher from 'expo-intent-launcher';
import { episodeStreamUrl, movieStreamUrl } from '@/api/streamUrl';
import { useProgress, episodeKey, movieKey } from '@/store/progress';
import { useSession } from '@/store/session';
import { Focusable } from '@/ui/Focusable';
import { PlayerControls } from '@/ui/PlayerControls';
import { ABSOLUTE_FILL, IS_TV, Layout, Palette, Type } from '@/ui/platform';

/** How long the "next episode" card counts down before it plays itself. */
const AUTOPLAY_SECONDS = 10;

export default function PlayerScreen() {
  useKeepAwake();
  const router = useRouter();

  // The rest of the app is portrait-locked (app.config.ts), so playback needs
  // its own override -- landscape on the way in, back to portrait on the way
  // out, regardless of how this screen is left (back, error, or unmount).
  // A TV has no orientation to lock.
  useEffect(() => {
    if (IS_TV) return;
    void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE);
    return () => {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    };
  }, []);

  const session = useSession((s) => s.session);
  const record = useProgress((s) => s.record);
  const flush = useProgress((s) => s.flush);
  const resumeAtFor = useProgress((s) => s.resumeAt);

  const params = useLocalSearchParams<{
    kind: 'movie' | 'episode';
    id: string;
    ext: string;
    title?: string;
    posterUrl?: string;
    seriesId?: string;
    seriesName?: string;
    season?: string;
    episodeNum?: string;
    /** '1' when the user explicitly chose "Start over". */
    restart?: string;
    /** file:// path of a completed download. Wins over the network source. */
    localUri?: string;
    /** The episode after this one, handed over by the series screen so the
     *  player can auto-advance without calling get_series_info. */
    nextId?: string;
    nextExt?: string;
    nextTitle?: string;
    nextSeason?: string;
    nextEpisodeNum?: string;
  }>();

  const kind = params.kind === 'episode' ? 'episode' : 'movie';
  const entryKey = kind === 'movie' ? movieKey(params.id) : episodeKey(params.id);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const [countdown, setCountdown] = useState<number | null>(null);
  const hasSeeked = useRef(false);
  // Captured once: "Start over" must win over whatever is stored, and the
  // stored value would otherwise change under us as we write progress.
  const resumeTarget = useRef(params.restart === '1' ? 0 : resumeAtFor(entryKey));

  // A downloaded file needs no server round trip at all. Otherwise the URL is
  // built here and nowhere else, because every request to it takes a connection
  // slot the server holds for 30 minutes.
  const uri = params.localUri
    ? params.localUri
    : session
      ? kind === 'movie'
        ? movieStreamUrl(session, Number(params.id), params.ext || 'mp4')
        : episodeStreamUrl(session, params.id, params.ext || 'mp4')
      : null;

  const player = useVideoPlayer(uri ? { uri, contentType: 'auto' } : null, (p) => {
    p.timeUpdateEventInterval = 1;
    p.staysActiveInBackground = false;
    // Caching would write multi-GB files to an 8GB Fire Stick.
    p.bufferOptions = { minBufferForPlayback: 3, preferredForwardBufferDuration: 30 };
  });

  const save = useCallback(() => {
    if (!player) return;
    const position = player.currentTime ?? 0;
    const duration = player.duration ?? 0;
    if (position <= 0) return;
    record({
      key: entryKey,
      kind,
      id: params.id,
      ext: params.ext || 'mp4',
      title: params.title ?? '',
      posterUrl: params.posterUrl ?? null,
      seriesId: params.seriesId ? Number(params.seriesId) : undefined,
      seriesName: params.seriesName,
      season: params.season ? Number(params.season) : undefined,
      episodeNum: params.episodeNum ? Number(params.episodeNum) : undefined,
      positionSec: position,
      durationSec: duration,
    });
  }, [player, record, entryKey, kind, params]);

  /**
   * The one way out of this screen.
   *
   * Every exit goes through here -- the on-screen back control, the error
   * screen, and the phone's own back button/gesture. That last one is why this
   * exists at all: letting the default handler close the screen dismissed the
   * native container without expo-router's state following it, and what was
   * left behind was a blank grey frame instead of the movie or series page the
   * user came from. Returning `true` from the BackHandler keeps JS
   * authoritative, so there is exactly one code path that ends playback.
   *
   * Portrait is requested here rather than only in the unmount cleanup so the
   * rotation overlaps the transition -- the screen underneath then lays out
   * once, in the orientation it will actually be seen in.
   */
  const leave = useCallback(() => {
    save();
    void flush();
    // The player is not released until this screen unmounts, which is after the
    // transition; without this the audio plays on over the page behind it.
    player?.pause();
    if (!IS_TV) {
      void ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.PORTRAIT_UP);
    }
    // A deep link or a notification can make the player the first route, in
    // which case there is nothing to go back to.
    if (router.canGoBack()) router.back();
    else router.replace('/(app)/home');
  }, [save, flush, player, router]);

  const playNext = useCallback(() => {
    if (!params.nextId) return;
    save();
    void flush();
    // replace, not push: otherwise Back walks the user through every episode
    // they auto-advanced through.
    router.replace({
      pathname: '/player',
      params: {
        kind: 'episode',
        id: params.nextId,
        ext: params.nextExt ?? 'mp4',
        title: params.nextTitle ?? '',
        seriesId: params.seriesId,
        seriesName: params.seriesName,
        season: params.nextSeason,
        episodeNum: params.nextEpisodeNum,
        posterUrl: params.posterUrl,
      },
    });
  }, [params, router, save, flush]);

  // Seek only once the source is loaded -- setting currentTime earlier is a
  // no-op. sourceLoad can fire again (e.g. after a track change), so the ref
  // stops a mid-film re-seek.
  useEventListener(player, 'sourceLoad', ({ duration }) => {
    setReady(true);
    const target = resumeTarget.current;
    if (!hasSeeked.current && target > 5 && target < duration - 30) {
      player.currentTime = target;
    }
    hasSeeked.current = true;
    player.play();
  });

  useEventListener(player, 'timeUpdate', () => save());

  useEventListener(player, 'statusChange', ({ status, error: err }) => {
    if (status === 'error') {
      setError(err?.message ?? 'This file could not be played.');
    }
  });

  // End of an episode with another one waiting: offer it, and take the offer if
  // the user does nothing.
  useEventListener(player, 'playToEnd', () => {
    if (params.nextId) setCountdown(AUTOPLAY_SECONDS);
  });

  useEffect(() => {
    if (countdown === null) return;
    if (countdown <= 0) {
      playNext();
      return;
    }
    const t = setTimeout(() => setCountdown((c) => (c === null ? null : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [countdown, playNext]);

  // The TV home button skips unmount entirely, and it is the most common way a
  // session ends on a Fire Stick -- so backgrounding must checkpoint.
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        save();
        void flush();
      }
    });
    return () => sub.remove();
  }, [save, flush]);

  // Back is how most playbacks end. `true` means "handled" -- see leave().
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      leave();
      return true;
    });
    return () => sub.remove();
  }, [leave]);

  useEffect(
    () => () => {
      save();
      void flush();
    },
    [save, flush],
  );

  if (!session && !params.localUri) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Not signed in.</Text>
      </View>
    );
  }

  if (!uri) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Nothing to play.</Text>
      </View>
    );
  }

  // The escape hatch for files this device cannot decode: hand the stream URL
  // to VLC / MX Player via ACTION_VIEW. The external app re-requests the same
  // /movie|/series URL, so it lands on the same connection slot for this
  // (user, ip) rather than consuming a second one.
  const openExternally = () =>
    IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: uri,
      type: 'video/*',
      flags: 268435456, // FLAG_ACTIVITY_NEW_TASK
    }).catch(() => setError('No other video player is installed on this device.'));

  if (error) {
    return (
      <View style={styles.center}>
        <Text style={styles.errorTitle}>Playback failed</Text>
        <Text style={styles.error}>{error}</Text>
        <Text style={styles.hint}>
          If this title is HEVC/x265 or in an AVI container, this device may not
          be able to decode it. A player like VLC often can.
        </Text>
        <Focusable onPress={openExternally} style={styles.button} hasTVPreferredFocus>
          <Text style={styles.buttonText}>Open in another app</Text>
        </Focusable>
        <Focusable onPress={leave} style={styles.buttonSecondary}>
          <Text style={styles.buttonSecondaryText}>Go back</Text>
        </Focusable>
      </View>
    );
  }

  const episodeLabel =
    kind === 'episode' && params.season
      ? `${params.seriesName ?? ''} · S${params.season}E${params.episodeNum}`
      : undefined;

  return (
    <View style={styles.root}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls={Layout.useNativeControls}
        contentFit="contain"
        fullscreenOptions={{ enable: !Layout.useNativeControls }}
      />

      {!ready ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color={Palette.brand} size="large" />
        </View>
      ) : null}

      {ready && !Layout.useNativeControls && countdown === null ? (
        <PlayerControls
          player={player}
          title={params.title || 'Playing'}
          subtitle={episodeLabel}
          onBack={leave}
          onOpenExternally={openExternally}
        />
      ) : null}

      {countdown !== null ? (
        <View style={styles.nextCard}>
          <Text style={styles.nextLabel}>Next episode</Text>
          <Text style={styles.nextTitle} numberOfLines={2}>
            S{params.nextSeason}E{params.nextEpisodeNum} · {params.nextTitle}
          </Text>
          <View style={styles.nextButtons}>
            <Focusable onPress={playNext} style={styles.button} hasTVPreferredFocus>
              <Text style={styles.buttonText}>Play now ({countdown})</Text>
            </Focusable>
            <Focusable onPress={() => setCountdown(null)} style={styles.buttonSecondary}>
              <Text style={styles.buttonSecondaryText}>Cancel</Text>
            </Focusable>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  center: {
    ...ABSOLUTE_FILL,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    backgroundColor: '#000',
  },
  errorTitle: {
    color: Palette.text,
    fontSize: Type.heading,
    fontWeight: '700',
    marginBottom: 8,
  },
  error: { color: Palette.danger, fontSize: Type.body, textAlign: 'center' },
  hint: {
    color: Palette.textMuted,
    fontSize: Type.caption,
    textAlign: 'center',
    marginTop: 12,
    maxWidth: 520,
  },
  button: {
    marginTop: 24,
    backgroundColor: Palette.brand,
    borderRadius: Layout.radius,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: { color: Palette.text, fontSize: Type.body, fontWeight: '700' },
  buttonSecondary: {
    marginTop: 12,
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Layout.radius,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonSecondaryText: { color: Palette.text, fontSize: Type.body, fontWeight: '600' },

  nextCard: {
    position: 'absolute',
    right: 24,
    bottom: 24,
    maxWidth: 420,
    padding: 18,
    borderRadius: Layout.radius,
    backgroundColor: 'rgba(0,0,0,0.9)',
  },
  nextLabel: {
    color: Palette.textMuted,
    fontSize: Type.caption,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  nextTitle: {
    color: Palette.text,
    fontSize: Type.body,
    fontWeight: '700',
    marginTop: 6,
  },
  nextButtons: { flexDirection: 'row', gap: 12, alignItems: 'center' },
});
