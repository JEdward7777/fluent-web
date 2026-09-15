import { useCallback, useMemo, useState } from 'react';

import { ackStore, attributionFor, pairKey, type AudioAttribution } from '../lib/ackStore';

import type { ChapterSourceAudio } from '../resolver/sourceAudioClient';

interface Options {
  pageKey?: string;
  textSourceId?: number;
  textSourceName?: string;
  notice?: string | null;
  enabled: boolean;
}

/** Host-side data only. Resolution remembers provenance; only an audible segment offers a notice. */
export function useAudioAttribution({ pageKey, textSourceId, textSourceName, notice, enabled }: Options) {
  const scope = useMemo(
    () => ({ pageKey, textSourceId, textSourceName, notice, enabled, sources: new Map<string, AudioAttribution | null>() }),
    [pageKey, textSourceId, textSourceName, notice, enabled]
  );
  const [offered, setOffered] = useState<{ scope: typeof scope; pairs: AudioAttribution[] }>();
  const pairs = offered?.scope === scope ? offered.pairs : [];
  const keyFor = (key: string, verseRef: string) => JSON.stringify([key, verseRef]);
  const remember = useCallback(
    (key: string, verseRef: string, response: ChapterSourceAudio | null, fallbackNotice?: string | null) => {
      if (!enabled || textSourceId === undefined) return;
      scope.sources.set(
        keyFor(key, verseRef),
        attributionFor({ textSourceId, textSourceName: textSourceName ?? String(textSourceId), notice }, response, fallbackNotice)
      );
    },
    [enabled, notice, scope, textSourceId, textSourceName]
  );
  const forSegment = useCallback(
    (key: string, verseRef: string) => scope.sources.get(keyFor(key, verseRef)) ?? null,
    [scope]
  );
  const offer = useCallback(
    (pair: AudioAttribution | null, explicit = false) => {
      if (!pair || !enabled || (!explicit && ackStore.isAcknowledged(pairKey(pair)))) return;
      setOffered(previous => {
        const current = previous?.scope === scope ? previous.pairs : [];
        // Never replace a notice the listener is reading, or stack duplicate boxes on timeupdate.
        if (current.some(existing => pairKey(existing) === pairKey(pair))) return previous;
        return { scope, pairs: [...current, pair] };
      });
    },
    [enabled, scope]
  );
  const close = useCallback(() => {
    if (pairs[0]) ackStore.acknowledge(pairs[0]);
    setOffered({ scope, pairs: pairs.slice(1) });
  }, [pairs, scope]);
  return { remember, forSegment, offer, dialog: pairs[0] ?? null, close };
}
