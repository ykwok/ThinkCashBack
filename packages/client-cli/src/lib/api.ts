import type { ApiResponse } from "@thinkcashback/shared";
import {
  Ad,
  DeviceRegistration,
  Earnings,
  GithubAuthResult,
  ImpressionPayload,
  LocalConfig,
  Platform,
} from "../types";
import { apiBase } from "./config";

const DEFAULT_TIMEOUT_MS = 8000;

export class ApiError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  timeoutMs?: number;
  /** Session JWT, sent as `Authorization: Bearer` (device registration, /me). */
  jwt?: string;
  /** Device/developer api key, also sent as `Authorization: Bearer` (ad, impressions). */
  apiKey?: string;
}

/**
 * Thin fetch wrapper with a timeout and uniform error handling.
 *
 * The server speaks a uniform `{ success, data, error }` envelope and expects
 * the credential (JWT *or* api key) in the `Authorization: Bearer` header for
 * every authenticated endpoint. This helper unwraps the envelope so callers
 * receive the bare `data` payload, and turns a server-side `error` into an
 * `ApiError` carrying the server's code/message.
 *
 * Every call is guarded so a network failure surfaces as an ApiError rather
 * than an unhandled rejection that crashes the statusline.
 */
async function request<T>(base: string, pathName: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const headers: Record<string, string> = { "content-type": "application/json" };
  // Both the JWT and the api key authenticate via the same Bearer scheme
  // server-side; a given request uses exactly one of them.
  const bearer = opts.jwt ?? opts.apiKey;
  if (bearer) headers["authorization"] = `Bearer ${bearer}`;

  try {
    const res = await fetch(`${base}${pathName}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });

    // Some endpoints may return 204 with no body.
    const text = await res.text();
    const envelope = text ? (JSON.parse(text) as ApiResponse<T>) : undefined;

    if (!res.ok) {
      const err = envelope && "error" in envelope ? envelope.error : null;
      const message = err ? `${err.code}: ${err.message}` : `request to ${pathName} failed`;
      throw new ApiError(message, res.status);
    }

    if (envelope === undefined) return undefined as T;
    if (envelope.success === false) {
      throw new ApiError(`${envelope.error.code}: ${envelope.error.message}`, res.status);
    }
    return envelope.data;
  } catch (err: unknown) {
    if (err instanceof ApiError) throw err;
    if (err instanceof Error && err.name === "AbortError") {
      throw new ApiError(`request to ${pathName} timed out`);
    }
    throw new ApiError(`request to ${pathName} failed: ${(err as Error).message}`);
  } finally {
    clearTimeout(timeout);
  }
}

export class ThinkCashBackApi {
  private base: string;

  constructor(private config: LocalConfig) {
    this.base = apiBase(config);
  }

  /**
   * Exchange a GitHub OAuth code for a session JWT (no auth header required).
   * In non-production the server also accepts a `dev:<githubId>:<email>` code.
   */
  authenticateGithub(code: string): Promise<GithubAuthResult> {
    return request<GithubAuthResult>(this.base, "/api/v1/auth/github", {
      method: "POST",
      body: { code },
    });
  }

  /** Register this device; returns credentials to be stored locally. */
  registerDevice(
    jwt: string,
    meta: { machine_fingerprint: string; platform: Platform; device_pubkey?: string }
  ): Promise<DeviceRegistration> {
    return request<DeviceRegistration>(this.base, "/api/v1/devices", {
      method: "POST",
      jwt,
      body: meta,
    });
  }

  /** Fetch a single ad for the given targeting parameters. */
  getAd(params: { platform: Platform; country?: string; lang?: string }): Promise<Ad> {
    const q = new URLSearchParams({ platform: params.platform });
    if (params.country) q.set("country", params.country);
    if (params.lang) q.set("lang", params.lang);
    return request<Ad>(this.base, `/api/v1/ad?${q.toString()}`, {
      apiKey: this.config.api_key,
    });
  }

  /** Report an impression heartbeat. */
  reportImpression(payload: ImpressionPayload): Promise<void> {
    return request<void>(this.base, "/api/v1/impressions", {
      method: "POST",
      apiKey: this.config.api_key,
      body: payload,
      // keep impression reports snappy so they don't pile up
      timeoutMs: 5000,
    });
  }

  /** Fetch earnings for the logged-in account. */
  getEarnings(): Promise<Earnings> {
    return request<Earnings>(this.base, "/api/v1/me/earnings", {
      jwt: this.config.jwt,
    });
  }
}
