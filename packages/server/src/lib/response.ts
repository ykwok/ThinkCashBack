import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { ApiError, ApiSuccess } from '@thinkcashback/shared';

/** Build the canonical success envelope. */
export function ok<T>(
  c: Context,
  data: T,
  status: ContentfulStatusCode = 200,
  meta?: ApiSuccess<T>['meta'],
) {
  const body: ApiSuccess<T> = { success: true, data, error: null };
  if (meta) body.meta = meta;
  return c.json(body, status);
}

/** Build the canonical error envelope. Never leak internal details to clients. */
export function fail(
  c: Context,
  status: ContentfulStatusCode,
  code: string,
  message: string,
  details?: Record<string, unknown>,
) {
  const body: ApiError = {
    success: false,
    data: null,
    error: { code, message, ...(details ? { details } : {}) },
  };
  return c.json(body, status);
}
