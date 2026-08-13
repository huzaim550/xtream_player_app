/**
 * "Delete all app data" -- one control that puts the app back to first launch.
 *
 * Settings already had three partial erasers (watch history, downloads, sign
 * out) and no single one, which is fine for a person hunting for a specific
 * button and wrong for the two readers who matter here: someone who wants their
 * data gone and does not know which of three buttons is enough, and Play's user
 * data policy, which asks for a route to deleting what the app has collected.
 *
 * The final sweep takes *every* key in `Keys` rather than a list maintained
 * here. A hand-written list is the kind that goes stale the first time somebody
 * persists something new, and a key missed is a claim on the privacy screen
 * that quietly stops being true. Deriving it means a new key is covered the day
 * it is added.
 */

import { reset as resetInterstitial } from '@/ads/interstitial';
import { useAds } from './ads';
import { useCatalogue } from './catalogue';
import { useCrashLog } from './crashLog';
import { useDownloads } from './downloads';
import { useEpg } from './epg';
import { useFavorites } from './favorites';
import { useNotifications } from './notifications';
import { clearPassword, Keys, remove } from './persist';
import { useProgress } from './progress';
import { useSession } from './session';

/**
 * Erase every trace of use from the device, then leave the caller at signed-out.
 *
 * Ordered deliberately: the stores that own files or in-memory state go first,
 * so nothing is holding a handle to a record that is about to vanish, and the
 * raw key sweep goes last as the backstop. Downloads first of all, because it
 * is the only one that touches the disk -- clearAll() there deletes the video
 * files, not just the rows describing them.
 *
 * Every step is independently failure-tolerant in its own store, so a broken
 * SecureStore (see persist.ts) cannot leave the wipe half-done.
 */
export async function wipeAllData(): Promise<void> {
  await useDownloads.getState().clearAll();
  await useProgress.getState().clearAll();
  await useFavorites.getState().clearAll();
  await useCatalogue.getState().clear();
  await useCrashLog.getState().clear();
  useNotifications.getState().clearAll();
  // Memory only, so the key sweep below cannot reach it -- and a guide fetched
  // for one account should not still be on screen under the next one.
  useEpg.getState().clearAll();

  // Ads are a property of the account and must not survive into whatever is
  // signed in next; resetInterstitial drops the frequency counters too.
  useAds.getState().reset();
  resetInterstitial();

  // signOut clears the password and moves the app to 'signed-out'. It
  // deliberately *keeps* the server URL and username so signing back in is
  // easy -- which is the opposite of what this function is for, hence the
  // sweep after it.
  await useSession.getState().signOut();
  await clearPassword();

  // Backstop, and the only part guaranteed exhaustive: whatever a store's
  // clear() chose to do -- remove the row, or rewrite it empty -- the row is
  // gone after this.
  await remove(...Object.values(Keys));
}
