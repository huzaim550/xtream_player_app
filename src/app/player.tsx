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
import { NavigationBar } from 'expo-navigation-bar';
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
import { show as showInterstitial } from '@/ads/interstitial';
import { episodeStreamUrl, movieStreamUrl } from '@/api/streamUrl';
import { midRollPoints, preRollOn, useAds } from '@/store/ads';
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

  /*
   * Orientation is NOT set here.
   *
   * This screen used to call ScreenOrientation.lockAsync() on mount and again
   * on unmount. That drives setRequestedOrientation() on the Activity from JS,
   * on its own schedule -- and it fired while react-native-screens was busy
   * attaching and detaching the fragments either side of the transition. The
   * result was a blank native surface with the whole app gone from it: the
   * grey/white screen on backing out of playback.
   *
   * It is now declared on the route instead (`orientation: 'landscape'` in
   * src/app/_layout.tsx, against `'portrait'` on every other screen), so
   * react-native-screens applies it as a window trait tied to the fragment
   * lifecycle. The navigator owns the rotation and the transition, which means
   * they can no longer race -- and there is no unlock left to strand if this
   * screen dies badly.
   *
   * expo-screen-orientation stays in package.json even though nothing imports
   * it any more. It is a native module: keeping it in the APK is what would let
   * a landscape regression be fixed over the air, instead of costing another
   * build and reinstall. Do not "tidy" it away without a device to test on.
   */

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
  /**
   * What media3 did with the video track, shown in the controls.
   *
   * Temporary, for the black-picture-with-audio bug. It splits the two halves
   * of that problem, which look identical from the sofa: if this reports a size
   * and `ok`, the frames are being decoded and the picture is being lost on the
   * way to the screen (a compositing bug in this app). If it reports `no video
   * track` or `unsupported`, the decoder never ran and the file or the device
   * is the problem -- and expo-video does not always raise an error for that,
   * which is why it can look like a black screen rather than a failure.
   */
  const [probe, setProbe] = useState<string | null>(null);
  /** Set by VideoView's onFirstFrameRender: a frame reached the surface. */
  const [firstFrame, setFirstFrame] = useState(false);
  /**
   * Forces the video surface visible. See the comment on <VideoView> below --
   * this flips true -> false shortly after mount on purpose, and the flip, not
   * the value, is what does the work.
   *
   * `adGeneration` is bumped every time a full-screen ad closes. Returning from
   * one destroys and recreates the SurfaceView, which puts expo-video back in
   * the state the flip exists to escape -- so the flip has to happen again. It
   * used to run once at mount, which was enough until something could re-attach
   * the surface mid-film.
   */
  const [shutter, setShutter] = useState(true);
  const [adGeneration, setAdGeneration] = useState(0);
  useEffect(() => {
    setShutter(true);
    const t = setTimeout(() => setShutter(false), 500);
    return () => clearTimeout(t);
  }, [adGeneration]);
  /** True while a full-screen ad is up. Drops the controls, like `left`. */
  const [adShowing, setAdShowing] = useState(false);
  const adsConfig = useAds((s) => s.config);
  /**
   * Ads are skipped entirely for a downloaded file: choosing to download
   * something is choosing to watch it without the network, and an ad request
   * that cannot succeed would pause the film for nothing. Also skipped on TV,
   * where a full-screen ad has no dismiss control a remote can reach.
   */
  const adsAllowed = !!adsConfig && !params.localUri && !IS_TV;
  /** Break times in seconds, computed once from the duration. */
  const pendingBreaks = useRef<number[]>([]);
  const breaksPlanned = useRef(false);

  const [countdown, setCountdown] = useState<number | null>(null);
  const hasSeeked = useRef(false);
  /** Latched by leave(), so playback can only be exited once. */
  const leaving = useRef(false);
  /** The render-side half of that latch -- see leave(). */
  const [left, setLeft] = useState(false);
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
    // Reading position off a released player throws
    // ERR_USING_RELEASED_SHARED_OBJECT. This runs from the unmount cleanup and
    // from the AppState handler, both of which can fire *after* useVideoPlayer
    // has released the native object -- so the read has to be allowed to fail.
    // There is nothing to save at that point anyway.
    let position: number;
    let duration: number;
    try {
      position = player.currentTime ?? 0;
      duration = player.duration ?? 0;
    } catch {
      return;
    }
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
   * Setting `left` is what actually fixed the blank screen on exit, and it is
   * the load-bearing line here. Navigation is queued, so this screen renders at
   * least once more after the press -- and react-native-screens freezes and
   * thaws it around the transition, which forces yet more renders. By then
   * useVideoPlayer may already have released the native player, and *any* touch
   * of a released expo-video object throws ERR_USING_RELEASED_SHARED_OBJECT.
   * That throw came from render, so React tore the whole tree down and left the
   * bare window behind: the grey screen, and then the white one.
   *
   * Flipping `left` first drops VideoView and PlayerControls from the tree in
   * the same commit, so nothing is left holding the player while it dies.
   * PlayerControls is the dangerous one -- it reads `player.playing` on every
   * single render and polls `currentTime` four times a second.
   */
  const leave = useCallback(() => {
    // Latched, because navigation is queued: without this a quick double-tap
    // dispatches a second GO_BACK that pops `(app)` off the root stack too.
    if (leaving.current) return;
    leaving.current = true;
    setLeft(true);
    save();
    void flush();
    // Stops the audio playing on over the page behind during the transition.
    // Guarded for the same reason as save() -- by the time a slow flush lands,
    // the player may be gone.
    try {
      player?.pause();
    } catch {
      /* already released; it is not playing either way */
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

  /** Reads the selected video track. Guarded: the player may be released. */
  const sampleProbe = useCallback(() => {
    try {
      const track = player.videoTrack;
      if (!track) {
        const available = player.availableVideoTracks?.length ?? 0;
        setProbe(available === 0 ? 'probe: no video track' : `probe: ${available} tracks, none selected`);
        return;
      }
      const { width, height } = track.size ?? { width: 0, height: 0 };
      setProbe(
        `probe: ${width}×${height} · ${track.mimeType ?? 'unknown'} · ${
          track.isSupported ? 'ok' : 'UNSUPPORTED'
        }`,
      );
    } catch {
      /* released mid-sample; the controls are going away anyway */
    }
  }, [player]);

  /**
   * Run a full-screen ad, with playback paused around it.
   *
   * The ordering here is the whole thing. Every step exists because of a way
   * this screen is already known to break:
   *
   *  - the leave() latch is checked first, and again after: an ad must never
   *    appear once the user has pressed back, and the app can be backgrounded
   *    and this screen destroyed while Google's Activity has focus
   *  - `adShowing` drops PlayerControls from the tree exactly as `left` does.
   *    Those controls read player.playing every render and poll currentTime
   *    four times a second, which is the code most likely to touch a released
   *    player while the surface underneath is being torn down and rebuilt
   *  - VideoView stays mounted. Unmounting it *is* the surface-attach path the
   *    expo-video patch exists to survive; there is no reason to walk it twice
   *  - playback resumes whatever the ad did. show() resolves rather than
   *    rejects, and resolves on a timeout if the ad never opened, because a
   *    promise that never settles here is a film that never restarts
   */
  const runAd = useCallback(async () => {
    if (leaving.current || !adsConfig) return;
    try {
      player.pause();
    } catch {
      return; // already released; there is nothing left to interrupt
    }
    setAdShowing(true);
    await showInterstitial(adsConfig.minSecondsBetween);
    if (leaving.current) return;
    setAdShowing(false);
    // Re-run the surface flip: coming back from the ad Activity recreated the
    // SurfaceView, so expo-video is back to hiding it.
    setAdGeneration((n) => n + 1);
    try {
      player.play();
    } catch {
      /* the screen is going away; nothing to resume */
    }
  }, [adsConfig, player]);

  // Seek only once the source is loaded -- setting currentTime earlier is a
  // no-op. sourceLoad can fire again (e.g. after a track change), so the ref
  // stops a mid-film re-seek.
  useEventListener(player, 'sourceLoad', ({ duration }) => {
    setReady(true);
    sampleProbe();
    const target = resumeTarget.current;
    if (!hasSeeked.current && target > 5 && target < duration - 30) {
      player.currentTime = target;
    }
    // Work out where the ad breaks fall, once, off the duration this event
    // carries. A ref rather than state: nothing renders from it.
    const firstLoad = !breaksPlanned.current;
    if (firstLoad) {
      breaksPlanned.current = true;
      pendingBreaks.current = adsAllowed
        ? midRollPoints(duration, target)
        : [];
    }
    hasSeeked.current = true;

    // The pre-roll replaces this play() rather than preceding it: runAd()
    // pauses and resumes around the ad, so starting playback first would leak a
    // second or two of film before the advert.
    if (firstLoad && adsAllowed && preRollOn()) {
      void runAd();
      return;
    }
    player.play();
  });

  useEventListener(player, 'timeUpdate', ({ currentTime }) => {
    save();
    // The break check reads the event payload, never the player object, so the
    // one thing running every second on this screen cannot be the thing that
    // touches a released player.
    if (!adsAllowed || adShowing || leaving.current || left) return;
    const next = pendingBreaks.current[0];
    if (next === undefined || currentTime < next) return;
    // Consumed before the await, so the tick a second from now cannot fire the
    // same break twice.
    pendingBreaks.current = pendingBreaks.current.slice(1);
    void runAd();
  });

  useEventListener(player, 'statusChange', ({ status, error: err }) => {
    if (status === 'error') {
      setError(err?.message ?? 'This file could not be played.');
    }
    // Tracks are not always resolved by the time sourceLoad fires.
    if (status === 'readyToPlay') sampleProbe();
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

  // On the way out: black, and nothing that touches the player. This must come
  // before every other branch -- see leave() for why rendering VideoView or
  // PlayerControls one frame too long takes the whole app down. It is also what
  // the user should see anyway: the picture goes out, then the screen slides
  // away.
  if (left) return <View style={styles.root} />;

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
      {/* Netflix-style: no back/home/recents while a film is on. Declarative
          rather than a pair of imperative calls, so the bar comes back purely
          because this element unmounted -- there is no restore to forget and no
          way to strand the device with no navigation bar if playback dies. The
          system still reveals it on a swipe from the edge.

          The route's own `navigationBarHidden` option was tried first, since it
          needs no native module; it hid the status bar but not this. Rendered
          only in the playback tree, so the error screen above keeps its bar. */}
      <NavigationBar hidden />
      {/* `useExoShutter={shutter}` is load-bearing, and the fact that it flips
          from true to false half a second after mount is the whole trick. This
          is what stops playback being audio over a black picture.

          expo-video keeps the video surface at alpha 0 until it decides the
          first frame has arrived. In 56.1.4 that decision is gated on the
          surface's aspect ratio matching the video's:

            val hasCorrectRatio = abs(trackAspect - surfaceAspect) < 0.05
            return hasCorrectRatio || hasFillContentFit || videoSizeIsUnknown

          (FirstFrameEventGenerator.isPlayerSurfaceLayoutValid). Our surface is
          the full screen -- 2340x1080, 2.167 -- and this library is full of
          2.35:1 films: 1130x480 is 2.354. The difference is 0.19, the gate
          never passes, the event is never emitted, and the surface it would
          have revealed stays invisible while media3 renders 25fps into it.
          Verified on the device: `mRenderFrameCnt = 25 fps` with a black
          screen.

          `useExoShutter` is meant to opt out of that whole mechanism, but its
          setter is also wrong:

            set(value) {
              ...
              applySurfaceViewVisibility()   // reads the OLD field
              field = value                  // assigned after
            }

          so setting it true does nothing -- the visibility call still sees
          null. Setting it *false* while the field holds true is what takes the
          `else` branch and puts the surface back to alpha 1, with a
          transparent shutter over it. Hence true on mount, false on the next
          tick.

          This is a workaround for someone else's bug, and it will stop being
          necessary when expo-video fixes either the gate or the setter -- at
          which point delete it and set nothing. Until then, do not "simplify"
          it to a constant: a constant cannot flip, and the flip is the fix. */}
      <VideoView
        style={StyleSheet.absoluteFill}
        player={player}
        useExoShutter={shutter}
        nativeControls={Layout.useNativeControls}
        contentFit="contain"
        fullscreenOptions={{ enable: !Layout.useNativeControls }}
        // Diagnostic: proves frames reached the surface. See `probe`.
        onFirstFrameRender={() => setFirstFrame(true)}
      />

      {!ready ? (
        <View style={styles.center} pointerEvents="none">
          <ActivityIndicator color={Palette.brand} size="large" />
        </View>
      ) : null}

      {/* `adShowing` drops these for the same reason `left` does: they read
          player.playing on every render and poll currentTime four times a
          second, and an ad is exactly when the surface underneath is being torn
          down and rebuilt. See runAd(). */}
      {ready && !adShowing && !Layout.useNativeControls && countdown === null ? (
        <PlayerControls
          player={player}
          title={params.title || 'Playing'}
          subtitle={episodeLabel}
          probe={probe ? `${probe} · frame ${firstFrame ? 'yes' : 'NO'}` : null}
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
