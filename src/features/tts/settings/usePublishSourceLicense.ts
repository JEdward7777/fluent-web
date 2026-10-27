import { useCallback, useEffect, useSyncExternalStore } from 'react';

import { resolveTextLicenseStatus, type TextLicenseStatus } from '../resolver/textLicenseStatus';

import { publishActiveSourceLicense } from './activeSourceLicenseStore';

import type { ProviderFactsAccess } from '../resolver/providerFacts';

interface SourceLicensePublication {
  sourceIdentity: string | null;
  bibleName: string;
  textKey: string | null;
  fallback?: TextLicenseStatus;
  facts?: ProviderFactsAccess;
  enabled: boolean;
}

/** Publishes the same source-pane identity and resolved status that the playback fence receives. */
export function usePublishSourceLicense({
  sourceIdentity,
  bibleName,
  textKey,
  fallback,
  facts,
  enabled,
}: SourceLicensePublication) {
  const subscribe = useCallback(
    (listener: () => void) => {
      if (!enabled || sourceIdentity === null || !facts || !textKey) return () => {};
      return facts.observe(textKey, listener);
    },
    [sourceIdentity, enabled, facts, textKey]
  );
  const read = useCallback(
    () => (enabled ? resolveTextLicenseStatus(facts, textKey, fallback) : undefined),
    [enabled, facts, textKey, fallback]
  );
  const status = useSyncExternalStore(subscribe, read, () => undefined);
  useEffect(
    () =>
      publishActiveSourceLicense(enabled && sourceIdentity !== null ? { bibleName, status } : null),
    [sourceIdentity, bibleName, enabled, facts, status, textKey]
  );
}
