import type { ProviderFactsAccess } from './providerFacts';
import type { ChapterSourceAudio } from './sourceAudioClient';

export type TextLicenseStatus = ChapterSourceAudio['ttsLicenseStatus'];

/** Unreadable facts are unconfirmed, never an authoritative unknown or fallback permission. */
export function resolveTextLicenseStatus(
  facts: Pick<ProviderFactsAccess, 'read'> | undefined,
  textKey: string | null,
  fallback?: TextLicenseStatus
): TextLicenseStatus | undefined {
  if (!facts) return fallback;
  const result = facts.read(textKey);
  return result.state === 'ready' ? result.facts.ttsLicenseStatus : undefined;
}
