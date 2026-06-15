import { test } from "node:test";
import assert from "node:assert/strict";
import { applyInstall, applyUninstall, isAdVerb } from "../src/lib/settings";

const SCRIPT = "/usr/local/lib/thinkcashback/statusline/index.js";

test("applyInstall injects ad verbs and statusLine, preserving user verbs", () => {
  const current = {
    theme: "dark",
    spinnerVerbs: ["Thinking", "Pondering"],
  };
  const { settings } = applyInstall(current, SCRIPT, ["✶ Sponsor — buy now ↗"]);

  assert.equal(settings.theme, "dark", "unmanaged keys are untouched");
  assert.equal(settings.statusLine, SCRIPT);
  const verbs = settings.spinnerVerbs as string[];
  assert.ok(verbs.includes("Thinking"));
  assert.ok(verbs.includes("Pondering"));
  assert.ok(verbs.some(isAdVerb), "an ad verb was injected");
});

test("applyInstall on empty settings creates the managed fields", () => {
  const { settings, backup } = applyInstall({}, SCRIPT);
  assert.equal(settings.statusLine, SCRIPT);
  assert.ok(Array.isArray(settings.spinnerVerbs));
  assert.equal(backup.had_spinner_verbs, false);
  assert.equal(backup.had_status_line, false);
});

test("install → uninstall restores the exact pre-install state", () => {
  const original = {
    theme: "light",
    spinnerVerbs: ["Thinking", "Cogitating"],
    statusLine: "/old/statusline.sh",
  };
  const { settings: installed, backup } = applyInstall(original, SCRIPT);
  const restored = applyUninstall(installed, backup);

  assert.deepEqual(restored.spinnerVerbs, ["Thinking", "Cogitating"]);
  assert.equal(restored.statusLine, "/old/statusline.sh");
  assert.equal(restored.theme, "light");
});

test("uninstall removes managed fields entirely when they did not exist before", () => {
  const original = { theme: "dark" };
  const { settings: installed, backup } = applyInstall(original, SCRIPT);
  const restored = applyUninstall(installed, backup);

  assert.equal("spinnerVerbs" in restored, false);
  assert.equal("statusLine" in restored, false);
  assert.equal(restored.theme, "dark");
});

test("uninstall without a backup still strips our ad verbs and statusLine", () => {
  const messy = {
    spinnerVerbs: ["✶ Ad ↗", "Thinking"],
    statusLine: "/path/to/thinkcashback/statusline/index.js",
  };
  const restored = applyUninstall(messy);
  assert.deepEqual(restored.spinnerVerbs, ["Thinking"]);
  assert.equal("statusLine" in restored, false);
});

test("re-install does not stack duplicate ad verbs", () => {
  const first = applyInstall({ spinnerVerbs: ["Thinking"] }, SCRIPT).settings;
  const second = applyInstall(first, SCRIPT).settings;
  const adVerbCount = (second.spinnerVerbs as string[]).filter(isAdVerb).length;
  const placeholderCount = applyInstall({}, SCRIPT).settings as { spinnerVerbs: string[] };
  assert.equal(adVerbCount, (placeholderCount.spinnerVerbs as string[]).filter(isAdVerb).length);
});
