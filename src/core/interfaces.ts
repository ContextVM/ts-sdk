import {
  InitializeRequest,
  ListPromptsRequest,
  ListResourcesRequest,
  ListResourceTemplatesRequest,
  ListToolsRequest,
} from '@modelcontextprotocol/sdk/types.js';
import type { Filter, NostrEvent } from 'nostr-tools';

/**
 * Defines the encryption mode for the transport.
 * - `optional`: Encrypts messages if the incoming message was encrypted.
 * - `required`: Enforces encryption for all messages.
 * - `disabled`: Disables encryption entirely.
 */
export enum EncryptionMode {
  OPTIONAL = 'optional',
  REQUIRED = 'required',
  DISABLED = 'disabled',
}

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

export interface AnnouncementMethods {
  server: InitializeRequest['method'];
  tools: ListToolsRequest['method'];
  resources: ListResourcesRequest['method'];
  resourceTemplates: ListResourceTemplatesRequest['method'];
  prompts: ListPromptsRequest['method'];
}
