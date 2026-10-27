import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import {
  publishActiveSourceLicense,
  readActiveSourceLicense,
  subscribeActiveSourceLicense,
  useActiveSourceLicense,
} from './activeSourceLicenseStore';

describe('active source-pane license', () => {
  it('publishes stable snapshots, notifies subscribers for changes, and clears on release', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeActiveSourceLicense(listener);
    const release = publishActiveSourceLicense({ bibleName: 'Main Bible', status: 'forbidden' });
    const snapshot = readActiveSourceLicense();
    expect(snapshot).toEqual({ bibleName: 'Main Bible', status: 'forbidden' });
    expect(listener).toHaveBeenCalledOnce();
    const releaseSame = publishActiveSourceLicense({
      bibleName: 'Main Bible',
      status: 'forbidden',
    });
    expect(readActiveSourceLicense()).toBe(snapshot);
    expect(listener).toHaveBeenCalledOnce();
    release();
    expect(readActiveSourceLicense()).toBe(snapshot);
    releaseSame();
    expect(readActiveSourceLicense()).toBeNull();
    expect(listener).toHaveBeenCalledTimes(2);
    unsubscribe();
  });
  it('reacts through useSyncExternalStore and protects a newer publisher against stale route cleanup', () => {
    const first = publishActiveSourceLicense({ bibleName: 'Old Bible', status: 'unknown' });
    const { result, unmount } = renderHook(useActiveSourceLicense);
    let second: () => void = () => {};
    act(() => {
      second = publishActiveSourceLicense({ bibleName: 'New Bible', status: 'allowed' });
    });
    act(first);
    expect(result.current).toEqual({ bibleName: 'New Bible', status: 'allowed' });
    act(second);
    expect(result.current).toBeNull();
    unmount();
  });
});
