import { type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Event as NostrEvent } from 'nostr-tools';
import { NostrSigner, RelayHandler } from '../core/interfaces.js';
import { CTXVM_MESSAGES_KIND } from '../core/constants.js';
import { BaseNostrTransport } from './base-nostr-transport.js';

// TODO: Check `e` tag of the response from the server

/**
 * Options for configuring the NostrTransport.
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
export class NostrTransport extends BaseNostrTransport implements Transport {
  // Public event handlers required by the Transport interface.
  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;

  // Private properties for managing the transport's state and dependencies.
  private readonly serverPubkey: string;
  private readonly serverIdentifier?: string;

  constructor(options: NostrTransportOptions) {
    super(options);
    this.serverPubkey = options.serverPubkey;
    this.serverIdentifier = options.serverIdentifier;
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
        const mcpMessage = this.convertNostrEventToMcpMessage(event);
        this.onmessage?.(mcpMessage);
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
    await this.sendWithEventId(message);
  }

  /**
   * Sends a JSON-RPC message over the Nostr transport and returns the event ID.
   * @param message The JSON-RPC request or response to send.
   * @returns The ID of the published Nostr event.
   */
  public async sendWithEventId(message: JSONRPCMessage): Promise<string> {
    const tags = this.createRecipientTags(
      this.serverPubkey,
      this.serverIdentifier,
    );
    return await this.sendMcpMessage(message, CTXVM_MESSAGES_KIND, tags);
  }
}
