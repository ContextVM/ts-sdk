import {
  InitializeRequest,
  InitializeResultSchema,
  isJSONRPCRequest,
  isJSONRPCResponse,
  isJSONRPCNotification,
  JSONRPCError,
  LATEST_PROTOCOL_VERSION,
  ListPromptsResultSchema,
  ListResourcesResultSchema,
  ListResourceTemplatesResultSchema,
  ListToolsResultSchema,
  type JSONRPCMessage,
  type JSONRPCRequest,
  type JSONRPCResponse,
  isJSONRPCError,
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

/**
 * Options for configuring the NostrServerTransport.
 */
export interface NostrServerTransportOptions extends BaseNostrTransportOptions {
  serverInfo?: ServerInfo;
  isPublicServer?: boolean;
  allowedPublicKeys?: string[];
}

/**
 * Information about a server.
 */
export interface ServerInfo {
  name?: string;
  picture?: string;
  website?: string;
  supportEncryption?: boolean;
}

/**
 * Information about a connected client session with integrated request tracking.
 */
interface ClientSession {
  isInitialized: boolean;
  lastActivity: number;
  pendingRequests: Map<string, string | number>;
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
  public onmessage?: (message: JSONRPCMessage) => void;
  public onclose?: () => void;
  public onerror?: (error: Error) => void;

  private readonly clientSessions = new Map<string, ClientSession>();
  private readonly isPublicServer?: boolean;
  private readonly allowedPublicKeys?: string[];
  private readonly serverInfo?: ServerInfo;

  constructor(options: NostrServerTransportOptions) {
    super(options);
    this.serverInfo = options.serverInfo;
    this.isPublicServer = options.isPublicServer;
    this.allowedPublicKeys = options.allowedPublicKeys;
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
      if (
        this.allowedPublicKeys?.length &&
        !this.allowedPublicKeys.includes(event.pubkey)
      )
        return; // Stop processing unauthorized messages

      try {
        const mcpMessage = this.convertNostrEventToMcpMessage(event);

        // Message handling with unified session management
        this.handleIncomingMessage(event.pubkey, event.id, mcpMessage);

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

    if (this.isPublicServer) {
      this.getAnnouncementData();
    }
  }

  /**
   * Closes the transport, disconnecting from the relay.
   */
  public async close(): Promise<void> {
    await this.disconnect();
    this.clientSessions.clear();
    this.onclose?.();
  }

  /**
   * Sends JSON-RPC messages over the Nostr transport.
   * @param message The JSON-RPC message to send.
   */
  public async send(message: JSONRPCMessage): Promise<void> {
    // Message type detection and routing
    console.error('message', message);
    if (isJSONRPCResponse(message) || isJSONRPCError(message)) {
      await this.handleResponse(message);
    } else if (isJSONRPCNotification(message)) {
      this.cleanupInactiveSessions();
      await this.handleNotification(message);
    } else {
      this.onerror?.(new Error('Unknown message type in send()'));
    }
  }

  /**
   * Initiates the process of fetching announcement data from the server's internal logic.
   */
  private getAnnouncementData(): void {
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
   */
  private announcer(message: JSONRPCResponse): void {
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

  /**
   * Handles incoming messages with unified session and request management.
   * @param clientPubkey The public key of the client.
   * @param eventId The Nostr event ID.
   * @param message The MCP message received from the client.
   */
  private handleIncomingMessage(
    clientPubkey: string,
    eventId: string,
    message: JSONRPCMessage,
  ): void {
    const now = Date.now();
    const session = this.getOrCreateClientSession(clientPubkey, now);

    // Update session activity
    session.lastActivity = now;
    // Handle different message types intelligently
    if (isJSONRPCRequest(message)) {
      this.handleIncomingRequest(session, eventId, message);
    } else if (isJSONRPCNotification(message)) {
      this.handleIncomingNotification(session, message);
    }
  }

  /**
   * Gets or creates a client session with proper initialization.
   * @param clientPubkey The client's public key.
   * @param now Current timestamp.
   * @returns The client session.
   */
  private getOrCreateClientSession(
    clientPubkey: string,
    now: number,
  ): ClientSession {
    const session = this.clientSessions.get(clientPubkey);
    if (!session) {
      const newSession: ClientSession = {
        isInitialized: false,
        lastActivity: now,
        pendingRequests: new Map(),
      };
      this.clientSessions.set(clientPubkey, newSession);
      return newSession;
    }
    return session;
  }

  /**
   * Handles incoming requests with correlation tracking.
   * @param session The client session.
   * @param eventId The Nostr event ID.
   * @param request The request message.
   */
  private handleIncomingRequest(
    session: ClientSession,
    eventId: string,
    request: JSONRPCRequest,
  ): void {
    // Store the original request ID for later restoration
    const originalRequestId = request.id;
    // Use the unique Nostr event ID as the MCP request ID to avoid collisions
    request.id = eventId;
    // Store in client session
    session.pendingRequests.set(eventId, originalRequestId);

    // Track progress tokens if provided
    const progressToken = request.params?._meta?.progressToken;
    if (progressToken) {
      session.pendingRequests.set(String(progressToken), eventId);
    }
  }

  /**
   * Handles incoming notifications.
   * @param session The client session.
   * @param notification The notification message.
   */
  private handleIncomingNotification(
    session: ClientSession,
    notification: JSONRPCMessage,
  ): void {
    if (
      isJSONRPCNotification(notification) &&
      notification.method === 'notifications/initialized'
    ) {
      session.isInitialized = true;
    }
  }

  /**
   * Handles response messages by finding the original request and routing back to client.
   * @param response The JSON-RPC response or error to send.
   */
  private async handleResponse(
    response: JSONRPCResponse | JSONRPCError,
  ): Promise<void> {
    // Handle special announcement responses
    if (response.id === 'announcement') {
      if (isJSONRPCResponse(response)) {
        this.announcer(response);
      }
      return;
    }

    // Find the client session with this pending request
    const nostrEventId = response.id as string;
    let targetClientPubkey: string | undefined;
    let originalRequestId: string | number | undefined;

    for (const [clientPubkey, session] of this.clientSessions.entries()) {
      const originalId = session.pendingRequests.get(nostrEventId);
      if (originalId !== undefined) {
        targetClientPubkey = clientPubkey;
        originalRequestId = originalId;
        break;
      }
    }

    if (!targetClientPubkey || originalRequestId === undefined) {
      this.onerror?.(
        new Error(`No pending request found for response ID: ${response.id}`),
      );
      return;
    }

    // Restore the original request ID in the response
    response.id = originalRequestId;

    // Send the response back to the original requester
    const tags = this.createResponseTags(targetClientPubkey, nostrEventId);
    await this.sendMcpMessage(response, CTXVM_MESSAGES_KIND, tags);

    // Clean up the pending request and any associated progress token
    const session = this.clientSessions.get(targetClientPubkey);
    if (session) {
      session.pendingRequests.delete(nostrEventId);

      // Find and delete the corresponding progress token if it exists
      let progressTokenToDelete: string | number | undefined;
      for (const [key, value] of session.pendingRequests.entries()) {
        if (value === nostrEventId) {
          progressTokenToDelete = key;
          break;
        }
      }
      if (progressTokenToDelete !== undefined) {
        session.pendingRequests.delete(String(progressTokenToDelete));
      }
    }
  }

  /**
   * Handles notification messages with routing.
   * @param notification The JSON-RPC notification to send.
   */
  private async handleNotification(
    notification: JSONRPCMessage,
  ): Promise<void> {
    // Special handling for progress notifications
    if (
      isJSONRPCNotification(notification) &&
      notification.method === 'notifications/progress' &&
      notification.params?._meta?.progressToken
    ) {
      const token = String(notification.params._meta.progressToken);

      for (const [clientPubkey, session] of this.clientSessions.entries()) {
        if (session.pendingRequests.has(token)) {
          const nostrEventId = session.pendingRequests.get(token) as string;
          await this.sendNotification(clientPubkey, notification, nostrEventId);
          return;
        }
      }

      this.onerror?.(new Error(`No client found for progress token: ${token}`));
      return;
    }

    const promises: Promise<void>[] = [];
    for (const [clientPubkey, session] of this.clientSessions.entries()) {
      if (session.isInitialized) {
        promises.push(this.sendNotification(clientPubkey, notification));
      }
    }

    await Promise.all(promises);
  }

  /**
   * Sends a notification to a specific client by their public key.
   * @param clientPubkey The public key of the target client.
   * @param notification The notification message to send.
   * @returns Promise that resolves when the notification is sent.
   */
  public async sendNotification(
    clientPubkey: string,
    notification: JSONRPCMessage,
    correlatedEventId?: string,
  ): Promise<void> {
    const session = this.clientSessions.get(clientPubkey);
    if (!session) {
      throw new Error(`No active session found for client: ${clientPubkey}`);
    }

    // Create tags for targeting the specific client
    const tags = this.createRecipientTags(clientPubkey);
    if (correlatedEventId) {
      tags.push([NOSTR_TAGS.EVENT_ID, correlatedEventId]);
    }

    await this.sendMcpMessage(notification, CTXVM_MESSAGES_KIND, tags);
  }

  /**
   * Cleans up inactive client sessions based on a timeout.
   * @param timeoutMs Timeout in milliseconds for considering a session inactive (default: 5 minutes).
   * @returns The number of sessions that were cleaned up.
   */
  public cleanupInactiveSessions(timeoutMs: number = 300000): number {
    const now = Date.now();
    const keysToDelete: string[] = [];

    for (const [clientPubkey, session] of this.clientSessions.entries()) {
      if (now - session.lastActivity > timeoutMs) {
        keysToDelete.push(clientPubkey);
      }
    }

    for (const key of keysToDelete) {
      this.clientSessions.delete(key);
    }

    return keysToDelete.length;
  }
}
