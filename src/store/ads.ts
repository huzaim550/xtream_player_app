/**
 * Ad settings, as decided by the Xtream server.
 *
 * This rides the login handshake rather than polling anything. The server
 * already authenticates this user on every launch, already knows who they are,
 * and already has an admin panel to set this from -- so there is no new host,
 * no new request, and nothing to add to src/content/privacy.ts about a third
 * endpoint. The notifications channel deliberately carries *no* identity (see
 * store/notifications.ts), so it is the wrong place for a per-user setting.
 *
 * The server sends nothing at all unless ads are on for this account. Absent
 * therefore means off, which is also what an older server and a failed
 * handshake mean. Every one of those is the same fail-closed answer.
 *
 * Propagation is bounded by the handshake, not by this file: session.ts
 * revalidates at most hourly and on foreground, so a dashboard change lands
 * within the hour or at the next cold start. Do not add a poll here to make it
 * feel quicker -- that is a request per foreground for every user, forever.
 */

import { create } from 'zustand';
import type { AdSurface, AdsConfig } from '@/types/domain';
import type { RawAdsConfig, RawHandshake } from '@/types/raw';
import { Keys, readJson, remove, writeJson } from './persist';

const SURFACES: AdSurface[] = ['home', 'movies', 'series', 'search', 'my_list'];

interface AdsFile {
  version: 1;
  config: AdsConfig | null;
}

interface AdsState {
  /** Null means no ads: no account, ads off, older server, or never synced. */
  config: AdsConfig | null;
  hydrated: boolean;
  /**
   * Title screens opened this session, for the every-N-opens interstitial.
   * In memory on purpose: a fresh launch should not immediately owe an ad.
   */
  opens: number;

  hydrate: () => Promise<void>;
  applyHandshake: (raw: RawHandshake) => void;
  /** Counts one detail-screen open and says whether it has earned an ad. */
  noteTitleOpen: () => boolean;
  reset: () => void;
}

/** A count from the wire. Tolerates strings; junk becomes the floor. */
function num(value: unknown, lo: number, hi: number, fallback: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(lo, Math.min(hi, Math.round(n)));
}

/**
 * The one place a wire shape becomes an app shape -- same rule as
 * api/normalize.ts and the coerce() in store/notifications.ts.
 *
 * The server validates all of this already. It is re-checked here for the same
 * reason notifications re-checks its link URLs: this is the half that runs on
 * the device, where the damage would actually happen. A stray 500 in
 * midRollBreaks should cost nothing, not turn a film into an ad break every
 * twenty seconds.
 */
export function coerce(raw: RawAdsConfig | undefined | null): AdsConfig | null {
  if (!raw || typeof raw !== 'object') return null;

  const wanted = Array.isArray(raw.banner_surfaces) ? raw.banner_surfaces : [];
  return {
    // Filtered against the app's own list, so a surface a newer server knows
    // about and this build does not is dropped rather than carried around.
    bannerSurfaces: SURFACES.filter((s) => wanted.includes(s)),
    preRoll: num(raw.player_pre_roll, 0, 1, 0),
    midRollBreaks: num(raw.player_mid_roll_breaks, 0, 5, 0),
    minTitleSeconds: num(raw.player_min_title_seconds, 0, 86400, 900),
    minSecondsBetween: num(raw.player_min_seconds_between, 0, 86400, 300),
    everyNOpens: num(raw.interstitial_every_n_opens, 0, 100, 0),
    interstitialMinSeconds: num(raw.interstitial_min_seconds, 0, 86400, 180),
  };
}

export const useAds = create<AdsState>((set, get) => ({
  config: null,
  hydrated: false,
  opens: 0,

  hydrate: async () => {
    const file = await readJson<AdsFile>(Keys.ads);
    set({ config: file?.config ?? null, hydrated: true });
  },

  /**
   * Replace, never merge. Turning ads off in the dashboard has to actually turn
   * them off, and a merge would leave the last-known placement behind forever.
   */
  applyHandshake: (raw) => {
    const config = coerce(raw.manzar_ads);
    set({ config, hydrated: true });
    const file: AdsFile = { version: 1, config };
    void writeJson(Keys.ads, file);
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
    set({ config: null, opens: 0 });
    void remove(Keys.ads);
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

export function adsOn(config: AdsConfig | null): boolean {
  return config !== null;
}

export function bannerOn(config: AdsConfig | null, surface: AdSurface | null): boolean {
  if (!config || !surface) return false;
  return config.bannerSurfaces.includes(surface);
}

export function midRollBreaks(config: AdsConfig | null): number {
  return config?.midRollBreaks ?? 0;
}

export function preRollOn(config: AdsConfig | null): boolean {
  return (config?.preRoll ?? 0) > 0;
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
  config: AdsConfig | null,
  durationSec: number,
  resumeAtSec: number,
): number[] {
  if (!config) return [];
  const n = config.midRollBreaks;
  if (n <= 0) return [];
  if (!Number.isFinite(durationSec) || durationSec < config.minTitleSeconds) return [];

  const points: number[] = [];
  for (let i = 1; i <= n; i += 1) points.push((durationSec * i) / (n + 1));
  return points.filter((t) => t > resumeAtSec + 1);
}
