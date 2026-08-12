/**
 * Storage helpers.
 *
 * Two backends, split by sensitivity:
 *
 * - SecureStore holds the password. It is a reusable plaintext credential for
 *   an internet-facing service, replayed on every request and embedded in every
 *   stream URL. AsyncStorage on Android is an unencrypted SQLite file that is
 *   eligible for Google Drive auto-backup, so the password must not live there.
 * - AsyncStorage holds everything else: server URL, username, catalogue cache,
 *   watch progress, favourites.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

export const Keys = {
  serverUrl: 'xtream.serverUrl',
  username: 'xtream.username',
  account: 'xtream.account.v1',
  catalogue: 'xtream.catalogue.v1',
  progress: 'xtream.progress.v1',
  seriesProgress: 'xtream.seriesProgress.v1',
  favorites: 'xtream.favorites.v1',
  /** Offline download records. The video files themselves live on disk under
   *  the app's private document directory, not in here. */
  downloads: 'xtream.downloads.v1',
  /** Recent crashes, redacted. Local only -- see store/crashLog.ts. */
  crashLog: 'xtream.crashLog.v1',
  /** Announcements from the build server, plus which of them have been read. */
  notifications: 'xtream.notifications.v1',
  /** Ad settings, as last served by the Xtream server. See store/ads.ts. */
  ads: 'xtream.ads.v1',
  /** Cached Remove Ads entitlement, so a cold start knows the answer before
   *  Play Billing has answered. Google's own record is still the source of
   *  truth -- see store/purchases.ts. */
  purchases: 'xtream.purchases.v1',
  /** Records that SecureStore failed and the password fell back to plain storage. */
  credentialStorageDegraded: 'xtream.credentialStorageDegraded',
} as const;

const SECURE_PASSWORD_KEY = 'xtream_password';
/** Only used when SecureStore is unavailable. See setPassword. */
const FALLBACK_PASSWORD_KEY = 'xtream.password.fallback';

export async function readJson<T>(key: string): Promise<T | null> {
  try {
    const raw = await AsyncStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    // A corrupt or half-written value should read as "absent", not crash boot.
    return null;
  }
}

export async function writeJson(key: string, value: unknown): Promise<void> {
  try {
    await AsyncStorage.setItem(key, JSON.stringify(value));
  } catch (err) {
    if (__DEV__) console.warn(`[persist] failed to write ${key}`, err);
  }
}

export async function readString(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

export async function writeString(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (err) {
    if (__DEV__) console.warn(`[persist] failed to write ${key}`, err);
  }
}

export async function remove(...keys: string[]): Promise<void> {
  try {
    await AsyncStorage.multiRemove(keys);
  } catch {
    /* nothing useful to do */
  }
}

/**
 * Store the password, preferring the Keystore.
 *
 * Some cheap Fire TV sticks ship a broken Keystore implementation. Falling back
 * silently would mean an unexplained forced re-login on every launch, so record
 * the degradation and let Settings say so plainly.
 */
export async function setPassword(password: string): Promise<{ secure: boolean }> {
  try {
    await SecureStore.setItemAsync(SECURE_PASSWORD_KEY, password);
    await remove(Keys.credentialStorageDegraded, FALLBACK_PASSWORD_KEY);
    return { secure: true };
  } catch (err) {
    if (__DEV__) console.warn('[persist] SecureStore unavailable, falling back', err);
    await writeString(FALLBACK_PASSWORD_KEY, password);
    await writeString(Keys.credentialStorageDegraded, '1');
    return { secure: false };
  }
}

export async function getPassword(): Promise<string | null> {
  try {
    const secure = await SecureStore.getItemAsync(SECURE_PASSWORD_KEY);
    if (secure) return secure;
  } catch {
    /* fall through to the fallback slot */
  }
  return readString(FALLBACK_PASSWORD_KEY);
}

export async function clearPassword(): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(SECURE_PASSWORD_KEY);
  } catch {
    /* already gone, or the store is unavailable */
  }
  await remove(FALLBACK_PASSWORD_KEY, Keys.credentialStorageDegraded);
}

export async function isCredentialStorageDegraded(): Promise<boolean> {
  return (await readString(Keys.credentialStorageDegraded)) === '1';
}
