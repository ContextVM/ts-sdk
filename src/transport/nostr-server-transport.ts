import {
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
} from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import type { Event as NostrEvent } from 'nostr-tools';
import {
  BaseNostrTransport,
  BaseNostrTransportOptions,
} from './base-nostr-transport.js';
import { CTXVM_MESSAGES_KIND } from '../core/constants.js';

// TODO: Add serverId to the configuration to check for targeted requests

/**
 * Options for configuring the NostrServerTransport.
 */
export type NostrServerTransportOptions = BaseNostrTransportOptions;

/**
 * Information about a pending request that needs correlation for response routing.
 */
interface PendingRequest {
  requesterPubkey: string;
  originalMcpRequestId: string | number;
}

/**
 * A server-side transport layer for CTXVM that uses Nostr events for communication.
 * This transport listens for incoming MCP requests via Nostr events and can send
 * responses back to the originating clients. It handles all request/response correlation
 * internally, making it a standalone MCP transport that works over Nostr.
 */
export class NostrServerTransport
  extends BaseNostrTransport
  implements Transport
{
  // Public event handlers required by the Transport interface.
  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;

  // Storage for pending requests with full correlation information
  private readonly pendingRequests = new Map<string | number, PendingRequest>();

  constructor(options: NostrServerTransportOptions) {
    super(options);
  }

  /**
   * Starts the transport, connecting to the relay and setting up event listeners
   * to receive incoming MCP requests.
   */
  public async start(): Promise<void> {
    await this.connect();
    const pubkey = await this.getPublicKey();

    // Subscribe to events targeting this server's public key
    const filters = this.createSubscriptionFilters(pubkey);

    await this.subscribe(filters, async (event: NostrEvent) => {
      try {
        const mcpMessage = this.convertNostrEventToMcpMessage(event);

        // Store correlation information for requests (not notifications)
        const request = mcpMessage as JSONRPCRequest;
        if (request.id !== undefined && request.id !== null) {
          // Store the original request ID for later restoration
          const originalRequestId = request.id;

          // Use the unique Nostr event ID as the MCP request ID to avoid collisions
          request.id = event.id;

          this.pendingRequests.set(event.id, {
            requesterPubkey: event.pubkey,
            originalMcpRequestId: originalRequestId,
          });
        }

        // Call standard Transport handler
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
    // Clear pending requests
    this.pendingRequests.clear();
    this.onclose?.();
  }

  /**
   * Sends a JSON-RPC message over the Nostr transport.
   * This method handles both standalone usage and gateway usage.
   * For responses, it automatically correlates with the original request.
   * @param message The JSON-RPC message to send.
   */
  public async send(message: JSONRPCMessage): Promise<void> {
    const response = message as JSONRPCResponse;

    // If this is a response (has an ID), look up the original request
    if (response.id !== undefined && response.id !== null) {
      const nostrEventId = response.id as string; // This is the Nostr event ID used as the key
      const pendingRequest = this.pendingRequests.get(nostrEventId);

      if (!pendingRequest) {
        throw new Error(
          `No pending request found for response ID: ${response.id}`,
        );
      }

      // Restore the original request ID in the response
      response.id = pendingRequest.originalMcpRequestId;

      // Send the response back to the original requester
      const tags = this.createResponseTags(
        pendingRequest.requesterPubkey,
        nostrEventId,
      );
      await this.sendMcpMessage(message, CTXVM_MESSAGES_KIND, tags);

      // Clean up the pending request (use the Nostr event ID as the key)
      this.pendingRequests.delete(nostrEventId);
    } else {
      // This is a notification (no ID), cannot be sent without a target
      throw new Error('Cannot send notification without a target recipient');
    }
  }

  /**
   * Gets the number of pending requests.
   * @returns The number of requests waiting for responses.
   */
  public getPendingRequestCount(): number {
    return this.pendingRequests.size;
  }
}
