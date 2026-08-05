/**
 * Credentials, the handshake, and the login-failure guard.
 *
 * The guard is the interesting part. The server throttles 10 failed auths per
 * IP per 5 minutes, and the same check gates the /movie and /series routes --
 * so a user hammering a typo can lock themselves out of *playback*. We stop
 * them well before they get there, and we never retry credentials ourselves.
 */

import { create } from 'zustand';
import { reset as resetInterstitial } from '@/ads/interstitial';
import { handshake, normalizeBaseUrl } from '@/api/client';
import { AuthError } from '@/api/errors';
import { useAds } from './ads';
import {
  Keys,
  clearPassword,
  getPassword,
  isCredentialStorageDegraded,
  readJson,
  readString,
  remove,
  setPassword,
  writeJson,
  writeString,
} from './persist';
import type { AccountInfo, Session } from '@/types/domain';
import type { RawHandshake } from '@/types/raw';

/** Consecutive local failures before we refuse to send another attempt. */
const FAILURE_LOCKOUT_THRESHOLD = 3;
const FAILURE_LOCKOUT_MS = 60_000;

/** Re-handshake at most this often while the app is running. */
const REVALIDATE_INTERVAL_MS = 60 * 60 * 1000;

export type BootState = 'loading' | 'signed-in' | 'signed-out';

function toAccount(raw: RawHandshake): AccountInfo {
  const u = raw.user_info;
  return {
    username: u.username,
    status: u.status,
    expDate: Number(u.exp_date) || 0,
    maxConnections: Number(u.max_connections) || 1,
    activeConnections: Number(u.active_cons) || 0,
  };
}

interface SessionState {
  boot: BootState;
  session: Session | null;
  account: AccountInfo | null;
  /** Set when the handshake failed for a reason the login screen should show. */
  notice: string | null;
  /** True when we could reach nothing -- browsing runs from cache. */
  offline: boolean;
  credentialStorageDegraded: boolean;

  consecutiveFailures: number;
  lockedUntil: number;
  lastRevalidatedAt: number;

  restore: () => Promise<void>;
  signIn: (baseUrl: string, username: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  /** `force` bypasses the hourly rate limit. See the implementation. */
  revalidate: (force?: boolean) => Promise<void>;
  clearNotice: () => void;
  lockoutRemainingMs: () => number;
}

export const useSession = create<SessionState>((set, get) => ({
  boot: 'loading',
  session: null,
  account: null,
  notice: null,
  offline: false,
  credentialStorageDegraded: false,
  consecutiveFailures: 0,
  lockedUntil: 0,
  lastRevalidatedAt: 0,

  clearNotice: () => set({ notice: null }),

  lockoutRemainingMs: () => Math.max(0, get().lockedUntil - Date.now()),

  /** Boot path: load stored credentials and validate them once. */
  restore: async () => {
    const [baseUrl, username, password, degraded, cachedAccount] = await Promise.all([
      readString(Keys.serverUrl),
      readString(Keys.username),
      getPassword(),
      isCredentialStorageDegraded(),
      readJson<AccountInfo>(Keys.account),
    ]);

    if (!baseUrl || !username || !password) {
      set({ boot: 'signed-out', credentialStorageDegraded: degraded });
      return;
    }

    const session: Session = { baseUrl, username, password };
    set({ account: cachedAccount, credentialStorageDegraded: degraded });

    try {
      const raw = await handshake(session);
      const account = toAccount(raw);
      useAds.getState().applyHandshake(raw);
      set({
        session,
        account,
        boot: 'signed-in',
        offline: false,
        lastRevalidatedAt: Date.now(),
      });
      await writeJson(Keys.account, account);
    } catch (err) {
      if (err instanceof AuthError) {
        // Expired, revoked, or throttled. Keep the stored password either way:
        // a throttled user has correct credentials, and wiping them makes a
        // temporary problem permanent.
        set({
          boot: 'signed-out',
          session: null,
          notice: err.isExpired
            ? 'Your account has expired. Contact whoever runs the server.'
            : 'Sign-in was refused. If your details are correct, wait five minutes — the server temporarily blocks repeated failed logins.',
        });
        return;
      }
      // Network trouble must never evict a session. Go in offline: the
      // catalogue cache makes browsing work, and playback will report its own
      // error if it is actually unreachable.
      set({
        session,
        boot: 'signed-in',
        offline: true,
      });
    }
  },

  signIn: async (rawBaseUrl, username, password) => {
    const { consecutiveFailures, lockedUntil } = get();
    if (Date.now() < lockedUntil) {
      throw new Error(
        `Too many attempts. Wait ${Math.ceil((lockedUntil - Date.now()) / 1000)}s before trying again.`,
      );
    }

    const baseUrl = normalizeBaseUrl(rawBaseUrl);
    const session: Session = { baseUrl, username: username.trim(), password };

    try {
      const raw = await handshake(session);
      const account = toAccount(raw);
      useAds.getState().applyHandshake(raw);
      const { secure } = await setPassword(password);
      await Promise.all([
        writeString(Keys.serverUrl, baseUrl),
        writeString(Keys.username, session.username),
        writeJson(Keys.account, account),
      ]);
      set({
        session,
        account,
        boot: 'signed-in',
        notice: null,
        offline: false,
        consecutiveFailures: 0,
        lockedUntil: 0,
        credentialStorageDegraded: !secure,
        lastRevalidatedAt: Date.now(),
      });
    } catch (err) {
      if (err instanceof AuthError) {
        const failures = consecutiveFailures + 1;
        set({
          consecutiveFailures: failures,
          lockedUntil:
            failures >= FAILURE_LOCKOUT_THRESHOLD ? Date.now() + FAILURE_LOCKOUT_MS : 0,
        });
      }
      throw err;
    }
  },

  signOut: async () => {
    await clearPassword();
    // Keep serverUrl (they'll sign back into the same box) and keep progress and
    // favourites -- those are keyed by content-derived ids, so the same user
    // signing back in should find their history intact.
    await remove(Keys.username, Keys.account);
    // Ads are a property of the account, not the device: the next person to
    // sign in on this phone must not inherit them.
    useAds.getState().reset();
    resetInterstitial();
    set({
      session: null,
      account: null,
      boot: 'signed-out',
      notice: null,
      offline: false,
      consecutiveFailures: 0,
      lockedUntil: 0,
    });
  },

  /**
   * Cheap refresh of everything the handshake carries: connection use, expiry,
   * status, and whether this account has ads.
   *
   * Rate-limited to hourly on the foreground path, because that fires every
   * time the app is brought forward. `force` skips the limit, for the one case
   * where a stale answer is actively misleading: the Settings screen, which
   * displays these values and is where somebody goes to check them. Without it,
   * a change made on the server can take an hour to show up -- and on Android
   * that is a real hour, because swiping the app away rarely kills the process,
   * so the cold-start path does not run either.
   */
  revalidate: async (force = false) => {
    const { session, lastRevalidatedAt } = get();
    if (!session) return;
    if (!force && Date.now() - lastRevalidatedAt < REVALIDATE_INTERVAL_MS) return;
    try {
      const raw = await handshake(session);
      const account = toAccount(raw);
      useAds.getState().applyHandshake(raw);
      set({ account, offline: false, lastRevalidatedAt: Date.now() });
      await writeJson(Keys.account, account);
    } catch (err) {
      if (err instanceof AuthError) {
        set({
          boot: 'signed-out',
          session: null,
          notice: err.isExpired
            ? 'Your account has expired.'
            : 'The server refused your sign-in. If your details are correct, wait five minutes and try again.',
        });
        return;
      }
      set({ offline: true });
    }
  },
}));
