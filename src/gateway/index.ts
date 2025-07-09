import { type JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import type { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import {
  NostrServerTransport,
  NostrServerTransportOptions,
} from '../transport/nostr-server-transport.js';

/**
 * Options for configuring the NostrMCPGateway.
 */
export interface NostrMCPGatewayOptions {
  /** The MCP server transport (e.g., StdioServerTransport) to connect to the original MCP server */
  mcpServerTransport: Transport;
  /** Options for configuring the Nostr server transport */
  nostrTransportOptions: NostrServerTransportOptions;
}

/**
 * The main gateway class that orchestrates communication between Nostr clients
 * and a local MCP server. It acts as a bridge, receiving MCP requests via Nostr
 * events and forwarding them to the local MCP server, then publishing the
 * responses back to Nostr. All request/response correlation is handled by the
 * NostrServerTransport, making this a simple message forwarder.
 */
export class NostrMCPGateway {
  private readonly mcpServerTransport: Transport;
  private readonly nostrServerTransport: NostrServerTransport;
  private isRunning = false;

  constructor(options: NostrMCPGatewayOptions) {
    this.mcpServerTransport = options.mcpServerTransport;
    this.nostrServerTransport = new NostrServerTransport(
      options.nostrTransportOptions,
    );

    this.setupEventHandlers();
  }

  /**
   * Sets up event handlers for both transports.
   */
  private setupEventHandlers(): void {
    // Handle incoming messages from Nostr (requests from clients)
    this.nostrServerTransport.onmessage =
      this.handleMessageFromNostr.bind(this);
    this.nostrServerTransport.onerror = this.handleNostrError.bind(this);
    this.nostrServerTransport.onclose = this.handleNostrClose.bind(this);

    // Handle incoming messages from MCP server (responses to our forwarded requests)
    this.mcpServerTransport.onmessage = this.handleMessageFromServer.bind(this);
    this.mcpServerTransport.onerror = this.handleServerError.bind(this);
    this.mcpServerTransport.onclose = this.handleServerClose.bind(this);
  }

  /**
   * Starts the gateway, initializing both transports.
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error('Gateway is already running');
    }

    try {
      // Start both transports
      await this.nostrServerTransport.start();
      await this.mcpServerTransport.start();

      this.isRunning = true;
      console.log('NostrMCPGateway started successfully');
    } catch (error) {
      console.error('Failed to start NostrMCPGateway:', error);
      await this.stop();
      throw error;
    }
  }

  /**
   * Stops the gateway, closing both transports.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) {
      return;
    }

    try {
      // Stop both transports
      await this.nostrServerTransport.close();
      await this.mcpServerTransport.close();

      this.isRunning = false;
      console.log('NostrMCPGateway stopped successfully');
    } catch (error) {
      console.error('Error stopping NostrMCPGateway:', error);
      throw error;
    }
  }

  /**
   * Handles incoming MCP messages from Nostr clients.
   * Simply forwards the message to the MCP server without any correlation logic.
   * @param message The MCP message received from Nostr.
   */
  private async handleMessageFromNostr(message: JSONRPCMessage): Promise<void> {
    try {
      // Forward the message directly to the MCP server
      await this.mcpServerTransport.send(message);
    } catch (error) {
      console.error('Error handling message from Nostr:', error);
      throw error;
    }
  }

  /**
   * Handles incoming MCP messages from the server (responses to forwarded requests).
   * Simply forwards the message to the Nostr transport, which handles correlation.
   * @param message The MCP response message from the server.
   */
  private async handleMessageFromServer(
    message: JSONRPCMessage,
  ): Promise<void> {
    try {
      // Forward the message directly to the Nostr transport
      // The transport will handle correlation and routing
      await this.nostrServerTransport.send(message);
    } catch (error) {
      console.error('Error handling message from server:', error);
      throw error;
    }
  }

  /**
   * Handles errors from the Nostr transport.
   * @param error The error that occurred.
   */
  private handleNostrError(error: Error): void {
    console.error('Nostr transport error:', error);
  }

  /**
   * Handles the Nostr transport closing.
   */
  private handleNostrClose(): void {
    console.log('Nostr transport closed');
  }

  /**
   * Handles errors from the MCP server transport.
   * @param error The error that occurred.
   */
  private handleServerError(error: Error): void {
    console.error('MCP server transport error:', error);
  }

  /**
   * Handles the MCP server transport closing.
   */
  private handleServerClose(): void {
    console.log('MCP server transport closed');
  }

  /**
   * Gets the current status of the gateway.
   * @returns True if the gateway is running, false otherwise.
   */
  public isActive(): boolean {
    return this.isRunning;
  }

  /**
   * Gets the number of pending requests from the Nostr transport.
   * @returns The number of requests waiting for responses.
   */
  public getPendingRequestCount(): number {
    return this.nostrServerTransport.getPendingRequestCount();
  }
}
