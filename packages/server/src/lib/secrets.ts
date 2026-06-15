import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

/**
 * Envelope encryption for the developer signing secret at rest.
 *
 * The signing secret is a *symmetric* HMAC key: the server must hold the actual
 * key material to recompute an impression's HMAC, so — unlike the API key — it
 * cannot be stored as a one-way hash. Storing it in plaintext means a database
 * leak lets an attacker forge impression signatures and mint earnings. We wrap
 * it with AES-256-GCM under a master key (`SECRET_ENC_KEY`, ideally sourced from
 * a KMS / secrets manager in production).
 *
 * The encoding is self-describing: ciphertext carries the `enc:v1:` prefix.
 * `decryptSecret` returns any value without that prefix untouched, so:
 *   - dev/test (no master key) keep storing plaintext — zero-config still works;
 *   - existing plaintext rows keep verifying after the key is introduced;
 *   - a future `enc:v2:` scheme can be added without a data migration.
 */

const PREFIX = 'enc:v1:';

/** Derive a fixed 32-byte AES key from an arbitrary-length master secret. */
function deriveKey(masterKey: string): Buffer {
  return createHash('sha256').update(masterKey).digest();
}

/**
 * Encrypt a signing secret for storage. With no master key configured the
 * value is returned as-is (development / test convenience).
 */
export function encryptSecret(plaintext: string, masterKey: string): string {
  if (!masterKey) return plaintext;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', deriveKey(masterKey), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return (
    PREFIX +
    [iv.toString('base64'), ciphertext.toString('base64'), tag.toString('base64')].join('.')
  );
}

/**
 * Decrypt a stored signing secret back to its plaintext HMAC key. Values that
 * were never encrypted (no `enc:v1:` prefix) pass through unchanged.
 */
export function decryptSecret(stored: string, masterKey: string): string {
  if (!stored.startsWith(PREFIX)) return stored;
  if (!masterKey) {
    throw new Error('SECRET_ENC_KEY is required to decrypt an encrypted signing secret');
  }
  const [ivB64, ctB64, tagB64] = stored.slice(PREFIX.length).split('.');
  if (!ivB64 || !ctB64 || !tagB64) {
    throw new Error('Malformed encrypted signing secret');
  }
  const decipher = createDecipheriv('aes-256-gcm', deriveKey(masterKey), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, 'base64')),
    decipher.final(),
  ]);
  return plaintext.toString('utf8');
}
