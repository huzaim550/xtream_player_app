/**
 * The download state machine.
 *
 * The transfer itself is mocked -- what matters here is the bookkeeping around
 * it, which is where the bugs live: a queue that drains exactly once, a cancel
 * that cannot resurrect the record it just removed, and a hydrate that tells
 * the truth about transfers the process did not survive.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { downloadedBytes, sortedDownloads, useDownloads } from '../downloads';
import { Keys } from '../persist';
import type { DownloadEntry } from '../downloads';
import type { Session } from '@/types/domain';

jest.mock('@/api/download', () => {
  const actual = jest.requireActual('@/api/download');
  return {
    ...actual,
    downloadsAvailable: jest.fn(() => true),
    availableDiskSpace: jest.fn(() => 50 * 1024 ** 3),
    deleteDownloadFile: jest.fn(),
    downloadFileExists: jest.fn(() => true),
    downloadFileSize: jest.fn(() => 1024 ** 3),
    startDownload: jest.fn(),
  };
});

import {
  availableDiskSpace,
  deleteDownloadFile,
  downloadFileExists,
  downloadsAvailable,
  startDownload,
} from '@/api/download';

const mockStart = startDownload as jest.Mock;
const mockAvailable = downloadsAvailable as jest.Mock;
const mockDisk = availableDiskSpace as jest.Mock;
const mockExists = downloadFileExists as jest.Mock;

const session: Session = { baseUrl: 'https://s', username: 'u', password: 'p' };

const movie = (key = 'movie:1') => ({
  key,
  kind: 'movie' as const,
  id: key.split(':')[1],
  ext: 'mkv',
  title: 'A Movie',
  posterUrl: null,
});

/** A transfer whose outcome the test decides, later. */
function deferredTransfer() {
  let settle!: (uri: string | null) => void;
  let fail!: (err: Error) => void;
  const promise = new Promise<string | null>((res, rej) => {
    settle = res;
    fail = rej;
  });
  const cancel = jest.fn();
  return { handle: { promise, cancel }, settle, fail, cancel };
}

const flush = () => new Promise((r) => setTimeout(r, 0));

/** Put a record on "disk" the way a previous app run would have left it. */
const seedStored = (entry: DownloadEntry) =>
  AsyncStorage.setItem(
    Keys.downloads,
    JSON.stringify({ version: 1, entries: { [entry.key]: entry } }),
  );

beforeEach(async () => {
  // clearAll(), not just setState: the live transfer handles live in a
  // module-level map that setState cannot see, so without this a deferred
  // transfer from the previous test is still "in flight" and blocks the queue
  // for every test after it.
  await useDownloads.getState().clearAll();
  useDownloads.setState({ entries: {}, hydrated: false });

  jest.clearAllMocks();
  mockAvailable.mockReturnValue(true);
  mockDisk.mockReturnValue(50 * 1024 ** 3);
  mockExists.mockReturnValue(true);
});

describe('enqueue', () => {
  it('starts the transfer and marks the entry downloading', () => {
    const t = deferredTransfer();
    mockStart.mockReturnValue(t.handle);

    useDownloads.getState().enqueue(session, movie());

    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(useDownloads.getState().entries['movie:1'].status).toBe('downloading');
  });

  it('ignores a second enqueue of something already in flight', () => {
    mockStart.mockReturnValue(deferredTransfer().handle);
    useDownloads.getState().enqueue(session, movie());
    useDownloads.getState().enqueue(session, movie());
    expect(mockStart).toHaveBeenCalledTimes(1);
  });

  it('runs one at a time and starts the next when the first finishes', async () => {
    const first = deferredTransfer();
    const second = deferredTransfer();
    mockStart.mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);

    useDownloads.getState().enqueue(session, movie('movie:1'));
    useDownloads.getState().enqueue(session, movie('movie:2'));

    // The second must wait rather than saturating the tunnel.
    expect(mockStart).toHaveBeenCalledTimes(1);
    expect(useDownloads.getState().entries['movie:2'].status).toBe('queued');

    first.settle('file:///downloads/movie_1.mkv');
    await flush();

    expect(useDownloads.getState().entries['movie:1'].status).toBe('done');
    expect(useDownloads.getState().entries['movie:1'].fileUri).toBe(
      'file:///downloads/movie_1.mkv',
    );
    expect(mockStart).toHaveBeenCalledTimes(2);
    expect(useDownloads.getState().entries['movie:2'].status).toBe('downloading');
  });

  it('records progress as bytes arrive', () => {
    const t = deferredTransfer();
    mockStart.mockImplementation((args: { onProgress: (a: number, b: number) => void }) => {
      args.onProgress(512, 2048);
      return t.handle;
    });

    useDownloads.getState().enqueue(session, movie());

    const e = useDownloads.getState().entries['movie:1'];
    expect(e.bytesWritten).toBe(512);
    expect(e.bytesTotal).toBe(2048);
  });

  it('refuses to start when the device is nearly full, and says why', () => {
    mockDisk.mockReturnValue(100 * 1024 ** 2); // 100 MB
    useDownloads.getState().enqueue(session, movie());

    const e = useDownloads.getState().entries['movie:1'];
    expect(e.status).toBe('failed');
    expect(e.error).toMatch(/Not enough space/);
    expect(mockStart).not.toHaveBeenCalled();
  });

  it('refuses when the native module is missing, instead of throwing', () => {
    mockAvailable.mockReturnValue(false);
    useDownloads.getState().enqueue(session, movie());

    expect(useDownloads.getState().entries['movie:1'].error).toMatch(/not supported/i);
    expect(mockStart).not.toHaveBeenCalled();
  });
});

describe('failure and retry', () => {
  it('marks the entry failed with the error message', async () => {
    const t = deferredTransfer();
    mockStart.mockReturnValue(t.handle);
    useDownloads.getState().enqueue(session, movie());

    t.fail(new Error('Network unreachable'));
    await flush();

    const e = useDownloads.getState().entries['movie:1'];
    expect(e.status).toBe('failed');
    expect(e.error).toBe('Network unreachable');
  });

  it('allows re-enqueueing something that failed', async () => {
    const t = deferredTransfer();
    mockStart.mockReturnValue(t.handle);
    useDownloads.getState().enqueue(session, movie());
    t.fail(new Error('boom'));
    await flush();

    mockStart.mockReturnValue(deferredTransfer().handle);
    useDownloads.getState().enqueue(session, movie());

    expect(useDownloads.getState().entries['movie:1'].status).toBe('downloading');
  });

  it('retry clears the previous error and restarts', async () => {
    const t = deferredTransfer();
    mockStart.mockReturnValue(t.handle);
    useDownloads.getState().enqueue(session, movie());
    t.fail(new Error('boom'));
    await flush();

    mockStart.mockReturnValue(deferredTransfer().handle);
    useDownloads.getState().retry(session, 'movie:1');

    const e = useDownloads.getState().entries['movie:1'];
    expect(e.status).toBe('downloading');
    expect(e.error).toBeUndefined();
  });
});

describe('cancel and remove', () => {
  it('cancels the transfer, drops the record, and deletes the file', async () => {
    const t = deferredTransfer();
    mockStart.mockReturnValue(t.handle);
    useDownloads.getState().enqueue(session, movie());

    useDownloads.getState().cancel('movie:1');

    expect(t.cancel).toHaveBeenCalled();
    expect(useDownloads.getState().entries['movie:1']).toBeUndefined();
    expect(deleteDownloadFile).toHaveBeenCalledWith('movie:1', 'mkv');
  });

  it('does not resurrect a cancelled record when its promise rejects', async () => {
    const t = deferredTransfer();
    mockStart.mockReturnValue(t.handle);
    useDownloads.getState().enqueue(session, movie());

    useDownloads.getState().cancel('movie:1');
    // cancel() rejects the in-flight promise; the catch must not re-add it.
    t.fail(new Error('Aborted'));
    await flush();

    expect(useDownloads.getState().entries['movie:1']).toBeUndefined();
  });

  it('remove stops an in-flight transfer before deleting its file', () => {
    const t = deferredTransfer();
    mockStart.mockReturnValue(t.handle);
    useDownloads.getState().enqueue(session, movie());

    // The delete button on the Downloads screen calls remove(), not cancel().
    // Leaving the task running would let it write the file back after we had
    // deleted it, orphaning bytes no record points at.
    useDownloads.getState().remove('movie:1');

    expect(t.cancel).toHaveBeenCalled();
    expect(t.cancel.mock.invocationCallOrder[0]).toBeLessThan(
      (deleteDownloadFile as jest.Mock).mock.invocationCallOrder[0],
    );
    expect(useDownloads.getState().entries['movie:1']).toBeUndefined();
  });

  it('starts the next queued item after a cancel', async () => {
    const first = deferredTransfer();
    const second = deferredTransfer();
    mockStart.mockReturnValueOnce(first.handle).mockReturnValueOnce(second.handle);

    useDownloads.getState().enqueue(session, movie('movie:1'));
    useDownloads.getState().enqueue(session, movie('movie:2'));

    useDownloads.getState().cancel('movie:1');
    first.fail(new Error('Aborted'));
    await flush();

    expect(useDownloads.getState().entries['movie:2'].status).toBe('downloading');
  });
});

/**
 * These exist as pure functions so screens can derive from the `entries` they
 * selected. Calling the store getters from inside a useMemo instead looks
 * equivalent but is not -- React Compiler infers its own dependencies and
 * freezes such a value at its first result. Keeping the logic addressable this
 * way is what makes the Downloads screen update live.
 */
describe('derivations', () => {
  const entry = (key: string, over: Partial<DownloadEntry> = {}): DownloadEntry => ({
    ...movie(key),
    fileUri: null,
    bytesWritten: 0,
    bytesTotal: -1,
    status: 'queued',
    createdAt: 1,
    ...over,
  });

  it('sortedDownloads puts the newest first', () => {
    const entries = {
      'movie:1': entry('movie:1', { createdAt: 100 }),
      'movie:2': entry('movie:2', { createdAt: 300 }),
      'movie:3': entry('movie:3', { createdAt: 200 }),
    };
    expect(sortedDownloads(entries).map((e) => e.key)).toEqual([
      'movie:2',
      'movie:3',
      'movie:1',
    ]);
  });

  it('downloadBytes counts only records with a file on disk', () => {
    const entries = {
      'movie:1': entry('movie:1', { status: 'done', fileUri: 'file:///a.mkv' }),
      'movie:2': entry('movie:2'), // still queued, nothing written yet
    };
    // downloadFileSize is mocked at 1 GB per file.
    expect(downloadedBytes(entries)).toBe(1024 ** 3);
  });
});

describe('hydrate', () => {
  it('re-marks an interrupted transfer as failed with a retry hint', async () => {
    await seedStored({
      ...movie(),
      fileUri: null,
      bytesWritten: 900,
      bytesTotal: 2048,
      status: 'downloading',
      createdAt: 1,
    });
    await useDownloads.getState().hydrate();

    const e = useDownloads.getState().entries['movie:1'];
    // The native task is foreground-only; nothing survives the process dying.
    expect(e.status).toBe('failed');
    expect(e.error).toMatch(/Interrupted/);
    expect(e.bytesWritten).toBe(0);
  });

  it('drops a completed record whose file is gone', async () => {
    mockExists.mockReturnValue(false);
    await seedStored({
      ...movie(),
      fileUri: 'file:///gone.mkv',
      bytesWritten: 10,
      bytesTotal: 10,
      status: 'done',
      createdAt: 1,
    });
    await useDownloads.getState().hydrate();

    expect(useDownloads.getState().entries['movie:1']).toBeUndefined();
  });

  it('keeps records untouched when the native module is unavailable', async () => {
    mockAvailable.mockReturnValue(false);
    mockExists.mockReturnValue(false);
    await seedStored({
      ...movie(),
      fileUri: 'file:///x.mkv',
      bytesWritten: 10,
      bytesTotal: 10,
      status: 'done',
      createdAt: 1,
    });
    await useDownloads.getState().hydrate();

    // Reconciling against a filesystem we cannot read would delete everything.
    expect(useDownloads.getState().entries['movie:1'].status).toBe('done');
  });
});
