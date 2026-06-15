/**
 * Transport types mirroring the ThinkCashBack backend contract
 * (docs/openapi.yaml + packages/server routes). Kept local so the web package
 * has no build-time dependency on the server's source.
 */

export type Platform = 'darwin' | 'linux' | 'win32';
export type DeveloperStatus = 'active' | 'suspended' | 'pending';

/** Canonical success envelope returned by every endpoint. */
export interface ApiSuccess<T> {
  success: true;
  data: T;
  meta?: { page: number; perPage: number; total: number };
  error: null;
}

export interface ApiError {
  success: false;
  data: null;
  error: { code: string; message: string; details?: Record<string, unknown> };
}

export type ApiResponse<T> = ApiSuccess<T> | ApiError;

/** Plaintext credentials — only ever returned once by the backend. */
export interface Credentials {
  apiKey: string;
  signingSecret: string;
}

/** Response of POST /api/v1/auth/github. */
export interface AuthResult {
  token: string;
  developer: { id: string; githubId: string; email: string };
  credentials: Credentials | null;
}

/** Response of GET /api/v1/me. */
export interface Me {
  id: string;
  githubId: string;
  email: string;
  revShareBps: number;
  status: DeveloperStatus;
  stripeConnected: boolean;
  createdAt: string;
}

export interface DailyEarnings {
  date: string;
  impressions: number;
  grossCents: number;
  devShareCents: number;
}

/** Response of GET /api/v1/me/earnings. */
export interface EarningsSummary {
  totalCents: number;
  pendingCents: number;
  paidCents: number;
  daily: DailyEarnings[];
}

/** Response of POST /api/v1/devices. */
export interface DeviceRegistration {
  device: { id: string; platform: Platform; createdAt: string };
  apiKey: string;
  signingSecret: string;
}
