#!/usr/bin/env node
import { Command } from "commander";
import { install } from "./commands/install";
import { uninstall } from "./commands/uninstall";
import { login } from "./commands/login";
import { status } from "./commands/status";
import { earnings } from "./commands/earnings";

const program = new Command();

program
  .name("thinkcashback")
  .description("Earn revenue by showing sponsored ads in the Claude Code thinking spinner.")
  .version("0.1.0");

program
  .command("install")
  .description("Configure Claude Code to display ads and start earning")
  .option("--mock", "skip real device registration (offline / development)")
  .action((opts) => run(install(opts)));

program
  .command("uninstall")
  .description("Restore Claude Code settings to their pre-install state (keeps your credentials)")
  .action(() => run(uninstall()));

program
  .command("login")
  .description("Authenticate with ThinkCashBack via GitHub")
  .option("--code <code>", "GitHub OAuth code to exchange for a session (non-interactive)")
  .option("--mock", "log in with a mock token (local development)")
  .action((opts) => run(login(opts)));

program
  .command("status")
  .description("Show install state, device info, and today's earnings")
  .action(() => run(status()));

program
  .command("earnings")
  .description("Show detailed earnings")
  .action(() => run(earnings()));

/** Run an async command that resolves to an exit code, mapping errors to code 1. */
function run(p: Promise<number>): void {
  p.then((code) => process.exit(code)).catch((err) => {
    console.error(`Error: ${(err as Error).message}`);
    process.exit(1);
  });
}

program.parseAsync(process.argv);
