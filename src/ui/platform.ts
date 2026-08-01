/**
 * Platform facts and the design tokens derived from them.
 *
 * The rule this file exists to enforce: components must NOT branch on IS_TV.
 * Branch once, here, in the token table -- components just read tokens. That is
 * what keeps one component tree serving both a finger and a D-pad instead of
 * quietly forking into two parallel UIs.
 */

import { Platform, type ViewStyle } from 'react-native';

/**
 * StyleSheet.absoluteFillObject spelled out.
 *
 * react-native-tvos 0.85.3-3 omits that member from its type declarations even
 * though it exists at runtime -- the fork's own template hits the same error.
 * Using our own constant keeps the app off the mistyped API entirely.
 */
export const ABSOLUTE_FILL: ViewStyle = {
  position: 'absolute',
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};

/** True on Android TV and Fire TV. Provided by the react-native-tvos fork. */
export const IS_TV: boolean = Platform.isTV === true;

/**
 * Safe area for a living-room screen. TVs overscan, so roughly 5% of a 1080p
 * frame can be off the edge of the panel; nothing interactive goes in there.
 */
export const OVERSCAN = IS_TV
  ? { horizontal: 48, vertical: 27 }
  : { horizontal: 16, vertical: 8 };

export const Layout = {
  posterWidth: IS_TV ? 220 : 120,
  /** Standard 2:3 movie poster. */
  posterAspect: 2 / 3,
  gridColumns: IS_TV ? 6 : 3,
  gap: IS_TV ? 20 : 12,
  rowGap: IS_TV ? 32 : 20,
  /** Android's minimum touch target; TV focus targets want a little more. */
  minTarget: IS_TV ? 48 : 44,
  focusRingWidth: 3,
  /** How much a focused card grows. Big enough to read across a room. */
  focusScale: IS_TV ? 1.08 : 1,
  focusAnimationMs: 120,
  radius: IS_TV ? 12 : 8,

  /**
   * The featured banner at the top of Home.
   *
   * The server never sends wide artwork -- `backdrop_path` is hardcoded `[]` in
   * both get_vod_info and get_series_info -- so the hero is built from the 2:3
   * poster: a blurred, zoomed copy fills the panel and the crisp poster sits on
   * top of it. These two numbers size that composition.
   */
  heroHeight: IS_TV ? 460 : 420,
  heroPosterWidth: IS_TV ? 200 : 140,
  /** How long each featured title holds before the banner advances. */
  heroRotateMs: 8000,

  /**
   * media3's PlayerView already handles the D-pad correctly, and a custom
   * overlay that misses one remote key makes a TV screen look frozen. So TV
   * keeps the native transport and phones get our own overlay.
   */
  useNativeControls: IS_TV,
  /** How long the phone control overlay stays up after the last interaction. */
  controlsHideMs: 3500,
} as const;

export const Type = {
  hero: IS_TV ? 44 : 30,
  title: IS_TV ? 34 : 24,
  heading: IS_TV ? 24 : 18,
  body: IS_TV ? 18 : 14,
  caption: IS_TV ? 15 : 12,
} as const;

/**
 * Dark throughout, on both platforms. A media app is watched in a dark room on
 * a TV, and a light theme behind video is unpleasant on a phone too -- so this
 * is a deliberate single-theme commitment, not an oversight.
 */
export const Palette = {
  background: '#0B0D10',
  surface: '#16191F',
  surfaceRaised: '#1F242C',
  text: '#FFFFFF',
  textSecondary: '#A5ADBA',
  textMuted: '#6B7280',
  /** Manzar red -- the wordmark, the play button, the active tab. */
  brand: '#E11D2E',
  brandBright: '#FF3B4E',
  brandDeep: '#8B0F1C',
  /** Kept for informational UI (links, spinners) so it stays distinct from
   *  brand red, which now means "act on this". */
  accent: '#3C9FFE',
  focus: '#FFFFFF',
  danger: '#F0616D',
  success: '#4ADE80',
  scrim: 'rgba(0,0,0,0.72)',
} as const;
