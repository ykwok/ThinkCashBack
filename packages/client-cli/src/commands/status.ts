import { ThinkCashBackApi } from "../lib/api";
import { isLoggedIn, isRegistered, readConfig } from "../lib/config";
import { claudeSettingsPath, isAdVerb, readClaudeSettings } from "../lib/settings";
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
    const verbs = Array.isArray(settings.spinnerVerbs) ? settings.spinnerVerbs : [];
    const hasAdVerbs = verbs.some(isAdVerb);
    const statusLineLinked = isManagedStatusLine(settings.statusLine);
    console.log(`Installed:   ${hasAdVerbs || statusLineLinked ? "yes" : "no"}`);
    console.log(`  spinnerVerbs: ${hasAdVerbs ? "active" : "not set"}`);
    console.log(`  statusLine:   ${statusLineLinked ? "active" : "not set"}`);
  }

  // Best-effort earnings snapshot; never fail status on a network hiccup.
  if (isLoggedIn(config)) {
    try {
      const api = new ThinkCashBackApi(config);
      const e = await api.getEarnings();
      console.log("────────────────────");
      console.log(`Today:  ${e.today_impressions} impressions · ${fmt(e.today_earnings, e.currency)}`);
      console.log(`Total:  ${e.total_impressions} impressions · ${fmt(e.total_earnings, e.currency)}`);
    } catch {
      console.log("(earnings unavailable — network error)");
    }
  }

  return 0;
}

function fmt(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}
