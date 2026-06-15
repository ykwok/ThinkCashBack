import { Hono } from 'hono';
import { generateToken, githubAuthSchema, sha256 } from '@thinkcashback/shared';
import type { AppBindings } from '../lib/context.js';
import { fail, ok } from '../lib/response.js';
import { issueSession } from '../lib/jwt.js';
import { encryptSecret } from '../lib/secrets.js';

export const authRoutes = new Hono<AppBindings>();

interface GithubIdentity {
  githubId: string;
  email: string;
}

/**
 * Exchange an OAuth code for a GitHub identity.
 *
 * In non-production we accept a `dev:<githubId>:<email>` code so the flow is
 * testable without real GitHub credentials. In production this performs the
 * real authorization-code exchange.
 */
async function resolveGithubIdentity(
  code: string,
  env: AppBindings['Variables']['env'],
): Promise<GithubIdentity | null> {
  if (env.NODE_ENV !== 'production' && code.startsWith('dev:')) {
    const [, githubId, email] = code.split(':');
    if (!githubId || !email) return null;
    return { githubId, email };
  }

  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) return null;

  const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: env.GITHUB_CLIENT_ID,
      client_secret: env.GITHUB_CLIENT_SECRET,
      code,
      redirect_uri: env.GITHUB_OAUTH_REDIRECT_URI,
    }),
  });
  if (!tokenRes.ok) return null;
  const tokenJson = (await tokenRes.json()) as { access_token?: string };
  if (!tokenJson.access_token) return null;

  const userRes = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${tokenJson.access_token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'thinkcashback-server',
    },
  });
  if (!userRes.ok) return null;
  const user = (await userRes.json()) as { id?: number; email?: string | null; login?: string };
  if (!user.id) return null;
  return {
    githubId: String(user.id),
    email: user.email ?? `${user.login}@users.noreply.github.com`,
  };
}

/**
 * POST /api/v1/auth/github
 * Body: { code }. Returns a session JWT, creating the developer on first login.
 * On first login we also mint the developer's API key + signing secret (shown
 * once) so the client can immediately register devices and report impressions.
 */
authRoutes.post('/auth/github', async (c) => {
  const env = c.get('env');
  const store = c.get('store');

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return fail(c, 400, 'BAD_JSON', 'Request body must be valid JSON');
  }

  const parsed = githubAuthSchema.safeParse(body);
  if (!parsed.success) {
    return fail(c, 422, 'VALIDATION_ERROR', 'Missing OAuth code');
  }

  const identity = await resolveGithubIdentity(parsed.data.code, env);
  if (!identity) {
    return fail(c, 401, 'OAUTH_FAILED', 'Could not authenticate with GitHub');
  }

  let developer = await store.getDeveloperByGithubId(identity.githubId);
  let freshCredentials: { apiKey: string; signingSecret: string } | undefined;

  if (!developer) {
    const apiKey = generateToken(24);
    const signingSecret = generateToken(24);
    developer = await store.createDeveloper({
      githubId: identity.githubId,
      email: identity.email,
      apiKeyHash: sha256(apiKey),
      // Symmetric HMAC key the client signs with — envelope-encrypted at rest
      // (passes through as plaintext when SECRET_ENC_KEY is unset; see secrets.ts).
      signingSecretHash: encryptSecret(signingSecret, env.SECRET_ENC_KEY),
      revShareBps: env.DEFAULT_REV_SHARE_BPS,
    });
    freshCredentials = { apiKey, signingSecret };
  }

  const token = await issueSession(env.JWT_SECRET, developer.id, developer.githubId);
  return ok(
    c,
    {
      token,
      developer: { id: developer.id, githubId: developer.githubId, email: developer.email },
      // Only present on first login; clients must persist these immediately.
      credentials: freshCredentials ?? null,
    },
    developer && freshCredentials ? 201 : 200,
  );
});
