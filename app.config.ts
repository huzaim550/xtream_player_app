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
  name: 'Manzar',
  // slug, scheme and the Android package id deliberately keep their original
  // values: the slug is what ties this project to its EAS id, and changing the
  // package id would make the store treat it as a different app and orphan
  // every existing install's data.
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
        // The mark is the whole splash, so it gets real size -- 76px was a
        // template default sized for a small glyph.
        android: { image: './assets/images/splash-icon.png', imageWidth: 180 },
      },
    ],
    ['expo-build-properties', { android: { usesCleartextTraffic: allowCleartext } }],
    'expo-video',
    'expo-secure-store',
  ],
  // reactCompiler comes from the template's known-good configuration; keep it.
  experiments: { typedRoutes: true, reactCompiler: true },
});
