import type { Event as NostrEvent } from 'nostr-tools';
import type {
  JSONRPCRequest,
  JSONRPCResponse,
  JSONRPCError,
} from '@modelcontextprotocol/sdk/types.js';

// The SDK's JSONRPCResponse only has `result`, not `error`. We define a proper error response type.
interface JSONRPCErrorResponse {
  jsonrpc: '2.0';
  id: string | number;
  error: JSONRPCError;
}

type MCPContent = Partial<Pick<JSONRPCRequest, 'method' | 'params'>> &
  Partial<Pick<JSONRPCResponse, 'result'>> &
  Partial<Pick<JSONRPCErrorResponse, 'error'>>;

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
  mcpMessage: JSONRPCRequest | JSONRPCResponse | JSONRPCErrorResponse,
  pubkey: string,
  kind: number,
  tags: string[][] = [],
): Omit<NostrEvent, 'sig' | 'id'> {
  let content: MCPContent;

  if ('method' in mcpMessage) {
    // It's a request
    content = {
      method: mcpMessage.method,
      params: mcpMessage.params,
    };
  } else if ('result' in mcpMessage) {
    // It's a success response
    content = {
      result: mcpMessage.result,
    };
  } else {
    // It's an error response
    content = {
      error: mcpMessage.error,
    };
  }

  return {
    pubkey,
    kind,
    tags,
    content: JSON.stringify(content),
    created_at: Math.floor(Date.now() / 1000),
  };
}

/**
 * Deserializes a Nostr event into an MCP message.
 *
 * @param event The Nostr event to deserialize.
 * @returns An MCP request or response object.
 */
export function nostrEventToMcpMessage(
  event: NostrEvent,
): JSONRPCRequest | JSONRPCResponse | JSONRPCErrorResponse {
  const content: MCPContent = JSON.parse(event.content);

  const messageBase = {
    jsonrpc: '2.0' as const,
  };

  if (content.method) {
    // It's a request
    return {
      ...messageBase,
      id: event.id,
      method: content.method,
      params: content.params,
    } as JSONRPCRequest;
  } else {
    // It's a response
    const eTag = event.tags.find((tag) => tag[0] === 'e');
    if (!eTag || !eTag[1]) {
      throw new Error(
        'Response event must have an "e" tag pointing to the request event id.',
      );
    }
    const requestId = eTag[1];

    if (content.result) {
      return {
        ...messageBase,
        id: requestId,
        result: content.result,
      } as JSONRPCResponse;
    } else {
      return {
        ...messageBase,
        id: requestId,
        error: content.error,
      } as JSONRPCErrorResponse;
    }
  }
}
