/**
 * Announcements from the build server.
 *
 * A *pull* channel, not push. The app asks the same self-hosted box that
 * serves updates whether anything has been posted, and shows what comes back
 * in its own inbox. Nothing is ever sent to this device, there is no device
 * token and no registration -- so the server never learns an install exists,
 * and this whole feature ships over the air with no native module and no new
 * APK. The price is honest and worth stating: a closed app shows nothing until
 * it is next opened.
 *
 * It talks to the build server rather than the Xtream server, which is why it
 * lives here and not in src/api -- same reasoning as hooks/useAppUpdate.ts,
 * whose endpoint sits on the same host.
 *
 * Quiet on failure throughout. That box is a home machine behind a Cloudflare
 * tunnel; it may be asleep or unreachable, and none of that is worth an error
 * in front of somebody trying to watch a film.
 */

import { create } from 'zustand';
import { Keys, readJson, writeJson } from './persist';

/** Same host the OTA manifest and the APK check use. See app.config.ts. */
const NOTIFICATIONS_API =
  'https://updates.manzaronline.site/api/notifications/xtream-player-app';

/** Matches the `expo-channel-name` header in app.config.ts `updates`. */
const CHANNEL = 'production';

/** A cold call through the tunnel can take seconds. */
const TIMEOUT_MS = 12000;

/** Foregrounding the app repeatedly must not mean a request every time. */
const MIN_SYNC_INTERVAL_MS = 5 * 60 * 1000;

/** The server serves at most this many; keeping the same cap keeps them aligned. */
const MAX_ITEMS = 50;

export type NotificationLevel = 'info' | 'warning';

export interface AppNotification {
  id: string;
  title: string;
  body: string;
  /** http(s) only -- see coerce(). Null when the message is just text. */
  linkUrl: string | null;
  level: NotificationLevel;
  /** ISO 8601, from the server. Sort key and the only clock involved. */
  createdAt: string;
}

interface NotificationsFile {
  version: 1;
  items: AppNotification[];
  readIds: string[];
}

interface WireResponse {
  notifications?: unknown;
}

interface NotificationsState {
  items: AppNotification[];
  readIds: Set<string>;
  hydrated: boolean;
  /** In-memory only: a cold start should always sync. */
  lastSyncAt: number;

  hydrate: () => Promise<void>;
  sync: (opts?: { force?: boolean }) => Promise<void>;
  unreadCount: () => number;
  newestUnread: () => AppNotification | null;
  markRead: (id: string) => void;
  markAllRead: () => void;
  clearAll: () => void;
}

/**
 * Coerce one wire record, or reject it.
 *
 * The single place a server shape becomes an app shape -- same rule as
 * src/api/normalize.ts. A record missing an id, a title or a body is dropped
 * rather than rendered as a blank row, and a `linkUrl` that is not http(s) is
 * dropped rather than handed to the system browser: the server already refuses
 * those, and this is the half of that check that runs on the device.
 */
function coerce(raw: unknown): AppNotification | null {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as Record<string, unknown>;

  const id = typeof r.id === 'string' ? r.id : '';
  const title = typeof r.title === 'string' ? r.title.trim() : '';
  const body = typeof r.body === 'string' ? r.body.trim() : '';
  if (!id || !title || !body) return null;

  const link = typeof r.linkUrl === 'string' ? r.linkUrl.trim() : '';
  const linkUrl = /^https?:\/\//i.test(link) ? link : null;

  const createdAt =
    typeof r.createdAt === 'string' && !Number.isNaN(Date.parse(r.createdAt))
      ? r.createdAt
      : new Date().toISOString();

  return {
    id,
    title,
    body,
    linkUrl,
    level: r.level === 'warning' ? 'warning' : 'info',
    createdAt,
  };
}

function newestFirst(items: AppNotification[]): AppNotification[] {
  return [...items].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
}

export const useNotifications = create<NotificationsState>((set, get) => {
  const persist = () =>
    void writeJson(Keys.notifications, {
      version: 1,
      items: get().items,
      readIds: [...get().readIds],
    } satisfies NotificationsFile);

  return {
    items: [],
    readIds: new Set<string>(),
    hydrated: false,
    lastSyncAt: 0,

    hydrate: async () => {
      const file = await readJson<NotificationsFile>(Keys.notifications);
      set({
        items: newestFirst((file?.items ?? []).map(coerce).filter((n) => n !== null)),
        readIds: new Set(file?.readIds ?? []),
        hydrated: true,
      });
    },

    /**
     * Replace the local list with what the server currently serves.
     *
     * Replace, not merge: retracting a message on the dashboard has to mean
     * something, and the served window is the whole truth about what is live.
     * A failed fetch changes nothing, so an offline launch still shows the
     * inbox it had. Read state survives independently.
     */
    sync: async ({ force = false }: { force?: boolean } = {}) => {
      const now = Date.now();
      if (!force && now - get().lastSyncAt < MIN_SYNC_INTERVAL_MS) return;
      set({ lastSyncAt: now });

      let payload: WireResponse;
      try {
        const res = await fetch(`${NOTIFICATIONS_API}?channel=${CHANNEL}`, {
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        if (!res.ok) return;
        payload = (await res.json()) as WireResponse;
      } catch {
        return;
      }

      if (!Array.isArray(payload.notifications)) return;
      const items = newestFirst(
        payload.notifications.map(coerce).filter((n) => n !== null),
      ).slice(0, MAX_ITEMS);

      // Drop read marks for messages that are gone, so the file cannot grow
      // without bound across years of announcements.
      const live = new Set(items.map((n) => n.id));
      const readIds = new Set([...get().readIds].filter((id) => live.has(id)));

      set({ items, readIds });
      persist();
    },

    unreadCount: () => {
      const { items, readIds } = get();
      return items.reduce((n, item) => (readIds.has(item.id) ? n : n + 1), 0);
    },

    // items is already newest-first, so the first unread is the newest one.
    newestUnread: () => {
      const { items, readIds } = get();
      return items.find((item) => !readIds.has(item.id)) ?? null;
    },

    markRead: (id) => {
      if (get().readIds.has(id)) return;
      set((s) => ({ readIds: new Set(s.readIds).add(id) }));
      persist();
    },

    markAllRead: () => {
      set((s) => ({ readIds: new Set(s.items.map((n) => n.id)) }));
      persist();
    },

    clearAll: () => {
      set({ items: [], readIds: new Set<string>() });
      persist();
    },
  };
});
