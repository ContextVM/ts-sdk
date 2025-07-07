import { serve, type ServerWebSocket } from 'bun';
import { matchFilters, matchFilter } from 'nostr-tools';
import type { Event, Filter } from 'nostr-tools';
import { getResponse, MOCK_SERVER_PUBLIC_KEY } from './mock-responses.js';

// Message Types
type NostrClientMessage =
  | ['EVENT', Event]
  | ['REQ', string, ...Filter[]]
  | ['CLOSE', string];

type NostrRelayMessage =
  | ['EVENT', string, Event]
  | ['EOSE', string]
  | ['OK', string, boolean, string]
  | ['NOTICE', string];

// Global state
let connCount = 0;
let events: Event[] = [];
const subs = new Map<string, { instance: Instance; filters: Filter[] }>();

let lastPurge = Date.now();

if (process.env.PURGE_INTERVAL) {
  console.log('Purging events every', process.env.PURGE_INTERVAL, 'seconds');
  setInterval(
    () => {
      lastPurge = Date.now();
      events = [];
    },
    Number(process.env.PURGE_INTERVAL) * 1000,
  );
}

/**
 * Represents a single connection to the relay.
 */
class Instance {
  private _socket: ServerWebSocket;
  private _subs = new Set<string>();

  /**
   * Creates an instance of the relay connection.
   * @param socket The WebSocket connection.
   */
  constructor(socket: ServerWebSocket) {
    this._socket = socket;
  }

  /**
   * Cleans up the connection and subscriptions.
   */
  cleanup(): void {
    this._socket.close();

    for (const subId of this._subs) {
      this.removeSub(subId);
    }
  }

  /**
   * Adds a subscription to the connection.
   * @param subId The subscription ID.
   * @param filters The filters for the subscription.
   */
  addSub(subId: string, filters: Filter[]): void {
    subs.set(subId, { instance: this, filters });
    this._subs.add(subId);
  }

  /**
   * Removes a subscription from the connection.
   * @param subId The subscription ID.
   */
  removeSub(subId: string): void {
    subs.delete(subId);
    this._subs.delete(subId);
  }

  /**
   * Sends a message to the client.
   * @param message The message to send.
   */
  send(message: NostrRelayMessage): void {
    if (this._socket.readyState === WebSocket.OPEN) {
      this._socket.send(JSON.stringify(message));
    }
  }

  /**
   * Handles an incoming message from the client.
   * @param message The message from the client.
   */
  handle(message: string): void {
    let parsedMessage: NostrClientMessage;
    try {
      parsedMessage = JSON.parse(message) as NostrClientMessage;
    } catch {
      this.send(['NOTICE', 'Unable to parse message']);
      return;
    }

    const [verb, ...payload] = parsedMessage;

    switch (verb) {
      case 'EVENT':
        this.onEVENT(payload[0] as Event);
        break;
      case 'REQ':
        this.onREQ(payload[0] as string, ...(payload.slice(1) as Filter[]));
        break;
      case 'CLOSE':
        this.onCLOSE(payload[0] as string);
        break;
      default:
        this.send(['NOTICE', 'Unable to handle message']);
    }
  }

  /**
   * Handles a CLOSE message.
   * @param subId The subscription ID to close.
   */
  onCLOSE(subId: string): void {
    this.removeSub(subId);
  }

  /**
   * Handles a REQ message.
   * @param subId The subscription ID.
   * @param filters The filters for the subscription.
   */
  onREQ(subId: string, ...filters: Filter[]): void {
    console.log('REQ', subId, ...filters);

    this.addSub(subId, filters);

    for (const filter of filters) {
      let limitCount = filter.limit;
      if (limitCount !== undefined && limitCount <= 0) {
        continue;
      }
      for (const event of events) {
        if (limitCount === undefined || limitCount > 0) {
          if (matchFilter(filter, event)) {
            console.log('match', subId, event);

            this.send(['EVENT', subId, event]);
            if (limitCount !== undefined) {
              limitCount--;
            }
          }
        }
      }
    }

    this.send(['EOSE', subId]);
  }

  /**
   * Handles an EVENT message.
   * @param event The event to handle.
   */
  onEVENT(event: Event): void {
    events = events
      .concat(event)
      .sort((a, b) => (a.created_at < b.created_at ? 1 : -1));

    console.log('EVENT:', event);

    // Check if the event is a CTXVM request and needs a mock response
    try {
      const content = JSON.parse(event.content);
      if (content.method) {
        // Extract serverPubkey and serverIdentifier from the request tags
        const targetServerPubkey = event.tags.find(
          (tag) => tag[0] === 'p',
        )?.[1];
        const targetServerIdentifier = event.tags.find(
          (tag) => tag[0] === 's',
        )?.[1];

        if (
          targetServerPubkey &&
          targetServerPubkey !== MOCK_SERVER_PUBLIC_KEY
        ) {
          console.log('Mismatched target server public key, not responding.');
          return; // Do not respond
        }
        if (
          targetServerIdentifier &&
          targetServerIdentifier !== 'mock-server-identifier'
        ) {
          console.log('Mismatched target server identifier, not responding.');
          return; // Do not respond
        }

        const responseEvent = getResponse(event);

        if (responseEvent) {
          // Find the subscription that matches this response
          for (const [subId, { instance, filters }] of subs.entries()) {
            if (matchFilters(filters, responseEvent)) {
              instance.send(['EVENT', subId, responseEvent]);
              console.log(
                'Sent mock response for',
                content.method,
                responseEvent,
              );
            }
          }
        }
        this.send(['OK', event.id, true, '']);
      }
    } catch (error) {
      console.error('Error handling incoming Nostr event:', error);
    }

    // Forward the original event to any matching subscriptions
    for (const [subId, { instance, filters }] of subs.entries()) {
      if (matchFilters(filters, event)) {
        console.log('match', subId, event.id);
        instance.send(['EVENT', subId, event]);
      }
    }
  }
}

const server = serve({
  port: process.env.PORT || 3000,
  fetch(req, server) {
    const url = new URL(req.url);

    if (
      url.pathname === '/' &&
      req.headers.get('accept') === 'application/nostr+json'
    ) {
      return new Response(
        JSON.stringify({
          name: 'Bucket',
          description: 'Just a dev relay',
        }),
        {
          headers: {
            'Content-Type': 'application/nostr+json',
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Headers': '*',
            'Access-Control-Allow-Methods': '*',
          },
        },
      );
    }

    const success = server.upgrade(req);
    if (success) {
      return undefined;
    }

    return new Response('Not Found', { status: 404 });
  },
  websocket: {
    open(ws: ServerWebSocket) {
      connCount += 1;
      console.log('Received connection', {
        pid: process.pid,
        connCount,
      });

      const relay = new Instance(ws);

      if (process.env.PURGE_INTERVAL) {
        const now = Date.now();
        relay.send([
          'NOTICE',
          'Next purge in ' +
            Math.round(
              (Number(process.env.PURGE_INTERVAL) * 1000 - (now - lastPurge)) /
                1000,
            ) +
            ' seconds',
        ]);
      }
    },
    message(ws: ServerWebSocket, message: string) {
      const relay = new Instance(ws);
      relay.handle(message);
    },
    close(ws: ServerWebSocket) {
      const relay = new Instance(ws);
      relay.cleanup();

      connCount -= 1;
      console.log('Closing connection', {
        pid: process.pid,
        connCount,
      });
    },
  },
});

console.log(`Listening on ${server.hostname}:${server.port}`);
