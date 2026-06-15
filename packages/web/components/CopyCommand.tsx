'use client';

import { useState } from 'react';

/** A terminal-style command block with a copy button. */
export function CopyCommand({ command }: { command: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(command);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div
      className="flex items-center justify-between gap-3 rounded-lg border px-4 py-3 font-mono text-sm"
      style={{ borderColor: 'rgb(var(--border))', background: 'rgb(var(--bg))' }}
      data-testid="copy-command"
    >
      <code className="overflow-x-auto">
        <span className="muted">$ </span>
        {command}
      </code>
      <button type="button" onClick={copy} className="btn-secondary shrink-0">
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}
