import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { bsbChapter } from '../testing/sourceAudioFixtures';

import { attributionFor, createAckStore, pairKey } from './ackStore';

const context = { textSourceId: 1, textSourceName: 'Text Bible', notice: 'Original notice.' };
const pair = () => attributionFor(context, bsbChapter())!;

beforeEach(() => localStorage.clear());
afterEach(() => vi.unstubAllGlobals());

describe('source-and-notice acknowledgment identity', () => {
  it('distinguishes pinned, fuzzy-matched, other text, TTS, and changed notices', () => {
    const recording = bsbChapter();
    const differentRecording = { ...recording, bible: { ...recording.bible, aquiferBibleId: 999 } };
    const pairs = [
      pair(),
      attributionFor(context, differentRecording)!,
      attributionFor({ ...context, textSourceId: 2 }, recording)!,
      attributionFor(context, null)!,
      attributionFor({ ...context, notice: 'Revised notice.' }, recording)!,
    ];
    expect(new Set(pairs.map(pairKey)).size).toBe(5);
  });

  it('does not repeat for another passage, changed URL or renamed display labels', () => {
    const recording = bsbChapter();
    expect(pairKey(attributionFor({ ...context, textSourceName: 'Renamed' }, {
      ...recording, chapter: 4, items: [], bible: { ...recording.bible, name: 'Renamed recording' },
    })!)).toBe(pairKey(pair()));
  });

  it.each([null, '', ' \n\t '])('treats explicit %j as the off switch even with a response notice', notice => {
    expect(attributionFor({ ...context, notice }, bsbChapter())).toBeNull();
    expect(attributionFor({ ...context, notice }, null, 'Fallback')).toBeNull();
  });

  it('falls back only when the assignment field is absent; never invents a recording identity', () => {
    expect(attributionFor({ ...context, notice: undefined }, { ...bsbChapter(), licenseNotice: 'Fallback' })?.notice).toBe('Fallback');
    expect(attributionFor({ ...context, notice: undefined }, null, 'Held notice')?.notice).toBe('Held notice');
    expect(attributionFor(context, { ...bsbChapter(), bible: { name: 'Unknown', abbreviation: '?' } })).toBeNull();
  });

  it('keeps text and recording names separate and handles DBL ids in their own namespace', () => {
    const dbl = attributionFor(context, { ...bsbChapter(), provider: 'dbl', bible: { name: 'Other translation', abbreviation: 'OT', dblAudioBibleId: 'audio-id' } })!;
    expect(dbl).toMatchObject({ textSourceName: 'Text Bible', audioSourceName: 'Other translation', audioSourceId: 'audio-id', audioProvider: 'dbl' });
    expect(pairKey(dbl)).not.toBe(pairKey(pair()));
  });
});

describe('the per-device store', () => {
  it('persists a date and the display data needed by Settings; a fresh store reads it', () => {
    const store = createAckStore();
    expect(store.isAcknowledged(pairKey(pair()))).toBe(false);
    store.acknowledge(pair());
    const fresh = createAckStore();
    expect(fresh.isAcknowledged(pairKey(pair()))).toBe(true);
    expect(fresh.list()).toEqual([{ pair: pair(), acknowledgedAt: expect.any(String) }]);
    expect(Number.isNaN(Date.parse(fresh.list()[0].acknowledgedAt))).toBe(false);
  });

  it('survives denied storage and retains acknowledgment in session memory', () => {
    vi.stubGlobal('localStorage', { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, get length() { throw new Error('denied'); } });
    const store = createAckStore();
    expect(store.isAcknowledged(pairKey(pair()))).toBe(false);
    store.acknowledge(pair());
    expect(store.isAcknowledged(pairKey(pair()))).toBe(true);
    expect(store.list()).toHaveLength(1);
  });

  it('tolerates malformed and unrelated entries, and does not accept a pair stored under the wrong key', () => {
    localStorage.setItem('unrelated', '{}');
    localStorage.setItem('fluent.audio.ack.broken', '{');
    localStorage.setItem('fluent.audio.ack.' + pairKey(pair()), JSON.stringify({ pair: { ...pair(), notice: 'Wrong notice' }, acknowledgedAt: new Date().toISOString() }));
    const store = createAckStore();
    expect(store.isAcknowledged(pairKey(pair()))).toBe(false);
    expect(store.list()).toEqual([]);
    store.acknowledge({ ...pair(), notice: '  ' });
    expect(store.list()).toEqual([]);
  });
});
