/**
 * Starts the AdMob SDK, but only once the server has said this account gets ads.
 *
 * Deferring it is the whole point. Until this fires, the Google SDK has made no
 * network call, read no advertising identifier and shown no consent form -- so
 * a user with ads switched off is in exactly the position src/content/privacy.ts
 * describes, not merely one where the ads happen to be hidden.
 *
 * Mounted from the (app) layout, which is also the gate: Google's consent form
 * is a modal over whatever is on screen, and the one place it must never appear
 * is over a landscape film. The player is a root-stack route outside (app), so
 * mounting this here means the form can only ever land on a browsing screen.
 */

import { useEffect } from 'react';
import { initAds } from '@/ads';
import { preload } from '@/ads/interstitial';
import { adsOn, useAds } from '@/store/ads';
import { IS_TV } from '@/ui/platform';

export function useAdsInit(): void {
  const on = useAds((s) => adsOn(s.config));

  useEffect(() => {
    if (!on || IS_TV) return;
    void initAds().then((ok) => {
      // Ask for the first interstitial now rather than at the moment a film is
      // meant to pause for one.
      if (ok) void preload();
    });
  }, [on]);
}
