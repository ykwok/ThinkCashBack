import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeAd, FALLBACK_ADS } from "../src/lib/cache";
import { mergeVerbs, adToVerb } from "../src/lib/spinner-update";
import { isAdVerb } from "../src/lib/settings";
import { Ad } from "../src/types";

function ad(id: string, headline = `headline ${id}`): Ad {
  return { id, headline, url: `https://x/${id}`, trackingId: `t-${id}` };
}

test("mergeAd dedups by id and puts the fresh ad first", () => {
  const existing = [ad("1"), ad("2")];
  const merged = mergeAd(existing, ad("2", "updated"));
  assert.equal(merged.length, 2);
  assert.equal(merged[0].id, "2");
  assert.equal(merged[0].headline, "updated");
});

test("mergeAd caps the cache at 10 entries", () => {
  let ads: Ad[] = [];
  for (let i = 0; i < 15; i++) ads = mergeAd(ads, ad(String(i)));
  assert.equal(ads.length, 10);
});

test("FALLBACK_ADS provides at least one ad for a cold cache", () => {
  assert.ok(FALLBACK_ADS.length >= 1);
  assert.ok(FALLBACK_ADS[0].headline.length > 0);
});

test("adToVerb wraps a plain headline with markers", () => {
  const verb = adToVerb(ad("1", "Buy widgets"));
  assert.ok(isAdVerb(verb));
});

test("mergeVerbs replaces old ad verbs but keeps user verbs", () => {
  const existing = ["✶ Old ad ↗", "Thinking", "Pondering"];
  const merged = mergeVerbs(existing, [ad("1", "New ad")]);
  assert.ok(merged.includes("Thinking"));
  assert.ok(merged.includes("Pondering"));
  assert.equal(merged.filter(isAdVerb).length, 1);
  assert.ok(merged.some((v) => v.includes("New ad")));
});

test("mergeVerbs limits ad verbs to at most 3", () => {
  const ads = [ad("1"), ad("2"), ad("3"), ad("4"), ad("5")];
  const merged = mergeVerbs(["Thinking"], ads);
  assert.equal(merged.filter(isAdVerb).length, 3);
});
