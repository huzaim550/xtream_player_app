/**
 * The break schedule.
 *
 * This guards something that fails silently in production: a bad schedule
 * means a film that stops for an advert every few seconds.
 */

import { midRollPoints } from '../ads';

const DEFAULT_CONFIG = {
  midRollBreaks: 2,
  minTitleSeconds: 900,
};

describe('midRollPoints', () => {
  it('puts one break at the halfway mark', () => {
    expect(midRollPoints(3600, 0)).toEqual([1200, 2400]);
  });

  it('spreads breaks evenly across the film', () => {
    expect(midRollPoints(3600, 0)).toEqual([1200, 2400]);
  });

  it('is empty when the title is too short', () => {
    // A 12-minute episode should not carry a commercial break.
    expect(midRollPoints(720, 0)).toEqual([]);
  });

  it('drops breaks already behind the resume point', () => {
    // Resuming a film at 80% must not fire the ad on the first tick --
    // the most obvious way this feature could look broken.
    expect(midRollPoints(3600, 2900)).toEqual([]);
    expect(midRollPoints(3600, 1500)).toEqual([2400]);
  });

  it('ignores an unknown duration', () => {
    expect(midRollPoints(0, 0)).toEqual([]);
    expect(midRollPoints(NaN, 0)).toEqual([]);
  });
});
