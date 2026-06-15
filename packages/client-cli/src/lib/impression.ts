import { generateToken, hmacSign, impressionSigningPayload } from "@thinkcashback/shared";
import { ImpressionPayload } from "../types";

const MAX_DURATION_MS = 600_000; // server caps duration_ms here.

/** Generate a fresh nonce for an impression report (server requires 8-128 chars). */
export function generateNonce(): string {
  return generateToken(16);
}

/**
 * Build a fully signed impression body for POST /api/v1/impressions.
 *
 * The HMAC is computed over the canonical payload from `@thinkcashback/shared`
 * (`campaignId.deviceId.nonce.durationMs`) so the client and server always
 * agree byte-for-byte — there is intentionally no signing logic duplicated in
 * the CLI. `campaign_id` must be the campaign UUID (`ad.id`), never the
 * per-serve `trackingId`.
 */
export function buildSignedImpression(
  fields: { campaign_id: string; device_id: string; duration_ms: number; nonce?: string },
  signingSecret: string
): ImpressionPayload {
  if (!signingSecret) {
    throw new Error("signing secret is required to sign an impression");
  }
  const nonce = fields.nonce ?? generateNonce();
  const duration_ms = Math.max(0, Math.min(MAX_DURATION_MS, Math.round(fields.duration_ms)));
  const payload = impressionSigningPayload({
    campaignId: fields.campaign_id,
    deviceId: fields.device_id,
    nonce,
    durationMs: duration_ms,
  });
  const signature = hmacSign(signingSecret, payload);
  return { campaign_id: fields.campaign_id, device_id: fields.device_id, nonce, signature, duration_ms };
}
