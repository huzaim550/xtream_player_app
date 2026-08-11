/**
 * Starts the AdMob SDK on app launch.
 *
 * Ads are always enabled by default. This initialization ensures Google's
 * consent form is shown where required and the SDK is ready to serve ads.
 *
 * Mounted from the (app) layout. Google's consent form is a modal over whatever
 * is on screen, and the one place it must never appear is over a landscape
 * film. The player is a root-stack route outside (app), so mounting this here
 * means the form can only ever land on a browsing screen.
 */

import { useEffect } from 'react';
import { initAds } from '@/ads';
import { preload } from '@/ads/interstitial';
import { IS_TV } from '@/ui/platform';

export function useAdsInit(): void {
  useEffect(() => {
    if (IS_TV) return;
    void initAds().then((ok) => {
      // Ask for the first interstitial now rather than at the moment a film is
      // meant to pause for one.
      if (ok) void preload();
    });
  }, []);
}
