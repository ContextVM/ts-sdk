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

    await this.subscribe(filters, async (event: NostrEvent) => {
      if (event.kind === GIFT_WRAP_KIND) {
        await this.handleEncryptedMessage(event);
      } else {
        this.handleRegularMessage(event);
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
    if (eventId) {
      this.pendingRequestIds.add(eventId);
    }
  }

  /**
   * Sends a JSON-RPC message over the Nostr transport and returns the event ID.
   * If encryption is optional, it attempts an encrypted request first and falls back to unencrypted.
   * @param message The JSON-RPC request or response to send.
   * @returns The ID of the published Nostr event.
   */
  public async sendWithEventId(message: JSONRPCMessage): Promise<string> {
    const tags = this.createRecipientTags(this.serverPubkey);

    return this.sendMcpMessage(
      message,
      this.serverPubkey,
      CTXVM_MESSAGES_KIND,
      tags,
      this.encryptionMode === EncryptionMode.REQUIRED,
    );
  }

  /**
   * Handles encrypted messages by decrypting them and processing the content.
   */
  private async handleEncryptedMessage(event: NostrEvent): Promise<void> {
    try {
      const secretKey = await this.signer.getSecretKey();
      if (!secretKey) {
        throw new Error('Secret key is not available for decryption.');
      }
      const decryptedContent = decryptMessage(event, secretKey);
      const nostrEvent = JSON.parse(decryptedContent) as NostrEvent;
      this.handleRegularMessage(nostrEvent);
    } catch (error) {
      console.error('Error handling encrypted message:', error);
      this.onerror?.(
        error instanceof Error
          ? error
          : new Error('Failed to handle encrypted message'),
      );
    }
  }

  /**
   * Handles regular (non-encrypted) messages.
   */
  private handleRegularMessage(event: NostrEvent): void {
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
  }
}
