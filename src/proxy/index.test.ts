import { NostrMCPProxy } from './index.js';
import {
  JSONRPCMessage,
  JSONRPCRequest,
} from '@modelcontextprotocol/sdk/types.js';
import { Transport } from '@modelcontextprotocol/sdk/shared/transport.js';
import { NostrSigner, RelayHandler } from '../core/interfaces.js';
import { Filter, NostrEvent, UnsignedEvent } from 'nostr-tools';

// Mock MCP Host Transport for testing
class MockMCPHostTransport implements Transport {
  onmessage?: (message: JSONRPCMessage) => void;
  onclose?: () => void;
  onerror?: (error: Error) => void;

  private messages: JSONRPCMessage[] = [];

  async start(): Promise<void> {
    console.log('Mock MCP Host Transport started');
  }

  async close(): Promise<void> {
    console.log('Mock MCP Host Transport closed');
  }

  async send(message: JSONRPCMessage): Promise<void> {
    console.log('Mock MCP Host received:', message);
    this.messages.push(message);
  }

  // Test helper to simulate messages from host
  simulateMessageFromHost(message: JSONRPCMessage): void {
    if (this.onmessage) {
      this.onmessage(message);
    }
  }

  getReceivedMessages(): JSONRPCMessage[] {
    return this.messages;
  }
}

// Mock Nostr Signer for testing
class MockNostrSigner implements NostrSigner {
  async getPublicKey(): Promise<string> {
    return 'mock_public_key';
  }

  async signEvent(event: UnsignedEvent): Promise<NostrEvent> {
    return {
      ...event,
      id: 'mock_event_id_' + Math.random().toString(36).substr(2, 9),
      sig: 'mock_signature',
    };
  }

  async getSecretKey(): Promise<Uint8Array> {
    return new Uint8Array(32);
  }
}

// Mock Relay Handler for testing
class MockRelayHandler implements RelayHandler {
  private eventHandlers: Array<(event: NostrEvent) => void> = [];
  private lastPublishedEvent: NostrEvent | null = null;

  async connect(): Promise<void> {
    console.log('Mock Relay Handler connected');
  }

  async disconnect(): Promise<void> {
    console.log('Mock Relay Handler disconnected');
  }

  async publish(event: NostrEvent): Promise<void> {
    console.log('Mock Relay Handler published event:', event);
    this.lastPublishedEvent = event;
  }

  async subscribe(
    filters: Filter[],
    onEvent: (event: NostrEvent) => void,
  ): Promise<void> {
    this.eventHandlers.push(onEvent);
    console.log('Mock Relay Handler subscribed with filters:', filters);
  }

  unsubscribe(): void {
    this.eventHandlers = [];
    console.log('Mock Relay Handler unsubscribed');
  }

  // Test helper to simulate events from Nostr
  simulateEventFromNostr(event: NostrEvent): void {
    this.eventHandlers.forEach((handler) => handler(event));
  }

  // Get the last published event for testing
  getLastPublishedEvent(): NostrEvent | null {
    return this.lastPublishedEvent;
  }
}

// Test function
async function testProxy(): Promise<void> {
  console.log('=== Testing NostrMCPProxy ===');

  const mockMCPHost = new MockMCPHostTransport();
  const mockSigner = new MockNostrSigner();
  const mockRelayHandler = new MockRelayHandler();

  const proxy = new NostrMCPProxy({
    mcpHostTransport: mockMCPHost,
    nostrTransportOptions: {
      signer: mockSigner,
      relayHandler: mockRelayHandler,
      serverPubkey: 'mock_server_pubkey',
      serverIdentifier: 'test_server',
    },
  });

  // Start the proxy
  await proxy.start();

  // Test 1: Send a request from MCP Host
  console.log('\n--- Test 1: MCP Host -> Nostr ---');
  const testRequest: JSONRPCRequest = {
    jsonrpc: '2.0',
    id: 'test_request_123',
    method: 'ping',
    params: {},
  };

  mockMCPHost.simulateMessageFromHost(testRequest);

  // Test 2: Simulate response from Nostr
  console.log('\n--- Test 2: Nostr -> MCP Host ---');
  setTimeout(() => {
    // Get the actual event ID that was published
    const publishedEvent = mockRelayHandler.getLastPublishedEvent();
    console.log('Published event ID:', publishedEvent?.id);

    // Simulate the response using the correct event ID mapping
    const mockNostrEvent = {
      id: 'nostr_response_event_id', // This is different from the content ID
      content: JSON.stringify({
        jsonrpc: '2.0',
        id: publishedEvent?.id || 'fallback_event_id', // Use the actual published event ID
        result: 'pong',
      }),
      kind: 25910,
      created_at: Math.floor(Date.now() / 1000),
      pubkey: 'mock_server_pubkey',
      tags: [],
      sig: 'mock_signature',
    };

    mockRelayHandler.simulateEventFromNostr(mockNostrEvent);

    // Check received messages
    setTimeout(() => {
      const receivedMessages = mockMCPHost.getReceivedMessages();
      console.log('\n--- Results ---');
      console.log('Messages received by MCP Host:', receivedMessages);

      if (receivedMessages.length > 0) {
        const response = receivedMessages[0] as JSONRPCRequest;
        console.log(
          'Response ID should match original request ID:',
          response.id === 'test_request_123',
        );
      }

      proxy
        .stop()
        .then(() => {
          console.log('Test completed successfully');
          process.exit(0);
        })
        .catch((err) => {
          console.error('Error stopping proxy:', err);
          process.exit(1);
        });
    }, 100);
  }, 100);
}

// Run the test
testProxy().catch(console.error);
