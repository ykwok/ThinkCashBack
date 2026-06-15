import type { Metadata } from 'next';
import './globals.css';
import { AuthProvider } from '@/lib/auth';
import { SiteHeader } from '@/components/SiteHeader';

export const metadata: Metadata = {
  title: 'ThinkCashBack — Developer Dashboard',
  description: 'Earn from your AI coding tool spinner. Track earnings, devices, and API keys.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <AuthProvider>
          <SiteHeader />
          <main className="mx-auto w-full max-w-5xl px-4 py-8">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
