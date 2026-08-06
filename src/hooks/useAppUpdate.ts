/**
 * "A newer APK exists" check.
 *
 * This covers the half of updating that expo-updates cannot. A JS-only change
 * arrives over the air by itself, but anything native -- a new module, an Expo
 * SDK bump, a permission -- ships as a whole new APK that the user has to
 * install by hand. Nothing would tell them it exists, so this asks.
 *
 * The comparison is on versionCode, not the version string: it is the integer
 * Android itself orders installs by, and it is the only field guaranteed to
 * increase. `version` ("1.0.0") is a display label and can legitimately stay
 * the same across builds.
 *
 * Deliberately quiet on failure. The build server lives behind a home tunnel
 * and may be asleep, offline, or unreachable from the user's network; none of
 * that is worth an error in front of somebody trying to watch a film.
 */

import * as Application from 'expo-application';
import { useEffect, useState } from 'react';
import { Linking } from 'react-native';

/**
 * Where the self-hosted build server publishes releases. Same host the OTA
 * manifest is served from (see `updates.url` in app.config.ts).
 */
const UPDATE_API = 'https://updates.manzaronline.site/api/apps/xtream-player-app/latest';

/** The server is a home box behind Cloudflare; a cold call can take seconds. */
const TIMEOUT_MS = 12000;

export interface AvailableUpdate {
  versionName: string | null;
  versionCode: number;
  sizeBytes: number | null;
  downloadUrl: string;
}

interface LatestResponse {
  versionName: string | null;
  versionCode: number | null;
  sizeBytes: number | null;
  downloadUrl: string;
}

/** versionCode of the running build, or null if Android won't say. */
function installedVersionCode(): number | null {
  const raw = Application.nativeBuildVersion;
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

export async function fetchAvailableUpdate(): Promise<AvailableUpdate | null> {
  const installed = installedVersionCode();
  if (installed === null) return null;

  let body: LatestResponse;
  try {
    const res = await fetch(UPDATE_API, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    // 404 simply means nothing has been released yet.
    if (!res.ok) return null;
    body = await res.json();
  } catch {
    return null;
  }

  // A build made before the server tracked versions reports null here. Treat
  // that as "nothing to offer" rather than risking a downgrade prompt.
  if (typeof body.versionCode !== 'number') return null;
  if (body.versionCode <= installed) return null;

  return {
    versionName: body.versionName,
    versionCode: body.versionCode,
    sizeBytes: body.sizeBytes,
    downloadUrl: body.downloadUrl,
  };
}

/**
 * Hand the APK to the browser rather than installing it in-process.
 *
 * Installing directly would need REQUEST_INSTALL_PACKAGES plus a FileProvider
 * and custom native code. Android's download manager already does this job,
 * and the user gets the system's own install prompt -- which is the flow they
 * recognise, and the one that stays honest about what is being installed.
 */
export function openUpdateDownload(update: AvailableUpdate): void {
  void Linking.openURL(update.downloadUrl);
}

/** Poll once per mount. Returns null until an update is known to exist. */
export function useAppUpdate(): AvailableUpdate | null {
  const [update, setUpdate] = useState<AvailableUpdate | null>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchAvailableUpdate().then((found) => {
      if (!cancelled) setUpdate(found);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return update;
}

/** Human-readable size for the prompt, e.g. "49 MB". */
export function formatUpdateSize(bytes: number | null): string | null {
  if (!bytes) return null;
  return `${Math.round(bytes / 1024 / 1024)} MB`;
}
