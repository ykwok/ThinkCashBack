'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ApiClientError, useAuth } from '@/lib/auth';
import { API_BASE } from '@/lib/api';

const IS_PROD = process.env.NODE_ENV === 'production';

export default function LoginPage() {
  const { token, initializing, login } = useAuth();
  const router = useRouter();
  const [devCode, setDevCode] = useState('dev:42:dev@example.com');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!initializing && token) router.replace('/');
  }, [initializing, token, router]);

  async function submit(code: string) {
    if (!code.trim()) {
      setError('Enter a code to continue.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      await login(code);
      router.replace('/');
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Login failed. Check the code and try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  // Production GitHub OAuth redirect (the backend completes the code exchange).
  const githubUrl = `${API_BASE}/api/v1/auth/github/callback`;

  return (
    <div className="mx-auto max-w-md">
      <div className="card">
        <h1 className="text-xl font-bold">Sign in to ThinkCashBack</h1>
        <p className="mt-1 text-sm muted">
          Connect your GitHub account to get your API key and start earning from your AI coding
          tool&apos;s spinner.
        </p>

        <a
          href={githubUrl}
          className="btn-primary mt-5 w-full"
          aria-disabled={submitting}
          data-testid="github-login"
        >
          <GithubMark />
          Continue with GitHub
        </a>

        {!IS_PROD && (
          <div className="mt-6 border-t pt-5" style={{ borderColor: 'rgb(var(--border))' }}>
            <p className="text-xs font-medium uppercase tracking-wide muted">Dev shortcut</p>
            <p className="mt-1 text-xs muted">
              Non-production only. Format: <code>dev:&lt;githubId&gt;:&lt;email&gt;</code>
            </p>
            <form
              className="mt-2 flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                void submit(devCode);
              }}
            >
              <input
                className="input"
                value={devCode}
                onChange={(e) => setDevCode(e.target.value)}
                aria-label="Dev login code"
                data-testid="dev-code-input"
              />
              <button type="submit" className="btn-secondary shrink-0" disabled={submitting}>
                {submitting ? '…' : 'Go'}
              </button>
            </form>
          </div>
        )}

        {error && (
          <p role="alert" className="mt-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}

function GithubMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0016 8c0-4.42-3.58-8-8-8z" />
    </svg>
  );
}
