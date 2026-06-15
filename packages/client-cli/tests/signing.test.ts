import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildSignedImpression,
  generateNonce,
  signImpression,
  verifyImpression,
} from "../src/lib/signing";

const SECRET = "test-signing-secret";

test("signImpression is deterministic for the same input", () => {
  const fields = {
    campaign_id: "camp-1",
    device_id: "dev-1",
    nonce: "fixed-nonce",
    duration_ms: 5000,
  };
  const a = signImpression(fields, SECRET);
  const b = signImpression(fields, SECRET);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{64}$/); // sha256 hex
});

test("signImpression throws without a secret", () => {
  assert.throws(() =>
    signImpression({ campaign_id: "c", device_id: "d", nonce: "n", duration_ms: 1 }, "")
  );
});

test("buildSignedImpression round-trips through verifyImpression", () => {
  const payload = buildSignedImpression(
    { campaign_id: "camp-2", device_id: "dev-2", duration_ms: 5000 },
    SECRET
  );
  assert.ok(payload.nonce);
  assert.ok(verifyImpression(payload, SECRET));
});

test("verifyImpression rejects a tampered payload", () => {
  const payload = buildSignedImpression(
    { campaign_id: "camp-3", device_id: "dev-3", duration_ms: 5000 },
    SECRET
  );
  const tampered = { ...payload, duration_ms: 999999 };
  assert.equal(verifyImpression(tampered, SECRET), false);
});

test("verifyImpression rejects a wrong secret", () => {
  const payload = buildSignedImpression(
    { campaign_id: "camp-4", device_id: "dev-4", duration_ms: 5000 },
    SECRET
  );
  assert.equal(verifyImpression(payload, "other-secret"), false);
});

test("generateNonce produces unique UUIDs", () => {
  const seen = new Set<string>();
  for (let i = 0; i < 100; i++) seen.add(generateNonce());
  assert.equal(seen.size, 100);
});
