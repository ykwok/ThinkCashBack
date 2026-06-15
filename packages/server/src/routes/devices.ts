import { Hono } from 'hono';
import { generateToken, registerDeviceSchema, sha256 } from '@thinkcashback/shared';
import type { AppBindings } from '../lib/context.js';
import { sessionAuth } from '../middleware/auth.js';
import { fail, ok } from '../lib/response.js';

export const deviceRoutes = new Hono<AppBindings>();

/**
 * POST /api/v1/devices
 * Register a device for the authenticated developer and (re)issue the
 * developer's API key + signing secret. The plaintext credentials are returned
 * exactly once; the server keeps only sha256(apiKey) and the HMAC signing key.
 *
 * V1 note: credentials are developer-scoped and the latest registration wins.
 * Per-device credential scoping is deferred to V2.
 */
deviceRoutes.post('/devices', sessionAuth, async (c) => {
  const dev = c.get('developer')!;
  const store = c.get('store');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, 'BAD_JSON', 'Request body must be valid JSON');
  }

  const parsed = registerDeviceSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 422, 'VALIDATION_ERROR', 'Invalid device payload', {
      issues: parsed.error.flatten().fieldErrors,
    });
  }

  const device = await store.createDevice({
    developerId: dev.id,
    machineFingerprint: parsed.data.machine_fingerprint,
    devicePubkey: parsed.data.device_pubkey ?? null,
    platform: parsed.data.platform,
  });

  const apiKey = generateToken(24);
  const signingSecret = generateToken(24);
  await store.rotateDeveloperCredentials(dev.id, sha256(apiKey), signingSecret);

  return ok(
    c,
    {
      device: {
        id: device.id,
        platform: device.platform,
        createdAt: device.createdAt.toISOString(),
      },
      // Returned once — persist immediately on the client.
      apiKey,
      signingSecret,
    },
    201,
  );
});
