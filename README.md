# ContextVM SDK

A JavaScript/TypeScript SDK that implements the Context Vending Machine Protocol, bridging Nostr and Model Context Protocol (MCP) to enable decentralized access and exposure of computational services.

## Overview

The ContextVM Protocol defines how Nostr and Model Context Machines can be used to expose MCP server capabilities, enabling standardized usage of these resources through a decentralized, cryptographically secure messaging system.

This SDK provides the necessary components to interact with the ContextVM Protocol:

- **Core Module**: Contains fundamental definitions, constants, interfaces, and utilities (e.g., encryption, serialization).
- **Transports**: Critical for communication, providing `NostrClientTransport` and `NostrServerTransport` implementations for enabling MCP over Nostr.
- **Proxy**: A client-side MCP server that connects to other servers through Nostr, exposing server capabilities locally. Particularly useful for clients that don't natively support Nostr transport.
- **Gateway**: Implements Nostr server transport, binding to another MCP server and exposing its capabilities through the Nostr network.
- **Relay**: Functionality for managing Nostr relays, abstracting relay interactions.
- **Signer**: Provides cryptographic signing capabilities required for Nostr events.

Both the Proxy and Gateway leverage Nostr transports, allowing existing MCP servers to maintain their conventional transports while gaining Nostr interoperability.

## Installation

```bash
npm install @contextvm/sdk
```

**Note:** You can use your preferred package manager to install the SDK.

## Usage

Visit the [ContextVM documentation](https://contextvm.org) for information on how to use ContextVM.

## Development

This project requires [Bun](https://bun.sh/) (version 1.2.0 or higher).

1. Clone the repository:

```bash
git clone https://github.com/ContextVM/ts-sdk.git
cd ts-sdk
```

2. Install dependencies:

```bash
bun install
```

### Running Tests

To run the test suite, use Bun:

```bash
bun tests
```
