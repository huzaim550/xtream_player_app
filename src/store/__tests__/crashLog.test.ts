/**
 * The crash log, and specifically its redaction.
 *
 * This is the security-critical part of that feature. Stream URLs carry the
 * password as a *path segment* (`/movie/{user}/{pass}/{id}.mp4`), so a raw
 * stack trace mentioning one is a plaintext credential written to storage and
 * then displayed on a screen the user is expected to read out to someone else.
 */

import { useCrashLog } from '../crashLog';

beforeEach(async () => {
  await useCrashLog.getState().clear();
});

describe('record', () => {
  it('strips the password out of a stream URL in the message', () => {
    useCrashLog
      .getState()
      .record(new Error('failed on https://s.example/movie/huzaim/hunter2/42.mkv'), true);

    const { message } = useCrashLog.getState().records[0];
    expect(message).not.toContain('hunter2');
    expect(message).not.toContain('huzaim');
    expect(message).toContain('/movie/***/***/');
  });

  it('strips credentials out of a player_api query string', () => {
    useCrashLog
      .getState()
      .record(
        new Error('GET https://s.example/player_api.php?username=huzaim&password=hunter2'),
        false,
      );

    const { message } = useCrashLog.getState().records[0];
    expect(message).not.toContain('hunter2');
    expect(message).toContain('password=***');
  });

  it('redacts the stack trace too, not just the message', () => {
    const err = new Error('boom');
    err.stack = 'Error: boom\n  at fetch (https://s.example/series/huzaim/hunter2/7.mkv)';
    useCrashLog.getState().record(err, true);

    expect(useCrashLog.getState().records[0].stack).not.toContain('hunter2');
  });

  it('records the fatal flag', () => {
    useCrashLog.getState().record(new Error('a'), true);
    useCrashLog.getState().record(new Error('b'), false);

    const [newest, older] = useCrashLog.getState().records;
    expect(newest.fatal).toBe(false);
    expect(older.fatal).toBe(true);
  });

  it('accepts a thrown non-Error without blowing up', () => {
    // Nothing stops `throw 'a string'`, and the crash handler is the last
    // place that should itself throw.
    useCrashLog.getState().record('just a string', true);
    expect(useCrashLog.getState().records[0].message).toBe('just a string');
  });

  it('puts the newest crash first', () => {
    useCrashLog.getState().record(new Error('first'), false);
    useCrashLog.getState().record(new Error('second'), false);
    expect(useCrashLog.getState().records[0].message).toBe('second');
  });

  it('caps the log so it cannot grow without bound', () => {
    for (let i = 0; i < 30; i++) useCrashLog.getState().record(new Error(`e${i}`), false);
    expect(useCrashLog.getState().records).toHaveLength(20);
    expect(useCrashLog.getState().records[0].message).toBe('e29');
  });

  it('gives every record a distinct id even in a tight crash loop', () => {
    for (let i = 0; i < 10; i++) useCrashLog.getState().record(new Error('loop'), true);
    const ids = new Set(useCrashLog.getState().records.map((r) => r.id));
    expect(ids.size).toBe(useCrashLog.getState().records.length);
  });
});
