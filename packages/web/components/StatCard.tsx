/** A single headline metric with an optional sublabel. */
export function StatCard({
  label,
  value,
  sublabel,
  accent = false,
}: {
  label: string;
  value: string;
  sublabel?: string;
  accent?: boolean;
}) {
  return (
    <div className="card" data-testid="stat-card">
      <p className="text-xs font-medium uppercase tracking-wide muted">{label}</p>
      <p
        className="mt-2 text-2xl font-bold tabular-nums"
        style={accent ? { color: 'rgb(var(--brand))' } : undefined}
      >
        {value}
      </p>
      {sublabel && <p className="mt-1 text-xs muted">{sublabel}</p>}
    </div>
  );
}
