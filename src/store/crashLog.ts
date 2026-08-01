/**
 * Local crash log.
 *
 * Deliberately local. A crash reporter would answer "why did it break" faster,
 * but every hosted one ships stack traces to a third party, and
 * src/content/privacy.ts promises that the only host this app ever contacts is
 * the user's own server. Writing to app storage and showing it on a screen
 * keeps that promise true and still turns "it crashed" into an actual stack.
 *
 * Everything stored here goes through `redact()` first. Stream URLs embed the
 * password as a path segment (`/movie/{user}/{pass}/{id}.mp4`), so an
 * un-redacted stack trace is a plaintext credential sitting in AsyncStorage --
 * and the whole point of this screen is that the user reads it out to someone.
 */

import { create } from 'zustand';
import { redact } from '@/api/client';
import { Keys, readJson, writeJson } from './persist';

/** Keep the log small: it is a diagnostic aid, not an archive. */
const MAX_RECORDS = 20;

export interface CrashRecord {
  id: string;
  at: number;
  /** A fatal error tore down the JS context; a non-fatal one was caught. */
  fatal: boolean;
  message: string;
  stack: string | null;
}

interface CrashFile {
  version: 1;
  records: CrashRecord[];
}

interface CrashLogState {
  records: CrashRecord[];
  hydrated: boolean;

  hydrate: () => Promise<void>;
  record: (error: unknown, fatal: boolean) => void;
  clear: () => Promise<void>;
}

export const useCrashLog = create<CrashLogState>((set, get) => ({
  records: [],
  hydrated: false,

  hydrate: async () => {
    const file = await readJson<CrashFile>(Keys.crashLog);
    set({ records: file?.records ?? [], hydrated: true });
  },

  record: (error, fatal) => {
    const err = error instanceof Error ? error : new Error(String(error));
    const entry: CrashRecord = {
      // Date.now() alone collides when a crash loop fires twice in a
      // millisecond, and React needs distinct keys for the list.
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      at: Date.now(),
      fatal,
      message: redact(err.message || 'Unknown error'),
      stack: err.stack ? redact(err.stack) : null,
    };

    const records = [entry, ...get().records].slice(0, MAX_RECORDS);
    set({ records });
    // Written immediately, not debounced: on a fatal error this process may
    // have milliseconds left, and a coalesced write would lose the one record
    // that actually mattered.
    void writeJson(Keys.crashLog, { version: 1, records } satisfies CrashFile);
  },

  clear: async () => {
    set({ records: [] });
    await writeJson(Keys.crashLog, { version: 1, records: [] } satisfies CrashFile);
  },
}));

/** React Native's global error hook. Not in the RN type surface. */
type ErrorUtilsShim = {
  getGlobalHandler?: () => ((error: unknown, isFatal?: boolean) => void) | undefined;
  setGlobalHandler?: (handler: (error: unknown, isFatal?: boolean) => void) => void;
};

let installed = false;

/**
 * Start capturing. Safe to call more than once.
 *
 * The previous handler is always called afterwards -- it is the one that shows
 * the red box in development and reports the crash to the OS in production, so
 * swallowing it would trade a visible crash for a silent hang.
 */
export function installCrashHandler(): void {
  if (installed) return;
  installed = true;

  const errorUtils = (globalThis as { ErrorUtils?: ErrorUtilsShim }).ErrorUtils;
  if (!errorUtils?.setGlobalHandler) return;

  const previous = errorUtils.getGlobalHandler?.();
  errorUtils.setGlobalHandler((error, isFatal) => {
    try {
      useCrashLog.getState().record(error, isFatal === true);
    } catch {
      // Never let the crash reporter be the reason a crash gets worse.
    }
    previous?.(error, isFatal);
  });
}
