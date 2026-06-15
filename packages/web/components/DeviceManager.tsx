'use client';

import { useState } from 'react';
import { api, ApiClientError } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { DeviceRegistration, Platform } from '@/lib/types';
import { formatDate } from '@/lib/format';
import { EmptyState, ErrorState } from './states';

const PLATFORMS: Platform[] = ['darwin', 'linux', 'win32'];

/**
 * Register a device and (re)issue developer credentials. The backend has no
 * "list devices" endpoint in V1, so we display devices registered during this
 * session and note that credential rotation is developer-scoped (latest wins).
 */
export function DeviceManager({ token }: { token: string }) {
  const { setFreshCredentials } = useAuth();
  const [platform, setPlatform] = useState<Platform>('darwin');
  const [fingerprint, setFingerprint] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [registered, setRegistered] = useState<DeviceRegistration['device'][]>([]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const result = await api.registerDevice(token, {
        machine_fingerprint: fingerprint.trim() || `web-${platform}-${registered.length + 1}`,
        platform,
      });
      setRegistered((prev) => [result.device, ...prev]);
      // Surface the freshly rotated secret through the one-time reveal banner.
      setFreshCredentials({ apiKey: result.apiKey, signingSecret: result.signingSecret });
      setFingerprint('');
    } catch (err) {
      setError(
        err instanceof ApiClientError ? err.message : 'Could not register the device. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-4" data-testid="device-manager">
      <form onSubmit={onSubmit} className="grid gap-3 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <label htmlFor="fingerprint" className="text-xs font-medium uppercase tracking-wide muted">
            Machine fingerprint
          </label>
          <input
            id="fingerprint"
            className="input mt-1"
            placeholder="auto-generated if blank"
            value={fingerprint}
            onChange={(e) => setFingerprint(e.target.value)}
          />
        </div>
        <div>
          <label htmlFor="platform" className="text-xs font-medium uppercase tracking-wide muted">
            Platform
          </label>
          <select
            id="platform"
            className="input mt-1"
            value={platform}
            onChange={(e) => setPlatform(e.target.value as Platform)}
          >
            {PLATFORMS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? 'Registering…' : 'Register & rotate keys'}
        </button>
      </form>

      {error && <ErrorState message={error} />}

      {registered.length === 0 ? (
        <EmptyState>
          No devices registered in this session. Registering rotates your API key &amp; signing
          secret (V1: developer-scoped, latest registration wins).
        </EmptyState>
      ) : (
        <ul className="divide-y" style={{ borderColor: 'rgb(var(--border))' }}>
          {registered.map((d) => (
            <li
              key={d.id}
              className="flex items-center justify-between py-2 text-sm"
              style={{ borderColor: 'rgb(var(--border))' }}
            >
              <span className="font-mono">{d.id}</span>
              <span className="muted">
                {d.platform} · {formatDate(d.createdAt)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
