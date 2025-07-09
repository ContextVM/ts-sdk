import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  JSONRPCMessage,
  JSONRPCRequest,
  JSONRPCResponse,
} from '@modelcontextprotocol/sdk/types.js';
import {
  NostrTransport,
  NostrTransportOptions,
} from '../transport/nostr-client-transport.js';

/**
 * Options for configuring the NostrMCPProxy.
 */
export interface NostrMCPProxyOptions {
  /**
   * The transport for the local MCP Host (e.g., StdioServerTransport).
   */
  mcpHostTransport: Transport;
  /**
   * Configuration options for the client-facing Nostr transport.
   */
  nostrTransportOptions: NostrTransportOptions;
}

/**
 * `NostrMCPProxy` acts as a bridge between a local MCP Host
 * and a remote MCP Server accessible via the Nostr network.
 *
 * It listens for MCP messages from the local host, forwards them over Nostr,
 * and relays the responses back.
 */
export class NostrMCPProxy {
  private mcpHostTransport: Transport;
  private nostrTransport: NostrTransport;
  private pendingRequests = new Map<string | number, string | number>(); // nostrEventId -> originalMcpId

  constructor(options: NostrMCPProxyOptions) {
    this.mcpHostTransport = options.mcpHostTransport;
    this.nostrTransport = new NostrTransport(options.nostrTransportOptions);
  }

  /**
   * Starts the proxy, establishing connections to both the local MCP host
   * and the remote Nostr transport.
   *
   * @returns Promise that resolves when both transports are started
   */
  public async start(): Promise<void> {
    // Start listening for messages from the local MCP Host
    await this.mcpHostTransport.start();

    this.mcpHostTransport.onmessage = (message) => {
      this.handleMessageFromHost(message).catch((err: Error) =>
        console.error('Error handling message from host:', err),
      );
    };
    this.mcpHostTransport.onerror = (err) =>
      console.error('MCP Host Transport Error:', err);
    this.mcpHostTransport.onclose = () => {
      console.log('MCP Host Transport closed');
    };

    // Start the Nostr transport to communicate with the remote Gateway
    await this.nostrTransport.start();
    this.nostrTransport.onmessage = this.handleMessageFromNostr.bind(this);
    this.nostrTransport.onerror = (err) =>
      console.error('Nostr Transport Error:', err);
    this.nostrTransport.onclose = () => {
      console.log('Nostr Transport closed');
    };

    console.log('NostrMCPProxy started.');
  }

  /**
   * Stops the proxy and closes all connections.
   *
   * @returns Promise that resolves when both transports are closed
   */
  public async stop(): Promise<void> {
    await this.mcpHostTransport.close();
    await this.nostrTransport.close();
    this.pendingRequests.clear();
    console.log('NostrMCPProxy stopped.');
  }

  /**
   * Handles incoming messages from the local MCP Host.
   * It forwards the message to the Nostr network and maintains ID correlation.
   *
   * @param message - The JSON-RPC message from the MCP host
   * @returns Promise that resolves when the message is processed
   */
  public async handleMessageFromHost(message: JSONRPCMessage): Promise<void> {
    const request = message as JSONRPCRequest;
    if (request.id) {
      try {
        // Send the message and get the Nostr event ID
        const nostrEventId = await this.nostrTransport.sendWithEventId(message);

        // Store the original MCP ID keyed by the Nostr event ID
        this.pendingRequests.set(nostrEventId, request.id);
      } catch (error) {
        console.error('Error sending message to Nostr:', error);
        // Send error response back to host
        if (request.id) {
          const errorResponse: JSONRPCMessage = {
            jsonrpc: '2.0',
            id: request.id,
            error: {
              code: -32603,
              message:
                'Internal error: Failed to send message to Nostr network',
            },
          };
          this.mcpHostTransport.send(errorResponse);
        }
      }
    } else {
      // For notifications (no ID), just send directly
      await this.nostrTransport.send(message);
    }
  }

  /**
   * Handles incoming messages from the Nostr network.
   * It looks up the original request ID and forwards the response
   * to the local MCP Host with proper ID correlation.
   *
   * @param message - The JSON-RPC message from the Nostr network
   */
  private handleMessageFromNostr(message: JSONRPCMessage): void {
    const response = message as JSONRPCResponse;

    if (response.id) {
      // Check if this is a response to a request we forwarded
      if (this.pendingRequests.has(response.id)) {
        const originalMcpId = this.pendingRequests.get(response.id);

        // Send the response back to the MCP host with the original ID
        if (originalMcpId !== undefined) {
          this.mcpHostTransport.send({ ...response, id: originalMcpId });

          // Clean up the mapping
          this.pendingRequests.delete(response.id);
        } else {
          // This shouldn't happen, but handle gracefully
          console.warn(
            'Found response ID in pending requests but no original MCP ID',
          );
          this.mcpHostTransport.send(message);
        }
      } else {
        // Unknown response ID, forward as-is (might be a notification)
        this.mcpHostTransport.send(message);
      }
    } else {
      // This is a notification from the server (no ID)
      this.mcpHostTransport.send(message);
    }
  }
}
