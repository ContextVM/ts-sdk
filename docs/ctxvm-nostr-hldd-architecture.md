# CTXVM Nostr Integration Architecture Design

## 1. Core Goal

To enable an existing MCP Host (e.g., a local CLI client) to interact with a remote MCP Server via the Nostr network, facilitated by a local `NostrMCPProxy` and a remote `NostrMCPGateway`.

## 2. Main Components

- **MCP Host**:
  - An external application (e.g., `modelcontextprotocol/sdk` client using `StdioClientTransport`) that expects to connect to a local MCP server. It's unaware of Nostr.

- **`NostrMCPProxy` (New Component)**:
  - It acts as an MCP Client (using an internal `NostrTransport` instance) to the `NostrMCPGateway`.
  - **Responsibility**: Bidirectionally proxy MCP messages between the `MCP Host` (via stdio) and the `NostrMCPGateway` (via Nostr). This includes serialization/deserialization of MCP messages into Nostr events and managing Nostr tags.
  - **Discovery Role**: Manages server discovery (public announcements) and client initialization (for private servers) on behalf of the `MCP Host`.

- **Nostr Relay**:
  - The standard Nostr network component serving as the communication backbone for all Nostr events.

- **`NostrMCPGateway` (New Component)**:
  - It listens, and receives Nostr events addressed to it, translates them into MCP messages, and forwards them to an `Original MCP Server`.
  - **Responsibility**: Converts incoming Nostr events into MCP messages for the internal `Original MCP Server`, and converts outgoing MCP messages (responses/notifications) from the `Original MCP Server` into Nostr events for publishing back to Nostr.
  - **Discovery Role**: Publishes server announcements and capability lists to the Nostr network.

- **Original MCP Server**:
  - The actual MCP server (e.g., a tool provider, resource exposer) that the `NostrMCPGateway` exposes capabilities from. It operates independently and communicates with the `NostrMCPGateway` via a standard MCP `Transport` interface (e.g., stdio transport if running locally to the gateway).

## 3. Communication Flow Overview

The communication between the `MCP Host` and the `Original MCP Server` will flow as follows:

1.  **MCP Host sends a request**: The `MCP Host` sends an MCP request (JSON-RPC) via its stdio `Transport` to the `NostrMCPProxy`.

2.  **`NostrMCPProxy` processes request**:
    - The `NostrMCPProxy` receives the MCP message.
    - It converts this MCP message into a Nostr event (`kind: 25910`), embedding the MCP message content and relevant Nostr tags (e.g., `p` tag targeting the `NostrMCPGateway`'s public key, `s` tag for the gateway's identifier).
    - It signs the Nostr event using its internal `NostrSigner`.
    - It publishes this signed Nostr event to the `Nostr Relay` via its internal `NostrTransport`.

3.  **Nostr Relay forwards event**: The `Nostr Relay` receives the event and, based on its subscription filters, forwards it to the `NostrMCPGateway`.

4.  **`NostrMCPGateway` processes request**:
    - The `NostrMCPGateway` was subscripbed to the relay with proper filters, and receives the Nostr event targeting it.
    - It converts the Nostr event back into an MCP message.
    - It forwards this MCP message to the `Original MCP Server` (via its configured `Transport`).

5.  **`Original MCP Server` provides response**: The `Original MCP Server` processes the request and sends an MCP response (JSON-RPC) back to the `NostrMCPGateway`.

6.  **`NostrMCPGateway` processes response**:
    - The `NostrMCPGateway` receives the MCP response from the `Original MCP Server`.
    - It converts this MCP response into a Nostr event (`kind: 25910`), including Nostr tags to target the original `NostrMCPProxy` (`p` tag for the proxy's public key, `e` tag referencing the original event request's `id` (not the json-rpc id, the id field of the request event)).
    - It signs the Nostr event using its internal `NostrSigner`.
    - It publishes this signed Nostr event to the `Nostr Relay`.

7.  **Nostr Relay forwards response**: The `Nostr Relay` receives the response event and forwards it to the `NostrMCPProxy`.

8.  **`NostrMCPProxy` delivers response**:
    - The `NostrMCPProxy` receives the Nostr event.
    - It converts the Nostr event back into an MCP response.
    - It sends this MCP response via stdio back to the `MCP Host`.

### Server Discovery and Announcements (Future iteration)

- **`NostrMCPGateway` Announcements**: The `NostrMCPGateway` will publish public server announcement events (`kind: 31316`) and capability listings (`kind: 31317-31319` for tools, resources, prompts) to the Nostr network. These events will contain metadata and the available capabilities of the `Original MCP Server`.
- **`NostrMCPProxy` Discovery**: The `NostrMCPProxy` will subscribe to these announcement events. When the `MCP Host` requests to list available capabilities (e.g., `tools/list`), the `NostrMCPProxy` will translate this into a Nostr query to the `NostrMCPGateway` (or use cached announcement data), and then present the results in an MCP-compatible format back to the `MCP Host`. For direct discovery of private servers, the standard MCP `initialize` request/response flow over Nostr (`kind: 25910`) will be used.

## 4. Architecture Diagram

```mermaid
graph TD
    subgraph Local Environment
        MCPHost((MCP Host))
        NostrMCPProxyCLI[`NostrMCPProxy` (CLI `mcp-nostr-proxy`)]
        LocalStdioTransport(Stdio Transport)
    end

    subgraph Nostr Network
        NostrRelay[Nostr Relay]
    end

    subgraph Remote Environment (Exposing Nostr MCP Server)
        NostrMCPGatewayCLI[`NostrMCPGateway` (CLI `mcp-nostr-gateway`)]
        OriginalMCPServer((Original MCP Server))
        NostrTransportGateway(Nostr Transport Adapter)
        GatewaySigner[Nostr Signer (Gateway)]
    end

    subgraph Communication via Nostr
        NostrTransportProxy(Nostr Transport Client)
        ProxySigner[Nostr Signer (Proxy)]
    end

    MCPHost -- JSON-RPC over Stdio --> LocalStdioTransport
    LocalStdioTransport <--> NostrMCPProxyCLI

    NostrMCPProxyCLI -- Uses NostrTransport (Client) --> NostrTransportProxy
    NostrTransportProxy <--> ProxySigner
    NostrTransportProxy -- Publishes/Subscribes Unencrypted Nostr Events (Kind 25910 & 3131x) --> NostrRelay

    NostrRelay -- Forwards Events --> NostrTransportGateway
    NostrTransportGateway <--> GatewaySigner
    NostrTransportGateway -- Adapts to MCP Server Interface --> NostrMCPGatewayCLI
    NostrMCPGatewayCLI <--> OriginalMCPServer

    %% Explanation of main interactions
    style MCPHost fill:#f9f,stroke:#333,stroke-width:2px;
    style OriginalMCPServer fill:#f9f,stroke:#333,stroke-width:2px;
    style NostrMCPProxyCLI fill:#bbf,stroke:#333,stroke-width:2px;
    style NostrMCPGatewayCLI fill:#bbf,stroke:#333,stroke-width:2px;
    style NostrRelay fill:#cfc,stroke:#333,stroke-width:2px;

    linkStyle 0 stroke:#00f,stroke-width:2px,fill:none;
    linkStyle 1 stroke:#00f,stroke-width:2px,fill:none;
    linkStyle 2 stroke:#008,stroke-width:2px,fill:none;
    linkStyle 3 stroke:#008,stroke-width:2px,fill:none;
    linkStyle 4 stroke:#008,stroke-width:2px,fill:none;
    linkStyle 5 stroke:#008,stroke-width:2px,fill:none;
```
