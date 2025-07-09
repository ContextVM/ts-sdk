import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Event as NostrEvent, Filter } from 'nostr-tools';
import { NostrSigner, RelayHandler } from './interfaces.js';
import {
  CTXVM_MESSAGES_KIND,
  GIFT_WRAP_KIND,
  NOSTR_TAGS,
} from './constants.js';
import {
  mcpToNostrEvent,
  nostrEventToMcpMessage,
} from './utils/serializers.js';

/**
 * Base options for configuring Nostr-based transports.
 */
export interface BaseNostrTransportOptions {
  signer: NostrSigner;
  relayHandler: RelayHandler;
}

/**
 * Base class for Nostr-based transports that provides common functionality
 * for managing Nostr connections, event conversion, and message handling.
 */
export abstract class BaseNostrTransport {
  protected readonly signer: NostrSigner;
  protected readonly relayHandler: RelayHandler;
  protected isConnected = false;

  constructor(options: BaseNostrTransportOptions) {
    this.signer = options.signer;
    this.relayHandler = options.relayHandler;
  }

  /**
   * Connects to the Nostr relay network.
   */
  protected async connect(): Promise<void> {
    if (this.isConnected) {
      return;
    }

    await this.relayHandler.connect();
    this.isConnected = true;
  }

  /**
   * Disconnects from the Nostr relay network.
   */
  protected async disconnect(): Promise<void> {
    if (!this.isConnected) {
      return;
    }

    this.relayHandler.unsubscribe();
    await this.relayHandler.disconnect();
    this.isConnected = false;
  }

  /**
   * Gets the public key from the signer.
   */
  protected async getPublicKey(): Promise<string> {
    return await this.signer.getPublicKey();
  }

  /**
   * Sets up a subscription to listen for Nostr events.
   */
  protected async subscribe(
    filters: Filter[],
    onEvent: (event: NostrEvent) => void | Promise<void>,
  ): Promise<void> {
    await this.relayHandler.subscribe(filters, onEvent);
  }

  /**
   * Converts a Nostr event to an MCP message.
   */
  protected convertNostrEventToMcpMessage(event: NostrEvent): JSONRPCMessage {
    return nostrEventToMcpMessage(event);
  }

  /**
   * Converts an MCP message to a Nostr event and signs it.
   */
  protected async createSignedNostrEvent(
    message: JSONRPCMessage,
    kind: number,
    tags: string[][],
  ): Promise<NostrEvent> {
    const pubkey = await this.getPublicKey();
    const unsignedEvent = mcpToNostrEvent(message, pubkey, kind, tags);
    return await this.signer.signEvent(unsignedEvent);
  }

  /**
   * Publishes a signed Nostr event to the relay network.
   */
  protected async publishEvent(event: NostrEvent): Promise<void> {
    await this.relayHandler.publish(event);
  }

  /**
   * Creates and publishes a Nostr event for an MCP message.
   */
  protected async sendMcpMessage(
    message: JSONRPCMessage,
    kind: number,
    tags: string[][],
  ): Promise<string> {
    const event = await this.createSignedNostrEvent(message, kind, tags);
    await this.publishEvent(event);
    return event.id;
  }

  /**
   * Creates subscription filters for listening to messages targeting a specific pubkey.
   */
  protected createSubscriptionFilters(
    targetPubkey: string,
    additionalFilters: Partial<Filter> = {},
  ): Filter[] {
    return [
      {
        '#p': [targetPubkey],
        kinds: [CTXVM_MESSAGES_KIND, GIFT_WRAP_KIND],
        ...additionalFilters,
      },
    ];
  }

  /**
   * Creates tags for targeting a specific recipient.
   */
  protected createRecipientTags(
    recipientPubkey: string,
    serverIdentifier?: string,
  ): string[][] {
    const tags: string[][] = [[NOSTR_TAGS.PUBKEY, recipientPubkey]];
    if (serverIdentifier) {
      tags.push([NOSTR_TAGS.TARGET_SERVER_ID, serverIdentifier]);
    }
    return tags;
  }

  /**
   * Creates tags for responding to a specific event.
   */
  protected createResponseTags(
    recipientPubkey: string,
    originalEventId: string,
    serverIdentifier?: string,
  ): string[][] {
    const tags: string[][] = [
      [NOSTR_TAGS.PUBKEY, recipientPubkey],
      [NOSTR_TAGS.EVENT_ID, originalEventId],
    ];
    if (serverIdentifier) {
      tags.push([NOSTR_TAGS.SERVER_ID, serverIdentifier]);
    }
    return tags;
  }
}
