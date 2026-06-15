import { ThinkCashBackApi } from "../lib/api";
import { isLoggedIn, readConfig } from "../lib/config";
import { Earnings } from "../types";

export async function earnings(): Promise<number> {
  const config = await readConfig();

  if (!isLoggedIn(config)) {
    console.error("You are not logged in. Run `thinkcashback login` first.");
    return 1;
  }

  try {
    const api = new ThinkCashBackApi(config);
    const e = await api.getEarnings();
    const today = todayBucket(e);

    console.log("ThinkCashBack earnings");
    console.log("──────────────────────");
    console.log(`Today:    ${today.impressions} impressions   ${fmtCents(today.devShareCents)}`);
    console.log(`Total:    ${totalImpressions(e)} impressions   ${fmtCents(e.totalCents)}`);
    console.log(`Pending:  ${fmtCents(e.pendingCents)}`);
    console.log(`Paid:     ${fmtCents(e.paidCents)}`);
    return 0;
  } catch (err) {
    console.error(`Could not fetch earnings: ${(err as Error).message}`);
    return 1;
  }
}

/** Most recent daily bucket (the server sorts `daily` newest-first). */
function todayBucket(e: Earnings): { impressions: number; devShareCents: number } {
  const first = e.daily[0];
  return first ? { impressions: first.impressions, devShareCents: first.devShareCents } : { impressions: 0, devShareCents: 0 };
}

function totalImpressions(e: Earnings): number {
  return e.daily.reduce((sum, d) => sum + d.impressions, 0);
}

function fmtCents(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}
