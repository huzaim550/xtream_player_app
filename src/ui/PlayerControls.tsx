/**
 * The phone transport overlay.
 *
 * TV keeps media3's native controls -- see Layout.useNativeControls in
 * platform.ts for why. This is the touch counterpart: bigger targets, a
 * scrubber you can drag, and the track pickers expo-video exposes but the
 * native Android controls bury.
 *
 * Everything here is driven off polled state rather than events, because
 * `player.currentTime` is the only source that stays correct while the user is
 * dragging the scrub handle.
 *
 * The back arrow top-left is load-bearing, not decoration. Playback hides the
 * Android status and navigation bars (see the `player` screen options in
 * src/app/_layout.tsx), so it is the only way out that is always one tap away
 * once the controls are up -- which is why it is an `arrow-back` rather than
 * the `chevron-down` it used to be, and why the hidden state below is a
 * full-screen tap target that brings the chrome straight back.
 */

import { Ionicons } from '@expo/vector-icons';
import { useEvent } from 'expo';
import type { AudioTrack, SubtitleTrack, VideoPlayer } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import {
  PanResponder,
  StyleSheet,
  Text,
  View,
  type LayoutChangeEvent,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Focusable } from './Focusable';
import { FocusSection } from './FocusSection';
import { ABSOLUTE_FILL, Layout, Palette, Type } from './platform';

const SKIP_SECONDS = 10;

function clock(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) sec = 0;
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = Math.floor(sec % 60);
  return h > 0
    ? `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
    : `${m}:${String(s).padStart(2, '0')}`;
}

export interface PlayerControlsProps {
  player: VideoPlayer;
  /**
   * A live channel rather than a title with an end.
   *
   * Removes the scrubber, the clock and the ±10s buttons -- not to simplify the
   * chrome, but because none of them mean anything against an open-ended HLS
   * stream. `player.duration` is not a finite number there, so a progress bar
   * would render at a nonsense position and a seek would be a request to jump
   * somewhere the stream does not have.
   */
  live?: boolean;
  title: string;
  subtitle?: string;
  /** What media3 did with the video track. See the probe in src/app/player.tsx. */
  probe?: string | null;
  onBack: () => void;
  onOpenExternally: () => void;
  /** Present only when there is a neighbouring episode to jump to -- absent
   *  hides the button rather than disabling it. */
  onPrevEpisode?: () => void;
  onNextEpisode?: () => void;
}

export function PlayerControls({
  player,
  live = false,
  title,
  subtitle,
  probe,
  onBack,
  onOpenExternally,
  onPrevEpisode,
  onNextEpisode,
}: PlayerControlsProps) {
  const insets = useSafeAreaInsets();
  const [visible, setVisible] = useState(true);
  // Bumped on every interaction. `visible` alone cannot restart the hide timer,
  // because pressing a button while the controls are already up does not change
  // it -- so the bar would vanish mid-scrub.
  const [nudge, setNudge] = useState(0);
  const [panel, setPanel] = useState<'none' | 'audio' | 'subtitle'>('none');
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);
  const [scrubbing, setScrubbing] = useState(false);
  const [barWidth, setBarWidth] = useState(1);

  const { isPlaying } = useEvent(player, 'playingChange', {
    isPlaying: player.playing,
    oldIsPlaying: undefined,
  });

  // Refs, because the PanResponder is created once and would otherwise close
  // over the first render's values forever.
  const barWidthRef = useRef(1);
  const durationRef = useRef(0);
  barWidthRef.current = barWidth;
  durationRef.current = duration;

  // Poll rather than listen: timeUpdate fires at 1Hz, which makes the counter
  // visibly lag a scrub. 250ms is smooth and still cheap.
  useEffect(() => {
    // Nothing renders position or duration on a live channel, so the poll would
    // be four reads a second off the player for no output at all -- and reading
    // a player is the one operation on this screen that can throw.
    if (live) return;
    const t = setInterval(() => {
      if (scrubbing) return;
      // A tick can land in the gap between the player being released and this
      // interval being cleared, and touching a released expo-video object
      // throws ERR_USING_RELEASED_SHARED_OBJECT. The player screen already
      // unmounts this component before that happens; this is the backstop, so
      // a stray tick can never be the thing that kills the app.
      try {
        setPosition(player.currentTime ?? 0);
        setDuration(player.duration ?? 0);
      } catch {
        clearInterval(t);
      }
    }, 250);
    return () => clearInterval(t);
  }, [player, scrubbing, live]);

  // Auto-hide, restarted by `visible` flipping back to true. Never hides while
  // a track panel is open or a drag is in progress.
  //
  // `position` must stay OUT of this dependency list: it changes four times a
  // second, and each change would clear and restart the timer, so the controls
  // would never actually hide.
  useEffect(() => {
    if (!visible || panel !== 'none' || scrubbing || !isPlaying) return;
    const t = setTimeout(() => setVisible(false), Layout.controlsHideMs);
    return () => clearTimeout(t);
  }, [visible, panel, scrubbing, isPlaying, nudge]);

  const show = () => {
    setVisible(true);
    setNudge((n) => n + 1);
  };

  const seekTo = (fraction: number) => {
    const d = durationRef.current;
    if (d <= 0) return;
    player.currentTime = Math.max(0, Math.min(d, fraction * d));
  };

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: (e) => {
        setScrubbing(true);
        const f = e.nativeEvent.locationX / barWidthRef.current;
        setPosition(f * durationRef.current);
      },
      onPanResponderMove: (e) => {
        const f = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidthRef.current));
        setPosition(f * durationRef.current);
      },
      onPanResponderRelease: (e) => {
        const f = Math.max(0, Math.min(1, e.nativeEvent.locationX / barWidthRef.current));
        seekTo(f);
        setScrubbing(false);
      },
      onPanResponderTerminate: () => setScrubbing(false),
    }),
  ).current;

  const pct = duration > 0 ? Math.max(0, Math.min(1, position / duration)) : 0;

  // Hidden state is still a full-screen tap target -- this is the only way the
  // controls come back. containerStyle is what actually gives it size: `style`
  // alone lands on the inner Pressable and would resolve against a zero-height
  // wrapper, leaving a control that renders but cannot be pressed.
  if (!visible) {
    return (
      <Focusable
        onPress={show}
        showFocusRing={false}
        accessibilityLabel="Show controls"
        containerStyle={ABSOLUTE_FILL}
        style={styles.fill}
      >
        <View style={styles.fill} />
      </Focusable>
    );
  }

  return (
    <View style={styles.root}>
      {/* Tapping dead space hides the chrome, the way every video app behaves.
          Rendered first so it sits *under* the buttons in z-order and never
          swallows their touches. */}
      <Focusable
        onPress={() => (panel === 'none' ? setVisible(false) : setPanel('none'))}
        showFocusRing={false}
        accessibilityLabel="Hide controls"
        containerStyle={ABSOLUTE_FILL}
        style={styles.fill}
      >
        <View style={styles.dim} />
      </Focusable>

      <FocusSection
        style={[
          styles.top,
          // The status and navigation bars are hidden during playback, but a
          // camera cutout is not -- and in landscape it sits on exactly the
          // edge the back arrow lives on. paddingLeft/Right win over the
          // stylesheet's paddingHorizontal.
          {
            paddingTop: styles.top.paddingTop + insets.top,
            paddingLeft: styles.top.paddingHorizontal + insets.left,
            paddingRight: styles.top.paddingHorizontal + insets.right,
          },
        ]}
      >
        <IconButton icon="arrow-back" label="Back" onPress={onBack} />
        <View style={styles.titles}>
          <View style={styles.titleLine}>
            {/* The only thing that tells you this is a channel and not a
                recording, now that the scrubber -- which would have said so by
                its absence -- is gone. */}
            {live ? (
              <View style={styles.liveBadge}>
                <View style={styles.liveDot} />
                <Text style={styles.liveText}>LIVE</Text>
              </View>
            ) : null}
            <Text style={styles.title} numberOfLines={1}>
              {title}
            </Text>
          </View>
          {subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
          {probe ? (
            <Text style={styles.probe} numberOfLines={1}>
              {probe}
            </Text>
          ) : null}
        </View>
        <IconButton icon="open-outline" label="Open in another app" onPress={onOpenExternally} />
      </FocusSection>

      <FocusSection style={styles.center}>
        {onPrevEpisode ? (
          <IconButton
            icon="play-skip-back"
            label="Previous episode"
            big
            onPress={() => {
              onPrevEpisode();
            }}
          />
        ) : null}
        {!live ? (
          <IconButton
            icon="play-back"
            label={`Back ${SKIP_SECONDS} seconds`}
            big
            onPress={() => {
              player.seekBy(-SKIP_SECONDS);
              show();
            }}
          />
        ) : null}
        <IconButton
          icon={isPlaying ? 'pause' : 'play'}
          label={isPlaying ? 'Pause' : 'Play'}
          hero
          onPress={() => {
            if (isPlaying) player.pause();
            else player.play();
            show();
          }}
        />
        {!live ? (
          <IconButton
            icon="play-forward"
            label={`Forward ${SKIP_SECONDS} seconds`}
            big
            onPress={() => {
              player.seekBy(SKIP_SECONDS);
              show();
            }}
          />
        ) : null}
        {onNextEpisode ? (
          <IconButton
            icon="play-skip-forward"
            label="Next episode"
            big
            onPress={() => {
              onNextEpisode();
            }}
          />
        ) : null}
      </FocusSection>

      <View
        style={[
          styles.bottom,
          {
            paddingBottom: styles.bottom.paddingBottom + insets.bottom,
            paddingLeft: styles.bottom.paddingHorizontal + insets.left,
            paddingRight: styles.bottom.paddingHorizontal + insets.right,
          },
        ]}
      >
        {/* Both come out for a live channel: there is no elapsed time that
            means anything and nowhere to scrub to. The track pickers below
            stay -- a live HLS stream can carry several audio renditions and
            subtitle tracks exactly like a file can. */}
        {!live ? (
          <>
            <View style={styles.timeRow}>
              <Text style={styles.time}>{clock(position)}</Text>
              <Text style={styles.time}>-{clock(Math.max(0, duration - position))}</Text>
            </View>

            <View
              style={styles.barHit}
              onLayout={(e: LayoutChangeEvent) =>
                setBarWidth(e.nativeEvent.layout.width)
              }
              {...pan.panHandlers}
            >
              <View style={styles.barTrack}>
                <View style={[styles.barFill, { width: `${pct * 100}%` }]} />
              </View>
              <View style={[styles.knob, { left: `${pct * 100}%` }]} />
            </View>
          </>
        ) : null}

        <FocusSection style={styles.trackRow}>
          <TrackButton
            icon="volume-medium-outline"
            label="Audio"
            active={panel === 'audio'}
            onPress={() => setPanel(panel === 'audio' ? 'none' : 'audio')}
          />
          <TrackButton
            icon="text-outline"
            label="Subtitles"
            active={panel === 'subtitle'}
            onPress={() => setPanel(panel === 'subtitle' ? 'none' : 'subtitle')}
          />
        </FocusSection>

        {panel === 'audio' ? (
          <TrackPanel
            emptyLabel="This file has only one audio track."
            // `id` is optional on a track, so the list index is the only key
            // guaranteed to exist and be unique.
            options={player.availableAudioTracks.map((t: AudioTrack, i: number) => ({
              key: `audio-${i}`,
              label: t.label || t.language || `Track ${i + 1}`,
              selected: player.audioTrack?.id === t.id,
              onPress: () => {
                player.audioTrack = t;
                setPanel('none');
              },
            }))}
          />
        ) : null}

        {panel === 'subtitle' ? (
          <TrackPanel
            emptyLabel="This file has no subtitle tracks."
            options={[
              {
                key: '__off__',
                label: 'Off',
                selected: player.subtitleTrack === null,
                onPress: () => {
                  player.subtitleTrack = null;
                  setPanel('none');
                },
              },
              ...player.availableSubtitleTracks.map((t: SubtitleTrack, i: number) => ({
                key: `sub-${i}`,
                label: t.label || t.language || `Subtitle ${i + 1}`,
                selected: player.subtitleTrack?.id === t.id,
                onPress: () => {
                  player.subtitleTrack = t;
                  setPanel('none');
                },
              })),
            ]}
          />
        ) : null}
      </View>
    </View>
  );
}

function TrackPanel({
  options,
  emptyLabel,
}: {
  options: { key: string; label: string; selected: boolean; onPress: () => void }[];
  emptyLabel: string;
}) {
  // "Off" alone is not a choice, so treat a lone entry as empty.
  if (options.length <= 1) {
    return <Text style={styles.panelEmpty}>{emptyLabel}</Text>;
  }
  return (
    <FocusSection autoFocus style={styles.panel}>
      {options.map((o) => (
        <Focusable key={o.key} onPress={o.onPress} showFocusRing={false}>
          {({ focused }) => (
            <View style={[styles.panelRow, focused && styles.panelRowFocused]}>
              <Ionicons
                name={o.selected ? 'radio-button-on' : 'radio-button-off'}
                size={16}
                color={o.selected ? Palette.brand : Palette.textMuted}
              />
              <Text style={styles.panelText}>{o.label}</Text>
            </View>
          )}
        </Focusable>
      ))}
    </FocusSection>
  );
}

function IconButton({
  icon,
  label,
  onPress,
  big,
  hero,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  big?: boolean;
  hero?: boolean;
}) {
  const size = hero ? 40 : big ? 30 : 22;
  return (
    <Focusable onPress={onPress} showFocusRing={false} accessibilityLabel={label}>
      {({ focused }) => (
        <View
          style={[
            styles.iconButton,
            hero && styles.iconButtonHero,
            big && styles.iconButtonBig,
            focused && styles.iconButtonFocused,
          ]}
        >
          <Ionicons name={icon} size={size} color={Palette.text} />
        </View>
      )}
    </Focusable>
  );
}

function TrackButton({
  icon,
  label,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Focusable onPress={onPress} showFocusRing={false} style={styles.trackOuter}>
      {({ focused }) => (
        <View
          style={[
            styles.trackButton,
            active && styles.trackButtonActive,
            focused && styles.trackButtonFocused,
          ]}
        >
          <Ionicons name={icon} size={16} color={Palette.text} />
          <Text style={styles.trackLabel}>{label}</Text>
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  root: { ...ABSOLUTE_FILL, justifyContent: 'space-between' },
  fill: { flex: 1 },
  dim: { flex: 1, backgroundColor: 'rgba(0,0,0,0.35)' },

  top: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 18,
    paddingTop: 14,
  },
  titles: { flex: 1 },
  titleLine: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { flex: 1, color: Palette.text, fontSize: Type.body, fontWeight: '700' },
  liveBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    backgroundColor: Palette.brand,
  },
  liveDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: Palette.text },
  liveText: { color: Palette.text, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  subtitle: { color: Palette.textSecondary, fontSize: Type.caption, marginTop: 2 },
  // Diagnostic, not chrome: deliberately quiet, and only on screen while the
  // controls are. Remove it once the black-picture bug is closed.
  probe: { color: Palette.textMuted, fontSize: 10, marginTop: 2 },

  center: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 36,
  },

  bottom: { paddingHorizontal: 18, paddingBottom: 18 },
  timeRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 },
  time: { color: Palette.textSecondary, fontSize: Type.caption, fontVariant: ['tabular-nums'] },

  // A tall invisible hit area around a thin bar: the bar is 4px, the target 28.
  barHit: { height: 28, justifyContent: 'center' },
  barTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255,255,255,0.28)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: Palette.brand },
  knob: {
    position: 'absolute',
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: -7,
    backgroundColor: Palette.brand,
  },

  trackRow: { flexDirection: 'row', gap: 10, marginTop: 10 },
  trackOuter: {},
  trackButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: Layout.radius,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  trackButtonActive: { backgroundColor: Palette.brand },
  trackButtonFocused: { borderColor: Palette.focus },
  trackLabel: { color: Palette.text, fontSize: Type.caption, fontWeight: '600' },

  panel: {
    marginTop: 10,
    backgroundColor: 'rgba(0,0,0,0.85)',
    borderRadius: Layout.radius,
    paddingVertical: 6,
  },
  panelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
    borderRadius: Layout.radius,
  },
  panelRowFocused: { borderColor: Palette.focus, backgroundColor: 'rgba(255,255,255,0.08)' },
  panelText: { color: Palette.text, fontSize: Type.caption },
  panelEmpty: { color: Palette.textMuted, fontSize: Type.caption, marginTop: 10 },

  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
  },
  iconButtonBig: { width: 60, height: 60, borderRadius: 30 },
  iconButtonHero: {
    width: 82,
    height: 82,
    borderRadius: 41,
    backgroundColor: Palette.brand,
  },
  iconButtonFocused: { borderColor: Palette.focus },
});
