# @ctxvm/sdk: CTXVM Protocol SDK

A JavaScript/TypeScript SDK that implements the Context Vending Machine (CTXVM) Protocol, bridging Nostr and Model Context Protocol (MCP) to enable decentralized access and exposure of computational services.

## Overview

The CTXVM Protocol defines how Nostr and Model Context Machines can be used to expose MCP server capabilities, enabling standardized usage of these resources through a decentralized, cryptographically secure messaging system.

This SDK provides the necessary components to interact with the CTXVM Protocol:

- **Core Module**: Contains fundamental definitions, constants, interfaces, and utilities (e.g., encryption, serialization).
- **Transports**: Critical for communication, providing `NostrClientTransport` and `NostrServerTransport` implementations for enabling MCP over Nostr.
- **Proxy**: A client-side MCP server that connects to other servers through Nostr, exposing server capabilities locally. Particularly useful for clients that don't natively support Nostr transport.
- **Gateway**: Implements Nostr server transport, binding to another MCP server and exposing its capabilities through the Nostr network.
- **Relay**: Functionality for managing Nostr relays, abstracting relay interactions.
- **Signer**: Provides cryptographic signing capabilities required for Nostr events.

Both the Proxy and Gateway leverage Nostr transports, allowing existing MCP servers to maintain their conventional transports while gaining Nostr interoperability.

## Installation

This project requires [Bun](https://bun.sh/) (version 1.2.0 or higher).

1.  **Clone the repository:**

    ```bash
    git clone https://github.com/ContextVM/ts-sdk.git
    cd ts-sdk
    ```

2.  **Install dependencies:**

    ```bash
    bun install
    ```

3.  **Build the project:**
    ```bash
    bun run build
    ```

## Usage

The SDK provides methods for bridging MCP and Nostr. At its core, the SDK relies on Nostr transports and utilities to facilitate communication.

### Core Building Blocks: Signers and Relay Pools

The SDK provides default implementations: `PrivateKeySigner` implements the `NostrSigner` interface, and `SimpleRelayPool` implements the `RelayHandler` interface. You can extend the SDK's capabilities by creating custom implementations that satisfy these interfaces, allowing you to integrate with different signing mechanisms or relay management logic.ª

### Nostr Transports

The SDK provides specialized transports to send and receive MCP messages over the Nostr network.

#### `NostrClientTransport`

Used by MCP clients to connect to remote MCP servers exposed via Nostr.

```typescript
import { Client } from '@modelcontextprotocol/sdk/client';
import { NostrClientTransport } from '@ctxvm/sdk/transport';
import { EncryptionMode } from '@ctxvm/sdk/core';

// Public key of the target MCP server on Nostr
const REMOTE_SERVER_PUBKEY = 'remote_server_public_key_here';

const clientNostrTransport = new NostrClientTransport({
  signer: signer, // Your NostrSigner instance
  relayHandler: relayPool, // Your RelayHandler instance
  serverPubkey: REMOTE_SERVER_PUBKEY, // Public key of the target MCP server
  encryptionMode: EncryptionMode.OPTIONAL, // Optional: REQUIRED, OPTIONAL (default), or DISABLED
});

const mcpClient = new Client();

// To connect the MCP client:
await mcpClient.connect(clientNostrTransport);
// Subsequent MCP calls (e.g., listTools, callTool) would use this transport.
await mcpClient.listTools();
// await mcpClient.close();
```

#### `NostrServerTransport`

Used by MCP servers to expose their capabilities to Nostr clients.

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server';
import { NostrServerTransport } from '@ctxvm/sdk/transport';
import { EncryptionMode } from '@ctxvm/sdk/core';
// Assume signer and relayPool are configured as shown above.

const server = new McpServer({
  name: 'demo-server',
  version: '1.0.0',
});

// Before connecting, register your MCP server's capabilities.

const serverNostrTransport = new NostrServerTransport({
  signer: signer, // Server's NostrSigner instance
  relayHandler: relayPool, // Server's RelayHandler instance
  isPublicServer: true, // Optional: set to true to announce server capabilities via Nostr events
  encryptionMode: EncryptionMode.OPTIONAL, // Optional: REQUIRED, OPTIONAL (default), or DISABLED
  serverInfo: {
    // Optional: Information for public announcements
    name: 'Nostr MCP Example Server',
    website: 'https://example.com/mcp-server',
  },
});

// To connect the MCP server and make it available via Nostr:
await mcpServer.connect(serverNostrTransport);
// This will keep the server running and listening for Nostr events.
// To gracefully shut down: await mcpServer.close();
```

### Bridging Components: Proxy and Gateway

The SDK also provides higher-level components that leverage these transports to bridge conventional MCP setups with Nostr.

#### `NostrMCPProxy` (Client-Side Bridge)

Allows an MCP client (e.g., a local application communicating via a mcp transport) to communicate with a remote MCP server over Nostr. The proxy acts as a translation layer, using `NostrClientTransport` internally.

```typescript
import { StdioServerTransport } from '@modelcontextprotocol/sdk/stdio';
import { NostrMCPProxy } from '@ctxvm/sdk/proxy';

// This transport represents the connection between your local MCP client and the proxy.
const hostTransport = new StdioServerTransport();

const proxy = new NostrMCPProxy({
  mcpHostTransport: hostTransport, // Your local client's transport
  nostrTransportOptions: {
    signer: signer,
    relayHandler: relayPool,
    serverPubkey: REMOTE_SERVER_PUBKEY, // Target the remote MCP server public key via Nostr
  },
});

// To start the proxy:
await proxy.start();
```

#### `NostrMCPGateway` (Server-Side Bridge)

Allows an existing MCP server (e.g., communicating via a mcp transport) to expose its capabilities through Nostr. The gateway uses `NostrServerTransport` internally.

```typescript
import { StdioClientTransport } from '@modelcontextprotocol/sdk/stdio';
import { NostrMCPGateway } from '@ctxvm/sdk/gateway';

// This transport defines how the Gateway connects to your traditional MCP server.
const serverTransport = new StdioClientTransport({
  command: 'bun',
  args: ['path/to/your/mcp-server.ts'],
});

const gateway = new NostrMCPGateway({
  mcpServerTransport: serverTransport, // Your existing MCP server's transport
  nostrTransportOptions: {
    signer: signer,
    relayHandler: relayPool,
    isPublicServer: true, // Set to true to announce server capabilities to Nostr clients for discovery
  },
});

// To start the gateway and expose your MCP server to Nostr clients:
await gateway.start();
// The gateway will run indefinitely, relaying messages between Nostr and your MCP server.
```

## Running Tests

To run the test suite, use Bun:

```bash
bun tests
```
