'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useAsync } from '@/lib/useAsync';
import { formatBps, formatCount, formatDate, formatUsd } from '@/lib/format';
import { CredentialReveal } from '@/components/CredentialReveal';
import { DeviceManager } from '@/components/DeviceManager';
import { EarningsChart } from '@/components/EarningsChart';
import { EarningsTable } from '@/components/EarningsTable';
import { StatCard } from '@/components/StatCard';
import { ErrorState, LoadingState } from '@/components/states';

export default function DashboardPage() {
  const { token, initializing, freshCredentials, dismissCredentials } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!initializing && !token) router.replace('/login');
  }, [initializing, token, router]);

  const me = useAsync((signal) => api.me(token as string, signal), [token], !!token);
  const earnings = useAsync(
    (signal) => api.earnings(token as string, signal),
    [token],
    !!token,
  );

  if (initializing || !token) {
    return <LoadingState label="Checking your session…" />;
  }

  const totalImpressions =
    earnings.data?.daily.reduce((sum, d) => sum + d.impressions, 0) ?? 0;

  return (
    <div className="grid gap-8">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="mt-1 text-sm muted">
          {me.data ? me.data.email : 'Your earnings, devices, and API credentials.'}
        </p>
      </div>

      {freshCredentials && (
        <CredentialReveal credentials={freshCredentials} onDismiss={dismissCredentials} />
      )}

      {/* Earnings summary */}
      <section aria-labelledby="earnings-heading" className="grid gap-4">
        <h2 id="earnings-heading" className="text-lg font-semibold">
          Earnings
        </h2>
        {earnings.loading && <LoadingState label="Loading earnings…" />}
        {earnings.error && <ErrorState message={earnings.error} onRetry={earnings.reload} />}
        {earnings.data && (
          <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <StatCard
                label="Total earned"
                value={formatUsd(earnings.data.totalCents)}
                accent
                sublabel="Lifetime developer share"
              />
              <StatCard label="Pending" value={formatUsd(earnings.data.pendingCents)} sublabel="Not yet paid out" />
              <StatCard label="Paid out" value={formatUsd(earnings.data.paidCents)} />
              <StatCard
                label="Impressions"
                value={formatCount(totalImpressions)}
                sublabel="$1.00 CPM"
              />
            </div>
            <div className="card">
              <EarningsChart daily={earnings.data.daily} />
            </div>
            <div className="card">
              <h3 className="mb-3 text-sm font-semibold">Daily breakdown</h3>
              <EarningsTable daily={earnings.data.daily} />
            </div>
          </>
        )}
      </section>

      {/* Account + API credentials */}
      <section aria-labelledby="account-heading" className="grid gap-4">
        <h2 id="account-heading" className="text-lg font-semibold">
          Account
        </h2>
        {me.loading && <LoadingState label="Loading profile…" />}
        {me.error && <ErrorState message={me.error} onRetry={me.reload} />}
        {me.data && (
          <div className="card grid gap-3 sm:grid-cols-2">
            <Field label="GitHub ID" value={me.data.githubId} />
            <Field label="Email" value={me.data.email} />
            <Field label="Revenue share" value={formatBps(me.data.revShareBps)} />
            <Field label="Status" value={me.data.status} />
            <Field
              label="Payouts"
              value={me.data.stripeConnected ? 'Stripe connected' : 'Not connected'}
            />
            <Field label="Member since" value={formatDate(me.data.createdAt)} />
          </div>
        )}
        <p className="text-xs muted">
          Your API key &amp; signing secret are shown only once. Lost them? Register a device below
          to rotate — see the{' '}
          <Link href="/install" className="underline">
            install guide
          </Link>
          .
        </p>
      </section>

      {/* Devices */}
      <section aria-labelledby="devices-heading" className="grid gap-4">
        <h2 id="devices-heading" className="text-lg font-semibold">
          Devices
        </h2>
        <div className="card">
          <DeviceManager token={token} />
        </div>
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wide muted">{label}</p>
      <p className="mt-0.5 break-all text-sm font-medium">{value}</p>
    </div>
  );
}
