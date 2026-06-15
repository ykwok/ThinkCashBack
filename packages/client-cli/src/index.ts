/**
 * ThinkCashBack client CLI — placeholder.
 *
 * Wave 2 owns the real implementation: device registration, ad fetch, and
 * HMAC-signed impression reporting. This stub only proves the package builds
 * and can import the shared signing helpers it will depend on.
 */
import { impressionSigningPayload } from '@thinkcashback/shared';

export function buildImpressionPayload(input: {
  campaignId: string;
  deviceId: string;
  nonce: string;
  durationMs: number;
}): string {
  return impressionSigningPayload(input);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  // eslint-disable-next-line no-console
  console.log('tcb client-cli placeholder — implemented in Wave 2');
}
