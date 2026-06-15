import { ThinkCashBackApi } from "../lib/api";
import { currentPlatform, machineFingerprint } from "../lib/device";
import { isLoggedIn, readConfig, writeConfig } from "../lib/config";
import {
  applyInstall,
  claudeSettingsPath,
  readClaudeSettings,
  writeClaudeSettings,
} from "../lib/settings";

interface InstallOptions {
  /** Skip real device registration; use stub credentials (offline/dev). */
  mock?: boolean;
}

export async function install(opts: InstallOptions = {}): Promise<number> {
  const config = await readConfig();

  if (!isLoggedIn(config)) {
    console.error("You are not logged in. Run `thinkcashback login` first.");
    return 1;
  }

  // 1. Read existing Claude Code settings (may not exist yet).
  let settings = await readClaudeSettings();
  if (settings === null) {
    console.log(
      `No Claude Code settings found at ${claudeSettingsPath()} — creating a new one.`
    );
    settings = {};
  }

  // 2. Register the device if we haven't already.
  let next = config;
  if (!config.device_id) {
    if (opts.mock) {
      next = {
        ...config,
        device_id: "mock-device",
        api_key: "mock-api-key",
        signing_secret: "mock-signing-secret",
      };
      console.log("Registered device mock-device (mock mode).");
    } else {
      try {
        const api = new ThinkCashBackApi(config);
        const reg = await api.registerDevice(config.jwt!, {
          machine_fingerprint: machineFingerprint(),
          platform: currentPlatform(),
        });
        next = {
          ...config,
          device_id: reg.device.id,
          api_key: reg.apiKey,
          signing_secret: reg.signingSecret,
        };
        console.log(`Registered device ${reg.device.id}.`);
      } catch (err) {
        console.error(`Device registration failed: ${(err as Error).message}`);
        return 1;
      }
    }
  }

  // 3. Inject our ad config, wrapping any existing statusLine (e.g. claude-hud)
  //    so the two coexist. priorBackup keeps re-install from wrapping our own
  //    wrapper and losing the user's original.
  const { settings: updated, backup, wrappedCommand } = applyInstall(settings, {
    priorBackup: config.install_backup,
  });
  await writeClaudeSettings(updated);

  // 4. Persist credentials + the wrapped command + backup with 0600 perms.
  next = { ...next, wrapped_status_line: wrappedCommand, install_backup: backup };
  // Pin the API base if provided via env so the detached renderer/worker reach
  // the right server without depending on Claude Code's launch environment.
  if (process.env.THINKCASHBACK_API_BASE) {
    next = { ...next, api_base: process.env.THINKCASHBACK_API_BASE };
  }
  await writeConfig(next);

  console.log("✓ ThinkCashBack installed.");
  if (wrappedCommand) {
    console.log(`  • statusLine in ${claudeSettingsPath()} now renders the ad below your existing status line`);
  } else {
    console.log(`  • statusLine in ${claudeSettingsPath()} now renders the ad`);
  }
  console.log("Restart Claude Code to start earning. Run `thinkcashback status` anytime.");
  return 0;
}
