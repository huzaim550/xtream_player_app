/**
 * Remove Ads: the cache-first hydrate, the refresh-from-Google sequencing,
 * and the fail-closed-on-cache-not-on-false behaviour when Play is
 * unreachable. This is what fails silently in production: a bad refresh()
 * either shows ads to someone who paid, or hides them from someone who
 * didn't.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { removeAdsOwned, usePurchases } from '../purchases';
import { Keys } from '../persist';

jest.mock('@/iap', () => ({
  __esModule: true,
  SUBSCRIPTION_SKU: 'remove_ads',
  hasActiveSubscription: jest.fn(async () => false),
  getPriceLabel: jest.fn(async () => null),
  purchaseRemoveAds: jest.fn(async () => {}),
  restore: jest.fn(async () => false),
}));

const iap = jest.requireMock('@/iap') as {
  hasActiveSubscription: jest.Mock;
  getPriceLabel: jest.Mock;
  purchaseRemoveAds: jest.Mock;
  restore: jest.Mock;
};

describe('purchases store', () => {
  beforeEach(() => {
    (AsyncStorage as unknown as { __reset: () => void }).__reset();
    usePurchases.setState({
      removeAdsOwned: false,
      priceLabel: null,
      hydrated: false,
      syncing: false,
      error: null,
    });
    iap.hasActiveSubscription.mockReset().mockResolvedValue(false);
    iap.getPriceLabel.mockReset().mockResolvedValue(null);
    iap.purchaseRemoveAds.mockReset().mockResolvedValue(undefined);
    iap.restore.mockReset().mockResolvedValue(false);
  });

  it('removeAdsOwned reads the store flag', () => {
    expect(removeAdsOwned(usePurchases.getState())).toBe(false);
    usePurchases.setState({ removeAdsOwned: true });
    expect(removeAdsOwned(usePurchases.getState())).toBe(true);
  });

  it('hydrate reads the cached answer before anything asks Google', async () => {
    await AsyncStorage.setItem(
      Keys.purchases,
      JSON.stringify({ version: 1, removeAdsOwned: true }),
    );
    await usePurchases.getState().hydrate();
    expect(usePurchases.getState().removeAdsOwned).toBe(true);
    expect(usePurchases.getState().hydrated).toBe(true);
    expect(iap.hasActiveSubscription).not.toHaveBeenCalled();
  });

  it('hydrate treats no cache as not owned', async () => {
    await usePurchases.getState().hydrate();
    expect(usePurchases.getState().removeAdsOwned).toBe(false);
  });

  it('refresh asks Google and writes the answer back to the cache', async () => {
    iap.hasActiveSubscription.mockResolvedValue(true);
    iap.getPriceLabel.mockResolvedValue('$2.99');

    await usePurchases.getState().refresh();

    expect(usePurchases.getState().removeAdsOwned).toBe(true);
    expect(usePurchases.getState().priceLabel).toBe('$2.99');
    expect(usePurchases.getState().syncing).toBe(false);

    const cached = await AsyncStorage.getItem(Keys.purchases);
    expect(JSON.parse(cached as string)).toEqual({ version: 1, removeAdsOwned: true });
  });

  it('refresh keeps the last known value when Google is unreachable', async () => {
    usePurchases.setState({ removeAdsOwned: true });
    iap.hasActiveSubscription.mockRejectedValue(new Error('offline'));

    await usePurchases.getState().refresh();

    // A failed check is not the same as "unsubscribed" -- see store/purchases.ts.
    expect(usePurchases.getState().removeAdsOwned).toBe(true);
    expect(usePurchases.getState().syncing).toBe(false);
  });

  it('purchase() calls through to Play and then refreshes', async () => {
    iap.purchaseRemoveAds.mockResolvedValue(undefined);
    iap.hasActiveSubscription.mockResolvedValue(true);

    await usePurchases.getState().purchase();

    expect(iap.purchaseRemoveAds).toHaveBeenCalled();
    expect(usePurchases.getState().removeAdsOwned).toBe(true);
    expect(usePurchases.getState().error).toBeNull();
  });

  it('purchase() surfaces a failure without touching removeAdsOwned', async () => {
    iap.purchaseRemoveAds.mockRejectedValue(new Error('User cancelled'));

    await usePurchases.getState().purchase();

    expect(usePurchases.getState().removeAdsOwned).toBe(false);
    expect(usePurchases.getState().error).toBe('User cancelled');
    expect(usePurchases.getState().syncing).toBe(false);
  });

  it('restore() reports "no subscription found" rather than a silent no-op', async () => {
    iap.restore.mockResolvedValue(false);

    await usePurchases.getState().restore();

    expect(usePurchases.getState().error).toMatch(/no active subscription/i);
    expect(usePurchases.getState().removeAdsOwned).toBe(false);
  });

  it('restore() re-syncs when Google finds an existing purchase', async () => {
    iap.restore.mockResolvedValue(true);
    iap.hasActiveSubscription.mockResolvedValue(true);

    await usePurchases.getState().restore();

    expect(usePurchases.getState().removeAdsOwned).toBe(true);
    expect(usePurchases.getState().error).toBeNull();
  });
});
