import { afterEach, describe, expect, it, vi } from 'vitest';
import { api, ApiClientError } from '../api';

function mockFetch(status: number, body: unknown) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as Response);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('api client', () => {
  it('unwraps the success envelope and sends the bearer token', async () => {
    const fetchMock = mockFetch(200, {
      success: true,
      error: null,
      data: { id: '1', githubId: '42', email: 'a@b.c', revShareBps: 8000, status: 'active', stripeConnected: false, createdAt: '2026-01-01T00:00:00Z' },
    });
    vi.stubGlobal('fetch', fetchMock);

    const me = await api.me('jwt-token');
    expect(me.email).toBe('a@b.c');

    const [, init] = fetchMock.mock.calls[0];
    expect((init as RequestInit).headers).toMatchObject({ Authorization: 'Bearer jwt-token' });
  });

  it('throws ApiClientError with the backend error code on failure', async () => {
    vi.stubGlobal(
      'fetch',
      mockFetch(401, { success: false, data: null, error: { code: 'OAUTH_FAILED', message: 'nope' } }),
    );

    await expect(api.authGithub('bad')).rejects.toMatchObject({
      name: 'ApiClientError',
      code: 'OAUTH_FAILED',
      status: 401,
    });
  });

  it('maps network failures to a NETWORK_ERROR without leaking the request', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    const err = await api.me('jwt').catch((e) => e);
    expect(err).toBeInstanceOf(ApiClientError);
    expect(err.code).toBe('NETWORK_ERROR');
  });
});
