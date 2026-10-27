import { useSyncExternalStore } from 'react';

export interface ActiveSourceLicense {
  bibleName: string;
  /** Undefined is unreadable/unconfirmed, rather than an actual unknown decision. */
  status: 'allowed' | 'forbidden' | 'unknown' | undefined;
}

let snapshot: Readonly<ActiveSourceLicense> | null = null;
let owner: symbol | null = null;
const listeners = new Set<() => void>();

export const readActiveSourceLicense = () => snapshot;
export const subscribeActiveSourceLicense = (listener: () => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

function update(value: ActiveSourceLicense | null) {
  if (snapshot?.bibleName === value?.bibleName && snapshot?.status === value?.status) return;
  snapshot = value ? Object.freeze({ ...value }) : null;
  for (const listener of listeners) listener();
}

/** A late cleanup from an outgoing route cannot clear the next drafting publisher. */
export function publishActiveSourceLicense(value: ActiveSourceLicense | null): () => void {
  const token = Symbol('source-pane license');
  owner = token;
  update(value);
  return () => {
    if (owner !== token) return;
    owner = null;
    update(null);
  };
}

export function useActiveSourceLicense() {
  return useSyncExternalStore(subscribeActiveSourceLicense, readActiveSourceLicense, () => null);
}
