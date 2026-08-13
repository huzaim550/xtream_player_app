/**
 * Live TV.
 *
 * The one browsing screen with no posters and no grid -- see ui/ChannelRow.tsx
 * for why a channel is a row. Two things here are worth knowing before editing:
 *
 * 1. The guide is fetched for the rows that are actually on screen, not for the
 *    whole list. `get_short_epg` is one request per channel, so a 200-channel
 *    playlist would otherwise mean 200 requests through a home tunnel to fill
 *    in text for rows nobody has scrolled to. store/epg.ts caps the
 *    concurrency; this screen decides *which* channels are worth asking about.
 *
 * 2. `nowSec` ticks, and it is what makes the progress bars move and a finished
 *    programme roll over to the next one. Deriving "now" from Date.now() inside
 *    the render would give a value that never changes on its own, because
 *    nothing else on this screen re-renders while you watch it.
 */

import { useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, StyleSheet, Text, View, type ViewToken } from 'react-native';
import { useCatalogue } from '@/store/catalogue';
import { isPlaceholder, nowNext, programmeProgress, useEpg } from '@/store/epg';
import { useSession } from '@/store/session';
import { ALL_CATEGORIES, CategoryChips } from '@/ui/CategoryChips';
import { ChannelRow } from '@/ui/ChannelRow';
import { FocusSection } from '@/ui/FocusSection';
import { OVERSCAN, Palette, Type } from '@/ui/platform';
import type { Channel } from '@/types/domain';

/**
 * How often the clock advances.
 *
 * A guide row shows minutes, so a second-accurate tick would re-render every
 * visible row 30 times for every visible change. 20s keeps the "until" time
 * honest to within a rounding error and the progress bar visibly moving.
 */
const TICK_MS = 20_000;

/**
 * Module scope, because FlatList requires this object's identity to be stable
 * for the life of the list and nothing about it depends on a render.
 *
 * A row half on screen is a row the user is reading. A threshold of 0 would
 * also count rows that are merely inside the virtualisation window, which is
 * how you end up fetching the guide for the whole playlist.
 */
const VIEWABILITY_CONFIG = {
  itemVisiblePercentThreshold: 50,
  minimumViewTime: 200,
} as const;

/** Rows whose guide is fetched up front. A little over one TV screenful. */
const PRIME_COUNT = 12;

export default function LiveScreen() {
  const router = useRouter();
  const session = useSession((s) => s.session);
  const data = useCatalogue((s) => s.data);
  const loading = useCatalogue((s) => s.loading);
  // Selected, not read through a getter: zustand re-runs selectors on every
  // store change, which is what lets a guide arriving mid-scroll actually
  // appear. See the React Compiler note in AGENTS.md.
  const byChannel = useEpg((s) => s.byChannel);
  const ensure = useEpg((s) => s.ensure);

  const [categoryId, setCategoryId] = useState<string>(ALL_CATEGORIES);
  const [nowSec, setNowSec] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNowSec(Math.floor(Date.now() / 1000)), TICK_MS);
    return () => clearInterval(t);
  }, []);

  const channels = useMemo(() => {
    const all = data?.channels ?? [];
    return categoryId === ALL_CATEGORIES
      ? all
      : all.filter((c) => c.categoryId === categoryId);
  }, [data, categoryId]);

  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const c of data?.channels ?? []) {
      out[c.categoryId] = (out[c.categoryId] ?? 0) + 1;
    }
    return out;
  }, [data]);

  /*
   * Viewability, via a ref that FlatList sees exactly once.
   *
   * FlatList throws "Changing onViewableItemsChanged on the fly is not
   * supported" if the prop identity changes, but the handler needs the current
   * session -- which arrives after mount. So the callback handed to the list is
   * created once and reads the live values out of a ref.
   *
   * The ref is updated in an effect rather than during render. Assigning to it
   * inline is the shorter spelling and it is wrong twice over: React may render
   * a component without committing it, and React Compiler refuses to memoize a
   * component that mutates a ref during render -- so that one line silently
   * opted this whole screen out of compilation.
   */
  const latest = useRef({ session, ensure });
  useEffect(() => {
    latest.current = { session, ensure };
  }, [session, ensure]);

  /*
   * Closes over nothing but the ref, so React Compiler memoizes it on nothing
   * and its identity never changes -- which is exactly what FlatList demands.
   * `useRef(fn).current` would read a ref during render, and the compiler
   * refuses to compile a component that does that at all.
   */
  const onViewable = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    const { session: s, ensure: fetchGuide } = latest.current;
    if (!s) return;
    const ids = viewableItems
      .map((v) => (v.item as Channel | undefined)?.id)
      .filter((id): id is number => typeof id === 'number');
    if (ids.length) fetchGuide(s, ids);
  }, []);

  /*
   * Prime the guide for the first screenful, rather than waiting to be told
   * what is visible.
   *
   * Not redundant with the viewability handler above, which is still what
   * covers scrolling: this makes the *initial* fetch deterministic instead of
   * dependent on FlatList firing a viewability event, which it delays by
   * `minimumViewTime` and recomputes only when it decides something changed.
   * Switching category swaps every row for a different one without any scroll
   * happening, and a screen of rows with no guide until you happen to flick it
   * is a degradation nobody would report as a bug.
   *
   * `ensure` already drops ids that are fresh or in flight, so this and the
   * viewability handler cannot fetch the same channel twice.
   */
  useEffect(() => {
    if (!session || channels.length === 0) return;
    ensure(
      session,
      channels.slice(0, PRIME_COUNT).map((c) => c.id),
    );
  }, [session, channels, ensure]);

  const play = useCallback(
    (channel: Channel) => {
      router.push({
        pathname: '/player',
        params: {
          kind: 'live',
          id: String(channel.id),
          title: channel.name,
          posterUrl: channel.logoUrl ?? undefined,
        },
      });
    },
    [router],
  );

  const hasAnyChannel = (data?.channels.length ?? 0) > 0;

  if (!hasAnyChannel) {
    return (
      <View style={styles.flex}>
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>
            {loading ? 'Loading your library…' : 'No live channels'}
          </Text>
          {!loading ? (
            <Text style={styles.emptyText}>
              Your server has no channels set up. Live TV appears here once a
              playlist has been added to it.
            </Text>
          ) : null}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <CategoryChips
        categories={data?.liveCategories ?? []}
        selected={categoryId}
        onSelect={setCategoryId}
        counts={counts}
        totalCount={data?.channels.length}
      />

      <FocusSection autoFocus style={styles.flex}>
        <FlatList
          data={channels}
          keyExtractor={(c) => String(c.id)}
          contentContainerStyle={styles.content}
          onViewableItemsChanged={onViewable}
          viewabilityConfig={VIEWABILITY_CONFIG}
          // Clipped subviews cannot hold focus; dropping the focused row
          // mid-scroll looks like a frozen screen on a TV. Same reason as
          // PosterGrid.
          removeClippedSubviews={false}
          initialNumToRender={10}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No channels in this category.</Text>
          }
          renderItem={({ item, index }) => {
            const { now, next } = nowNext(byChannel[item.id], nowSec);
            // A placeholder programme is titled after the channel itself, so
            // showing it would render "BBC One / BBC One". Nothing is better.
            const realNow = now && !isPlaceholder(now, item.name) ? now : undefined;
            const realNext = next && !isPlaceholder(next, item.name) ? next : undefined;
            return (
              <ChannelRow
                name={item.name}
                logoUrl={item.logoUrl}
                now={realNow}
                next={realNext}
                progress={realNow ? programmeProgress(realNow, nowSec) : 0}
                onPress={() => play(item)}
                // Exactly one preferred focus per screen.
                hasTVPreferredFocus={index === 0}
              />
            );
          }}
        />
      </FocusSection>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: Palette.background },
  content: { paddingVertical: OVERSCAN.vertical },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: OVERSCAN.horizontal,
    gap: 10,
  },
  emptyTitle: { color: Palette.text, fontSize: Type.heading, fontWeight: '700' },
  emptyText: {
    color: Palette.textMuted,
    fontSize: Type.body,
    textAlign: 'center',
    maxWidth: 460,
    padding: OVERSCAN.horizontal,
  },
});
