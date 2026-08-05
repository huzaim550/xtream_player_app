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
 * Which shop this binary is destined for.
 *
 * `sideload` (the default) is the build the family installs by hand from the
 * Axe server: it carries the in-app APK updater and self-hosted OTA updates.
 * `play` is the Play Store build, which must carry neither -- downloading and
 * installing an APK is a Device and Network Abuse violation, and a store binary
 * whose behaviour can be changed from a home server is a review risk for no
 * benefit, since Play does the updating.
 *
 * EXPO_PUBLIC_ because the value has to reach two places: this file, which
 * shapes the native project, and the JS, where it decides whether the updater
 * is in the bundle at all. Anything with that prefix is inlined at build time.
 *
 * Defaulting to `sideload` means an ordinary `axe build` keeps doing what it
 * has always done, and only a deliberate store build opts in.
 */
const DISTRIBUTION = process.env.EXPO_PUBLIC_DISTRIBUTION ?? 'sideload';
if (DISTRIBUTION !== 'play' && DISTRIBUTION !== 'sideload') {
  // Fail the build rather than quietly producing a sideload binary that someone
  // is about to upload to the Play Store.
  throw new Error(
    `EXPO_PUBLIC_DISTRIBUTION must be "play" or "sideload", got "${DISTRIBUTION}".`,
  );
}
const IS_PLAY = DISTRIBUTION === 'play';

/**
 * Cleartext HTTP exists only to reach a local dev server (http://10.0.2.2:8000).
 * The live server is HTTPS behind a Cloudflare tunnel, so no shipped build
 * should carry it.
 *
 * This used to key off `NODE_ENV !== 'production'`, which was wrong in the one
 * place it mattered: nothing sets NODE_ENV on the Axe build server, so every
 * build it produced -- including a store one -- shipped cleartext enabled. An
 * explicit opt-in cannot be got wrong by omission.
 */
const allowCleartext = !IS_PLAY && process.env.EXPO_PUBLIC_ALLOW_CLEARTEXT === '1';

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Manzar',
  // slug, scheme and the Android package id deliberately keep their original
  // values: the slug is what ties this project to its EAS id, and changing the
  // package id would make the store treat it as a different app and orphan
  // every existing install's data.
  slug: 'xtream-player',
  scheme: 'xtreamplayer',
  // 1.3.0: adds react-native-google-mobile-ads, a native module. The bump is
  // mandatory -- runtimeVersion follows this field, so without it every 1.2.0
  // install would download a bundle that imports a module its APK does not
  // contain and crash at launch. The cost is the other half of the same rule:
  // 1.2.0 phones stop receiving updates until someone installs the new APK by
  // hand, so never bump this without shipping one.
  version: '1.3.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  /**
   * Over-the-air updates.
   *
   * `runtimeVersion` is the compatibility contract between a JS bundle and the
   * native binary that runs it. The `appVersion` policy ties it to `version`
   * above, which means: bump `version` whenever you add or remove a native
   * module, and old installs correctly stop accepting new JS instead of
   * crashing on a module that is not in their APK. That failure mode is not
   * hypothetical here -- adding expo-file-system did exactly that.
   */
  runtimeVersion: { policy: 'appVersion' },
  updates: IS_PLAY
    ? // Play does the updating. Leaving a self-hosted manifest live in a store
      // binary would mean the reviewed app could be changed from a machine in
      // somebody's house -- permitted for JS, but a risk with no upside here,
      // and it would make the store build depend on a home tunnel staying up.
      { enabled: false }
    : {
        // Self-hosted update server (the mybuild box at home), published over
        // HTTPS through a Cloudflare tunnel so installs reach it from anywhere,
        // not just the home LAN. Not EAS Update — the previous endpoint was
        // https://u.expo.dev/0f30553e-a11e-404c-9de0-31edfb91167f.
        // HTTPS also matters because usesCleartextTraffic is false in release
        // builds (see allowCleartext above), which would block a plain-http URL.
        url: 'https://updates.manzaronline.site/api/updates/xtream-player-app/manifest',
        requestHeaders: { 'expo-channel-name': 'production' },
        // Never block the splash on a network round trip. The server is behind a
        // Cloudflare tunnel and a cold call can take ~10s; the app launches on
        // the bundle it already has and picks up the new one next launch.
        fallbackToCacheTimeout: 0,
      },
  android: {
    ...config.android,
    package: 'site.manzaronline.xtream',
    /**
     * Must be set explicitly and bumped on every release build. Without it
     * prebuild hardcodes `versionCode 1`, so the in-app "new version
     * available" check has nothing to compare and never fires. This is the
     * integer Android orders installs by; `version` above is only the label.
     */
    versionCode: 7,
    /**
     * Permissions the app has never used, removed rather than explained.
     *
     * Expo's template starts every project with these, and nothing in src/
     * touches any of them: downloads go to Paths.document, which is app-private
     * and needs no storage permission, and nothing draws over other apps.
     * SYSTEM_ALERT_WINDOW in particular is one Play asks about, and "we do not
     * use it" is a much better answer than a justification.
     *
     * INTERNET, ACCESS_NETWORK_STATE, WAKE_LOCK and AD_ID stay: they come from
     * expo-video, expo-updates and play-services-ads, are actually used, and
     * AD_ID is declared on the Data Safety form.
     */
    blockedPermissions: [
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
    ],
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
    /**
     * AdMob. The app id is written into AndroidManifest.xml as a meta-data
     * entry, so it is native: changing it costs a rebuild, and the SDK crashes
     * at initialisation if it is missing.
     *
     * Hardcoded rather than read from .env on purpose. It is not a secret -- it
     * ships in the manifest of every APK -- and .env is gitignored, so sourcing
     * it from there would mean a build from a clean checkout produced an app
     * that crashed the first time an ad loaded.
     *
     * Note the tilde: this is the *app* id. The ad *unit* ids (with a slash)
     * are plain strings in src/ads/index.ts and can be changed over the air.
     */
    [
      'react-native-google-mobile-ads',
      {
        androidAppId: 'ca-app-pub-2594910378903221~6280597182',
        optimizeInitialization: true,
        optimizeAdLoading: true,
      },
    ],
  ],
  // reactCompiler comes from the template's known-good configuration; keep it.
  experiments: { typedRoutes: true, reactCompiler: true },
});
