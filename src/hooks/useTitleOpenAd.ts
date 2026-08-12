/**
 * The browsing interstitial: one ad every N titles opened.
 *
 * Off unless the dashboard sets a count, because it is the most intrusive of
 * the three placements -- it interrupts someone who is still deciding what to
 * watch, rather than someone already committed to a film.
 *
 * Mounted by the movie and series detail screens. Never by the player: an ad
 * on the way *into* playback is the pre-roll's job, and it is subject to the
 * same shared time floor, so the two cannot stack.
 */

import { useEffect } from 'react';
import { show as showInterstitial } from '@/ads/interstitial';
import { useAds } from '@/store/ads';
import { removeAdsOwned, usePurchases } from '@/store/purchases';
import { IS_TV } from '@/ui/platform';

export function useTitleOpenAd(): void {
  const config = useAds((s) => s.config);
  const noteTitleOpen = useAds((s) => s.noteTitleOpen);
  const owned = usePurchases(removeAdsOwned);

  useEffect(() => {
    if (!config || IS_TV || owned) return;
    if (!noteTitleOpen()) return;
    // Fire and forget: nothing on this screen waits for it, and show() refuses
    // quietly if the floor since the last full-screen ad has not elapsed.
    void showInterstitial(config.interstitialMinSeconds);
    // Deliberately once per mount of a title screen. Opening the same title
    // again is a new open, which is what the operator means by "every N".
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
