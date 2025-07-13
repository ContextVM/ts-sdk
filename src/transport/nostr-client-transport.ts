import {
  NotificationSchema,
  type JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Event as NostrEvent } from 'nostr-tools';
import { NostrSigner, RelayHandler } from '../core/interfaces.js';
import { CTXVM_MESSAGES_KIND } from '../core/constants.js';
import { BaseNostrTransport } from './base-nostr-transport.js';
import { getNostrEventTag } from '../core/utils/serializers.js';

/**
 * Options for configuring the NostrClientTransport.
 */
export interface NostrTransportOptions {
  signer: NostrSigner;
  relayHandler: RelayHandler;
  serverPubkey: string;
  serverIdentifier?: string;
}

/**
 * A transport layer for CTXVM that uses Nostr events for communication.
 * It implements the Transport interface from the @modelcontextprotocol/sdk.
 */
export class NostrClientTransport
  extends BaseNostrTransport
  implements Transport
{
  // Public event handlers required by the Transport interface.
  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;

  // Private properties for managing the transport's state and dependencies.
  private readonly serverPubkey: string;
  private readonly serverIdentifier?: string;
  private readonly pendingRequestIds: Set<string>;

  constructor(options: NostrTransportOptions) {
    super(options);
    this.serverPubkey = options.serverPubkey;
    this.serverIdentifier = options.serverIdentifier;
    this.pendingRequestIds = new Set();
  }

  /**
   * Starts the transport, connecting to the relay and setting up event listeners.
   */
  public async start(): Promise<void> {
    await this.connect();
    const pubkey = await this.getPublicKey();
    const filters = this.createSubscriptionFilters(pubkey, {
      authors: [this.serverPubkey],
    });

    await this.subscribe(filters, async (event: NostrEvent) => {
      try {
        const eTag = getNostrEventTag(event.tags, 'e');
        const mcpMessage = this.convertNostrEventToMcpMessage(event);

        if (eTag) {
          const eventId = eTag;
          if (this.pendingRequestIds.has(eventId)) {
            this.onmessage?.(mcpMessage);
            this.pendingRequestIds.delete(eventId);
          } else {
            console.warn(
              `Received Nostr event with unexpected 'e' tag: ${eventId}.`,
            );
          }
        } else {
          try {
            NotificationSchema.parse(mcpMessage);
            this.onmessage?.(mcpMessage);
          } catch (error) {
            this.onerror?.(
              error instanceof Error
                ? error
                : new Error('Failed to handle incoming Nostr event'),
            );
          }
        }
      } catch (error) {
        console.error('Error handling incoming Nostr event:', error);
        this.onerror?.(
          error instanceof Error
            ? error
            : new Error('Failed to handle incoming Nostr event'),
        );
      }
    });
  }

  /**
   * Closes the transport, disconnecting from the relay.
   */
  public async close(): Promise<void> {
    await this.disconnect();
    this.onclose?.();
  }

  /**
   * Sends a JSON-RPC message over the Nostr transport.
   * @param message The JSON-RPC request or response to send.
   */
  public async send(message: JSONRPCMessage): Promise<void> {
    const eventId = await this.sendWithEventId(message);
    this.pendingRequestIds.add(eventId);
  }

  /**
   * Sends a JSON-RPC message over the Nostr transport and returns the event ID.
   * @param message The JSON-RPC request or response to send.
   * @returns The ID of the published Nostr event.
   */
  public async sendWithEventId(message: JSONRPCMessage): Promise<string> {
    const tags = this.createRecipientTags(this.serverPubkey);
    return await this.sendMcpMessage(message, CTXVM_MESSAGES_KIND, tags);
  }
}
