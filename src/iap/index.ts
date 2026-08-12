/**
 * The Google Play Billing boundary.
 *
 * Only this file imports react-native-iap, same role src/ads/index.ts plays
 * for AdMob: screens and the purchases store go through here, never through
 * the package directly, so it can be stubbed for tests in one line.
 *
 * Every export no-ops (or resolves the "nothing owned" answer) when the build
 * is not IS_PLAY. Play Billing only exists inside a Play-distributed install;
 * calling it from a sideloaded APK would either throw or hit a store that has
 * no idea who this app is. See src/distribution.ts.
 *
 * There is no server involved and nothing to verify a receipt against --
 * Google's own purchase record *is* the entitlement. getAvailablePurchases()
 * is asked fresh every time src/store/purchases.ts refreshes, rather than
 * this module caching an answer, so a cancellation or a refund shows up the
 * next time the app checks, not just on the device that bought it.
 */

import {
  finishTransaction,
  getAvailablePurchases,
  getSubscriptions,
  initConnection,
  purchaseErrorListener,
  purchaseUpdatedListener,
  requestSubscription,
  type Purchase,
  type SubscriptionAndroid,
} from 'react-native-iap';
import { IS_PLAY } from '@/distribution';

/**
 * Play Console product id (subscription) and base plan id. These have to
 * match whatever is actually created in Play Console -- Monetize ->
 * Subscriptions -- or every call below returns "no such product."
 */
export const SUBSCRIPTION_SKU = 'remove_ads';

/** Module scope, so concurrent callers share one connection. */
let started: Promise<boolean> | null = null;

async function start(): Promise<boolean> {
  if (!IS_PLAY) return false;
  try {
    await initConnection();

    // Acknowledges any purchase for our SKU as soon as Google reports it --
    // including one that finishes after the app was backgrounded for the
    // checkout sheet. Billing Library auto-refunds an unacknowledged
    // subscription after 3 days, so this has to run unconditionally, not
    // just from the purchase() call site below.
    purchaseUpdatedListener((purchase: Purchase) => {
      if (purchase.productId !== SUBSCRIPTION_SKU) return;
      void finishTransaction({ purchase, isConsumable: false }).catch(() => {
        // Acknowledgement failing here does not lose the purchase -- Google
        // still owns it, and the next refresh() re-derives ownership from
        // getAvailablePurchases() regardless of ack state.
      });
    });
    // No local handling needed: purchase()/restore() report failure to their
    // own caller via rejection. This listener only exists so react-native-iap
    // has somewhere to put an error that arrives with no in-flight call
    // waiting on it (e.g. the checkout sheet closing after backgrounding).
    purchaseErrorListener(() => {});

    return true;
  } catch {
    return false;
  }
}

/** Initialise once, idempotent, safe to call from any of the exports below. */
export function initIap(): Promise<boolean> {
  if (!started) started = start();
  return started;
}

async function currentOffer(): Promise<
  { sku: string; offerToken: string; priceLabel: string } | null
> {
  const subs = await getSubscriptions({ skus: [SUBSCRIPTION_SKU] });
  const sub = subs.find(
    (s): s is SubscriptionAndroid => s.productId === SUBSCRIPTION_SKU && 'subscriptionOfferDetails' in s,
  );
  const offer = sub?.subscriptionOfferDetails[0];
  const phase = offer?.pricingPhases.pricingPhaseList[0];
  if (!offer || !phase) return null;
  return { sku: SUBSCRIPTION_SKU, offerToken: offer.offerToken, priceLabel: phase.formattedPrice };
}

/** Play's real, localized price for the subscription -- never hardcode one. */
export async function getPriceLabel(): Promise<string | null> {
  if (!(await initIap())) return null;
  try {
    return (await currentOffer())?.priceLabel ?? null;
  } catch {
    return null;
  }
}

/** The only question that matters: does Google currently consider this owned. */
export async function hasActiveSubscription(): Promise<boolean> {
  if (!(await initIap())) return false;
  try {
    const purchases = await getAvailablePurchases();
    return purchases.some((p) => p.productId === SUBSCRIPTION_SKU);
  } catch {
    return false;
  }
}

/** Opens Play's checkout sheet. Resolves once requested -- the actual result
 *  arrives through the purchaseUpdatedListener above and the caller's own
 *  refresh() afterwards, not through this promise. */
export async function purchaseRemoveAds(): Promise<void> {
  if (!(await initIap())) throw new Error('Billing unavailable');
  const offer = await currentOffer();
  if (!offer) throw new Error('Subscription not available');
  await requestSubscription({
    subscriptionOffers: [{ sku: offer.sku, offerToken: offer.offerToken }],
  });
}

/** Explicit "Restore purchase" action: re-asks Google rather than trusting cache. */
export async function restore(): Promise<boolean> {
  return hasActiveSubscription();
}
