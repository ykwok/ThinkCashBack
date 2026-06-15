import { ThinkCashBackApi } from "../lib/api";
import { isLoggedIn, readConfig } from "../lib/config";

export async function earnings(): Promise<number> {
  const config = await readConfig();

  if (!isLoggedIn(config)) {
    console.error("You are not logged in. Run `thinkcashback login` first.");
    return 1;
  }

  try {
    const api = new ThinkCashBackApi(config);
    const e = await api.getEarnings();
    console.log("ThinkCashBack earnings");
    console.log("──────────────────────");
    console.log(`Today:    ${e.today_impressions} impressions   ${fmt(e.today_earnings, e.currency)}`);
    console.log(`Total:    ${e.total_impressions} impressions   ${fmt(e.total_earnings, e.currency)}`);
    console.log(`Pending:  ${fmt(e.pending_payout, e.currency)}`);
    return 0;
  } catch (err) {
    console.error(`Could not fetch earnings: ${(err as Error).message}`);
    return 1;
  }
}

function fmt(amount: number, currency: string): string {
  return `${amount.toFixed(2)} ${currency}`;
}
