import {
  NotificationSchema,
  type JSONRPCMessage,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  EncryptionMode,
  NostrSigner,
  RelayHandler,
} from '../core/interfaces.js';
import {
  CTXVM_MESSAGES_KIND,
  GIFT_WRAP_KIND,
  decryptMessage,
} from '../core/index.js';
import { BaseNostrTransport } from './base-nostr-transport.js';
import { getNostrEventTag } from '../core/utils/serializers.js';

/**
 * Options for configuring the NostrClientTransport.
 */
export interface NostrTransportOptions {
  signer: NostrSigner;
  relayHandler: RelayHandler;
  serverPubkey: string;
  encryptionMode?: EncryptionMode;
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
  private readonly pendingRequestIds: Set<string>;

  constructor(options: NostrTransportOptions) {
    super(options);
    this.serverPubkey = options.serverPubkey;
    this.pendingRequestIds = new Set();
  }

  /**
   * Starts the transport, connecting to the relay and setting up event listeners.
   */
  public async start(): Promise<void> {
    await this.connect();
    const pubkey = await this.getPublicKey();
    const filters = this.createSubscriptionFilters(pubkey);

    await this.subscribe(filters, this.processIncomingEvent.bind(this));
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
    const eventId = await this._sendInternal(message);
    if (eventId) {
      this.pendingRequestIds.add(eventId);
    }
  }

  /**
   * Internal method to send a JSON-RPC message and get the resulting event ID.
   * @param message The JSON-RPC message to send.
   * @returns The ID of the published Nostr event.
   */
  private async _sendInternal(message: JSONRPCMessage): Promise<string> {
    const tags = this.createRecipientTags(this.serverPubkey);

    return this.sendMcpMessage(
      message,
      this.serverPubkey,
      CTXVM_MESSAGES_KIND,
      tags,
    );
  }

  /**
   * Processes incoming Nostr events, routing them to the correct handler.
   */
  private async processIncomingEvent(event: NostrEvent): Promise<void> {
    try {
      let nostrEvent = event;
      // Handle encrypted messages
      if (event.kind === GIFT_WRAP_KIND) {
        const secretKey = await this.signer.getSecretKey();
        if (!secretKey) {
          throw new Error('Secret key is not available for decryption.');
        }
        const decryptedContent = decryptMessage(event, secretKey);
        nostrEvent = JSON.parse(decryptedContent) as NostrEvent;
      }

      // Process the resulting event
      const mcpMessage = this.convertNostrEventToMcpMessage(nostrEvent);
      const eTag = getNostrEventTag(nostrEvent.tags, 'e');

      if (eTag) {
        this.handleResponse(eTag, mcpMessage);
      } else {
        this.handleNotification(mcpMessage);
      }
    } catch (error) {
      console.error('Error handling incoming Nostr event:', error);
      this.onerror?.(
        error instanceof Error
          ? error
          : new Error('Failed to handle incoming Nostr event'),
      );
    }
  }

  /**
   * Handles response messages by correlating them with pending requests.
   * @param correlatedEventId The event ID from the 'e' tag.
   * @param mcpMessage The incoming MCP message.
   */
  private handleResponse(
    correlatedEventId: string,
    mcpMessage: JSONRPCMessage,
  ): void {
    if (this.pendingRequestIds.has(correlatedEventId)) {
      this.onmessage?.(mcpMessage);
      this.pendingRequestIds.delete(correlatedEventId);
    } else {
      console.warn(
        `Received Nostr event with unexpected 'e' tag: ${correlatedEventId}.`,
      );
    }
  }

  /**
   * Handles notification messages.
   * @param mcpMessage The incoming MCP message.
   */
  private handleNotification(mcpMessage: JSONRPCMessage): void {
    try {
      NotificationSchema.parse(mcpMessage);
      this.onmessage?.(mcpMessage);
    } catch (error) {
      this.onerror?.(
        error instanceof Error
          ? error
          : new Error('Failed to handle incoming notification'),
      );
    }
  }
}
