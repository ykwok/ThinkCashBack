import { Ad, DeviceRegistration, Earnings, ImpressionPayload, LocalConfig } from "../types";
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
  /** Bearer JWT (for /me endpoints and device registration). */
  jwt?: string;
  /** Device api_key (for impressions/ad fetch). */
  apiKey?: string;
}

/**
 * Thin fetch wrapper with a timeout and uniform error handling.
 * Every call is guarded so a network failure surfaces as an ApiError
 * rather than an unhandled rejection that crashes the statusline.
 */
async function request<T>(base: string, pathName: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), opts.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.jwt) headers["authorization"] = `Bearer ${opts.jwt}`;
  if (opts.apiKey) headers["x-api-key"] = opts.apiKey;

  try {
    const res = await fetch(`${base}${pathName}`, {
      method: opts.method ?? "GET",
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new ApiError(`request to ${pathName} failed`, res.status);
    }
    // Some endpoints (impressions) may return 204 with no body.
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
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

  /** Register this device; returns credentials to be stored locally. */
  registerDevice(jwt: string, meta: { platform: string; hostname?: string }): Promise<DeviceRegistration> {
    return request<DeviceRegistration>(this.base, "/api/v1/devices", {
      method: "POST",
      jwt,
      body: meta,
    });
  }

  /** Fetch a single ad for the given targeting parameters. */
  getAd(params: { platform: string; country?: string; lang?: string }): Promise<Ad> {
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
