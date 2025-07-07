import {
  CallToolResult,
  GetPromptResult,
  InitializeResult,
  JSONRPCResponse,
  ListPromptsResult,
  ListResourcesResult,
  ListToolsResult,
  ReadResourceResult,
} from '@modelcontextprotocol/sdk/types.js';
import type { NostrEvent, UnsignedEvent } from 'nostr-tools';
import { finalizeEvent } from 'nostr-tools';
import { hexToBytes } from 'nostr-tools/utils';

// A dummy private key for the mock server to sign events.
const MOCK_SERVER_PRIVATE_KEY_HEX =
  'dd6db7f15d05ac8014f2c809be0a5123627917c961c2412117f0c8b66d7797ec';
export const MOCK_SERVER_PUBLIC_KEY =
  'b2a35f0fe5f64e0764c131bd58c987ff87837a9a1dcab7f922ec2edeae3d33de';
export const MOCK_SERVER_IDENTIFIER = 'mock-server-identifier';
/**
 * Creates a Nostr event envelope for a response.
 * @param requestEvent The original request event to reply to.
 * @param content The MCP content of the response.
 * @returns A signed Nostr event.
 */
const createResponseEvent = (
  requestEvent: NostrEvent,
  content: object,
): NostrEvent => {
  const unsignedEvent: UnsignedEvent = {
    kind: 25910,
    pubkey: MOCK_SERVER_PUBLIC_KEY,
    created_at: Math.floor(Date.now() / 1000),
    tags: [
      ['e', requestEvent.id],
      ['p', requestEvent.pubkey],
      ['d', MOCK_SERVER_IDENTIFIER],
    ],
    content: JSON.stringify(content),
  };

  return finalizeEvent(unsignedEvent, hexToBytes(MOCK_SERVER_PRIVATE_KEY_HEX));
};

/**
 * Generates a response for the 'initialize' method.
 * @param requestEvent The initialize request event.
 * @returns A signed Nostr event containing the initialize response.
 */
export const EXAMPLE_PROMPT_NAME = 'example-prompt';
export const EXAMPLE_RESOURCE_URI = 'file:///example.txt';
export const EXAMPLE_TOOL_NAME = 'example-tool';

export const mockedInitializeResult: InitializeResult = {
  protocolVersion: '2025-06-18',
  capabilities: {
    logging: {},
    prompts: {
      listChanged: true,
    },
    resources: {
      subscribe: true,
      listChanged: true,
    },
    tools: {
      listChanged: true,
    },
  },
  serverInfo: {
    name: 'MockServer',
    version: '1.0.0',
  },
  instructions: 'Welcome to the mock server.',
};

export const getInitializeResponse = (requestEvent: NostrEvent): NostrEvent => {
  const requestContent = JSON.parse(requestEvent.content);

  const responseContent: JSONRPCResponse = {
    jsonrpc: '2.0',
    id: requestContent.id,
    result: mockedInitializeResult,
  };
  return createResponseEvent(requestEvent, responseContent);
};

export const mockedListPromptsReuslt: ListPromptsResult = {
  prompts: [
    {
      name: EXAMPLE_PROMPT_NAME,
      title: 'Example Prompt',
      description: 'A mock prompt for testing purposes',
      arguments: [
        {
          name: 'arg1',
          type: 'string',
          description: 'An example argument',
        },
      ],
    },
  ],
  nextCursor: undefined,
};

export const listPromptsResponse = (requestEvent: NostrEvent): NostrEvent => {
  const requestContent = JSON.parse(requestEvent.content);

  const responseContent: JSONRPCResponse = {
    jsonrpc: '2.0',
    id: requestContent.id,
    result: mockedListPromptsReuslt,
  };
  return createResponseEvent(requestEvent, responseContent);
};

export const mockedGetPromptResult: GetPromptResult = {
  description: 'Mock prompt content.',
  messages: [
    {
      role: 'user',
      content: {
        type: 'text',
        text: `Content for get prompt request`,
      },
    },
  ],
};

export const getPromptResponse = (requestEvent: NostrEvent): NostrEvent => {
  const requestContent = JSON.parse(requestEvent.content);

  const responseContent: JSONRPCResponse = {
    jsonrpc: '2.0',
    id: requestContent.id,
    result: mockedGetPromptResult,
  };
  return createResponseEvent(requestEvent, responseContent);
};

export const mockedListResourcesResult: ListResourcesResult = {
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
};

export const listResourcesResponse = (requestEvent: NostrEvent): NostrEvent => {
  const requestContent = JSON.parse(requestEvent.content);

  const responseContent: JSONRPCResponse = {
    jsonrpc: '2.0',
    id: requestContent.id,
    result: mockedListResourcesResult,
  };
  return createResponseEvent(requestEvent, responseContent);
};

export const mockedReadResourceResult: ReadResourceResult = {
  contents: [
    {
      uri: EXAMPLE_RESOURCE_URI,
      name: 'example.txt',
      title: 'Example Text File',
      mimeType: 'text/plain',
      text: 'This is the content of the example.txt file.',
    },
  ],
};

export const readResourceResponse = (requestEvent: NostrEvent): NostrEvent => {
  const requestContent = JSON.parse(requestEvent.content);

  const responseContent: JSONRPCResponse = {
    jsonrpc: '2.0',
    id: requestContent.id,
    result: mockedReadResourceResult,
  };
  return createResponseEvent(requestEvent, responseContent);
};

export const mockedListToolResult: ListToolsResult = {
  tools: [
    {
      name: EXAMPLE_TOOL_NAME,
      title: 'Weather Information Provider',
      description: 'Get current weather information for a location',
      inputSchema: {
        type: 'object',
        properties: {
          location: {
            type: 'string',
            description: 'City name or zip code',
          },
        },
        required: ['location'],
      },
    },
  ],
  nextCursor: 'next-page-cursor',
};

export const listToolsResponse = (requestEvent: NostrEvent): NostrEvent => {
  const requestContent = JSON.parse(requestEvent.content);

  const responseContent: JSONRPCResponse = {
    jsonrpc: '2.0',
    id: requestContent.id,
    result: mockedListToolResult,
  };
  return createResponseEvent(requestEvent, responseContent);
};

export const mockedCallToolResult: CallToolResult = {
  content: [
    {
      type: 'text',
      text: `Call Tool Result`,
    },
  ],
  isError: false,
};

export const callToolResponse = (requestEvent: NostrEvent): NostrEvent => {
  const requestContent = JSON.parse(requestEvent.content);

  const responseContent: JSONRPCResponse = {
    jsonrpc: '2.0',
    id: requestContent.id,
    result: mockedCallToolResult,
  };
  return createResponseEvent(requestEvent, responseContent);
};

// Central dispatcher for all mock responses
type MockResponseHandler = (requestEvent: NostrEvent) => NostrEvent | undefined;

const mockResponseHandlers: Record<string, MockResponseHandler> = {
  initialize: getInitializeResponse,
  'prompts/list': listPromptsResponse,
  'prompts/get': getPromptResponse,
  'resources/list': listResourcesResponse,
  'resources/read': readResourceResponse,
  'tools/list': listToolsResponse,
  'tools/call': callToolResponse,
};

export const getResponse = (
  requestEvent: NostrEvent,
): NostrEvent | undefined => {
  const requestContent = JSON.parse(requestEvent.content);
  const method = requestContent.method;
  const handler = mockResponseHandlers[method];
  if (handler) {
    return handler(requestEvent);
  }
  return undefined;
};
