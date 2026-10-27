import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  ProviderFactsAccess,
  providerFactsOptions,
  type ProviderFacts,
} from '../resolver/providerFacts';

import { readActiveSourceLicense } from './activeSourceLicenseStore';
import { usePublishSourceLicense } from './usePublishSourceLicense';

afterEach(() => vi.restoreAllMocks());
const props = {
  sourceIdentity: 'assigned-1' as string | null,
  bibleName: 'Assigned Bible',
  textKey: 'dbl-assigned',
  fallback: 'forbidden' as const,
  enabled: true,
};
const fact = (key: string, status: ProviderFacts['ttsLicenseStatus']): ProviderFacts => ({
  bibleKey: key,
  provider: 'dbl',
  externalId: key.slice(4),
  id: 1,
  ttsLicenseStatus: status,
  licenseNotice: null,
});

describe('source-pane license publication lifecycle', () => {
  it('publishes assignment fallback only without facts, replaces source/name/status and clears on unmount or no Bible', () => {
    const { rerender, unmount } = renderHook(usePublishSourceLicense, { initialProps: props });
    expect(readActiveSourceLicense()).toEqual({ bibleName: 'Assigned Bible', status: 'forbidden' });
    rerender({ ...props, sourceIdentity: 'reference-2', bibleName: 'Visible Reference Bible' });
    expect(readActiveSourceLicense()).toEqual({
      bibleName: 'Visible Reference Bible',
      status: 'forbidden',
    });
    rerender({ ...props, sourceIdentity: null });
    expect(readActiveSourceLicense()).toBeNull();
    rerender(props);
    unmount();
    expect(readActiveSourceLicense()).toBeNull();
  });
  it('follows ready facts and unreadable changes without claiming fallback permission, or carrying a previous source status onto a new identity', () => {
    const client = new QueryClient();
    const facts = new ProviderFactsAccess(client, 1);
    const observe = vi
      .spyOn(facts, 'observe')
      .mockImplementation((_key, listener) => facts.subscribe(listener));
    const key = providerFactsOptions(1, props.textKey).queryKey;
    client.setQueryData(key, fact(props.textKey, 'unknown'));
    const initialProps = { ...props, fallback: 'allowed' as const, facts };
    const { rerender, unmount } = renderHook(usePublishSourceLicense, { initialProps });
    expect(readActiveSourceLicense()?.status).toBe('unknown');
    act(() => {
      client.setQueryData(key, fact(props.textKey, 'allowed'));
    });
    expect(readActiveSourceLicense()?.status).toBe('allowed');
    act(() => {
      client.getQueryCache().find({ queryKey: key })?.setState({ status: 'error' });
    });
    expect(readActiveSourceLicense()?.status).toBeUndefined();
    rerender({
      ...initialProps,
      sourceIdentity: 'reference-2',
      textKey: 'dbl-other',
      bibleName: 'Other Bible',
    });
    expect(readActiveSourceLicense()).toEqual({ bibleName: 'Other Bible', status: undefined });
    expect(observe).toHaveBeenLastCalledWith('dbl-other', expect.any(Function));
    unmount();
    client.clear();
  });
  it('does not observe or publish while the feature is off and ignores outgoing route cleanup after a new publisher mounts', () => {
    const client = new QueryClient();
    const facts = new ProviderFactsAccess(client, 1);
    const observe = vi
      .spyOn(facts, 'observe')
      .mockImplementation((_key, listener) => facts.subscribe(listener));
    const first = renderHook(usePublishSourceLicense, {
      initialProps: { ...props, facts, enabled: false },
    });
    expect(observe).not.toHaveBeenCalled();
    expect(readActiveSourceLicense()).toBeNull();
    const second = renderHook(usePublishSourceLicense, {
      initialProps: { ...props, bibleName: 'New Route Bible' },
    });
    first.unmount();
    expect(readActiveSourceLicense()?.bibleName).toBe('New Route Bible');
    second.unmount();
    expect(readActiveSourceLicense()).toBeNull();
    client.clear();
  });
});
