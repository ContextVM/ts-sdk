import type { Filter, NostrEvent } from 'nostr-tools';

/**
 * A generic interface for Nostr signers.
 */
export interface NostrSigner {
  getPublicKey(): Promise<string>;
  signEvent(event: Omit<NostrEvent, 'sig' | 'id'>): Promise<NostrEvent>;
  getSecretKey(): Promise<Uint8Array>;
}

/**
 * A generic interface for Nostr relays.
 */
export interface RelayHandler {
  connect(): Promise<void>;
  disconnect(relayUrls?: string[]): Promise<void>;
  publish(event: NostrEvent): Promise<void>;
  subscribe(
    filters: Filter[],
    onEvent: (event: NostrEvent) => void,
    onEose?: () => void,
  ): Promise<void>;
  unsubscribe(): void;
}
