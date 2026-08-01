/**
 * Hydrate the local stores, then refresh the catalogue once per session.
 *
 * Order matters: disk first, network second. Reading the cache before any
 * request is what makes the app interactive in well under a second and lets
 * browsing work with no connection at all.
 */

import { useEffect } from 'react';
import { AuthError } from '@/api/errors';
import { useCatalogue } from '@/store/catalogue';
import { useFavorites } from '@/store/favorites';
import { useProgress } from '@/store/progress';
import { useSession } from '@/store/session';

export function useCatalogueSync() {
  const session = useSession((s) => s.session);
  const hydrateCatalogue = useCatalogue((s) => s.hydrate);
  const refresh = useCatalogue((s) => s.refresh);
  const hydrated = useCatalogue((s) => s.hydrated);
  const hydrateProgress = useProgress((s) => s.hydrate);
  const hydrateFavorites = useFavorites((s) => s.hydrate);

  useEffect(() => {
    void hydrateCatalogue();
    void hydrateProgress();
    void hydrateFavorites();
  }, [hydrateCatalogue, hydrateProgress, hydrateFavorites]);

  useEffect(() => {
    if (!session || !hydrated) return;
    // An AuthError here is handled by the session store, which drops to the
    // login screen; swallow it so it does not surface as an unhandled promise.
    void refresh(session).catch((err) => {
      if (!(err instanceof AuthError) && __DEV__) {
        console.warn('[catalogue] refresh failed', err);
      }
    });
  }, [session, hydrated, refresh]);
}
