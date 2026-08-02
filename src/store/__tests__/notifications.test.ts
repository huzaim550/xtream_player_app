/**
 * The notification inbox.
 *
 * What is worth testing here is everything that decides what a user sees
 * *without* a server present: that a retracted message really disappears, that
 * a failed poll changes nothing rather than emptying the inbox, that read
 * marks survive a sync but do not accumulate forever, and that a malformed
 * record is dropped instead of rendered as a blank row.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { useNotifications } from '../notifications';
import { Keys } from '../persist';

const initial = useNotifications.getState();

const wire = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  title: `Title ${id}`,
  body: `Body ${id}`,
  linkUrl: null,
  level: 'info',
  createdAt: new Date(Date.parse('2026-01-01T00:00:00.000Z') + Number(id) * 60000).toISOString(),
  ...over,
});

/** The store's only outbound call. `globalThis` because there are no node types here. */
const fetchMock = jest.fn();
(globalThis as unknown as { fetch: unknown }).fetch = fetchMock;

function respondWith(notifications: unknown[]) {
  fetchMock.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ channel: 'production', notifications }),
  });
}

/** Bypass the five-minute rate limit the store applies to background polls. */
const sync = () => useNotifications.getState().sync({ force: true });

beforeEach(async () => {
  (AsyncStorage as unknown as { __reset: () => void }).__reset();
  fetchMock.mockReset();
  useNotifications.setState({ ...initial, readIds: new Set<string>() }, true);
});

describe('sync', () => {
  it('replaces the list, so a retracted message disappears', async () => {
    respondWith([wire('1'), wire('2')]);
    await sync();
    expect(useNotifications.getState().items.map((n) => n.id)).toEqual(['2', '1']);

    respondWith([wire('2')]);
    await sync();
    expect(useNotifications.getState().items.map((n) => n.id)).toEqual(['2']);
  });

  it('keeps what it has when the server cannot be reached', async () => {
    respondWith([wire('1')]);
    await sync();

    fetchMock.mockRejectedValueOnce(new Error('offline'));
    await sync();
    expect(useNotifications.getState().items.map((n) => n.id)).toEqual(['1']);
  });

  it('ignores a non-ok response rather than emptying the inbox', async () => {
    respondWith([wire('1')]);
    await sync();

    fetchMock.mockResolvedValueOnce({ ok: false, json: async () => ({}) });
    await sync();
    expect(useNotifications.getState().items).toHaveLength(1);
  });

  it('drops records that could only render as a blank row', async () => {
    respondWith([wire('1'), { id: '2', title: '', body: 'no title' }, { body: 'no id' }, null]);
    await sync();
    expect(useNotifications.getState().items.map((n) => n.id)).toEqual(['1']);
  });

  it('keeps only http(s) links, because they are handed to a browser', async () => {
    respondWith([
      wire('1', { linkUrl: 'https://manzaronline.site' }),
      wire('2', { linkUrl: 'javascript:alert(1)' }),
      wire('3', { linkUrl: 'file:///etc/passwd' }),
    ]);
    await sync();

    const byId = Object.fromEntries(
      useNotifications.getState().items.map((n) => [n.id, n.linkUrl]),
    );
    expect(byId['1']).toBe('https://manzaronline.site');
    expect(byId['2']).toBeNull();
    expect(byId['3']).toBeNull();
  });

  it('is rate limited unless forced', async () => {
    respondWith([wire('1')]);
    await useNotifications.getState().sync();
    respondWith([wire('2')]);
    await useNotifications.getState().sync();

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('read state', () => {
  it('counts unread and offers the newest one for the banner', async () => {
    respondWith([wire('1'), wire('2'), wire('3')]);
    await sync();

    expect(useNotifications.getState().unreadCount()).toBe(3);
    expect(useNotifications.getState().newestUnread()?.id).toBe('3');

    useNotifications.getState().markRead('3');
    expect(useNotifications.getState().unreadCount()).toBe(2);
    expect(useNotifications.getState().newestUnread()?.id).toBe('2');

    useNotifications.getState().markAllRead();
    expect(useNotifications.getState().unreadCount()).toBe(0);
    expect(useNotifications.getState().newestUnread()).toBeNull();
  });

  it('survives a sync, and forgets marks for messages that are gone', async () => {
    respondWith([wire('1'), wire('2')]);
    await sync();
    useNotifications.getState().markAllRead();

    respondWith([wire('2'), wire('3')]);
    await sync();

    const state = useNotifications.getState();
    // 2 stayed read; 1 is gone, so its mark went with it; 3 is new.
    expect([...state.readIds]).toEqual(['2']);
    expect(state.unreadCount()).toBe(1);
  });
});

describe('hydrate', () => {
  it('restores the inbox and its read marks from disk', async () => {
    respondWith([wire('1'), wire('2')]);
    await sync();
    useNotifications.getState().markRead('1');

    // A fresh process: same disk, empty memory.
    useNotifications.setState({ ...initial, items: [], readIds: new Set<string>() }, true);
    await useNotifications.getState().hydrate();

    const state = useNotifications.getState();
    expect(state.items.map((n) => n.id)).toEqual(['2', '1']);
    expect(state.unreadCount()).toBe(1);
    expect(state.hydrated).toBe(true);
  });

  it('reads an absent file as an empty inbox', async () => {
    await useNotifications.getState().hydrate();
    expect(useNotifications.getState().items).toEqual([]);
    expect(await AsyncStorage.getItem(Keys.notifications)).toBeNull();
  });
});
