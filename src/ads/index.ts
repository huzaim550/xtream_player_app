/**
 * The AdMob boundary.
 *
 * Only this directory imports react-native-google-mobile-ads, so the SDK can be
 * stubbed in one line for tests and removed in one commit if the AdMob account
 * ever goes away. Screens import from here, never from the package.
 *
 * Initialisation is deferred on purpose. Nothing here runs -- no network call,
 * no advertising identifier read, no consent form -- until the server has said
 * this account gets ads. That is what makes the claim in src/content/privacy.ts
 * ("only when your server has enabled them") true rather than aspirational, so
 * the two have to change together.
 */

import mobileAds, {
  AdsConsent,
  MaxAdContentRating,
  TestIds,
} from 'react-native-google-mobile-ads';

/**
 * Live ad units. Not secret -- the app ID is in the manifest of every APK, and
 * these travel in every ad request.
 *
 * The *app* ID (ca-app-pub-2594910378903221~6280597182, note the tilde) is not
 * here: it is a native manifest entry set by the config plugin in
 * app.config.ts, so changing it costs a rebuild. These, being plain strings,
 * can be changed over the air.
 */
const LIVE = {
  banner: 'ca-app-pub-2594910378903221/8006978919',
  interstitial: 'ca-app-pub-2594910378903221/5789205229',
};

export type AdKind = keyof typeof LIVE;

/**
 * Google's test units in a debug build.
 *
 * __DEV__ is false in a release build, so this alone does NOT protect a release
 * APK installed on your own phone -- that serves live ads, and tapping one is a
 * policy violation that can cost the account. EXPO_PUBLIC_ADMOB_TEST_DEVICE is
 * the other half: set it to the hashed device id the SDK prints to logcat on
 * its first ad request, and that device gets test ads from the live units.
 */
export function unitId(kind: AdKind): string {
  if (__DEV__) {
    return kind === 'banner' ? TestIds.ADAPTIVE_BANNER : TestIds.INTERSTITIAL;
  }
  return LIVE[kind];
}

const TEST_DEVICE = process.env.EXPO_PUBLIC_ADMOB_TEST_DEVICE;

/** Module scope, so concurrent callers share one initialisation. */
let started: Promise<boolean> | null = null;

async function start(): Promise<boolean> {
  try {
    // Consent first: Google requires a certified CMP for EEA/UK users, and
    // requesting ads before it has run is what gets a publisher throttled.
    // Both calls are no-ops where consent is not required.
    await AdsConsent.requestInfoUpdate();
    await AdsConsent.loadAndShowConsentFormIfRequired();
  } catch {
    // A consent form that will not load must not take ads down entirely --
    // Google's own SDK falls back to non-personalised ads in that case.
  }

  try {
    await mobileAds().setRequestConfiguration({
      // Backs the Children section of the privacy policy. If this changes, that
      // file changes with it.
      maxAdContentRating: MaxAdContentRating.PG,
      tagForChildDirectedTreatment: false,
      tagForUnderAgeOfConsent: false,
      testDeviceIdentifiers: TEST_DEVICE ? [TEST_DEVICE] : [],
    });
    await mobileAds().initialize();
    return true;
  } catch {
    // Quiet, like every other optional network path in this app. No ads is a
    // perfectly good outcome; an error in front of someone trying to watch a
    // film is not.
    return false;
  }
}

/**
 * Initialise once, and report whether ads may now be requested.
 *
 * Idempotent and safe to call from an effect or from a play handler: every
 * caller after the first awaits the same promise.
 */
export function initAds(): Promise<boolean> {
  if (!started) started = start();
  return started;
}

/**
 * Whether Google wants a "Privacy options" entry point on screen. Only true in
 * regions where the consent form offers one, and Google requires it to be
 * reachable when it is.
 */
export async function privacyOptionsRequired(): Promise<boolean> {
  try {
    const info = await AdsConsent.getConsentInfo();
    return info.privacyOptionsRequirementStatus === 'REQUIRED';
  } catch {
    return false;
  }
}

export async function showPrivacyOptions(): Promise<void> {
  try {
    await AdsConsent.showPrivacyOptionsForm();
  } catch {
    /* nothing useful to say if Google's own form will not open */
  }
}
