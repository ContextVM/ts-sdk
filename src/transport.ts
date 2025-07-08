import { type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Event as NostrEvent } from 'nostr-tools';
import { NostrSigner, RelayHandler } from './core/interfaces.js';
import {
  CTXVM_MESSAGES_KIND,
  GIFT_WRAP_KIND,
  NOSTR_TAGS,
} from './core/constants.js';
import { mcpToNostrEvent, nostrEventToMcpMessage } from './core/index.js';

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
export class NostrTransport implements Transport {
  // Public event handlers required by the Transport interface.
  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;

  // Private properties for managing the transport's state and dependencies.
  private readonly signer: NostrSigner;
  private readonly relayHandler: RelayHandler;
  private readonly serverPubkey: string;
  private readonly serverIdentifier?: string;

  constructor(options: NostrTransportOptions) {
    this.signer = options.signer;
    this.relayHandler = options.relayHandler;
    this.serverPubkey = options.serverPubkey;
    this.serverIdentifier = options.serverIdentifier;
  }

  /**
   * Starts the transport, connecting to the relay and setting up event listeners.
   */
  public async start(): Promise<void> {
    await this.relayHandler.connect();
    const pubkey = await this.signer.getPublicKey();
    this.relayHandler.subscribe(
      [
        {
          '#p': [pubkey],
          kinds: [CTXVM_MESSAGES_KIND, GIFT_WRAP_KIND],
          authors: [this.serverPubkey],
        },
      ],
      async (event: NostrEvent) => {
        try {
          const mcpMessage = nostrEventToMcpMessage(event);
          this.onmessage?.(mcpMessage);
        } catch (error) {
          console.error('Error handling incoming Nostr event:', error);
          this.onerror?.(
            error instanceof Error
              ? error
              : new Error('Failed to handle incoming Nostr event'),
          );
        }
      },
    );
  }

  /**
   * Closes the transport, disconnecting from the relay.
   */
  public async close(): Promise<void> {
    await this.relayHandler.disconnect();
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
    const pubkey = await this.signer.getPublicKey();
    const tags: string[][] = [[NOSTR_TAGS.PUBKEY, this.serverPubkey]];
    if (this.serverIdentifier) {
      tags.push([NOSTR_TAGS.TARGET_SERVER_ID, this.serverIdentifier]);
    }

    const unsignedEvent = mcpToNostrEvent(
      message,
      pubkey,
      CTXVM_MESSAGES_KIND,
      tags,
    );

    const finalEvent: NostrEvent = await this.signer.signEvent(unsignedEvent);

    await this.relayHandler.publish(finalEvent);
    return finalEvent.id;
  }
}
