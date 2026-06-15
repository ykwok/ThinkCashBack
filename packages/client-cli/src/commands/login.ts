import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { readConfig, writeConfig } from "../lib/config";

interface LoginOptions {
  /** Skip the browser and accept a token directly (CI / mock mode). */
  token?: string;
  mock?: boolean;
}

/**
 * Authenticate the user.
 *
 * Real flow: open the browser to the GitHub OAuth start URL and poll for the
 * resulting JWT. To keep the CLI testable and dependency-free, we also support
 * pasting a token manually (`--token`) and a `--mock` mode for local dev.
 */
export async function login(opts: LoginOptions = {}): Promise<number> {
  const config = await readConfig();

  if (opts.mock) {
    await writeConfig({ ...config, jwt: "mock-jwt-token" });
    console.log("✓ Logged in (mock mode).");
    return 0;
  }

  if (opts.token) {
    await writeConfig({ ...config, jwt: opts.token });
    console.log("✓ Logged in with provided token.");
    return 0;
  }

  console.log("To authenticate, open this URL in your browser and authorize ThinkCashBack:");
  console.log("");
  console.log("  https://thinkcashback.dev/auth/github/start?platform=cli");
  console.log("");
  await tryOpenBrowser("https://thinkcashback.dev/auth/github/start?platform=cli");

  const rl = readline.createInterface({ input, output });
  try {
    const token = (await rl.question("Paste the token shown after authorizing: ")).trim();
    if (!token) {
      console.error("No token entered. Login cancelled.");
      return 1;
    }
    await writeConfig({ ...config, jwt: token });
    console.log("✓ Logged in.");
    return 0;
  } finally {
    rl.close();
  }
}

/** Best-effort browser open; never fails the command if it can't. */
async function tryOpenBrowser(url: string): Promise<void> {
  try {
    const { spawn } = await import("child_process");
    const cmd =
      process.platform === "darwin"
        ? "open"
        : process.platform === "win32"
        ? "start"
        : "xdg-open";
    spawn(cmd, [url], { stdio: "ignore", detached: true, shell: process.platform === "win32" }).unref();
  } catch {
    // Headless environment — the user can copy the URL manually.
  }
}
