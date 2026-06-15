import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Canonical message that a client signs when reporting an impression.
 *
 * Keeping this in shared guarantees the client-cli and the server build the
 * exact same byte string before HMAC, otherwise every impression would fail
 * verification.
 */
export function impressionSigningPayload(input: {
  campaignId: string;
  deviceId: string;
  nonce: string;
  durationMs: number;
}): string {
  return [input.campaignId, input.deviceId, input.nonce, String(input.durationMs)].join('.');
}

/** HMAC-SHA256, hex-encoded. */
export function hmacSign(secret: string, payload: string): string {
  return createHmac('sha256', secret).update(payload).digest('hex');
}

/** Constant-time comparison of two hex HMAC signatures. */
export function hmacVerify(secret: string, payload: string, signature: string): boolean {
  const expected = hmacSign(secret, payload);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length || a.length === 0) return false;
  return timingSafeEqual(a, b);
}

/** SHA-256 hex digest — used to store API keys / signing secrets at rest. */
export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Generate a URL-safe random token (default 32 bytes => 43 base64url chars). */
export function generateToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Hash an IP address with a salt for privacy-preserving storage. */
export function hashIp(ip: string, salt: string): string {
  return sha256(`${salt}:${ip}`);
}
