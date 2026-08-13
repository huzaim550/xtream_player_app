/**
 * One live channel, as a row.
 *
 * A row rather than a poster tile, deliberately. A channel has no 2:3 artwork
 * -- only a `tvg-logo`, which is a wide or square badge on a transparent
 * background -- and the useful thing about a channel is not its picture but
 * what is on it right now. A grid of logos would be a grid of similar-looking
 * rectangles you cannot scan; a list gives the guide text room to be read.
 *
 * The row renders completely with no guide at all: the channel's name is always
 * there, and the now/next lines simply do not appear. That matters because a
 * channel with no `tvg-id` never gets real programmes, and because a server
 * with no EPG source configured never gets them for anyone.
 */

import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { Focusable } from './Focusable';
import { IS_TV, Layout, OVERSCAN, Palette, Type } from './platform';
import type { Programme } from '@/types/domain';

export interface ChannelRowProps {
  name: string;
  logoUrl: string | null;
  /** Absent when the guide has not arrived, or has nothing real to say. */
  now?: Programme;
  next?: Programme;
  /** 0..1 through `now`. Only meaningful when `now` is set. */
  progress?: number;
  onPress: () => void;
  onFocusEnter?: () => void;
  hasTVPreferredFocus?: boolean;
}

const LOGO = IS_TV ? 72 : 54;

/** Local wall-clock time, which is what a guide is read against. */
function hhmm(unixSec: number): string {
  const d = new Date(unixSec * 1000);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function ChannelRow({
  name,
  logoUrl,
  now,
  next,
  progress = 0,
  onPress,
  onFocusEnter,
  hasTVPreferredFocus,
}: ChannelRowProps) {
  return (
    <Focusable
      onPress={onPress}
      onFocusEnter={onFocusEnter}
      hasTVPreferredFocus={hasTVPreferredFocus}
      showFocusRing={false}
      accessibilityLabel={now ? `${name}, now playing ${now.title}` : name}
    >
      {({ focused }) => (
        <View style={[styles.row, focused && styles.rowFocused]}>
          <View style={styles.logoBox}>
            {logoUrl ? (
              <Image
                source={{ uri: logoUrl }}
                style={styles.logo}
                // contain, not cover: a channel logo is a badge with its own
                // margins, and cropping it to fill the box cuts the mark.
                contentFit="contain"
                cachePolicy="memory-disk"
                transition={150}
              />
            ) : (
              // No tvg-logo in the playlist. A television glyph beats both a
              // broken image box and a stretched letter.
              <Ionicons name="tv-outline" size={LOGO / 2} color={Palette.textMuted} />
            )}
          </View>

          <View style={styles.text}>
            <Text style={styles.name} numberOfLines={1}>
              {name}
            </Text>

            {now ? (
              <>
                <View style={styles.nowLine}>
                  <Text style={styles.nowTitle} numberOfLines={1}>
                    {now.title}
                  </Text>
                  <Text style={styles.until}>{hhmm(now.stopSec)}</Text>
                </View>
                <View style={styles.barTrack}>
                  <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
                </View>
              </>
            ) : null}

            {next ? (
              <Text style={styles.next} numberOfLines={1}>
                Next: {next.title}
              </Text>
            ) : null}
          </View>

          <Ionicons
            name="play-circle"
            size={IS_TV ? 34 : 28}
            color={focused ? Palette.brand : Palette.textMuted}
          />
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 10,
    paddingHorizontal: OVERSCAN.horizontal,
    borderWidth: Layout.focusRingWidth,
    borderColor: 'transparent',
    borderRadius: Layout.radius,
  },
  rowFocused: { backgroundColor: Palette.surfaceRaised, borderColor: Palette.focus },

  logoBox: {
    width: LOGO,
    height: LOGO,
    borderRadius: Layout.radius,
    backgroundColor: Palette.surface,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  logo: { width: '100%', height: '100%' },

  text: { flex: 1 },
  name: { color: Palette.text, fontSize: Type.body, fontWeight: '700' },

  nowLine: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  nowTitle: { flex: 1, color: Palette.textSecondary, fontSize: Type.caption },
  until: { color: Palette.textMuted, fontSize: Type.caption, fontVariant: ['tabular-nums'] },

  barTrack: {
    height: 3,
    borderRadius: 2,
    marginTop: 5,
    backgroundColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  barFill: { height: '100%', backgroundColor: Palette.brand },

  next: { color: Palette.textMuted, fontSize: Type.caption, marginTop: 4 },
});
