import { test } from "node:test";
import assert from "node:assert/strict";
import { composeStatusLine, currentAd } from "../src/statusline/render";
import { isAdVerb } from "../src/lib/settings";
import { FALLBACK_ADS } from "../src/lib/cache";
import { Ad } from "../src/types";

function ad(id: string, headline = `headline ${id}`): Ad {
  return { id, headline, url: `https://x/${id}`, trackingId: `t-${id}` };
}

test("composeStatusLine puts the ad on its own line below the wrapped HUD output", () => {
  const out = composeStatusLine("◇ opus · 142k · main", ad("1", "Buy widgets"));
  const lines = out.split("\n");
  assert.equal(lines[0], "◇ opus · 142k · main", "HUD output is the first line");
  assert.ok(isAdVerb(lines[1]), "the ad line carries the ✶ … ↗ markers");
  assert.ok(lines[1].includes("Buy widgets"));
});

test("composeStatusLine tolerates a multi-line HUD and trailing newlines", () => {
  const out = composeStatusLine("line1\nline2\n\n", ad("1", "Promo"));
  const lines = out.split("\n");
  assert.deepEqual(lines.slice(0, 2), ["line1", "line2"]);
  assert.ok(isAdVerb(lines[2]));
});

test("composeStatusLine with no wrapped HUD prints only the ad line", () => {
  const out = composeStatusLine("", ad("1", "Solo"));
  assert.ok(isAdVerb(out));
  assert.ok(out.includes("Solo"));
  assert.equal(out.includes("\n"), false);
});

test("currentAd rotates over the cache by time and wraps around", () => {
  const ads = [ad("a"), ad("b"), ad("c")];
  const ROTATE = 60_000;
  assert.equal(currentAd(ads, 0).id, "a");
  assert.equal(currentAd(ads, ROTATE).id, "b");
  assert.equal(currentAd(ads, 2 * ROTATE).id, "c");
  assert.equal(currentAd(ads, 3 * ROTATE).id, "a", "wraps back to the first ad");
});

test("currentAd falls back to the built-in ad when the cache is empty", () => {
  assert.equal(currentAd([], 0).id, FALLBACK_ADS[0].id);
});
