/**
 * The break schedule.
 *
 * This guards something that fails silently in production: a bad schedule
 * means a film that stops for an advert every few seconds.
 */

import { midRollPoints } from '../ads';

describe('midRollPoints', () => {
  // Was two identical assertions under different names, one of which claimed
  // "one break at the halfway mark" while asserting two -- a leftover from when
  // the break count came off the server handshake and the default was 1.
  it('spreads the configured breaks evenly across the film', () => {
    // DEFAULT_ADS_CONFIG.midRollBreaks is 2, so an hour splits into thirds.
    expect(midRollPoints(3600, 0, false)).toEqual([1200, 2400]);
  });

  it('is empty when the title is too short', () => {
    // A 12-minute episode should not carry a commercial break.
    expect(midRollPoints(720, 0, false)).toEqual([]);
  });

  it('drops breaks already behind the resume point', () => {
    // Resuming a film at 80% must not fire the ad on the first tick --
    // the most obvious way this feature could look broken.
    expect(midRollPoints(3600, 2900, false)).toEqual([]);
    expect(midRollPoints(3600, 1500, false)).toEqual([2400]);
  });

  it('ignores an unknown duration', () => {
    expect(midRollPoints(0, 0, false)).toEqual([]);
    expect(midRollPoints(NaN, 0, false)).toEqual([]);
  });

  it('is empty once Remove Ads is owned, regardless of duration', () => {
    expect(midRollPoints(3600, 0, true)).toEqual([]);
  });
});
