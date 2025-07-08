import { afterAll, beforeAll, describe, test, expect } from 'bun:test';
import type { Subprocess } from 'bun';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
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
} from '../__mocks__/mock-responses.js';
import { TEST_PRIVATE_KEY } from '../__mocks__/fixtures.js';

describe('NostrMCPProxy End-to-End Test', () => {
  let relayProcess: Subprocess;
  const relayPort = 7779;
  const relayUrl = `ws://localhost:${relayPort}`;

  const getProxyTransport = () => {
    return new StdioClientTransport({
      command: 'bun',
      args: ['src/proxy/proxy-server.ts'],
      env: {
        ...process.env,
        RELAY_URL: relayUrl,
        CLIENT_PRIVATE_KEY: TEST_PRIVATE_KEY,
        SERVER_PUBKEY: MOCK_SERVER_PUBLIC_KEY,
        SERVER_IDENTIFIER: MOCK_SERVER_IDENTIFIER,
      },
    });
  };

  beforeAll(async () => {
    // Start the mock relay
    relayProcess = Bun.spawn(['bun', 'src/__mocks__/mock-relay.ts'], {
      env: { ...process.env, PORT: `${relayPort}` },
      stdout: 'inherit',
      stderr: 'inherit',
    });

    // Wait for relay to start
    await Bun.sleep(200);
  });

  afterAll(() => {
    relayProcess?.kill();
  });

  test('should connect to proxy and initialize', async () => {
    const transport = getProxyTransport();

    const client = new Client({
      name: 'e2e-test-client',
      version: '1.0.0',
    });

    await client.connect(transport);
    console.log('Client connected');
    await client.close();
  }, 10000);

  test('should list prompts through proxy', async () => {
    const transport = getProxyTransport();

    const client = new Client({
      name: 'e2e-test-client',
      version: '1.0.0',
    });

    await client.connect(transport);
    const prompts = await client.listPrompts();
    expect(prompts).toEqual(mockedListPromptsReuslt);
    await client.close();
  }, 10000);

  test('should get a specific prompt through proxy', async () => {
    const transport = getProxyTransport();

    const client = new Client({
      name: 'e2e-test-client',
      version: '1.0.0',
    });

    await client.connect(transport);
    const prompt = await client.getPrompt({
      name: EXAMPLE_PROMPT_NAME,
      arguments: { arg1: 'test_value' },
    });
    expect(prompt).toEqual(mockedGetPromptResult);
    await client.close();
  }, 10000);

  test('should list resources through proxy', async () => {
    const transport = getProxyTransport();

    const client = new Client({
      name: 'e2e-test-client',
      version: '1.0.0',
    });

    await client.connect(transport);
    const resources = await client.listResources();
    expect(resources).toEqual({
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

  test('should read a resource through proxy', async () => {
    const transport = getProxyTransport();

    const client = new Client({
      name: 'e2e-test-client',
      version: '1.0.0',
    });

    await client.connect(transport);
    const resource = await client.readResource({
      uri: EXAMPLE_RESOURCE_URI,
    });
    expect(resource).toEqual(mockedReadResourceResult);
    await client.close();
  }, 10000);

  test('should list tools through proxy', async () => {
    const transport = getProxyTransport();

    const client = new Client({
      name: 'e2e-test-client',
      version: '1.0.0',
    });

    await client.connect(transport);
    const tools = await client.listTools();
    expect(tools).toEqual(mockedListToolResult);
    await client.close();
  }, 10000);

  test('should call a tool through proxy', async () => {
    const transport = getProxyTransport();

    const client = new Client({
      name: 'e2e-test-client',
      version: '1.0.0',
    });

    await client.connect(transport);
    const result = await client.callTool({
      name: EXAMPLE_TOOL_NAME,
      arguments: { arg1: 'tool_test_value' },
    });
    expect(result).toEqual(mockedCallToolResult);
    await client.close();
  }, 10000);

  test('should handle multiple concurrent requests through proxy', async () => {
    const transport = getProxyTransport();

    const client = new Client({
      name: 'e2e-test-client',
      version: '1.0.0',
    });

    await client.connect(transport);

    // Make multiple concurrent requests to test ID correlation
    const [prompts, resources, tools] = await Promise.all([
      client.listPrompts(),
      client.listResources(),
      client.listTools(),
    ]);

    expect(prompts).toEqual(mockedListPromptsReuslt);
    expect(resources.resources).toHaveLength(1);
    expect(tools).toEqual(mockedListToolResult);

    await client.close();
  }, 10000);
});
