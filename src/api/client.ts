/**
 * The single choke point for every request to the Xtream server.
 *
 * Shaped after the server's own admin panel client (xtream/static/admin/api.js)
 * so the two codebases read alike: one `xtreamGet`, one `retry` with backoff.
 */

import {
  AuthError,
  NetworkError,
  ServerError,
  TimeoutError,
  isRetryable,
} from './errors';
import type { RawHandshake, RawHealth } from '@/types/raw';

/**
 * Normal calls. Generous, because everything goes through a Cloudflare tunnel
 * to a home server -- a bare health check measured ~7s in testing.
 */
export const TIMEOUT_NORMAL = 20_000;

/**
 * The first catalogue call of a session. The server caches its R2 bucket scan
 * with a 300s stale-while-revalidate (xtream/config.py SCAN_TTL); the one
 * request that arrives after expiry blocks on a live bucket listing.
 */
export const TIMEOUT_COLD = 60_000;

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 500;

/**
 * Strip credentials from a URL before it reaches a log, an error message, or a
 * crash report. Covers both places they appear: the `password` query param and
 * the `/{username}/{password}/` segments of a stream path. The server redacts
 * the same two things in its access log.
 */
export function redact(url: string): string {
  return url
    .replace(/([?&]password=)[^&]*/gi, '$1***')
    .replace(/([?&]username=)[^&]*/gi, '$1***')
    .replace(/\/(movie|series|live)\/[^/]+\/[^/]+\//g, '/$1/***/***/');
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Trim a user-entered server URL into a usable base. */
export function normalizeBaseUrl(input: string): string {
  let url = input.trim();
  if (!url) throw new Error('Server address is required.');
  if (!/^https?:\/\//i.test(url)) url = `https://${url}`;
  url = url.replace(/\/+$/, '');
  // People paste the whole endpoint out of a player app or an email.
  url = url.replace(/\/(player_api\.php|get\.php|xmltv\.php).*$/i, '');
  const parsed = new URL(url);
  if (!parsed.hostname) throw new Error('That server address is not valid.');
  return url.replace(/\/+$/, '');
}

async function fetchJson(
  url: string,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<unknown> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const onAbort = () => controller.abort();
  signal?.addEventListener('abort', onAbort);

  let res: Response;
  try {
    res = await fetch(url, { signal: controller.signal });
  } catch (err) {
    // An abort from our own timer vs. one from the caller's signal.
    if (controller.signal.aborted && !signal?.aborted) {
      throw new TimeoutError(`Request timed out after ${timeoutMs / 1000}s.`);
    }
    throw new NetworkError('Could not reach the server.', err);
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onAbort);
  }

  if (res.status >= 500) {
    throw new ServerError(`Server error (${res.status}).`, res.status);
  }
  if (!res.ok) {
    throw new ServerError(`Request failed (${res.status}).`, res.status);
  }

  try {
    return await res.json();
  } catch {
    throw new ServerError('The server sent a response we could not read.', res.status);
  }
}

/**
 * Reject the auth-failure envelope.
 *
 * The server answers bad credentials with HTTP *200* and
 * `{"user_info": {"auth": 0, "status": "Disabled"}}` -- it never sends a 401.
 * So the status code tells us nothing and the body is the only signal.
 */
function assertAuthenticated(body: unknown): void {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return;
  const info = (body as { user_info?: Record<string, unknown> }).user_info;
  if (!info) return;
  if (Number(info.auth) === 1) return;

  const status = typeof info.status === 'string' ? info.status : 'Disabled';
  const rawExp = info.exp_date;
  const expDate = rawExp == null || rawExp === '' ? null : Number(rawExp);
  throw new AuthError(status, Number.isFinite(expDate) ? expDate : null);
}

export interface RequestOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Set for actions whose healthy response is a JSON array. */
  expectArray?: boolean;
}

/**
 * One `player_api.php` call. Pass `action: null` for the handshake.
 *
 * Retries only transport failures and 5xx -- never an AuthError. See errors.ts
 * for why that rule is load-bearing rather than merely tidy.
 */
export async function xtreamGet<T>(
  session: { baseUrl: string; username: string; password: string },
  action: string | null,
  params: Record<string, string | number | undefined> = {},
  opts: RequestOptions = {},
): Promise<T> {
  const q = new URLSearchParams({
    username: session.username,
    password: session.password,
  });
  if (action) q.set('action', action);
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined) q.set(k, String(v));
  }
  const url = `${session.baseUrl}/player_api.php?${q.toString()}`;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT_NORMAL;

  let lastErr: unknown;
  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
    if (attempt > 0) await sleep(BACKOFF_BASE_MS * 2 ** (attempt - 1));
    try {
      const body = await fetchJson(url, timeoutMs, opts.signal);
      assertAuthenticated(body);

      // A list action must come back as an array. If it did not, and it was not
      // already caught above, the response is some other envelope we don't
      // understand -- surface it rather than handing a bad shape downstream.
      if (opts.expectArray && !Array.isArray(body)) {
        throw new ServerError(
          `Expected a list from "${action}" but got ${typeof body}.`,
          200,
        );
      }
      return body as T;
    } catch (err) {
      lastErr = err;
      if (!isRetryable(err)) throw err;
      if (opts.signal?.aborted) throw err;
    }
  }
  if (__DEV__ && lastErr instanceof Error) {
    console.warn(`[xtream] gave up on ${redact(url)}: ${lastErr.message}`);
  }
  throw lastErr;
}

/**
 * The handshake: `player_api.php` with no action.
 *
 * Deliberately the cheapest call the server offers -- it answers before
 * touching the library, so a login still succeeds while R2 is unreachable.
 */
export function handshake(
  session: { baseUrl: string; username: string; password: string },
  opts: RequestOptions = {},
): Promise<RawHandshake> {
  return xtreamGet<RawHandshake>(session, null, {}, opts);
}

/** `GET /` -- a real readiness probe, 503 when degraded. Diagnostics only. */
export async function health(
  baseUrl: string,
  opts: RequestOptions = {},
): Promise<RawHealth> {
  // Bypasses xtreamGet: no credentials, and a 503 here is a real answer
  // carrying the degraded payload rather than a failure to retry.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), opts.timeoutMs ?? TIMEOUT_NORMAL);
  try {
    const res = await fetch(`${baseUrl}/`, { signal: controller.signal });
    return (await res.json()) as RawHealth;
  } catch (err) {
    throw new NetworkError('Could not reach the server.', err);
  } finally {
    clearTimeout(timer);
  }
}
