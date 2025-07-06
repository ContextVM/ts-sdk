import { SimplePool, type Filter, type NostrEvent } from 'nostr-tools';
import type { SubCloser } from 'nostr-tools/abstract-pool';
import { RelayHandler } from '../core/interfaces.js';

/**
 * A RelayHandler implementation that uses a SimplePool to manage connections and subscriptions.
 * @argument relayUrls - An array of relay URLs to connect to.
 * @returns A RelayHandler implementation that uses a SimplePool to manage connections and subscriptions.
 */
export class SimpleRelayPool implements RelayHandler {
  private readonly relayUrls: string[];
  private pool: SimplePool;
  private subscriptions: SubCloser[] = [];

  constructor(relayUrls: string[]) {
    this.relayUrls = relayUrls;
    this.pool = new SimplePool();
  }

  async connect(): Promise<void> {
    this.relayUrls.forEach((url) => {
      const normalizedUrl = new URL(url).href;
      if (!this.pool.listConnectionStatus().get(normalizedUrl)) {
        this.pool.ensureRelay(url, { connectionTimeout: 5000 });
      }
    });
  }

  async disconnect(relayUrls?: string[]): Promise<void> {
    if (!relayUrls) {
      relayUrls = this.relayUrls;
    }
    this.pool.close(relayUrls);
  }

  async publish(event: NostrEvent): Promise<void> {
    await Promise.all(this.pool.publish(this.relayUrls, event));
  }

  async subscribe(
    filters: Filter[],
    onEvent: (event: NostrEvent) => void,
    onEose?: () => void,
  ): Promise<void> {
    const sub = this.pool.subscribeMany(this.relayUrls, filters, {
      onevent: onEvent,
      oneose: onEose,
    });
    this.subscriptions.push(sub);
  }

  unsubscribe(): void {
    this.subscriptions.forEach((sub) => {
      sub.close();
    });
  }
}
