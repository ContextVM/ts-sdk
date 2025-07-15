import { nip44 } from 'nostr-tools';
import {
  finalizeEvent,
  generateSecretKey,
  getPublicKey,
  NostrEvent,
} from 'nostr-tools/pure';
import { GIFT_WRAP_KIND, NOSTR_TAGS } from './constants.js';

/**
 * Encrypts a JSON-RPC message using a simplified NIP-17/NIP-59 gift wrap scheme.
 * The message is encrypted with NIP-44 and wrapped in a kind 1059 event.
 * @param message The JSON-RPC message to encrypt.
 * @param recipientPublicKey The public key of the recipient.
 * @returns The encrypted gift wrap event.
 */
export function encryptMessage(
  message: string,
  recipientPublicKey: string,
): NostrEvent {
  const giftWrapPrivateKey = generateSecretKey();
  const giftWrapPublicKey = getPublicKey(giftWrapPrivateKey);
  const conversationKey = nip44.v2.utils.getConversationKey(
    giftWrapPrivateKey,
    recipientPublicKey,
  );
  const encryptedContent = nip44.v2.encrypt(message, conversationKey);
  const giftWrap = {
    kind: GIFT_WRAP_KIND,
    content: encryptedContent,
    tags: [[NOSTR_TAGS.PUBKEY, recipientPublicKey]],
    created_at: Math.floor(Date.now() / 1000),
    pubkey: giftWrapPublicKey,
  };

  return finalizeEvent(giftWrap, giftWrapPrivateKey);
}

/**
 * Decrypts a gift-wrapped Nostr event.
 * @param event The gift wrap event (kind 1059).
 * @param recipientPrivateKey The private key of the recipient.
 * @returns The decrypted message content.
 * @throws If the event is not a valid gift wrap or decryption fails.
 */
export function decryptMessage(
  event: NostrEvent,
  recipientPrivateKey: Uint8Array,
): string {
  if (event.kind !== GIFT_WRAP_KIND) {
    throw new Error('Event is not a gift wrap.');
  }

  const conversationKey = nip44.v2.utils.getConversationKey(
    recipientPrivateKey,
    event.pubkey,
  );
  const decryptedMsg = nip44.v2.decrypt(event.content, conversationKey);
  return decryptedMsg;
}
