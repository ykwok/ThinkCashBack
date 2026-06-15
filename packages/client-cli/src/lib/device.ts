import * as os from "os";
import { sha256 } from "@thinkcashback/shared";
import { Platform } from "../types";

/**
 * Resolve the current OS to the platform enum the server accepts
 * (darwin / linux / win32). Node's `process.platform` already uses these exact
 * values for macOS, Linux and Windows; anything else (e.g. freebsd) is mapped
 * to `linux` so registration/ad-fetch never trip the server's enum validation.
 */
export function currentPlatform(): Platform {
  switch (process.platform) {
    case "darwin":
      return "darwin";
    case "win32":
      return "win32";
    default:
      return "linux";
  }
}

/**
 * Build a stable, anonymous machine fingerprint (>= 8 chars, as the server
 * requires). We hash a few non-identifying host attributes so the same machine
 * registers consistently without leaking the raw hostname/username.
 */
export function machineFingerprint(): string {
  const raw = [os.hostname(), os.platform(), os.arch(), os.userInfo().username].join(":");
  return sha256(raw);
}
