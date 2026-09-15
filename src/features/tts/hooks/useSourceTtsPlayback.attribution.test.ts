import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ackStore, createAckStore } from '../lib/ackStore';
import { PlaybackRegistryProvider } from '../registry/PlaybackRegistryProvider';
import { fetchChapterSourceAudio } from '../resolver/sourceAudioClient';
import { FakeClipElement } from '../testing/fakeClipElement';
import { bsbChapter, sourceChapterRequest, windowlessChapter } from '../testing/sourceAudioFixtures';

import { useSourceTtsPlayback, type UseSourceTtsPlaybackOptions } from './useSourceTtsPlayback';

import type * as audioModule from '../lib/audioElement';
import type * as clientModule from '../resolver/sourceAudioClient';
import type { TtsEngine } from '../tts.types';

const elements: FakeClipElement[] = [];
vi.mock('react-i18next', () => {
  const t = (_key: string, text: string) => text;
  return { useTranslation: () => ({ t }) };
});
vi.mock('../resolver/sourceAudioClient', async importOriginal => ({
  ...(await importOriginal<typeof clientModule>()), fetchChapterSourceAudio: vi.fn(),
}));
vi.mock('../lib/audioElement', async importOriginal => ({
  ...(await importOriginal<typeof audioModule>()),
  createClipAudioElement: (src: string) => {
    const element = new FakeClipElement();
    element.src = src;
    elements.push(element);
    return element;
  },
}));
const load = vi.mocked(fetchChapterSourceAudio);
const synthesize = vi.fn<TtsEngine['synthesize']>();
const engine: TtsEngine = { synthesize };
const rows = [1, 2, 3].map(verseNumber => ({ verseNumber, verseRef: String(verseNumber), text: `Source ${verseNumber}`, langCode: 'eng' }));
const refs = rows.map(row => row.verseRef);
const props = (extra: Partial<UseSourceTtsPlaybackOptions> = {}): UseSourceTtsPlaybackOptions => ({
  engine, rows, sourceChapter: sourceChapterRequest,
  sourceLicence: { status: 'allowed', notice: 'Text Bible notice.', name: 'Text Bible' },
  referenceBibleId: null, pageKey: 'chapter-1', getRowElement: () => null, getViewport: () => null,
  ...extra,
});
const setup = (extra: Partial<UseSourceTtsPlaybackOptions> = {}) => renderHook(useSourceTtsPlayback, { initialProps: props(extra), wrapper: PlaybackRegistryProvider });
const settle = async () => {
  await act(async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); });
};
const start = async (action: () => void) => { act(action); await settle(); };
const sound = async (index = 0) => { act(() => elements[index].emit('playing')); await settle(); };

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  localStorage.clear();
  const store = createAckStore();
  vi.spyOn(ackStore, 'isAcknowledged').mockImplementation(store.isAcknowledged);
  vi.spyOn(ackStore, 'acknowledge').mockImplementation(store.acknowledge);
  vi.spyOn(ackStore, 'list').mockImplementation(store.list);
  elements.length = 0;
  load.mockResolvedValue(bsbChapter());
  synthesize.mockImplementation(async request => ({ audioUrl: `https://tts.test/${request.text}` }));
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('first-sound source attribution through the real resolver and queue', () => {
  it('does not open on press, metadata, or play promise; sound opens it without pausing', async () => {
    const { result } = setup();
    await start(() => result.current.playGroup(refs));
    expect(result.current.attributionDialog).toBeNull();
    act(() => elements[0].emit('loadedmetadata'));
    expect(result.current.attributionDialog).toBeNull();
    await sound();
    expect(result.current.attributionDialog).toMatchObject({ textSourceName: 'Text Bible', audioProvider: 'aquifer', audioSourceName: bsbChapter().bible.name, notice: 'Text Bible notice.' });
    expect(elements[0].paused).toBe(false);
    expect(ackStore.list()).toEqual([]);
    act(() => result.current.closeAttribution());
    expect(result.current.attributionDialog).toBeNull();
    expect(ackStore.list()).toHaveLength(1);
    act(() => elements[0].emit('timeupdate'));
    expect(result.current.attributionDialog).toBeNull();
    act(() => result.current.pause());
    await start(() => result.current.playGroup(refs));
    await sound(elements.length - 1);
    expect(result.current.attributionDialog).toBeNull();
  });

  it('remembers no acknowledgment for canceled loading or failed playback', async () => {
    const { result } = setup();
    await start(() => result.current.playVerse('1'));
    act(() => result.current.pause());
    await sound(); // late event on detached element
    expect(result.current.attributionDialog).toBeNull();
    expect(ackStore.list()).toHaveLength(0);
    await start(() => result.current.playVerse('1'));
    await sound(elements.length - 1);
    expect(result.current.attributionDialog).not.toBeNull();
  });

  it('keeps synthesized provenance truthful and uses assignment notice through provider outage', async () => {
    load.mockRejectedValue(new Error('unavailable'));
    const { result } = setup();
    await start(() => result.current.playVerse('1'));
    expect(result.current.attributionDialog).toBeNull();
    await sound();
    expect(result.current.attributionDialog).toMatchObject({ audioProvider: 'tts', notice: 'Text Bible notice.' });
    expect(synthesize.mock.calls[0][0]).toEqual({ text: 'Source 1', langCode: 'eng' });
  });

  it.each([null, '', ' \n '])('explicit notice %j suppresses both dialog and Info data, independently of clearance', async notice => {
    const { result } = setup({ sourceLicence: { status: 'unknown', notice, name: 'Text Bible' } });
    await start(() => result.current.playGroup(refs));
    await sound();
    expect(result.current.attributionDialog).toBeNull();
    expect(result.current.groupView(refs).attribution).toBeNull();
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('lets Info reopen the pair after acknowledgment without another lookup or synthesis', async () => {
    const { result } = setup();
    expect(result.current.groupView(refs).attribution).toBeNull();
    await start(() => result.current.playGroup(refs));
    await sound();
    act(() => result.current.closeAttribution());
    act(() => result.current.pause());
    const calls = load.mock.calls.length;
    const pair = result.current.groupView(refs).attribution!;
    expect(pair.audioProvider).toBe('aquifer');
    act(() => result.current.showAttribution(pair));
    expect(result.current.attributionDialog).toEqual(pair);
    expect(load).toHaveBeenCalledTimes(calls);
    expect(synthesize).not.toHaveBeenCalled();
  });

  it('a new Bible or revised notice on this page requires a new acknowledgment', async () => {
    const { result, rerender } = setup();
    await start(() => result.current.playVerse('1'));
    await sound();
    act(() => result.current.closeAttribution());
    act(() => result.current.stop());
    rerender(props({ sourceChapter: { ...sourceChapterRequest, bibleId: 2 } }));
    await start(() => result.current.playVerse('1'));
    await sound(elements.length - 1);
    expect(result.current.attributionDialog?.textSourceId).toBe(2);
    act(() => result.current.closeAttribution());
    act(() => result.current.stop());
    rerender(props({ sourceLicence: { status: 'allowed', notice: 'Updated notice.', name: 'Text Bible' } }));
    await start(() => result.current.playVerse('1'));
    await sound(elements.length - 1);
    expect(result.current.attributionDialog?.notice).toBe('Updated notice.');
  });

  it('discards unacknowledged page/source notices without borrowing the project attribution for references', async () => {
    const { result, rerender } = setup();
    await start(() => result.current.playVerse('1'));
    await sound();
    rerender(props({ pageKey: 'chapter-2' }));
    expect(result.current.attributionDialog).toBeNull();
    expect(ackStore.list()).toHaveLength(0);
    rerender(props({ sourceChapter: null, referenceBibleId: 'reference:2' }));
    await start(() => result.current.playVerse('1'));
    await sound(elements.length - 1);
    expect(result.current.attributionDialog).toBeNull();
  });

  it('uses the old API response notice only if the assignment omitted its notice', async () => {
    load.mockResolvedValue({ ...windowlessChapter(), licenseNotice: 'Old API notice' });
    const { result } = setup({ sourceLicence: { status: 'allowed', name: 'Text Bible' } });
    await start(() => result.current.playVerse('1'));
    await sound();
    expect(result.current.attributionDialog?.notice).toBe('Old API notice');
  });
});
