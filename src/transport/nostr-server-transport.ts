import {
  InitializeRequest,
  InitializeResultSchema,
  isJSONRPCResponse,
  JSONRPCError,
  LATEST_PROTOCOL_VERSION,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
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
import {
  announcementMethods,
  CTXVM_MESSAGES_KIND,
  NOSTR_TAGS,
  PROMPTS_LIST_KIND,
  RESOURCES_LIST_KIND,
  RESOURCETEMPLATES_LIST_KIND,
  SERVER_ANNOUNCEMENT_KIND,
  TOOLS_LIST_KIND,
} from '../core/constants.js';

// TODO: Improve notification handling, right now if the jsonrpc message doesnt have an id (notifications doesnt have id) it wont be registered or sent

/**
 * Information about a server.
 */
export interface ServerInfo {
  name?: string;
  picture?: string;
  isPublicServer?: boolean;
  website?: string;
  supportEncryption?: boolean;
}

/**
 * Options for configuring the NostrServerTransport.
 */
export interface NostrServerTransportOptions extends BaseNostrTransportOptions {
  serverInfo?: ServerInfo;
}

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
  private readonly serverInfo?: ServerInfo;

  constructor(options: NostrServerTransportOptions) {
    super(options);
    this.serverInfo = options.serverInfo;
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
        } else {
          // This is a notification (no ID)
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

    if (this.serverInfo?.isPublicServer) {
      await this.getAnnouncementData();
    }
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
   * It automatically correlates with the original request.
   * @param message The JSON-RPC message to send.
   */
  public async send(message: JSONRPCMessage): Promise<void> {
    const response = message as JSONRPCResponse | JSONRPCError;
    // If this is a response (has an ID), look up the original request
    if (response.id !== undefined && response.id !== null) {
      const nostrEventId = response.id as string; // This is the Nostr event ID used as the key
      const pendingRequest = this.pendingRequests.get(nostrEventId);

      if (!pendingRequest) {
        if (response.id === 'announcement') {
          if (isJSONRPCResponse(response)) {
            this.announcer(response);
          }
          return;
        } else {
          this.onerror?.(
            new Error(
              `No pending request found for response ID: ${response.id}`,
            ),
          );
          return;
        }
      }

      // Restore the original request ID in the response
      response.id = pendingRequest.originalMcpRequestId;

      // Send the response back to the original requester
      const tags = this.createResponseTags(
        pendingRequest.requesterPubkey,
        nostrEventId,
      );

      await this.sendMcpMessage(response, CTXVM_MESSAGES_KIND, tags);

      // Clean up the pending request (use the Nostr event ID as the key)
      this.pendingRequests.delete(nostrEventId);
    } else {
      // This is a notification (no ID)
      throw new Error('Cannot send notification without a target recipient');
    }
  }

  /**
   * Initiates the process of fetching announcement data from the server's internal logic.
   * @returns A Promise that resolves when the announcement requests have been dispatched.
   */
  private async getAnnouncementData(): Promise<void> {
    console.log('Getting announcement data...');

    const initializeParams: InitializeRequest['params'] = {
      protocolVersion: LATEST_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'DummyClient',
        version: '1.0.0',
      },
    };

    for (const [key, methodValue] of Object.entries(announcementMethods)) {
      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id: 'announcement',
        method: methodValue,
        params: key === 'server' ? initializeParams : {},
      };

      this.onmessage?.(message);
    }
  }

  /**
   * Handles the JSON-RPC responses for public server announcements and publishes
   * them as Nostr events to the configured relays.
   * @param message The JSON-RPC response containing the announcement data.
   * @returns A Promise that resolves when the announcement event has been sent.
   */
  private async announcer(message: JSONRPCResponse): Promise<void> {
    if (InitializeResultSchema.safeParse(message.result).success) {
      this.sendMcpMessage(
        message.result as JSONRPCMessage,
        SERVER_ANNOUNCEMENT_KIND,
        [
          ...(this.serverInfo?.name
            ? [[NOSTR_TAGS.NAME, this.serverInfo?.name]]
            : []),
          ...(this.serverInfo?.website
            ? [[NOSTR_TAGS.WEBSITE, this.serverInfo?.website]]
            : []),
          ...(this.serverInfo?.picture
            ? [[NOSTR_TAGS.PICTURE, this.serverInfo?.picture]]
            : []),
          ...(this.serverInfo?.supportEncryption
            ? [[NOSTR_TAGS.SUPPORT_ENCRYPTION]]
            : []),
        ],
      );
    } else if (ListToolsResultSchema.safeParse(message.result).success) {
      this.sendMcpMessage(message.result as JSONRPCMessage, TOOLS_LIST_KIND);
    } else if (ListResourcesResultSchema.safeParse(message.result).success) {
      this.sendMcpMessage(
        message.result as JSONRPCMessage,
        RESOURCES_LIST_KIND,
      );
    } else if (
      ListResourceTemplatesResultSchema.safeParse(message.result).success
    ) {
      this.sendMcpMessage(
        message.result as JSONRPCMessage,
        RESOURCETEMPLATES_LIST_KIND,
      );
    } else if (ListPromptsResultSchema.safeParse(message.result).success) {
      this.sendMcpMessage(message.result as JSONRPCMessage, PROMPTS_LIST_KIND);
    }
  }
}
