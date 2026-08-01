/**
 * A poster tile. The one card component for movies, series, and the Continue
 * Watching row, so focus behaviour is identical everywhere.
 */

import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';
import { Focusable } from './Focusable';
import { ABSOLUTE_FILL, IS_TV, Layout, Palette, Type } from './platform';

export interface PosterCardProps {
  title: string;
  posterUrl: string | null;
  /** e.g. "1080p · x265 · BluRay" -- the first thing to check when a file
   *  refuses to play on a weak device, so it belongs on the card. */
  qualityLabel?: string | null;
  /** 0..1. Draws the resume bar in Continue Watching. */
  progress?: number;
  watched?: boolean;
  width?: number;
  onPress: () => void;
  onLongPress?: () => void;
  onFocusEnter?: () => void;
  hasTVPreferredFocus?: boolean;
}

export function PosterCard({
  title,
  posterUrl,
  qualityLabel,
  progress,
  watched,
  width = Layout.posterWidth,
  onPress,
  onLongPress,
  onFocusEnter,
  hasTVPreferredFocus,
}: PosterCardProps) {
  const height = width / Layout.posterAspect;

  return (
    <Focusable
      onPress={onPress}
      onLongPress={onLongPress}
      onFocusEnter={onFocusEnter}
      hasTVPreferredFocus={hasTVPreferredFocus}
      style={{ width, margin: Layout.gap / 2 }}
    >
      {({ focused }) => (
        <View>
          <View style={[styles.art, { width: width - 6, height }]}>
            {posterUrl ? (
              <Image
                source={{ uri: posterUrl }}
                style={StyleSheet.absoluteFill}
                contentFit="cover"
                // Glide keys its disk cache on this URL, not on the presigned
                // R2 URL it redirects to -- so the 1h signature never causes a
                // re-fetch, and rotating the server's secret key changes the
                // token, which invalidates the cache for free.
                cachePolicy="memory-disk"
                transition={150}
              />
            ) : (
              // stream_icon is '' for anything without artwork. Show the title
              // rather than a broken image box.
              <View style={styles.placeholder}>
                <Text style={styles.placeholderText} numberOfLines={4}>
                  {title}
                </Text>
              </View>
            )}

            {watched ? (
              <View style={styles.watched}>
                <Text style={styles.watchedMark}>✓</Text>
              </View>
            ) : null}

            {progress !== undefined && progress > 0 ? (
              <View style={styles.progressTrack}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${Math.min(100, Math.max(0, progress * 100))}%` },
                  ]}
                />
              </View>
            ) : null}
          </View>

          <Text
            style={[styles.title, focused && styles.titleFocused]}
            numberOfLines={2}
          >
            {title}
          </Text>
          {qualityLabel ? (
            <Text style={styles.quality} numberOfLines={1}>
              {qualityLabel}
            </Text>
          ) : null}
        </View>
      )}
    </Focusable>
  );
}

const styles = StyleSheet.create({
  art: {
    borderRadius: Layout.radius,
    overflow: 'hidden',
    backgroundColor: Palette.surface,
  },
  placeholder: {
    ...ABSOLUTE_FILL,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 8,
    backgroundColor: Palette.surfaceRaised,
  },
  placeholderText: {
    color: Palette.textMuted,
    fontSize: Type.caption,
    textAlign: 'center',
  },
  watched: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Palette.scrim,
  },
  watchedMark: { color: Palette.success, fontSize: 14, fontWeight: '700' },
  progressTrack: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 4,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  progressFill: { height: '100%', backgroundColor: Palette.accent },
  title: {
    marginTop: 6,
    color: Palette.textSecondary,
    fontSize: Type.caption,
  },
  titleFocused: { color: Palette.text },
  quality: {
    marginTop: 2,
    color: Palette.textMuted,
    fontSize: IS_TV ? 13 : 10,
  },
});
