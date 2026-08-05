/**
 * Full-screen ads: the pre-roll, the mid-roll breaks, and the browse one.
 *
 * One module-level instance, because AdMob loads an interstitial well before it
 * is shown and a per-call object would mean requesting an ad at the exact
 * moment the picture is meant to stop.
 *
 * Everything here resolves rather than rejects. The player pauses playback
 * before calling show() and resumes when it returns, so a promise that never
 * settles is a film that never restarts -- which is a far worse outcome than a
 * missed impression.
 */

import { AdEventType, InterstitialAd } from 'react-native-google-mobile-ads';
import { initAds, unitId } from './index';

/**
 * How long to wait for an ad that has been asked to open. Generous, because a
 * slow network is the normal case here, but finite for the reason above.
 */
const OPEN_TIMEOUT_MS = 8000;

/** Shared across every placement, so a browse ad cannot land seconds after a
 *  mid-roll. The server sets the floor; this is what enforces it. */
let lastShownAt = 0;

let ad: InterstitialAd | null = null;
let loaded = false;
let loading = false;

function instance(): InterstitialAd {
  if (!ad) {
    ad = InterstitialAd.createForAdRequest(unitId('interstitial'));
    ad.addAdEventListener(AdEventType.LOADED, () => {
      loaded = true;
      loading = false;
    });
    ad.addAdEventListener(AdEventType.ERROR, () => {
      loaded = false;
      loading = false;
    });
    ad.addAdEventListener(AdEventType.CLOSED, () => {
      // An interstitial is single-use: the next one has to be requested now if
      // it is to be ready in time for the next break.
      loaded = false;
      void preload();
    });
  }
  return ad;
}

/** Ask for the next ad. Cheap to call repeatedly; ignored while one is in flight. */
export async function preload(): Promise<void> {
  if (loaded || loading) return;
  if (!(await initAds())) return;
  loading = true;
  try {
    instance().load();
  } catch {
    loading = false;
  }
}

export function canShow(minSecondsBetween: number): boolean {
  if (!loaded) return false;
  return Date.now() - lastShownAt >= minSecondsBetween * 1000;
}

/**
 * Show the loaded ad, resolving when it closes.
 *
 * Resolves `false` without waiting when there is nothing to show or the floor
 * has not elapsed, so callers can skip a break rather than pause for nothing.
 * Resolves `true` once the ad has been dismissed -- or when it has taken too
 * long to open, on the assumption that whatever went wrong is not worth holding
 * playback for.
 */
export function show(minSecondsBetween: number): Promise<boolean> {
  if (!canShow(minSecondsBetween)) {
    void preload();
    return Promise.resolve(false);
  }

  return new Promise<boolean>((resolve) => {
    let settled = false;
    const finish = (shown: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      closed();
      errored();
      resolve(shown);
    };

    const timer = setTimeout(() => finish(false), OPEN_TIMEOUT_MS);
    const closed = instance().addAdEventListener(AdEventType.CLOSED, () => finish(true));
    const errored = instance().addAdEventListener(AdEventType.ERROR, () => finish(false));

    try {
      lastShownAt = Date.now();
      instance().show();
    } catch {
      finish(false);
    }
  });
}

/** Signing out, or ads being switched off, should not leave one primed. */
export function reset(): void {
  ad = null;
  loaded = false;
  loading = false;
}
