import { readConfig, writeConfig } from "../lib/config";
import {
  applyUninstall,
  claudeSettingsPath,
  readClaudeSettings,
  writeClaudeSettings,
} from "../lib/settings";

export async function uninstall(): Promise<number> {
  const config = await readConfig();

  const settings = await readClaudeSettings();
  if (settings === null) {
    console.log("No Claude Code settings found — nothing to restore.");
  } else {
    const restored = applyUninstall(settings, config.install_backup);
    await writeClaudeSettings(restored);
    console.log(`✓ Restored ${claudeSettingsPath()} to its pre-install state.`);
  }

  // Drop the install backup but KEEP credentials so the user can re-install
  // without re-registering or logging in again.
  if (config.install_backup) {
    const { install_backup, ...rest } = config;
    await writeConfig(rest);
  }

  console.log("ThinkCashBack uninstalled. Your credentials are preserved.");
  console.log("Run `thinkcashback install` to re-enable, or delete ~/.thinkcashback to fully remove.");
  return 0;
}
