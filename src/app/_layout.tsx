import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { installCrashHandler, useCrashLog } from '@/store/crashLog';
import { useSession } from '@/store/session';
import { BrandSplash } from '@/ui/BrandSplash';
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
  const [minElapsed, setMinElapsed] = useState(false);

  useEffect(() => {
    void restore();
    // Read past crashes off disk so Settings can show the one that happened
    // *before* this launch -- the only one anybody ever wants to see.
    void hydrateCrashLog();
  }, [restore, hydrateCrashLog]);

  useEffect(() => {
    const t = setTimeout(() => setMinElapsed(true), MIN_SPLASH_MS);
    return () => clearTimeout(t);
  }, []);

  if (boot === 'loading' || !minElapsed) return <BrandSplash />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: Palette.background },
          animation: 'fade',
        }}
      >
        <Stack.Screen name="index" />
        <Stack.Screen name="login" />
        <Stack.Screen name="(app)" />
        <Stack.Screen
          name="player"
          options={{ presentation: 'fullScreenModal', animation: 'fade' }}
        />
      </Stack>
    </SafeAreaProvider>
  );
}
