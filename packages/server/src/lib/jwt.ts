import { sign, verify } from 'hono/jwt';

export interface SessionClaims {
  /** developer id */
  sub: string;
  githubId: string;
  /** issued-at / expiry (seconds since epoch) */
  iat: number;
  exp: number;
  [key: string]: string | number;
}

const SESSION_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

export async function issueSession(
  secret: string,
  developerId: string,
  githubId: string,
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = {
    sub: developerId,
    githubId,
    iat: now,
    exp: now + SESSION_TTL_SECONDS,
  };
  return sign(claims, secret);
}

export async function verifySession(secret: string, token: string): Promise<SessionClaims> {
  const payload = (await verify(token, secret, 'HS256')) as unknown as SessionClaims;
  return payload;
}
