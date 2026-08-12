/**
 * Ad settings for the app.
 *
 * Ads are enabled by default with a consistent configuration. Every function
 * below takes a `purchased` flag -- whether the Remove Ads subscription
 * (src/store/purchases.ts, Play Billing only) is currently owned -- and
 * short-circuits to "no ads" when it is true. This file has no dependency on
 * that store itself; callers pass the flag in, same as they already read it
 * from their own selector.
 */

import { create } from 'zustand';
import type { AdSurface, AdsConfig } from '@/types/domain';

const SURFACES: AdSurface[] = ['home', 'movies', 'series', 'search', 'my_list'];

/** Default ad configuration - always enabled. */
const DEFAULT_ADS_CONFIG: AdsConfig = {
  bannerSurfaces: SURFACES,
  preRoll: 1,
  midRollBreaks: 2,
  minTitleSeconds: 900,
  minSecondsBetween: 300,
  everyNOpens: 3,
  interstitialMinSeconds: 180,
};

interface AdsState {
  /** Ads are always enabled with default config. */
  config: AdsConfig;
  hydrated: boolean;
  /**
   * Title screens opened this session, for the every-N-opens interstitial.
   * In memory on purpose: a fresh launch should not immediately owe an ad.
   */
  opens: number;

  hydrate: () => Promise<void>;
  /** Counts one detail-screen open and says whether it has earned an ad. */
  noteTitleOpen: () => boolean;
  reset: () => void;
}

export const useAds = create<AdsState>((set, get) => ({
  config: DEFAULT_ADS_CONFIG,
  hydrated: false,
  opens: 0,

  hydrate: async () => {
    // Always use default config - ads are enabled by default
    set({ config: DEFAULT_ADS_CONFIG, hydrated: true });
  },

  /**
   * Counting happens even when the ad is refused, so "every 3rd" stays every
   * 3rd rather than drifting whenever one fails to load. The time floor in
   * ads/interstitial.ts is the other guard: it is what stops this landing
   * seconds after a mid-roll.
   */
  noteTitleOpen: () => {
    const { config, opens } = get();
    const next = opens + 1;
    set({ opens: next });
    if (!config || config.everyNOpens <= 0) return false;
    return next % config.everyNOpens === 0;
  },

  reset: () => {
    set({ config: DEFAULT_ADS_CONFIG, opens: 0 });
  },
}));

/* --- pure selectors ---------------------------------------------------------
 *
 * Pure functions of the config, so screens can read them through a zustand
 * selector -- `useAds((s) => bannerOn(s.config, 'home'))`. Selectors re-run on
 * every store change and are exempt from the React Compiler problem described
 * in AGENTS.md; wrapping any of these in a useMemo inside a screen would freeze
 * it at mount.
 */

export function adsOn(purchased: boolean): boolean {
  return !purchased;
}

export function bannerOn(surface: AdSurface | null, purchased: boolean): boolean {
  if (!surface || purchased) return false;
  return DEFAULT_ADS_CONFIG.bannerSurfaces.includes(surface);
}

export function midRollBreaks(): number {
  return DEFAULT_ADS_CONFIG.midRollBreaks;
}

export function preRollOn(purchased: boolean): boolean {
  return !purchased && DEFAULT_ADS_CONFIG.preRoll > 0;
}

/**
 * Where the mid-roll breaks fall, in seconds.
 *
 * Evenly spread and strictly inside the runtime: one break is the halfway
 * point, two are the thirds. Breaks at or before `resumeAt` are dropped --
 * without that, resuming a film at 80% fires the halfway ad the instant it
 * starts, which is the most obvious way this feature could feel broken.
 */
export function midRollPoints(
  durationSec: number,
  resumeAtSec: number,
  purchased: boolean,
): number[] {
  if (purchased) return [];
  const config = DEFAULT_ADS_CONFIG;
  const n = config.midRollBreaks;
  if (n <= 0) return [];
  if (!Number.isFinite(durationSec) || durationSec < config.minTitleSeconds) return [];

  const points: number[] = [];
  for (let i = 1; i <= n; i += 1) points.push((durationSec * i) / (n + 1));
  return points.filter((t) => t > resumeAtSec + 1);
}
