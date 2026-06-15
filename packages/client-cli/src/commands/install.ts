import { ThinkCashBackApi } from "../lib/api";
import { currentPlatform, machineFingerprint } from "../lib/device";
import { isLoggedIn, readConfig, writeConfig } from "../lib/config";
import {
  applyInstall,
  claudeSettingsPath,
  readClaudeSettings,
  writeClaudeSettings,
} from "../lib/settings";
import { statusLineBinPath } from "../lib/paths";

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

  // 3. Inject our ad config, capturing a backup for uninstall.
  const { settings: updated, backup } = applyInstall(settings, statusLineBinPath());
  await writeClaudeSettings(updated);

  // 4. Persist credentials + backup with 0600 perms.
  next = { ...next, install_backup: backup };
  await writeConfig(next);

  console.log("✓ ThinkCashBack installed.");
  console.log(`  • spinnerVerbs updated in ${claudeSettingsPath()}`);
  console.log(`  • statusLine → ${statusLineBinPath()}`);
  console.log("Restart Claude Code to start earning. Run `thinkcashback status` anytime.");
  return 0;
}
