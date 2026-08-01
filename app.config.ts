import type { ConfigContext, ExpoConfig } from 'expo/config';

/**
 * Phone-only configuration.
 *
 * The Android TV / Fire Stick variant (EXPO_TV=1, react-native-tvos alias,
 * @react-native-tvos/config-tv plugin, package id site.manzaronline.xtream.tv)
 * has been removed for now; see git history to restore it. The UI layer still
 * branches on IS_TV via src/ui/platform.ts, so screens need no changes when it
 * comes back.
 */

/**
 * Cleartext HTTP is needed only to reach a local dev server (http://10.0.2.2:8000).
 * The live server is HTTPS behind a Cloudflare tunnel, so release builds must
 * not carry this.
 */
const allowCleartext = process.env.NODE_ENV !== 'production';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Xtream',
  slug: 'xtream-player',
  scheme: 'xtreamplayer',
  version: '1.0.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  android: {
    ...config.android,
    package: 'site.manzaronline.xtream',
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        backgroundColor: '#0B0D10',
        android: { image: './assets/images/splash-icon.png', imageWidth: 76 },
      },
    ],
    ['expo-build-properties', { android: { usesCleartextTraffic: allowCleartext } }],
    'expo-video',
    'expo-secure-store',
  ],
  // reactCompiler comes from the template's known-good configuration; keep it.
  experiments: { typedRoutes: true, reactCompiler: true },
});
