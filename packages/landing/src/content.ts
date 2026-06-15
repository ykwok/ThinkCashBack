/**
 * Single source of truth for the ThinkCashBack marketing landing page.
 *
 * Every string the page renders lives here so the copy stays auditable against
 * the V1 product scope: Claude Code CLI only, a fixed $1.00 / 1k-impression CPM,
 * an 80% developer revenue share, zero editor patching, and server-side signed
 * impression counting. No unimplemented capabilities (RTB/bidding, VS Code,
 * Codex) are promised here.
 */

export interface CtaLink {
  readonly label: string;
  readonly href: string;
}

export interface HowItWorksStep {
  readonly index: number;
  readonly title: string;
  readonly body: string;
}

export interface ValueProp {
  readonly emphasis: string;
  readonly title: string;
  readonly body: string;
}

export interface AdvertiserPoint {
  readonly title: string;
  readonly body: string;
}

export interface SiteContent {
  readonly brand: string;
  readonly tagline: string;
  readonly seoDescription: string;
  /** Public dashboard URL the CTAs send developers to. */
  readonly dashboardUrl: string;
  readonly primaryCta: CtaLink;
  readonly hero: {
    readonly eyebrow: string;
    readonly heading: string;
    readonly subheading: string;
    readonly secondaryCta: CtaLink;
    readonly note: string;
  };
  readonly howItWorks: {
    readonly heading: string;
    readonly steps: readonly HowItWorksStep[];
  };
  readonly valueProps: {
    readonly heading: string;
    readonly subheading: string;
    readonly items: readonly ValueProp[];
  };
  readonly install: {
    readonly heading: string;
    readonly subheading: string;
    readonly commands: readonly string[];
    readonly footnote: string;
    readonly cta: CtaLink;
  };
  readonly advertisers: {
    readonly heading: string;
    readonly subheading: string;
    readonly points: readonly AdvertiserPoint[];
    readonly cta: CtaLink;
  };
  readonly finalCta: {
    readonly heading: string;
    readonly subheading: string;
    readonly cta: CtaLink;
  };
  readonly footerNote: string;
}

/**
 * Override the dashboard URL at build time without touching source, e.g.
 * `DASHBOARD_URL=https://app.thinkcashback.dev pnpm --filter @thinkcashback/landing build`.
 */
const DASHBOARD_URL = process.env.DASHBOARD_URL ?? 'https://app.thinkcashback.dev/signup';

export const content: SiteContent = {
  brand: 'ThinkCashBack',
  tagline: 'Earn while Claude thinks.',
  seoDescription:
    'ThinkCashBack pays Claude Code developers an 80% revenue share for unobtrusive sponsored copy shown in the thinking spinner. No editor patches, server-side signed impression counting, fixed $1.00 / 1k CPM.',
  dashboardUrl: DASHBOARD_URL,
  primaryCta: { label: 'Start earning', href: DASHBOARD_URL },
  hero: {
    eyebrow: 'For Claude Code developers',
    heading: 'Earn while Claude thinks.',
    subheading:
      'ThinkCashBack mixes unobtrusive sponsored copy into the Claude Code thinking spinner and pays you an 80% share of every verified impression. No source patching, no workflow change — install once and earn.',
    secondaryCta: { label: 'See how it works', href: '#how-it-works' },
    note: 'V1 supports the Claude Code CLI. Fixed $1.00 / 1,000 impressions. 80% to you.',
  },
  howItWorks: {
    heading: 'Three steps to your first payout',
    steps: [
      {
        index: 1,
        title: 'Install the CLI',
        body: 'Run a single npm install and `thinkcashback install`. It only adds sponsored `spinnerVerbs` and a `statusLine` to your Claude settings — every other key is left byte-for-byte intact.',
      },
      {
        index: 2,
        title: 'The spinner shows an ad',
        body: 'While Claude is thinking, a tagged sponsored verb (✶ … ↗) rotates in alongside your own. A small status-line daemon rotates ad copy and reports impressions — and degrades to a local cache when offline.',
      },
      {
        index: 3,
        title: 'You earn automatically',
        body: 'Each impression is signed with HMAC-SHA256 and counted server-side. Your 80% share accrues per verified impression and shows up in your developer dashboard.',
      },
    ],
  },
  valueProps: {
    heading: 'Why developers pick ThinkCashBack',
    subheading: 'Built for the people who actually run the terminal.',
    items: [
      {
        emphasis: '80%',
        title: 'Highest developer share',
        body: 'You keep 80% of revenue on verified impressions in V1 — above the rates typical of comparable spinner-ad networks. The split is fixed, not a teaser.',
      },
      {
        emphasis: '0',
        title: 'Zero editor patches',
        body: 'We never modify Claude Code itself. Integration is pure configuration — sponsored `spinnerVerbs` plus a `statusLine` entry. `uninstall` restores your settings to their exact pre-install state.',
      },
      {
        emphasis: '✓',
        title: 'Signed, server-side counting',
        body: 'Every impression is signed with HMAC-SHA256 over a canonical message and verified by the backend. You and advertisers bill against the same auditable count — no black-box analytics.',
      },
    ],
  },
  install: {
    heading: 'Install in under a minute',
    subheading: 'Three commands, then restart Claude Code. Authenticate with GitHub OAuth.',
    commands: [
      'npm install -g @thinkcashback/cli',
      'thinkcashback login     # GitHub OAuth',
      'thinkcashback install   # adds spinnerVerbs + statusLine',
    ],
    footnote:
      'Only `spinnerVerbs` and `statusLine` in ~/.claude/settings.json are touched, and your prior settings are backed up for a clean `thinkcashback uninstall`.',
    cta: { label: 'Open the developer dashboard', href: DASHBOARD_URL },
  },
  advertisers: {
    heading: 'For advertisers',
    subheading: 'Reach developers in the moment they wait — and pay only for impressions you can audit.',
    points: [
      {
        title: 'Fixed, transparent CPM',
        body: 'V1 pricing is a flat $1.00 per 1,000 verified impressions. No bidding, no opaque auction — predictable spend from day one.',
      },
      {
        title: 'Audited impression counts',
        body: 'Impressions are counted server-side from HMAC-signed reports, so you pay for real displays in the Claude Code thinking spinner — not estimates.',
      },
      {
        title: 'A focused developer audience',
        body: 'Your copy appears inside the Claude Code CLI workflow, in front of engineers actively building. V1 is Claude Code CLI today; more surfaces are on the roadmap.',
      },
    ],
    cta: { label: 'Talk to us about a campaign', href: DASHBOARD_URL },
  },
  finalCta: {
    heading: 'Turn idle thinking time into income',
    subheading:
      'Sign up, install the CLI, and start earning your 80% share on every verified impression — today, on the Claude Code CLI.',
    cta: { label: 'Create your developer account', href: DASHBOARD_URL },
  },
  footerNote:
    'ThinkCashBack V1 supports the Claude Code CLI only. Pricing and revenue share (fixed $1.00 / 1k CPM, 80% to developers) reflect the current release.',
};
