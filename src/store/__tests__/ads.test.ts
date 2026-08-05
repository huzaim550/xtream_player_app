/**
 * The wire boundary and the break schedule.
 *
 * Both halves of this file guard something that fails silently in production:
 * a bad coerce() means ads appear for someone who should not have them, and a
 * bad schedule means a film that stops for an advert every few seconds.
 */

import { coerce, midRollPoints } from '../ads';
import type { AdsConfig } from '@/types/domain';

const FULL = {
  banner_surfaces: ['home', 'movies', 'series', 'search', 'my_list'],
  player_pre_roll: 1,
  player_mid_roll_breaks: 1,
  player_min_title_seconds: 900,
  player_min_seconds_between: 300,
  interstitial_every_n_opens: 0,
  interstitial_min_seconds: 180,
};

describe('coerce', () => {
  it('treats an absent key as no ads', () => {
    // The normal case: the server omits it for every account without ads, and
    // for every server too old to know about them.
    expect(coerce(undefined)).toBeNull();
    expect(coerce(null)).toBeNull();
  });

  it('reads a full payload', () => {
    const c = coerce(FULL) as AdsConfig;
    expect(c.bannerSurfaces).toEqual(['home', 'movies', 'series', 'search', 'my_list']);
    expect(c.preRoll).toBe(1);
    expect(c.midRollBreaks).toBe(1);
    expect(c.interstitialMinSeconds).toBe(180);
  });

  it('fills in defaults for missing counts', () => {
    const c = coerce({}) as AdsConfig;
    expect(c.bannerSurfaces).toEqual([]);
    expect(c.midRollBreaks).toBe(0);
    expect(c.minTitleSeconds).toBe(900);
  });

  it('accepts counts sent as strings', () => {
    const c = coerce({ ...FULL, player_mid_roll_breaks: '2' }) as AdsConfig;
    expect(c.midRollBreaks).toBe(2);
  });

  it('clamps a count the server should never have sent', () => {
    // The server validates this too. This is the half that runs where the
    // damage would happen -- a stray 500 must not mean 500 ad breaks.
    const c = coerce({ ...FULL, player_mid_roll_breaks: 500 }) as AdsConfig;
    expect(c.midRollBreaks).toBe(5);
  });

  it('falls back to the default on junk', () => {
    const c = coerce({ ...FULL, player_mid_roll_breaks: 'lots' }) as AdsConfig;
    expect(c.midRollBreaks).toBe(0);
  });

  it('drops a surface this build does not know about', () => {
    const c = coerce({ ...FULL, banner_surfaces: ['home', 'kitchen'] }) as AdsConfig;
    expect(c.bannerSurfaces).toEqual(['home']);
  });

  it('survives banner_surfaces arriving as something other than a list', () => {
    const c = coerce({ ...FULL, banner_surfaces: 'home' }) as AdsConfig;
    expect(c.bannerSurfaces).toEqual([]);
  });
});

describe('midRollPoints', () => {
  const config = (over: Partial<AdsConfig> = {}): AdsConfig => ({
    ...(coerce(FULL) as AdsConfig),
    ...over,
  });

  it('puts one break at the halfway mark', () => {
    expect(midRollPoints(config({ midRollBreaks: 1 }), 3600, 0)).toEqual([1800]);
  });

  it('spreads two breaks across the thirds', () => {
    expect(midRollPoints(config({ midRollBreaks: 2 }), 3600, 0)).toEqual([1200, 2400]);
  });

  it('is empty when mid-rolls are off', () => {
    expect(midRollPoints(config({ midRollBreaks: 0 }), 3600, 0)).toEqual([]);
  });

  it('is empty when ads are off entirely', () => {
    expect(midRollPoints(null, 3600, 0)).toEqual([]);
  });

  it('leaves a short title alone', () => {
    // A 12-minute episode should not carry a commercial break.
    expect(midRollPoints(config({ midRollBreaks: 1 }), 720, 0)).toEqual([]);
  });

  it('drops breaks already behind the resume point', () => {
    // Resuming a film at 80% must not fire the halfway ad on the first tick --
    // the most obvious way this feature could look broken.
    expect(midRollPoints(config({ midRollBreaks: 1 }), 3600, 2900)).toEqual([]);
    expect(midRollPoints(config({ midRollBreaks: 2 }), 3600, 1500)).toEqual([2400]);
  });

  it('ignores an unknown duration', () => {
    expect(midRollPoints(config({ midRollBreaks: 1 }), 0, 0)).toEqual([]);
    expect(midRollPoints(config({ midRollBreaks: 1 }), NaN, 0)).toEqual([]);
  });
});
