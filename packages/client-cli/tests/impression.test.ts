import { test } from "node:test";
import assert from "node:assert/strict";
import { hmacVerify, impressionSigningPayload } from "@thinkcashback/shared";
import { buildSignedImpression, generateNonce } from "../src/lib/impression";

const SECRET = "test-signing-secret";

test("buildSignedImpression signs over the shared canonical payload (a.b.c format)", () => {
  const payload = buildSignedImpression(
    { campaign_id: "camp-1", device_id: "dev-1", nonce: "fixed-nonce", duration_ms: 5000 },
    SECRET
  );
  // Signature must match the shared a.b.c canonical string, byte-for-byte.
  const canonical = impressionSigningPayload({
    campaignId: "camp-1",
    deviceId: "dev-1",
    nonce: "fixed-nonce",
    durationMs: 5000,
  });
  assert.equal(canonical, "camp-1.dev-1.fixed-nonce.5000");
  assert.match(payload.signature, /^[0-9a-f]{64}$/);
  assert.ok(hmacVerify(SECRET, canonical, payload.signature));
});

test("buildSignedImpression is deterministic for the same fixed nonce", () => {
  const fields = { campaign_id: "c", device_id: "d", nonce: "fixed-nonce", duration_ms: 1000 };
  const a = buildSignedImpression(fields, SECRET);
  const b = buildSignedImpression(fields, SECRET);
  assert.equal(a.signature, b.signature);
});

test("buildSignedImpression throws without a secret", () => {
  assert.throws(() =>
    buildSignedImpression({ campaign_id: "c", device_id: "d", nonce: "n", duration_ms: 1 }, "")
  );
});

test("buildSignedImpression auto-generates a server-valid nonce when omitted", () => {
  const payload = buildSignedImpression(
    { campaign_id: "camp-2", device_id: "dev-2", duration_ms: 5000 },
    SECRET
  );
  assert.ok(payload.nonce.length >= 8 && payload.nonce.length <= 128);
  // Round-trips against the shared verifier with the generated nonce.
  const canonical = impressionSigningPayload({
    campaignId: payload.campaign_id,
    deviceId: payload.device_id,
    nonce: payload.nonce,
    durationMs: payload.duration_ms,
  });
  assert.ok(hmacVerify(SECRET, canonical, payload.signature));
});

test("buildSignedImpression clamps duration_ms to an integer within server bounds", () => {
  const tooLong = buildSignedImpression(
    { campaign_id: "c", device_id: "d", nonce: "n", duration_ms: 999_999.7 },
    SECRET
  );
  assert.equal(tooLong.duration_ms, 600_000);
  const negative = buildSignedImpression(
    { campaign_id: "c", device_id: "d", nonce: "n", duration_ms: -50 },
    SECRET
  );
  assert.equal(negative.duration_ms, 0);
});

test("generateNonce produces unique tokens", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(generateNonce());
  assert.equal(seen.size, 100);
});
