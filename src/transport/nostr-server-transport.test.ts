import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  test,
  expect,
} from 'bun:test';
import type { Subprocess } from 'bun';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { NostrServerTransport } from './nostr-server-transport.js';
import { NostrClientTransport } from './nostr-client-transport.js';
import { PrivateKeySigner } from '../signer/private-key-signer.js';
import { SimpleRelayPool } from '../relay/simple-relay-pool.js';
import { generateSecretKey, getPublicKey, NostrEvent } from 'nostr-tools';
import { bytesToHex, hexToBytes } from 'nostr-tools/utils';
import { TEST_PRIVATE_KEY } from '../__mocks__/fixtures.js';
import { SERVER_ANNOUNCEMENT_KIND } from '../core/constants.js';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

const baseRelayPort = 7790; // Use a different port to avoid conflicts
const relayUrl = `ws://localhost:${baseRelayPort}`;

describe('NostrServerTransport', () => {
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
    await Bun.sleep(100);
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
    await Bun.sleep(100);
  });

  // Test cases will go here

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
    });
    return { client, clientNostrTransport };
  };

  test('should publish a server announcement event when isPublicServer is true', async () => {
    const serverPrivateKey = bytesToHex(generateSecretKey());
    const serverPublicKey = getPublicKey(hexToBytes(serverPrivateKey));

    // Create a mock MCP server
    const server = new McpServer({
      name: 'Test Server',
      version: '1.0.0',
    });

    const transport = new NostrServerTransport({
      signer: new PrivateKeySigner(serverPrivateKey),
      relayHandler: new SimpleRelayPool([relayUrl]),
      serverInfo: {
        name: 'Test Server',
        website: 'http://localhost',
      },
      isPublicServer: true,
    });

    await server.connect(transport);

    let announcementEvent: NostrEvent | null = null;
    const relayPool = new SimpleRelayPool([relayUrl]);
    await relayPool.connect();

    await relayPool.subscribe(
      [{ kinds: [SERVER_ANNOUNCEMENT_KIND], authors: [serverPublicKey] }],
      (event) => {
        announcementEvent = event;
      },
    );

    await Bun.sleep(100);

    expect(announcementEvent).toBeDefined();
    expect(announcementEvent!.kind).toBe(SERVER_ANNOUNCEMENT_KIND);
    expect(announcementEvent!.pubkey).toBe(serverPublicKey);
    expect(JSON.parse(announcementEvent!.content).serverInfo.name).toBe(
      'Test Server',
    );
    expect(
      JSON.parse(announcementEvent!.content).protocolVersion,
    ).toBeDefined();

    await server.close();
    await relayPool.disconnect();
  }, 5000);

  test('should allow connection for allowed public keys', async () => {
    const serverPrivateKey = TEST_PRIVATE_KEY;
    const serverPublicKey = getPublicKey(hexToBytes(serverPrivateKey));

    const allowedClientPrivateKey = bytesToHex(generateSecretKey());
    const allowedClientPublicKey = getPublicKey(
      hexToBytes(allowedClientPrivateKey),
    );

    const server = new McpServer({ name: 'Allowed Server', version: '1.0.0' });
    const allowedTransport = new NostrServerTransport({
      signer: new PrivateKeySigner(serverPrivateKey),
      relayHandler: new SimpleRelayPool([relayUrl]),
      allowedPublicKeys: [allowedClientPublicKey],
    });

    await server.connect(allowedTransport);

    const {
      client: allowedClient,
      clientNostrTransport: allowedClientNostrTransport,
    } = createClientAndTransport(
      allowedClientPrivateKey,
      'Allowed Client',
      serverPublicKey,
    );

    expect(
      allowedClient.connect(allowedClientNostrTransport),
    ).resolves.toBeUndefined();
    await allowedClient.close();
    await server.close();
  }, 10000);

  test('should not allow connection for disallowed public keys and timeout', async () => {
    const serverPrivateKey = TEST_PRIVATE_KEY;
    const serverPublicKey = getPublicKey(hexToBytes(serverPrivateKey));

    const allowedClientPublicKey = getPublicKey(
      hexToBytes(bytesToHex(generateSecretKey())), // Generate a dummy key for the allowed list
    );
    const disallowedClientPrivateKey = bytesToHex(generateSecretKey());

    const server = new McpServer({
      name: 'Disallowed Server',
      version: '1.0.0',
    });

    const allowedTransport = new NostrServerTransport({
      signer: new PrivateKeySigner(serverPrivateKey),
      relayHandler: new SimpleRelayPool([relayUrl]),
      allowedPublicKeys: [allowedClientPublicKey], // Only allow the dummy key
    });

    await server.connect(allowedTransport);

    const {
      client: disallowedClient,
      clientNostrTransport: disallowedClientNostrTransport,
    } = createClientAndTransport(
      disallowedClientPrivateKey,
      'Disallowed Client',
      serverPublicKey,
    );

    const timeoutPromise = new Promise<string>((resolve) => {
      Bun.sleep(1000).then(() => {
        resolve('timeout');
      });
    });

    const connectPromise = disallowedClient
      .connect(disallowedClientNostrTransport)
      .then(() => 'connected');

    const result = await Promise.race([connectPromise, timeoutPromise]);
    expect(result).toBe('timeout');
    await server.close();
  }, 10000);
});
