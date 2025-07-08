import { afterAll, beforeAll, describe, test, expect } from 'bun:test';
import type { Subprocess } from 'bun';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { PrivateKeySigner } from './signer/private-key-signer.js';
import { SimpleRelayPool } from './relay/simple-relay-pool.js';
import { NostrTransport } from './transport.js';
import {
  MOCK_SERVER_IDENTIFIER,
  MOCK_SERVER_PUBLIC_KEY,
  EXAMPLE_PROMPT_NAME,
  EXAMPLE_RESOURCE_URI,
  EXAMPLE_TOOL_NAME,
  mockedListToolResult,
  mockedListPromptsReuslt,
  mockedGetPromptResult,
  mockedReadResourceResult,
  mockedCallToolResult,
} from './__mocks__/mock-responses.js';
import { TEST_PRIVATE_KEY } from './__mocks__/fixtures.js';

describe('NostrTransport Integration Test', () => {
  let relayProcess: Subprocess;
  const relayPort = 7778;
  const relayUrl = `ws://localhost:${relayPort}`;

  beforeAll(async () => {
    relayProcess = Bun.spawn(['bun', 'src/__mocks__/mock-relay.ts'], {
      env: { ...process.env, PORT: `${relayPort}` },
      stdout: 'inherit',
    });
    // Wait for the relay to start
    await Bun.sleep(100);
  });

  afterAll(() => {
    relayProcess.kill();
  });

  test('should connect and handle a simple request', async () => {
    const signer = new PrivateKeySigner(TEST_PRIVATE_KEY);
    const relayPool = new SimpleRelayPool([relayUrl]);

    const transport = new NostrTransport({
      signer,
      relayHandler: relayPool,
      serverPubkey: MOCK_SERVER_PUBLIC_KEY,
      serverIdentifier: MOCK_SERVER_IDENTIFIER,
    });

    const client = new Client({
      name: 'test-client',
      version: '0.0.1',
    });

    await client.connect(transport);
    await client.close();
  }, 10000);

  test('should not connect if serverPubkey is incorrect (expect timeout)', async () => {
    const signer = new PrivateKeySigner(TEST_PRIVATE_KEY);
    const relayPool = new SimpleRelayPool([relayUrl]);

    const incorrectServerPubkey =
      'a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1a1';

    const transport = new NostrTransport({
      signer,
      relayHandler: relayPool,
      serverPubkey: incorrectServerPubkey,
      serverIdentifier: 'test-server',
    });

    const client = new Client({
      name: 'test-client',
      version: '0.0.1',
    });

    expect(client.connect(transport)).rejects.toThrow();
    await client.close();
  }, 10000);

  test('should not connect if serverIdentifier is incorrect (expect timeout)', async () => {
    const signer = new PrivateKeySigner(TEST_PRIVATE_KEY);
    const relayPool = new SimpleRelayPool([relayUrl]);

    const transport = new NostrTransport({
      signer,
      relayHandler: relayPool,
      serverPubkey: MOCK_SERVER_PUBLIC_KEY,
      serverIdentifier: 'incorrect-identifier',
    });

    const client = new Client({
      name: 'test-client',
      version: '0.0.1',
    });

    expect(client.connect(transport)).rejects.toThrow();
    await client.close();
  }, 10000);

  test('should list prompts', async () => {
    const signer = new PrivateKeySigner(TEST_PRIVATE_KEY);
    const relayPool = new SimpleRelayPool([relayUrl]);

    const transport = new NostrTransport({
      signer,
      relayHandler: relayPool,
      serverPubkey: MOCK_SERVER_PUBLIC_KEY,
      serverIdentifier: MOCK_SERVER_IDENTIFIER,
    });

    const client = new Client({
      name: 'test-client',
      version: '0.0.1',
    });

    await client.connect(transport);
    const promptsResponse = await client.listPrompts();
    expect(promptsResponse).toEqual(mockedListPromptsReuslt);
    await client.close();
  }, 10000);

  test('should get a specific prompt', async () => {
    const signer = new PrivateKeySigner(TEST_PRIVATE_KEY);
    const relayPool = new SimpleRelayPool([relayUrl]);

    const transport = new NostrTransport({
      signer,
      relayHandler: relayPool,
      serverPubkey: MOCK_SERVER_PUBLIC_KEY,
      serverIdentifier: MOCK_SERVER_IDENTIFIER,
    });

    const client = new Client({
      name: 'test-client',
      version: '0.0.1',
    });

    await client.connect(transport);

    const prompt = await client.getPrompt({
      name: EXAMPLE_PROMPT_NAME,
      arguments: { arg1: 'test_value' },
    });

    expect(prompt).toEqual(mockedGetPromptResult);
    await client.close();
  }, 10000);

  test('should list resources', async () => {
    const signer = new PrivateKeySigner(TEST_PRIVATE_KEY);
    const relayPool = new SimpleRelayPool([relayUrl]);

    const transport = new NostrTransport({
      signer,
      relayHandler: relayPool,
      serverPubkey: MOCK_SERVER_PUBLIC_KEY,
      serverIdentifier: MOCK_SERVER_IDENTIFIER,
    });

    const client = new Client({
      name: 'test-client',
      version: '0.0.1',
    });

    await client.connect(transport);
    const resourcesResponse = await client.listResources();
    expect(resourcesResponse).toEqual({
      resources: [
        {
          uri: EXAMPLE_RESOURCE_URI,
          name: 'example.txt',
          title: 'Example Text File',
          description: 'A mock resource for testing purposes',
          mimeType: 'text/plain',
        },
      ],
      nextCursor: undefined,
    });
    await client.close();
  }, 10000);

  test('should read a specific resource', async () => {
    const signer = new PrivateKeySigner(TEST_PRIVATE_KEY);
    const relayPool = new SimpleRelayPool([relayUrl]);

    const transport = new NostrTransport({
      signer,
      relayHandler: relayPool,
      serverPubkey: MOCK_SERVER_PUBLIC_KEY,
      serverIdentifier: MOCK_SERVER_IDENTIFIER,
    });

    const client = new Client({
      name: 'test-client',
      version: '0.0.1',
    });

    await client.connect(transport);
    const resourceContent = await client.readResource({
      uri: EXAMPLE_RESOURCE_URI,
    });
    expect(resourceContent).toEqual(mockedReadResourceResult);
    await client.close();
  }, 10000);

  test('should list tools', async () => {
    const signer = new PrivateKeySigner(TEST_PRIVATE_KEY);
    const relayPool = new SimpleRelayPool([relayUrl]);

    const transport = new NostrTransport({
      signer,
      relayHandler: relayPool,
      serverPubkey: MOCK_SERVER_PUBLIC_KEY,
      serverIdentifier: MOCK_SERVER_IDENTIFIER,
    });

    const client = new Client({
      name: 'test-client',
      version: '0.0.1',
    });

    await client.connect(transport);
    const resourcesResponse = await client.listTools();
    expect(resourcesResponse).toEqual(mockedListToolResult);
    await client.close();
  }, 10000);

  test('should call a tool', async () => {
    const signer = new PrivateKeySigner(TEST_PRIVATE_KEY);
    const relayPool = new SimpleRelayPool([relayUrl]);

    const transport = new NostrTransport({
      signer,
      relayHandler: relayPool,
      serverPubkey: MOCK_SERVER_PUBLIC_KEY,
      serverIdentifier: MOCK_SERVER_IDENTIFIER,
    });

    const client = new Client({
      name: 'test-client',
      version: '0.0.1',
    });

    await client.connect(transport);
    const result = await client.callTool({
      name: EXAMPLE_TOOL_NAME,
      arguments: { arg1: 'tool_test_value' },
    });
    expect(result).toEqual(mockedCallToolResult);
    await client.close();
  }, 10000);
});
