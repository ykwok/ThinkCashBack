'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export function SiteHeader() {
  const { token, logout } = useAuth();
  const pathname = usePathname();
  const router = useRouter();

  const nav = [
    { href: '/', label: 'Dashboard' },
    { href: '/install', label: 'Install' },
  ];

  return (
    <header
      className="sticky top-0 z-10 border-b backdrop-blur"
      style={{ borderColor: 'rgb(var(--border))', background: 'rgb(var(--surface) / 0.8)' }}
    >
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-bold">
          <span
            className="inline-block h-5 w-5 rounded-md"
            style={{ background: 'rgb(var(--brand))' }}
            aria-hidden
          />
          ThinkCashBack
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {nav.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`rounded-md px-3 py-1.5 transition ${
                  active ? 'font-semibold' : 'muted hover:opacity-80'
                }`}
                style={active ? { background: 'rgb(var(--brand-soft))' } : undefined}
              >
                {item.label}
              </Link>
            );
          })}
          {token && (
            <button
              type="button"
              onClick={() => {
                logout();
                router.push('/login');
              }}
              className="ml-2 rounded-md px-3 py-1.5 muted transition hover:opacity-80"
            >
              Sign out
            </button>
          )}
        </nav>
      </div>
    </header>
  );
}
