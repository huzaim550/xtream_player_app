/**
 * Remove Ads: a Google Play Billing subscription bought from inside the app.
 *
 * Unlike src/store/ads.ts, this is a property of the Google Play account /
 * device, not the Xtream login -- so unlike that store, this one is never
 * reset on sign-out, and wipeAllData()'s key sweep dropping the cache is
 * harmless: refresh() re-derives it from Google within seconds, the same as
 * any other cold start.
 *
 * hydrate() reads the cached answer off disk so a deep link straight into
 * /player knows whether it may break for an ad before Play has answered --
 * same rationale as useAds' hydrate, see src/app/_layout.tsx. refresh() then
 * asks Google directly, because that cache can go stale in one direction
 * (a purchase made on another device, or a lapsed renewal) that only Google
 * can correct.
 */

import { create } from 'zustand';
import {
  getPriceLabel,
  hasActiveSubscription,
  purchaseRemoveAds,
  restore as restorePurchase,
} from '@/iap';
import { Keys, readJson, writeJson } from './persist';

interface PurchasesFile {
  version: 1;
  removeAdsOwned: boolean;
}

interface PurchasesState {
  removeAdsOwned: boolean;
  priceLabel: string | null;
  hydrated: boolean;
  syncing: boolean;
  error: string | null;

  hydrate: () => Promise<void>;
  refresh: () => Promise<void>;
  purchase: () => Promise<void>;
  restore: () => Promise<void>;
}

export const usePurchases = create<PurchasesState>((set, get) => ({
  removeAdsOwned: false,
  priceLabel: null,
  hydrated: false,
  syncing: false,
  error: null,

  hydrate: async () => {
    const file = await readJson<PurchasesFile>(Keys.purchases);
    set({ removeAdsOwned: file?.removeAdsOwned ?? false, hydrated: true });
  },

  refresh: async () => {
    set({ syncing: true, error: null });
    try {
      const [owned, priceLabel] = await Promise.all([
        hasActiveSubscription(),
        getPriceLabel(),
      ]);
      set({ removeAdsOwned: owned, priceLabel, syncing: false });
      await writeJson(Keys.purchases, { version: 1, removeAdsOwned: owned } satisfies PurchasesFile);
    } catch {
      // Offline, or Play unreachable -- keep whatever hydrate() last read
      // rather than assuming the subscription lapsed. Google is the only
      // thing allowed to say "not owned"; a failed check is not that.
      set({ syncing: false });
    }
  },

  purchase: async () => {
    set({ syncing: true, error: null });
    try {
      await purchaseRemoveAds();
    } catch (err) {
      set({ syncing: false, error: err instanceof Error ? err.message : 'Purchase failed' });
      return;
    }
    await get().refresh();
  },

  restore: async () => {
    set({ syncing: true, error: null });
    try {
      const owned = await restorePurchase();
      if (!owned) {
        set({ syncing: false, error: 'No active subscription found for this account' });
        return;
      }
    } catch (err) {
      set({ syncing: false, error: err instanceof Error ? err.message : 'Restore failed' });
      return;
    }
    await get().refresh();
  },
}));

/** Pure selector, same idiom as bannerOn/preRollOn in store/ads.ts. */
export function removeAdsOwned(state: PurchasesState): boolean {
  return state.removeAdsOwned;
}
