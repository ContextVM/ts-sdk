import { hexToBytes } from '@noble/hashes/utils';
import {
  finalizeEvent,
  getPublicKey,
  type NostrEvent,
  type UnsignedEvent,
} from 'nostr-tools';
import { NostrSigner } from '../core/interfaces.js';

/**
 * A signer that uses a private key to sign events.
 * @argument privateKey - The private key to use for signing.
 * @returns A signer that uses the provided private key to sign events.
 */
export class PrivateKeySigner implements NostrSigner {
  private readonly privateKey: Uint8Array;
  private readonly publicKey: string;

  constructor(privateKey: string) {
    this.privateKey = hexToBytes(privateKey);
    this.publicKey = getPublicKey(this.privateKey);
  }

  async getSecretKey(): Promise<Uint8Array> {
    return this.privateKey;
  }

  async getPublicKey(): Promise<string> {
    return this.publicKey;
  }

  async signEvent(event: UnsignedEvent): Promise<NostrEvent> {
    return finalizeEvent(event, this.privateKey);
  }
}
