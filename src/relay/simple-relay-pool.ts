import { SimplePool, type Filter, type NostrEvent } from 'nostr-tools';
import type { SubCloser } from 'nostr-tools/abstract-pool';
import { RelayHandler } from '../core/interfaces.js';
import { sleep } from '../core/utils/utils.js';

/**
 * A RelayHandler implementation that uses a SimplePool to manage connections and subscriptions.
 * Implements exponential backoff for reconnection attempts when relays drop connections.
 * @argument relayUrls - An array of relay URLs to connect to.
 * @returns A RelayHandler implementation that uses a SimplePool to manage connections and subscriptions.
 */
export class SimpleRelayPool implements RelayHandler {
  private readonly relayUrls: string[];
  private pool: SimplePool;
  private subscriptions: SubCloser[] = [];
  private reconnectIntervals: Map<string, number> = new Map();
  private reconnectTimer?: ReturnType<typeof setTimeout>;

  constructor(relayUrls: string[]) {
    this.relayUrls = relayUrls;
    this.pool = new SimplePool();
    this.startReconnectLoop();
  }

  /**
   * Starts a loop that periodically checks connection status and reconnects if needed
   * using exponential backoff strategy.
   */
  private startReconnectLoop(): void {
    // Clear any existing timer
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }

    // Check all relays every 5 seconds
    this.reconnectTimer = setTimeout(() => {
      this.relayUrls.forEach((url) => {
        const normalizedUrl = new URL(url).href;
        if (!this.pool.listConnectionStatus().get(normalizedUrl)) {
          this.handleDisconnectedRelay(url);
        }
      });
      this.startReconnectLoop(); // Schedule next check
    }, 5000);
  }

  async connect(): Promise<void> {
    // Connect to all relays with exponential backoff tracking
    await Promise.all(
      this.relayUrls.map(async (url) => {
        const normalizedUrl = new URL(url).href;
        if (!this.pool.listConnectionStatus().get(normalizedUrl)) {
          await this.handleDisconnectedRelay(url);
        }
      }),
    );
  }

  /**
   * Handles a disconnected relay with exponential backoff strategy.
   * @param url - The relay URL to reconnect to
   */
  private async handleDisconnectedRelay(url: string): Promise<void> {
    const normalizedUrl = new URL(url).href;
    const currentInterval = this.reconnectIntervals.get(normalizedUrl) || 1000;

    try {
      await this.pool.ensureRelay(url, { connectionTimeout: 5000 });
      // Reset backoff interval on successful connection
      this.reconnectIntervals.delete(normalizedUrl);
    } catch (error) {
      console.error(error);
      // Double the interval for next attempt (exponential backoff), capped at 30 seconds
      const nextInterval = Math.min(currentInterval * 2, 30000);
      this.reconnectIntervals.set(normalizedUrl, nextInterval);
    }
  }

  async disconnect(relayUrls?: string[]): Promise<void> {
    if (!relayUrls) {
      relayUrls = this.relayUrls;

      // Clear all reconnect intervals when disconnecting all relays
      this.reconnectIntervals.clear();

      // Clear the reconnect loop timer
      if (this.reconnectTimer) {
        clearTimeout(this.reconnectTimer);
        this.reconnectTimer = undefined;
      }
    } else {
      // Clear reconnect intervals for specific relays
      relayUrls.forEach((url) => {
        const normalizedUrl = new URL(url).href;
        this.reconnectIntervals.delete(normalizedUrl);
      });
    }

    this.pool.close(relayUrls);
    await sleep(100);
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
    this.subscriptions.forEach((sub) => sub.close());
    this.subscriptions = [];
  }
}
