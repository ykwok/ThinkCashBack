'use client';

import { useState } from 'react';

/**
 * A masked secret with reveal + copy. The value is held only in props/state;
 * it is never written to console or persistent storage by this component.
 */
export function SecretField({ label, value }: { label: string; value: string }) {
  const [revealed, setRevealed] = useState(false);
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard may be unavailable (e.g. insecure context); fail quietly.
      setCopied(false);
    }
  }

  const masked = '•'.repeat(Math.min(value.length, 40));

  return (
    <div>
      <label className="text-xs font-medium uppercase tracking-wide muted">{label}</label>
      <div className="mt-1 flex items-center gap-2">
        <code
          className="flex-1 overflow-x-auto rounded-md border px-3 py-2 font-mono text-sm"
          style={{ borderColor: 'rgb(var(--border))', background: 'rgb(var(--bg))' }}
          data-testid={`secret-${label}`}
          aria-label={revealed ? `${label} (revealed)` : `${label} (hidden)`}
        >
          {revealed ? value : masked}
        </code>
        <button
          type="button"
          onClick={() => setRevealed((r) => !r)}
          className="btn-secondary"
          aria-pressed={revealed}
        >
          {revealed ? 'Hide' : 'Reveal'}
        </button>
        <button type="button" onClick={copy} className="btn-secondary">
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
    </div>
  );
}
