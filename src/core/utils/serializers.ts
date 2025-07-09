import type { Event as NostrEvent, UnsignedEvent } from 'nostr-tools';
import type { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';

/**
 * Serializes an MCP message into a Nostr event object.
 *
 * @param mcpMessage The MCP message (request or response) to serialize.
 * @param pubkey The public key of the sender.
 * @param kind The kind of Nostr event to create.
 * @param tags An array of tags to include in the event.
 * @returns A Nostr event object (without `id` and `sig`).
 */
export function mcpToNostrEvent(
  mcpMessage: JSONRPCMessage,
  pubkey: string,
  kind: number,
  tags: string[][] = [],
): UnsignedEvent {
  return {
    pubkey,
    kind,
    tags,
    content: JSON.stringify(mcpMessage),
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Deserializes a Nostr event into an MCP message.
 *
 * @param event The Nostr event to deserialize.
 * @returns An MCP request or response object.
 * @throws Error if the event content is not valid JSON
 */
export function nostrEventToMcpMessage(event: NostrEvent): JSONRPCMessage {
  try {
    const content = JSON.parse(event.content);
    return content;
  } catch (error) {
    throw new Error(
      `Invalid JSON in Nostr event content: ${error instanceof Error ? error.message : 'Unknown error'}`,
    );
  }
}
