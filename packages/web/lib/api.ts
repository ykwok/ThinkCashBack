import type {
  ApiResponse,
  AuthResult,
  DeviceRegistration,
  EarningsSummary,
  Me,
  Platform,
} from './types';

const API_BASE = (process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:8787').replace(
  /\/$/,
  '',
);

/** Error carrying the backend's error envelope (code + message + status). */
export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
  }
}

interface RequestOptions {
  token?: string | null;
  body?: unknown;
  signal?: AbortSignal;
}

async function request<T>(
  method: string,
  path: string,
  { token, body, signal }: RequestOptions = {},
): Promise<T> {
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined) headers['Content-Type'] = 'application/json';

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    // Never echo the secret-bearing request body into the message.
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Could not reach the ThinkCashBack API.');
  }

  let payload: ApiResponse<T> | null = null;
  try {
    payload = (await res.json()) as ApiResponse<T>;
  } catch {
    payload = null;
  }

  if (!res.ok || !payload || payload.success === false) {
    const code = payload && payload.success === false ? payload.error.code : `HTTP_${res.status}`;
    const message =
      payload && payload.success === false
        ? payload.error.message
        : `Request failed (${res.status})`;
    throw new ApiClientError(res.status, code, message);
  }

  return payload.data;
}

/** Typed client for the developer-facing ThinkCashBack endpoints. */
export const api = {
  /** Exchange an OAuth code (or non-prod `dev:<id>:<email>` code) for a session. */
  authGithub(code: string, signal?: AbortSignal): Promise<AuthResult> {
    return request<AuthResult>('POST', '/api/v1/auth/github', { body: { code }, signal });
  },

  me(token: string, signal?: AbortSignal): Promise<Me> {
    return request<Me>('GET', '/api/v1/me', { token, signal });
  },

  earnings(token: string, signal?: AbortSignal): Promise<EarningsSummary> {
    return request<EarningsSummary>('GET', '/api/v1/me/earnings', { token, signal });
  },

  registerDevice(
    token: string,
    input: { machine_fingerprint: string; platform: Platform; device_pubkey?: string | null },
    signal?: AbortSignal,
  ): Promise<DeviceRegistration> {
    return request<DeviceRegistration>('POST', '/api/v1/devices', { token, body: input, signal });
  },
};

export { API_BASE };
