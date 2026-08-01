/**
 * Playback.
 *
 * Phase A deliberately uses expo-video's native controls: media3's PlayerView
 * already handles the D-pad on TV and touch on a phone correctly, so shipping
 * this first validates the real risk (codec support on cheap hardware) without
 * spending days on a custom overlay that might be built on sand.
 *
 * Three things here are load-bearing and easy to break:
 *  - the stream URL is built HERE, at play time, never earlier (connection slots)
 *  - no `headers` on the source (they would replay onto the presigned R2 redirect)
 *  - progress is flushed on background, not just unmount (the TV home button)
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
import { ABSOLUTE_FILL, IS_TV, Layout, Palette, Type } from '@/ui/platform';

export default function PlayerScreen() {
  useKeepAwake();
  const router = useRouter();

  // The rest of the app is portrait-locked (app.config.ts), so playback needs
  // its own override -- landscape on the way in, back to portrait on the way
  // out, regardless of how this screen is left (back, error, or unmount).
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
  }>();

  const kind = params.kind === 'episode' ? 'episode' : 'movie';
  const entryKey = kind === 'movie' ? movieKey(params.id) : episodeKey(params.id);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const hasSeeked = useRef(false);
  // Captured once: "Start over" must win over whatever is stored, and the
  // stored value would otherwise change under us as we write progress.
  const resumeTarget = useRef(params.restart === '1' ? 0 : resumeAtFor(entryKey));

  // Built here and nowhere else. Every request to this URL takes a connection
  // slot the server holds for 30 minutes, so it must never be constructed
  // on mount of a list or a detail screen.
  const uri = session
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

  // Back is how most playbacks end; flush before the screen goes away.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      save();
      void flush();
      return false;
    });
    return () => sub.remove();
  }, [save, flush]);

  useEffect(
    () => () => {
      save();
      void flush();
    },
    [save, flush],
  );

  if (!session || !uri) {
    return (
      <View style={styles.center}>
        <Text style={styles.error}>Not signed in.</Text>
      </View>
    );
  }

  // The escape hatch for files this device cannot decode: hand the stream URL
  // to VLC / MX Player via ACTION_VIEW. The external app re-requests the same
  // /movie|/series URL, so it lands on the same connection slot for this
  // (user, ip) rather than consuming a second one.
  const openExternally = () =>
    IntentLauncher.startActivityAsync('android.intent.action.VIEW', {
      data: uri ?? undefined,
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
        <Focusable onPress={() => router.back()} style={styles.buttonSecondary}>
          <Text style={styles.buttonSecondaryText}>Go back</Text>
        </Focusable>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        nativeControls
        contentFit="contain"
        fullscreenOptions={{ enable: !IS_TV }}
      />
      {!ready ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color={Palette.accent} size="large" />
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
    backgroundColor: Palette.accent,
    borderRadius: Layout.radius,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonText: { color: '#04121F', fontSize: Type.body, fontWeight: '700' },
  buttonSecondary: {
    marginTop: 12,
    backgroundColor: Palette.surfaceRaised,
    borderRadius: Layout.radius,
    paddingHorizontal: 24,
    paddingVertical: 12,
  },
  buttonSecondaryText: { color: Palette.text, fontSize: Type.body, fontWeight: '600' },
});
