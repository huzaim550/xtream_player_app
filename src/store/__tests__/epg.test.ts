/**
 * The guide's pure functions.
 *
 * These decide what a channel row says, and every way they can be wrong is a
 * way the row renders confidently wrong text rather than failing: last hour's
 * programme still shown as "now", a placeholder rendered as if it were real
 * data, a progress bar past the end of its track.
 *
 * `nowNext` in particular cannot simply trust the order it was given. The
 * server filters to unfinished programmes at *fetch* time, and this store keeps
 * an entry for up to ten minutes -- so by the time it is read, the first entry
 * in the list may well have ended.
 */

import { isPlaceholder, nowNext, programmeProgress, type EpgEntry } from '../epg';
import type { Programme } from '@/types/domain';

const NOW = 1_786_089_600; // an arbitrary but fixed "now", in unix seconds

const prog = (over: Partial<Programme> = {}): Programme => ({
  title: 'The One Show',
  description: 'Topical magazine.',
  startSec: NOW - 600,
  stopSec: NOW + 1200,
  ...over,
});

const entry = (programmes: Programme[]): EpgEntry => ({
  programmes,
  fetchedAt: Date.now(),
});

describe('nowNext', () => {
  it('picks the programme spanning the moment asked about', () => {
    const current = prog();
    const upcoming = prog({ title: 'News', startSec: NOW + 1200, stopSec: NOW + 3000 });
    const { now, next } = nowNext(entry([current, upcoming]), NOW);
    expect(now?.title).toBe('The One Show');
    expect(next?.title).toBe('News');
  });

  it('skips a programme that has already finished', () => {
    // The case that matters: this entry was fetched while the first programme
    // was still on, and is being read twenty minutes later.
    const over = prog({ title: 'Breakfast', startSec: NOW - 7200, stopSec: NOW - 60 });
    const current = prog({ title: 'The One Show' });
    const { now } = nowNext(entry([over, current]), NOW);
    expect(now?.title).toBe('The One Show');
  });

  it('reports no "now" when there is a gap in the schedule', () => {
    // Off air between programmes is a real state, and inventing a "now" from
    // the next one would put a progress bar on something not yet started.
    const later = prog({ startSec: NOW + 600, stopSec: NOW + 3000 });
    const { now, next } = nowNext(entry([later]), NOW);
    expect(now).toBeUndefined();
    expect(next).toBe(later);
  });

  it('reports nothing at all for a channel with no guide', () => {
    expect(nowNext(undefined, NOW)).toEqual({ now: undefined, next: undefined });
    expect(nowNext(entry([]), NOW)).toEqual({ now: undefined, next: undefined });
  });

  it('reports nothing once every programme it holds has ended', () => {
    const stale = prog({ startSec: NOW - 7200, stopSec: NOW - 3600 });
    expect(nowNext(entry([stale]), NOW).now).toBeUndefined();
  });
});

describe('programmeProgress', () => {
  it('measures how far through the programme the moment is', () => {
    // Halfway through a one-hour show.
    const p = prog({ startSec: NOW - 1800, stopSec: NOW + 1800 });
    expect(programmeProgress(p, NOW)).toBeCloseTo(0.5);
  });

  it('clamps rather than overflowing its track', () => {
    const p = prog({ startSec: NOW - 3600, stopSec: NOW - 1800 });
    expect(programmeProgress(p, NOW)).toBe(1);
    const future = prog({ startSec: NOW + 600, stopSec: NOW + 1200 });
    expect(programmeProgress(future, NOW)).toBe(0);
  });

  it('returns 0 for a zero-length programme instead of dividing by zero', () => {
    // NaN here would render as a bar of width "NaN%", which React Native
    // silently drops -- a bug with no visible symptom beyond a missing bar.
    const p = prog({ startSec: NOW, stopSec: NOW });
    expect(programmeProgress(p, NOW)).toBe(0);
  });
});

describe('isPlaceholder', () => {
  it('recognises the server filler, which is titled after the channel', () => {
    // xtream/epg.py _placeholders. There is no flag on the wire; this is the
    // only signal, and showing it would render "BBC One / BBC One".
    expect(isPlaceholder(prog({ title: 'BBC One' }), 'BBC One')).toBe(true);
  });

  it('ignores case and surrounding space, which the playlist controls', () => {
    expect(isPlaceholder(prog({ title: 'bbc one' }), '  BBC One ')).toBe(true);
  });

  it('leaves a real programme alone', () => {
    expect(isPlaceholder(prog({ title: 'The One Show' }), 'BBC One')).toBe(false);
  });
});
