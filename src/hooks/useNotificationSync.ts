/**
 * Read the inbox off disk, then ask the server what is new.
 *
 * Same order as useCatalogueSync -- disk first, network second -- so the badge
 * is right immediately and only gets more right once the request lands.
 *
 * Foreground is the second trigger, because a poll-based channel that only
 * fires at cold start would mean an app left open for a week never sees
 * anything. The store rate-limits it to one request per five minutes.
 */

import { useEffect } from 'react';
import { AppState } from 'react-native';
import { useNotifications } from '@/store/notifications';

export function useNotificationSync() {
  const hydrate = useNotifications((s) => s.hydrate);
  const sync = useNotifications((s) => s.sync);
  const hydrated = useNotifications((s) => s.hydrated);

  useEffect(() => {
    void hydrate();
  }, [hydrate]);

  useEffect(() => {
    // Hydrating first matters: syncing into an un-hydrated store would drop
    // the read marks that are still sitting on disk.
    if (!hydrated) return;
    void sync();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void sync();
    });
    return () => subscription.remove();
  }, [hydrated, sync]);
}
