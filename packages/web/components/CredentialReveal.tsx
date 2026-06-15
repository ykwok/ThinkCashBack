'use client';

import type { Credentials } from '@/lib/types';
import { SecretField } from './SecretField';

/**
 * One-time credential reveal shown after first login or device registration.
 * Emphasises that the secret cannot be retrieved again and offers a dismiss
 * action that wipes it from session storage.
 */
export function CredentialReveal({
  credentials,
  onDismiss,
}: {
  credentials: Credentials;
  onDismiss: () => void;
}) {
  return (
    <section
      className="card border-2"
      style={{ borderColor: 'rgb(var(--brand))' }}
      data-testid="credential-reveal"
      aria-labelledby="creds-heading"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 id="creds-heading" className="text-lg font-bold">
            Save your credentials now
          </h2>
          <p className="mt-1 text-sm muted">
            These are shown <strong>only once</strong>. Store them in a secure secret manager — for
            security we keep only a hash and cannot show them again. Lost them? Register a device to
            rotate.
          </p>
        </div>
        <button type="button" onClick={onDismiss} className="btn-secondary shrink-0">
          I&apos;ve saved them
        </button>
      </div>
      <div className="mt-4 grid gap-4">
        <SecretField label="API key" value={credentials.apiKey} />
        <SecretField label="Signing secret" value={credentials.signingSecret} />
      </div>
    </section>
  );
}
