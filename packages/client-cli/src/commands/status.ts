import { ThinkCashBackApi } from "../lib/api";
import { isLoggedIn, isRegistered, readConfig } from "../lib/config";
import { claudeSettingsPath, readClaudeSettings } from "../lib/settings";
import { isManagedStatusLine } from "../lib/paths";

export async function status(): Promise<number> {
  const config = await readConfig();

  console.log("ThinkCashBack status");
  console.log("────────────────────");
  console.log(`Logged in:   ${isLoggedIn(config) ? "yes" : "no"}`);
  console.log(`Registered:  ${isRegistered(config) ? `yes (device ${config.device_id})` : "no"}`);

  // Inspect Claude Code settings to confirm the integration is live.
  const settings = await readClaudeSettings();
  if (settings === null) {
    console.log(`Installed:   no (no settings at ${claudeSettingsPath()})`);
  } else {
    const statusLineLinked = isManagedStatusLine(settings.statusLine);
    console.log(`Installed:   ${statusLineLinked ? "yes" : "no"}`);
    console.log(`  statusLine:   ${statusLineLinked ? "active" : "not set"}`);
  }

  // Best-effort earnings snapshot; never fail status on a network hiccup.
  if (isLoggedIn(config)) {
    try {
      const api = new ThinkCashBackApi(config);
      const e = await api.getEarnings();
      const today = e.daily[0];
      const todayImpressions = today?.impressions ?? 0;
      const todayCents = today?.devShareCents ?? 0;
      const totalImpressions = e.daily.reduce((sum, d) => sum + d.impressions, 0);
      console.log("────────────────────");
      console.log(`Today:  ${todayImpressions} impressions · ${fmtCents(todayCents)}`);
      console.log(`Total:  ${totalImpressions} impressions · ${fmtCents(e.totalCents)}`);
    } catch {
      console.log("(earnings unavailable — network error)");
    }
  }

  return 0;
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
