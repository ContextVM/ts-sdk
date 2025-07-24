import {
  JSONRPCMessage,
  JSONRPCMessageSchema,
} from '@modelcontextprotocol/sdk/types.js';
import { MAX_MESSAGE_SIZE } from '../constants.js';

/**
 * Sleeps for a specified number of milliseconds.
 * @param ms The number of milliseconds to sleep.
 * @returns A promise that resolves after the specified number of milliseconds.
 */
export const sleep = (ms: number) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Validates message size
 */
export function validateMessageSize(message: string): boolean {
  const size = new Blob([message]).size;
  return size <= MAX_MESSAGE_SIZE;
}

/**
 * Validates a message using the MCP SDK's schema
 */
export function validateMessage(message: unknown): JSONRPCMessage | null {
  try {
    return JSONRPCMessageSchema.parse(message);
  } catch {
    return null;
  }
}
