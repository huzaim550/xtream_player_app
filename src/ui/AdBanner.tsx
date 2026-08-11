/**
 * The browsing banner.
 *
 * Mounted once in the (app) layout rather than per screen, so switching tabs
 * does not request a new ad every time -- AdMob's own refresh interval governs
 * that. Which screens it appears on is a server setting; this component is
 * where that setting becomes visible or not.
 *
 * The player is a root-stack route outside (app), so playback never carries
 * one. That is by design and not worth "fixing": a banner over video is both
 * ugly and, if it overlaps the picture, against AdMob's placement policy.
 */

import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { BannerAd, BannerAdSize } from 'react-native-google-mobile-ads';
import { initAds, unitId } from '@/ads';
import { bannerOn } from '@/store/ads';
import { useSession } from '@/store/session';
import type { AdSurface } from '@/types/domain';
import { IS_TV, Palette } from '@/ui/platform';

export interface AdBannerProps {
  /** Null on any screen that is not one of the five browsing surfaces. */
  surface: AdSurface | null;
}

export function AdBanner({ surface }: AdBannerProps) {
  // A zustand selector, not a useMemo: selectors re-run on every store change,
  // and the React Compiler would freeze a memo at mount. See AGENTS.md.
  const show = bannerOn(surface);
  const offline = useSession((s) => s.offline);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!show || IS_TV) return;
    let live = true;
    void initAds().then((ok) => {
      if (live) setReady(ok);
    });
    return () => {
      live = false;
    };
  }, [show]);

  // A BannerAd is not a Focusable, and Focusable is the one interactive
  // primitive on this app's TV side precisely because the native focus engine
  // drops anything it cannot reach. On a remote this would be either invisible
  // or a trap you cannot navigate out of.
  if (IS_TV) return null;
  // An ad request over a dead network is a wasted round trip and a blank strip.
  if (!show || offline || !ready) return null;

  return (
    <View style={styles.slot}>
      <BannerAd unitId={unitId('banner')} size={BannerAdSize.ANCHORED_ADAPTIVE_BANNER} />
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * The padding is not decoration. AdMob's policies prohibit placing an ad
   * where it invites accidental clicks, and the tab bar sits directly below
   * this: a banner flush against Home/Movies/Series is exactly the arrangement
   * that gets a publisher a policy strike. The background makes the boundary
   * visible rather than leaving the ad to blend into the app's own chrome.
   */
  slot: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    backgroundColor: Palette.surface,
  },
});
