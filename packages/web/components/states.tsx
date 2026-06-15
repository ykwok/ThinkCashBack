/** Small presentational primitives for the loading / error / empty triad. */

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center gap-3 py-6 muted"
      data-testid="loading-state"
    >
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span className="text-sm">{label}</span>
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-3 rounded-lg border border-red-300 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"
      data-testid="error-state"
    >
      <span>{message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="btn-secondary">
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="rounded-lg border border-dashed p-6 text-center text-sm muted"
      style={{ borderColor: 'rgb(var(--border))' }}
      data-testid="empty-state"
    >
      {children}
    </div>
  );
}
