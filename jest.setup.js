/**
 * Native modules the stores pull in transitively.
 *
 * src/store/persist.ts is imported by every store, and it reaches for
 * AsyncStorage and SecureStore at module scope. Neither exists in a Node test
 * process, so both are stubbed with in-memory equivalents that behave like the
 * real thing well enough for the state machines under test.
 */

jest.mock('@react-native-async-storage/async-storage', () => {
  let store = {};
  return {
    __esModule: true,
    default: {
      getItem: jest.fn(async (k) => (k in store ? store[k] : null)),
      setItem: jest.fn(async (k, v) => {
        store[k] = v;
      }),
      multiRemove: jest.fn(async (keys) => {
        for (const k of keys) delete store[k];
      }),
      __reset: () => {
        store = {};
      },
    },
  };
});

jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn(async () => {}),
  getItemAsync: jest.fn(async () => null),
  deleteItemAsync: jest.fn(async () => {}),
}));

/**
 * AdMob. src/store/session.ts reaches src/ads/interstitial.ts to clear a primed
 * ad on sign-out, which pulls the SDK in transitively -- and the SDK's native
 * module throws at import time outside an app. The stub only needs to be
 * inert: nothing under test shows an ad, it just must not explode on the way
 * past.
 */
jest.mock('react-native-google-mobile-ads', () => ({
  __esModule: true,
  default: () => ({
    initialize: jest.fn(async () => []),
    setRequestConfiguration: jest.fn(async () => {}),
  }),
  AdsConsent: {
    requestInfoUpdate: jest.fn(async () => {}),
    loadAndShowConsentFormIfRequired: jest.fn(async () => {}),
    getConsentInfo: jest.fn(async () => ({ privacyOptionsRequirementStatus: 'NOT_REQUIRED' })),
    showPrivacyOptionsForm: jest.fn(async () => {}),
  },
  AdEventType: { LOADED: 'loaded', ERROR: 'error', CLOSED: 'closed' },
  BannerAd: () => null,
  BannerAdSize: { ANCHORED_ADAPTIVE_BANNER: 'anchored' },
  InterstitialAd: { createForAdRequest: jest.fn(() => ({
    addAdEventListener: jest.fn(() => jest.fn()),
    load: jest.fn(),
    show: jest.fn(),
  })) },
  MaxAdContentRating: { PG: 'PG' },
  TestIds: { ADAPTIVE_BANNER: 'test-banner', INTERSTITIAL: 'test-interstitial' },
}));
