/**
 * Asks Google Play whether Remove Ads is owned, once per app launch.
 *
 * Mirrors useAdsInit.ts. Mounted from the (app) layout, same as that hook --
 * ordering between the two does not matter, since each only ever *narrows*
 * whether ads show, never widens it. Skipped on TV for the same reason ads
 * are already off there (see AGENTS.md), and skipped entirely off the Play
 * build -- src/store/purchases.ts's refresh() would no-op anyway, but there
 * is no reason to even ask.
 */

import { useEffect } from 'react';
import { IS_PLAY } from '@/distribution';
import { usePurchases } from '@/store/purchases';
import { IS_TV } from '@/ui/platform';

export function usePurchasesInit(): void {
  const refresh = usePurchases((s) => s.refresh);

  useEffect(() => {
    if (IS_TV || !IS_PLAY) return;
    void refresh();
  }, [refresh]);
}
