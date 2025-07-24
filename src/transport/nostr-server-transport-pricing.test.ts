import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  test,
  expect,
} from 'bun:test';
import { sleep, type Subprocess } from 'bun';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import {
  NostrServerTransport,
  PricingConfig,
} from './nostr-server-transport.js';
import { NostrClientTransport } from './nostr-client-transport.js';
import { PrivateKeySigner } from '../signer/private-key-signer.js';
import { SimpleRelayPool } from '../relay/simple-relay-pool.js';
import { generateSecretKey, getPublicKey } from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { TEST_PRIVATE_KEY } from '../__mocks__/fixtures.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { EncryptionMode } from '../core/interfaces.js';
import { CTXVM_MESSAGES_KIND } from '../core/constants.js';
import { JSONRPCNotification } from '@modelcontextprotocol/sdk/types.js';

const baseRelayPort = 7791; // Use a different port to avoid conflicts
const relayUrl = `ws://localhost:${baseRelayPort}`;

describe('NostrServerTransport - Capability Pricing', () => {
  let relayProcess: Subprocess;

  beforeAll(async () => {
    relayProcess = Bun.spawn(['bun', 'src/__mocks__/mock-relay.ts'], {
      env: {
        ...process.env,
        PORT: `${baseRelayPort}`,
      },
      stdout: 'inherit',
      stderr: 'inherit',
    });
    await sleep(100);
  });

  afterEach(async () => {
    if (relayUrl) {
      try {
        const clearUrl = relayUrl.replace('ws://', 'http://') + '/clear-cache';
        await fetch(clearUrl, { method: 'POST' });
        console.log('[TEST] Event cache cleared');
      } catch (error) {
        console.warn('[TEST] Failed to clear event cache:', error);
      }
    }
  });

  afterAll(async () => {
    relayProcess?.kill();
    await sleep(100);
  });

  // Helper function to create a client and its transport
  const createClientAndTransport = (
    privateKey: string,
    name: string,
    serverPublicKey: string,
  ) => {
    const client = new Client({ name, version: '1.0.0' });
    const clientNostrTransport = new NostrClientTransport({
      signer: new PrivateKeySigner(privateKey),
      relayHandler: new SimpleRelayPool([relayUrl]),
      serverPubkey: serverPublicKey,
      encryptionMode: EncryptionMode.DISABLED,
    });
    return { client, clientNostrTransport };
  };

  test('transport should correctly add price capabilities', async () => {
    const serverPrivateKey = TEST_PRIVATE_KEY;

    // Create a mock MCP server with tools and resources
    const server = new McpServer({
      name: 'Pricing Test Server',
      version: '1.0.0',
    });

    // Add test tools with pricing
    server.tool(
      'test-tool',
      {
        title: 'Test Tool',
        description: 'A test tool for pricing',
        inputSchema: { input: z.string() },
      },
      async ({ input }) => ({
        content: [{ type: 'text', text: `Processed: ${input}` }],
      }),
    );
    const pricing = new Map<string, PricingConfig>([
      ['test-tool', { price: 100, currency: 'sats' }],
    ]);
    const transport = new NostrServerTransport({
      signer: new PrivateKeySigner(serverPrivateKey),
      relayHandler: new SimpleRelayPool([relayUrl]),
      serverInfo: {
        name: 'Pricing Test Server',
      },
      capabilityPricing: { pricing },
    });

    await server.connect(transport);
    // Test tool pricing
    expect(transport.hasCapabilityPrice('test-tool')).toBe(true);
    expect(transport.getCapabilityPrice('test-tool')?.price).toBe(100);
    expect(transport.getCapabilityPrice('test-tool')?.currency).toBe('sats');

    // Test non-existent capability
    expect(transport.hasCapabilityPrice('non-existent')).toBe(false);
    expect(transport.getCapabilityPrice('non-existent')).toBeUndefined();

    await server.close();
  }, 10000);

  test('should send payment required notification for priced capabilities', async () => {
    const serverPrivateKey = TEST_PRIVATE_KEY;
    const serverPublicKey = getPublicKey(hexToBytes(serverPrivateKey));

    // Create a mock MCP server with tools and resources
    const server = new McpServer({
      name: 'Payment Test Server',
      version: '1.0.0',
    });

    // Add test tools with pricing
    server.tool(
      'paid-tool',
      {
        title: 'Paid Tool',
        description: 'A test tool that requires payment',
        inputSchema: { input: z.string() },
      },
      async ({ input }) => ({
        content: [{ type: 'text', text: `Processed: ${input}` }],
      }),
    );

    const pricing = new Map<string, PricingConfig>([
      ['paid-tool', { price: 500, currency: 'sats' }],
    ]);

    const transport = new NostrServerTransport({
      signer: new PrivateKeySigner(serverPrivateKey),
      relayHandler: new SimpleRelayPool([relayUrl]),
      serverInfo: {
        name: 'Payment Test Server',
      },
      capabilityPricing: { pricing },
    });

    await server.connect(transport);

    // Create client
    const clientPrivateKey = bytesToHex(generateSecretKey());
    const clientPublicKey = getPublicKey(hexToBytes(clientPrivateKey));

    const { client, clientNostrTransport } = createClientAndTransport(
      clientPrivateKey,
      'Payment Test Client',
      serverPublicKey,
    );

    // Connect client
    await client.connect(clientNostrTransport);

    // Set up subscription to listen for payment notifications
    const relayPool = new SimpleRelayPool([relayUrl]);
    await relayPool.connect();

    let paymentNotificationReceived = false;
    let paymentNotification: JSONRPCNotification | null = null;

    await relayPool.subscribe(
      [{ kinds: [CTXVM_MESSAGES_KIND], '#p': [clientPublicKey] }],
      (event) => {
        try {
          const content = JSON.parse(event.content) as JSONRPCNotification;
          if (content.method === 'payment_required') {
            paymentNotificationReceived = true;
            paymentNotification = content;
          }
        } catch (e) {
          // Ignore parsing errors
          console.error(e);
        }
      },
    );

    // Try to call the paid tool
    client.callTool({
      name: 'paid-tool',
    });

    // Wait for a short time to allow the notification to be processed
    await sleep(100);
    // Verify that payment notification was sent
    expect(paymentNotificationReceived).toBe(true);
    expect(paymentNotification).not.toBeNull();
    expect(paymentNotification!.method).toBe('payment_required');
    expect(paymentNotification!.params).toBeDefined();
    expect(paymentNotification!.params?.price).toBe(500);
    expect(paymentNotification!.params?.currency).toBe('sats');
  }, 15000);
});
