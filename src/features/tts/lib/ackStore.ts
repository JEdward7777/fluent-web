import { z } from 'zod';

import type { ChapterSourceAudio } from '../resolver/sourceAudioClient';

const attributionSchema = z.object({
  textSourceId: z.number().int(),
  textSourceName: z.string(),
  audioProvider: z.enum(['aquifer', 'dbl', 'tts']),
  audioSourceId: z.string(),
  audioSourceName: z.string(),
  notice: z.string().refine(value => value.trim().length > 0),
});
export type AudioAttribution = z.infer<typeof attributionSchema>;
export interface AttributionContext {
  textSourceId: number;
  textSourceName: string;
  /** Undefined permits the old API's response fallback; null/blank explicitly disables notices. */
  notice?: string | null;
}

/** Null response means synthesized speech, never an assumed recorded Bible. */
export function attributionFor(
  context: AttributionContext,
  response: ChapterSourceAudio | null,
  fallbackNotice?: string | null
): AudioAttribution | null {
  const notice = context.notice === undefined ? (response?.licenseNotice ?? fallbackNotice) : context.notice;
  if (!notice?.trim()) return null;
  const audioSourceId = response
    ? response.provider === 'aquifer'
      ? response.bible.aquiferBibleId
      : response.bible.dblAudioBibleId
    : 'tts';
  // Missing identity is not a licence to pretend the recording is the text Bible.
  if (audioSourceId === undefined) return null;
  return {
    textSourceId: context.textSourceId,
    textSourceName: context.textSourceName,
    audioProvider: response?.provider ?? 'tts',
    audioSourceId: String(audioSourceId),
    audioSourceName: response?.bible.name ?? '',
    notice,
  };
}

/** Exact tuple encoding avoids delimiter/hash collisions; passages and expiring URLs are not identity. */
export const pairKey = (pair: AudioAttribution): string =>
  JSON.stringify([pair.textSourceId, pair.audioProvider, pair.audioSourceId, pair.notice]);

const prefix = 'fluent.audio.ack.';
const entrySchema = z.object({ pair: attributionSchema, acknowledgedAt: z.string().datetime() });
export type AudioAcknowledgment = z.infer<typeof entrySchema>;

/** Data only, including display text so Settings can reopen notices without provider requests. */
export function createAckStore() {
  const memory = new Map<string, AudioAcknowledgment>();
  const read = (key: string): AudioAcknowledgment | undefined => {
    if (memory.has(key)) return memory.get(key);
    try {
      const raw = localStorage.getItem(prefix + key);
      if (!raw) return undefined;
      const result = entrySchema.safeParse(JSON.parse(raw));
      if (result.success && pairKey(result.data.pair) === key) return result.data;
    } catch {
      // Storage can be denied, full, or contain an old/malformed value.
    }
    return undefined;
  };
  return {
    isAcknowledged: (key: string): boolean => read(key) !== undefined,
    acknowledge(pair: AudioAttribution): void {
      if (!pair.notice.trim()) return;
      const key = pairKey(pair);
      const entry = { pair, acknowledgedAt: new Date().toISOString() };
      memory.set(key, entry);
      try {
        localStorage.setItem(prefix + key, JSON.stringify(entry));
      } catch {
        // In-memory acknowledgment still suppresses repeats for this session.
      }
    },
    list(): AudioAcknowledgment[] {
      const entries = new Map(memory);
      try {
        for (let index = 0; index < localStorage.length; index++) {
          const storageKey = localStorage.key(index);
          if (!storageKey?.startsWith(prefix)) continue;
          const key = storageKey.slice(prefix.length);
          const entry = read(key);
          if (entry) entries.set(key, entry);
        }
      } catch {
        // Still return this session's entries when storage is unavailable.
      }
      return [...entries.values()];
    },
  };
}

export const ackStore = createAckStore();
