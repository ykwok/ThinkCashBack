import { createHmac, randomUUID } from "crypto";
import { ImpressionPayload } from "../types";

/** Generate a fresh nonce (UUID v4) for an impression report. */
export function generateNonce(): string {
  return randomUUID();
}

/**
 * Compute the HMAC-SHA256 signature for an impression.
 *
 * The signed message is a deterministic, ordered join of the impression
 * fields (excluding the signature itself). Both client and backend must
 * build the message the same way, so the field order here is part of the
 * API contract.
 */
export function signImpression(
  fields: Omit<ImpressionPayload, "signature">,
  signingSecret: string
): string {
  if (!signingSecret) {
    throw new Error("signing secret is required to sign an impression");
  }
  const message = canonicalMessage(fields);
  return createHmac("sha256", signingSecret).update(message).digest("hex");
}

/** Build the full signed impression payload. */
export function buildSignedImpression(
  fields: Omit<ImpressionPayload, "signature" | "nonce"> & { nonce?: string },
  signingSecret: string
): ImpressionPayload {
  const withNonce = { ...fields, nonce: fields.nonce ?? generateNonce() };
  const signature = signImpression(withNonce, signingSecret);
  return { ...withNonce, signature };
}

/** Verify a signature (used in tests and could be reused by the backend). */
export function verifyImpression(payload: ImpressionPayload, signingSecret: string): boolean {
  const { signature, ...fields } = payload;
  const expected = signImpression(fields, signingSecret);
  // timingSafeEqual would be ideal, but lengths are equal hex strings here.
  return constantTimeEquals(signature, expected);
}

function canonicalMessage(fields: Omit<ImpressionPayload, "signature">): string {
  return [
    `campaign_id=${fields.campaign_id}`,
    `device_id=${fields.device_id}`,
    `nonce=${fields.nonce}`,
    `duration_ms=${fields.duration_ms}`,
  ].join("&");
}

function constantTimeEquals(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
