/**
 * Error taxonomy for the Xtream API.
 *
 * The distinction that matters most is AuthError vs everything else: it is the
 * one error we must never retry. The server throttles 10 failed auths per IP
 * per 5 minutes (xtream/state.py), and `authenticate()` guards the *stream*
 * routes too -- so a retry loop on a bad password locks the user out of
 * playback, not just login.
 */

export class XtreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/**
 * Credentials rejected. Arrives as HTTP 200 with `user_info.auth === 0`.
 *
 * `status` is 'Expired' for a lapsed account, 'Disabled' for everything else --
 * and 'Disabled' is genuinely ambiguous: a wrong password and a throttled IP
 * are indistinguishable on the wire. Surface that ambiguity in the UI instead
 * of guessing.
 */
export class AuthError extends XtreamError {
  readonly status: string;
  readonly expDate: number | null;

  constructor(status: string, expDate: number | null = null) {
    super(
      status === 'Expired'
        ? 'This account has expired.'
        : 'Login failed. Check your username and password.',
    );
    this.status = status;
    this.expDate = expDate;
  }

  get isExpired(): boolean {
    return this.status === 'Expired';
  }
}

/** The server answered, but not with the resource. */
export class NotFoundError extends XtreamError {}

/** Transport-level: no response, DNS failure, connection reset. */
export class NetworkError extends XtreamError {
  readonly cause?: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.cause = cause;
  }
}

/** The request exceeded its time budget. Distinct from NetworkError so the UI
 *  can say "the server is slow" rather than "you are offline". */
export class TimeoutError extends NetworkError {}

/** HTTP >= 500, or a malformed body we could not parse. */
export class ServerError extends XtreamError {
  readonly httpStatus: number;

  constructor(message: string, httpStatus: number) {
    super(message);
    this.httpStatus = httpStatus;
  }
}

/**
 * HTTP 403 from a stream route. On this server that nearly always means the
 * per-user connection limit, because slots are held for 30 minutes after last
 * use and are never explicitly released (xtream/state.py CONN_WINDOW).
 */
export class ConnectionLimitError extends XtreamError {
  constructor() {
    super(
      'Connection limit reached. Slots free up about 30 minutes after last use.',
    );
  }
}

/** True for errors where retrying the identical request could plausibly help. */
export function isRetryable(err: unknown): boolean {
  if (err instanceof AuthError) return false;
  if (err instanceof NotFoundError) return false;
  if (err instanceof ConnectionLimitError) return false;
  if (err instanceof ServerError) return err.httpStatus >= 500;
  return err instanceof NetworkError;
}
