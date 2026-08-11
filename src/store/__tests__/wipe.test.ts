/**
 * "Delete all app data" has to actually delete all app data.
 *
 * This is the one control the privacy policy points at by name and the one a
 * Play data-deletion review would exercise, so the test is deliberately blunt:
 * write something under every key the app knows how to persist, wipe, and
 * assert the store is empty. It fails on a key added to `Keys` that some future
 * wipe forgets, which is the failure that would otherwise be invisible -- the
 * screen would still say "deleted" and one row would survive.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { Keys } from '../persist';
import { wipeAllData } from '../wipe';

// downloads.clearAll() reaches the filesystem to remove the video files. What
// matters here is the bookkeeping, so the transfer layer is inert -- same shape
// as downloads.test.ts.
jest.mock('@/api/download', () => ({
  ...jest.requireActual('@/api/download'),
  deleteDownloadFile: jest.fn(),
  downloadFileExists: jest.fn(() => false),
  downloadsAvailable: jest.fn(() => true),
}));

const storage = AsyncStorage as unknown as { __reset: () => void };

describe('wipeAllData', () => {
  beforeEach(() => {
    storage.__reset();
  });

  it('leaves no key from Keys behind', async () => {
    const keys = Object.values(Keys);
    // Deliberately not realistic shapes: a wipe must not depend on being able
    // to parse what it is deleting, and a store that chokes on junk on its way
    // past would be a real bug on a device with a half-written file.
    for (const key of keys) await AsyncStorage.setItem(key, '{"version":1}');

    await wipeAllData();

    const survivors: string[] = [];
    for (const key of keys) {
      if ((await AsyncStorage.getItem(key)) !== null) survivors.push(key);
    }
    expect(survivors).toEqual([]);
  });

  it('is safe to run on a device that has nothing stored', async () => {
    await expect(wipeAllData()).resolves.toBeUndefined();
  });
});
