import Link from 'next/link';
import { CopyCommand } from '@/components/CopyCommand';

const STEPS = [
  {
    title: 'Install the CLI',
    body: 'Adds the `thinkcashback` command to your machine.',
    command: 'npm i -g @thinkcashback/cli',
  },
  {
    title: 'Authenticate',
    body: 'Opens GitHub OAuth and stores your session + API key locally.',
    command: 'thinkcashback login',
  },
  {
    title: 'Wire up the spinner',
    body: 'Installs the spinner ad hook into your AI coding tool. You start earning on the next run.',
    command: 'thinkcashback install',
  },
];

export default function InstallPage() {
  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold">Get started in 3 commands</h1>
      <p className="mt-1 text-sm muted">
        Run these in your terminal. You earn 80% of the ad revenue your spinner generates.
      </p>

      <div className="mt-6">
        <p className="text-xs font-medium uppercase tracking-wide muted">All at once</p>
        <div className="mt-2">
          <CopyCommand command="npm i -g @thinkcashback/cli && thinkcashback login && thinkcashback install" />
        </div>
      </div>

      <ol className="mt-8 grid gap-5">
        {STEPS.map((step, i) => (
          <li key={step.command} className="card flex gap-4">
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full font-bold text-white"
              style={{ background: 'rgb(var(--brand))' }}
              aria-hidden
            >
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">{step.title}</h2>
              <p className="mt-0.5 text-sm muted">{step.body}</p>
              <div className="mt-3">
                <CopyCommand command={step.command} />
              </div>
            </div>
          </li>
        ))}
      </ol>

      <div className="mt-8 text-sm muted">
        Already installed?{' '}
        <Link href="/" className="font-medium underline">
          Open your dashboard
        </Link>{' '}
        to view earnings and API keys.
      </div>
    </div>
  );
}
