import { describe, expect, it } from 'vitest';

import { licenceBar } from './licenceFence';
import { resolveTextLicenseStatus } from './textLicenseStatus';

import type { ProviderFactsState } from './providerFacts';

const read = (state: ProviderFactsState) => ({ read: () => state });

describe('shared source-pane license resolution', () => {
  it.each(['allowed', 'forbidden', 'unknown'] as const)(
    'uses ready provider %s authority ahead of assignment fallback',
    status => {
      const facts = read({
        state: 'ready',
        facts: {
          bibleKey: 'dbl-source',
          provider: 'dbl',
          externalId: 'source',
          id: 1,
          ttsLicenseStatus: status,
          licenseNotice: null,
        },
      });
      expect(resolveTextLicenseStatus(facts, 'dbl-source', 'allowed')).toBe(status);
    }
  );
  it.each(['loading', 'error', 'missing'] as const)(
    'keeps %s facts unconfirmed without falling back to an allowed assignment',
    state => {
      const status = resolveTextLicenseStatus(read({ state }), 'dbl-source', 'allowed');
      expect(status).toBeUndefined();
      expect(licenceBar(status)).toBe('unconfirmed');
    }
  );
  it('uses assignment bootstrap only without a facts authority and never manufactures an unknown decision', () => {
    expect(resolveTextLicenseStatus(undefined, null, 'forbidden')).toBe('forbidden');
    expect(resolveTextLicenseStatus(undefined, null)).toBeUndefined();
  });
});
