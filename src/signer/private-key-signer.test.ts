import { test, expect, beforeAll, describe } from 'bun:test';
import { bytesToHex } from '@noble/hashes/utils';
import {
  generateSecretKey,
  getPublicKey,
  finalizeEvent,
  type UnsignedEvent,
} from 'nostr-tools';
import { PrivateKeySigner } from './private-key-signer.js';

describe('PrivateKeySigner', () => {
  const privateKey = generateSecretKey();
  const privateKeyHex = bytesToHex(privateKey);
  const publicKeyHex = getPublicKey(privateKey);
  let signer: PrivateKeySigner;

  beforeAll(() => {
    signer = new PrivateKeySigner(privateKeyHex);
  });

  test('constructor correctly initializes privateKey and publicKey', async () => {
    expect(signer['privateKey']).toEqual(
      Uint8Array.from(Buffer.from(privateKeyHex, 'hex')),
    );
    expect(await signer.getPublicKey()).toBe(publicKeyHex);
  });

  test('getSecretKey() returns the correct private key', async () => {
    const secretKey = await signer.getSecretKey();
    expect(secretKey).toEqual(
      Uint8Array.from(Buffer.from(privateKeyHex, 'hex')),
    );
  });

  test('getPublicKey() returns the correct public key', async () => {
    const publicKey = await signer.getPublicKey();
    expect(publicKey).toBe(publicKeyHex);
  });

  test('signEvent() correctly signs an UnsignedEvent', async () => {
    const unsignedEvent: UnsignedEvent = {
      kind: 1,
      pubkey: publicKeyHex,
      created_at: Math.floor(Date.now() / 1000),
      tags: [],
      content: 'Hello Nostr!',
    };

    const signedEvent = await signer.signEvent(unsignedEvent);

    expect(signedEvent).toEqual(
      finalizeEvent(
        unsignedEvent,
        Uint8Array.from(Buffer.from(privateKeyHex, 'hex')),
      ),
    );
  });
});
