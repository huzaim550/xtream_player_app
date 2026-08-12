import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { installCrashHandler, useCrashLog } from '@/store/crashLog';
import { useAds } from '@/store/ads';
import { usePurchases } from '@/store/purchases';
import { useSession } from '@/store/session';
import { BrandSplash } from '@/ui/BrandSplash';
// Aliased: expo-router gives the bare name `ErrorBoundary` a special meaning
// when a route file exports it, and this one is ours to place by hand.
import { ErrorBoundary as AppErrorBoundary } from '@/ui/ErrorBoundary';
import { Palette } from '@/ui/platform';

/** Long enough for the brand animation to land. See BrandSplash. */
const MIN_SPLASH_MS = 1400;

// At module scope, not in an effect: a crash while the very first component
// tree renders is exactly the kind this log exists to catch, and an effect
// would install the handler too late to see it.
installCrashHandler();

export default function RootLayout() {
  const boot = useSession((s) => s.boot);
  const restore = useSession((s) => s.restore);
  const hydrateCrashLog = useCrashLog((s) => s.hydrate);
  // Read the last-known ad settings off disk before the first handshake lands,
  // so a cold start into /player (a deep link, or the app being reopened on a
  // film) knows whether it may break for an ad.
  const hydrateAds = useAds((s) => s.hydrate);
  // Same reasoning, for the Remove Ads entitlement -- see store/purchases.ts.
  const hydratePurchases = usePurchases((s) => s.hydrate);
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    void restore();
    // Read past crashes off disk so Settings can show the one that happened
    // *before* this launch -- the only one anybody ever wants to see.
    void hydrateCrashLog();
    void hydrateAds();
    void hydratePurchases();
  }, [restore, hydrateCrashLog, hydrateAds, hydratePurchases]);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  if (boot === 'loading' || !minElapsed) return <BrandSplash />;

  return (
    // Outside the navigator, so a render error that takes the Stack with it
    // still has something left to draw. Without this the tree unmounts and a
    // release build shows the bare window background -- a grey screen with no
    // app chrome and no way to find out why.
    <AppErrorBoundary>
      <SafeAreaProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: Palette.background },
            animation: 'fade',
            // Portrait is declared here, not left to the manifest alone, so it
            // is the same mechanism the player's landscape override uses. One
            // system owning the rotation is the entire point -- see the note on
            // the player screen below.
            orientation: 'portrait',
          }}
        >
          <Stack.Screen name="index" />
          <Stack.Screen name="login" />
          <Stack.Screen name="(app)" />
          {/* Presentation stays `fullScreenModal`. Dropping it to a plain card
              was tried against the "grey screen on exit" report and made it
              measurably worse, so the modal is what this screen is known to
              survive -- do not re-litigate it without a device to test on.

              `orientation` is the important one. Playback used to rotate the
              Activity itself via ScreenOrientation.lockAsync() on mount and
              unmount, which raced the fragment attach/detach on either side of
              the transition and left a blank native surface behind -- the
              grey, then white, screen on backing out. Declaring it here hands
              the rotation to the same system that owns the transition, so
              there is nothing left to race.

              `statusBarHidden` works; `navigationBarHidden` did not hide the
              back/home/recents bar on a real device, so that job moved to
              <NavigationBar hidden /> inside the player. Left set because it
              costs nothing and is correct where it is honoured. */}
          <Stack.Screen
            name="player"
            options={{
              presentation: 'fullScreenModal',
              animation: 'fade',
              orientation: 'landscape',
              statusBarHidden: true,
              navigationBarHidden: true,
            }}
          />
        </Stack>
      </SafeAreaProvider>
    </AppErrorBoundary>
  );
}
