import { test } from "node:test";
import assert from "node:assert/strict";
import { applyInstall, applyUninstall, isAdVerb } from "../src/lib/settings";
import { isManagedStatusLine } from "../src/lib/paths";

test("applyInstall installs a managed wrapper statusLine and does NOT touch spinnerVerbs", () => {
  const current = {
    theme: "dark",
    spinnerVerbs: ["Thinking", "Pondering"],
  };
  const { settings, wrappedCommand } = applyInstall(current);

  assert.equal(settings.theme, "dark", "unmanaged keys are untouched");
  assert.ok(isManagedStatusLine(settings.statusLine), "statusLine is our wrapper");
  assert.equal(wrappedCommand, undefined, "no prior statusLine to wrap");
  // spinnerVerbs is left exactly as the user had it (current Claude Code rejects
  // an array-shaped spinnerVerbs, so we must not write one).
  assert.deepEqual(settings.spinnerVerbs, ["Thinking", "Pondering"]);
  assert.equal((settings.spinnerVerbs as string[]).some(isAdVerb), false, "no ad verb injected");
});

test("applyInstall on empty settings adds statusLine only, never a spinnerVerbs key", () => {
  const { settings, backup } = applyInstall({});
  assert.ok(isManagedStatusLine(settings.statusLine));
  assert.equal("spinnerVerbs" in settings, false, "no spinnerVerbs key is created");
  assert.equal(backup.had_spinner_verbs, false);
  assert.equal(backup.had_status_line, false);
});

test("wraps an existing string statusLine and restores it on uninstall", () => {
  const original = {
    theme: "light",
    statusLine: "/old/statusline.sh",
  };
  const { settings: installed, backup, wrappedCommand } = applyInstall(original);
  assert.equal(wrappedCommand, "/old/statusline.sh", "original command is captured for re-run");
  assert.ok(isManagedStatusLine(installed.statusLine));

  const restored = applyUninstall(installed, backup);
  assert.equal(restored.statusLine, "/old/statusline.sh");
  assert.equal(restored.theme, "light");
});

test("wraps an object-format (claude-hud-like) statusLine and restores it byte-faithfully", () => {
  const hud = { type: "command", command: 'bash -c "exec hud"' };
  const original = { theme: "x", statusLine: hud };
  const { settings: installed, backup, wrappedCommand } = applyInstall(original);

  assert.equal(wrappedCommand, 'bash -c "exec hud"', "wrapped command is the hud command string");
  assert.ok(isManagedStatusLine(installed.statusLine));
  assert.notDeepEqual(installed.statusLine, hud, "statusLine was replaced by our wrapper");

  const restored = applyUninstall(installed, backup);
  assert.deepEqual(restored.statusLine, hud, "the original hud object is restored exactly");
  assert.equal(restored.theme, "x");
});

test("re-install over our own wrapper preserves the TRUE original (does not wrap our wrapper)", () => {
  const original = { statusLine: "/old/hud.sh" };
  const first = applyInstall(original);
  const second = applyInstall(first.settings, { priorBackup: first.backup });

  assert.equal(second.wrappedCommand, "/old/hud.sh", "still wraps the user's original, not ours");
  assert.equal(second.backup.original_status_line, "/old/hud.sh");
  assert.equal(second.backup.had_status_line, true);

  const restored = applyUninstall(second.settings, second.backup);
  assert.equal(restored.statusLine, "/old/hud.sh");
});

test("uninstall removes the managed statusLine when none existed before", () => {
  const original = { theme: "dark" };
  const { settings: installed, backup } = applyInstall(original);
  const restored = applyUninstall(installed, backup);

  assert.equal("statusLine" in restored, false);
  assert.equal(restored.theme, "dark");
});

test("uninstall scrubs a stray ad-verb array and our statusLine even without a backup", () => {
  // Simulates cleaning up after an OLD build that wrote an array spinnerVerbs.
  const messy = {
    spinnerVerbs: ["✶ Ad ↗", "Thinking"],
    statusLine: { type: "command", command: "node /path/to/thinkcashback/statusline/render.js" },
  };
  const restored = applyUninstall(messy);
  assert.deepEqual(restored.spinnerVerbs, ["Thinking"], "our ad verb is stripped, user verb kept");
  assert.equal("statusLine" in restored, false);
});
