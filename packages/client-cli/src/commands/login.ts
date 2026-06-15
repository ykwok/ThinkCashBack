import * as readline from "readline/promises";
import { stdin as input, stdout as output } from "process";
import { ThinkCashBackApi } from "../lib/api";
import { readConfig, writeConfig } from "../lib/config";

interface LoginOptions {
  /** GitHub OAuth code to exchange non-interactively (CI / scripted login). */
  code?: string;
  /** Skip the network and store a mock token (local dev / offline). */
  mock?: boolean;
}

const GITHUB_START_URL = "https://thinkcashback.dev/auth/github/start?platform=cli";

/**
 * Authenticate the user against the real server.
 *
 * The browser opens the GitHub OAuth start page; after authorizing, the user
 * is shown a short OAuth `code` which we exchange at `POST /api/v1/auth/github`
 * for a session JWT. The JWT (and, on first login, the developer's API key +
 * signing secret) are persisted locally. `--mock` keeps a dependency-free path
 * for local development.
 */
export async function login(opts: LoginOptions = {}): Promise<number> {
  const config = await readConfig();

  if (opts.mock) {
    await writeConfig({ ...config, jwt: "mock-jwt-token" });
    console.log("✓ Logged in (mock mode).");
    return 0;
  }

  let code = opts.code;
  if (!code) {
    console.log("To authenticate, open this URL in your browser and authorize ThinkCashBack:");
    console.log("");
    console.log(`  ${GITHUB_START_URL}`);
    console.log("");
    await tryOpenBrowser(GITHUB_START_URL);

    const rl = readline.createInterface({ input, output });
    try {
      code = (await rl.question("Paste the code shown after authorizing: ")).trim();
    } finally {
      rl.close();
    }
  }

  if (!code) {
    console.error("No code entered. Login cancelled.");
    return 1;
  }

  try {
    const api = new ThinkCashBackApi(config);
    const result = await api.authenticateGithub(code);
    const next = { ...config, jwt: result.token };
    // Credentials are only returned on first login; persist them immediately so
    // impressions can be signed even before an explicit device registration.
    if (result.credentials) {
      next.api_key = result.credentials.apiKey;
      next.signing_secret = result.credentials.signingSecret;
    }
    await writeConfig(next);
    console.log(`✓ Logged in as ${result.developer.email}.`);
    return 0;
  } catch (err) {
    console.error(`Login failed: ${(err as Error).message}`);
    return 1;
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
