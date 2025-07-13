import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { JSONRPCMessage } from '@modelcontextprotocol/sdk/types.js';
import {
  NostrClientTransport,
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
  private nostrTransport: NostrClientTransport;

  constructor(options: NostrMCPProxyOptions) {
    this.mcpHostTransport = options.mcpHostTransport;
    this.nostrTransport = new NostrClientTransport(
      options.nostrTransportOptions,
    );
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
    await this.nostrTransport.send(message);
  }

  /**
   * Handles incoming messages from the Nostr network.
   * It looks up the original request ID and forwards the response
   * to the local MCP Host with proper ID correlation.
   *
   * @param message - The JSON-RPC message from the Nostr network
   */
  private handleMessageFromNostr(message: JSONRPCMessage): void {
    this.mcpHostTransport.send(message);
  }
}
