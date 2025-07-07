/**
 * CTXVM-specific event kinds.
 *
 * All CTXVM messages are ephemeral events.
 * @see https://github.com/nostr-protocol/nips/blob/master/01.md#kinds
 */
export const CTXVM_MESSAGES_KIND = 25910;

/**
 * Encrypted CTXVM messages using NIP-59 Gift Wrap.
 * @see https://github.com/nostr-protocol/nips/blob/master/59.md
 */
export const GIFT_WRAP_KIND = 1059;

/**
 * Addressable event for server announcements.
 */
export const SERVER_ANNOUNCEMENT_KIND = 31316;

/**
 * Addressable event for listing available tools.
 */
export const TOOLS_LIST_KIND = 31317;

/**
 * Addressable event for listing available resources.
 */
export const RESOURCES_LIST_KIND = 31318;

/**
 * Addressable event for listing available prompts.
 */
export const PROMPTS_LIST_KIND = 31319;

/**
 * CTXVM-specific Nostr event tags.
 */
export const NOSTR_TAGS = {
  /**
   * Unique server identifier, defined by the provider.
   */
  SERVER_ID: 'd',
  /**
   * Server identifier for targeting specific servers.
   */
  TARGET_SERVER_ID: 's',
  /**
   * Public key for addressing providers or clients.
   */
  PUBKEY: 'p',
  /**
   * Event ID for correlating requests and responses.
   */
  EVENT_ID: 'e',
  /**
   * MCP method for easy filtering and routing.
   */
  MCP_METHOD: 'method',
  /**
   * Capability tag for tools, resources, and prompts to provide pricing metadata.
   */
  CAPABILITY: 'cap',
} as const;
