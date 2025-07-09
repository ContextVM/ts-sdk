import { afterAll, beforeAll, describe, test, expect } from 'bun:test';
import type { Subprocess } from 'bun';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { TEST_PRIVATE_KEY } from '../__mocks__/fixtures.js';
import { NostrMCPGateway } from './index.js';
import { NostrTransport } from '../transport/nostr-client-transport.js';
import { PrivateKeySigner } from '../signer/private-key-signer.js';
import { SimpleRelayPool } from '../relay/simple-relay-pool.js';
import { getPublicKey } from 'nostr-tools';
import { hexToBytes } from 'nostr-tools/utils';

describe('NostrMCPGateway End-to-End Test', () => {
  let relayProcess: Subprocess;
  let gateway: NostrMCPGateway;

  const relayPort = 7780;
  const relayUrl = `ws://localhost:${relayPort}`;

  // Generate a test private key for the gateway
  const gatewayPrivateKey = TEST_PRIVATE_KEY;
  const gatewayPublicKey = getPublicKey(hexToBytes(gatewayPrivateKey));

  // Generate a different private key for the client
  const clientPrivateKey = 'a'.repeat(64);

  beforeAll(async () => {
    // Start the mock relay
    relayProcess = Bun.spawn(['bun', 'src/__mocks__/mock-relay.ts'], {
      env: {
        ...process.env,
        PORT: `${relayPort}`,
        DISABLE_MOCK_RESPONSES: 'true',
      },
      stdout: 'inherit',
      stderr: 'inherit',
    });

    // Wait for relay to start
    await Bun.sleep(200);

    // Create the gateway with the mock server transport
    const mcpServerTransport = new StdioClientTransport({
      command: 'bun',
      args: ['src/__mocks__/mock-mcp-server.ts'],
    });

    const gatewaySigner = new PrivateKeySigner(gatewayPrivateKey);
    const gatewayRelayHandler = new SimpleRelayPool([relayUrl]);

    gateway = new NostrMCPGateway({
      mcpServerTransport,
      nostrTransportOptions: {
        signer: gatewaySigner,
        relayHandler: gatewayRelayHandler,
      },
    });

    // Start the gateway
    console.log('Starting gateway...');
    await gateway.start();
    console.log('Gateway started, waiting for readiness...');

    // Wait for gateway to be ready
    await Bun.sleep(200);
    console.log('Gateway should be ready now');
    console.log('Gateway public key:', gatewayPublicKey);
    console.log(
      'Client public key:',
      getPublicKey(hexToBytes(clientPrivateKey)),
    );
  });

  afterAll(async () => {
    // Stop the gateway
    if (gateway) {
      await gateway.stop();
    }

    // Kill processes
    relayProcess?.kill();

    // Wait for cleanup
    await Bun.sleep(100);
  });

  const createClientTransport = (): NostrTransport => {
    const clientSigner = new PrivateKeySigner(clientPrivateKey);
    const clientRelayHandler = new SimpleRelayPool([relayUrl]);

    return new NostrTransport({
      signer: clientSigner,
      relayHandler: clientRelayHandler,
      serverPubkey: gatewayPublicKey,
    });
  };

  test('should connect to gateway and initialize', async () => {
    const transport = createClientTransport();

    const client = new Client({
      name: 'e2e-test-client',
      version: '1.0.0',
    });

    await client.connect(transport);
    console.log('Client connected to gateway');

    // Verify gateway is active
    expect(gateway.isActive()).toBe(true);

    await client.close();
  }, 10000);

  test('should list tools through gateway', async () => {
    const transport = createClientTransport();
    const client = new Client({
      name: 'tools-test-client',
      version: '1.0.0',
    });

    await client.connect(transport);

    // List tools from the mock MCP server
    const tools = await client.listTools();
    expect(tools).toBeDefined();
    expect(tools.tools).toBeDefined();

    // Verify the mock server provides expected tools
    const toolNames = tools.tools.map((tool) => tool.name);
    expect(toolNames).toContain('add');

    await client.close();
  }, 10000);
});
