import { content } from './content.js';
import { styles } from './styles.js';

/** Escape a value for safe interpolation into HTML text/attributes. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Escape HTML, then promote `backtick` spans to <code> elements so inline
 * identifiers (spinnerVerbs, statusLine, …) render as code without letting any
 * raw markup through.
 */
function inline(value: string): string {
  return escapeHtml(value).replace(/`([^`]+)`/g, '<code>$1</code>');
}

function renderHeader(): string {
  return `
  <header class="site-header">
    <div class="container">
      <a class="brand" href="#top"><span class="dot"></span>${escapeHtml(content.brand)}</a>
      <nav class="header-nav">
        <a href="#how-it-works">How it works</a>
        <a href="#why">Why us</a>
        <a href="#install">Install</a>
        <a href="#advertisers">Advertisers</a>
      </nav>
      <a class="btn btn-primary" href="${escapeHtml(content.primaryCta.href)}">${escapeHtml(
        content.primaryCta.label,
      )}</a>
    </div>
  </header>`;
}

function renderHero(): string {
  const { hero, primaryCta } = content;
  return `
  <section class="hero" id="top">
    <div class="container">
      <span class="eyebrow">${escapeHtml(hero.eyebrow)}</span>
      <h1>${escapeHtml(hero.heading)}</h1>
      <p class="sub">${escapeHtml(hero.subheading)}</p>
      <div class="hero-actions">
        <a class="btn btn-primary" href="${escapeHtml(primaryCta.href)}">${escapeHtml(
          primaryCta.label,
        )}</a>
        <a class="btn btn-ghost" href="${escapeHtml(hero.secondaryCta.href)}">${escapeHtml(
          hero.secondaryCta.label,
        )}</a>
      </div>
      <p class="hero-note">${inline(hero.note)}</p>
    </div>
  </section>`;
}

function renderHowItWorks(): string {
  const { howItWorks } = content;
  const steps = howItWorks.steps
    .map(
      (step) => `
        <article class="step">
          <div class="num">${step.index}</div>
          <h3>${escapeHtml(step.title)}</h3>
          <p>${inline(step.body)}</p>
        </article>`,
    )
    .join('');
  return `
  <section id="how-it-works">
    <div class="container">
      <div class="section-head">
        <h2>${escapeHtml(howItWorks.heading)}</h2>
      </div>
      <div class="steps">${steps}</div>
    </div>
  </section>`;
}

function renderValueProps(): string {
  const { valueProps } = content;
  const cards = valueProps.items
    .map(
      (item) => `
        <article class="value-card">
          <div class="emphasis">${escapeHtml(item.emphasis)}</div>
          <h3>${escapeHtml(item.title)}</h3>
          <p>${inline(item.body)}</p>
        </article>`,
    )
    .join('');
  return `
  <section class="values" id="why">
    <div class="container">
      <div class="section-head">
        <h2>${escapeHtml(valueProps.heading)}</h2>
        <p>${escapeHtml(valueProps.subheading)}</p>
      </div>
      <div class="value-grid">${cards}</div>
    </div>
  </section>`;
}

function renderTerminalLine(command: string): string {
  const commentIndex = command.indexOf('#');
  if (commentIndex === -1) {
    return `<span class="prompt">$</span> ${escapeHtml(command)}`;
  }
  const cmd = command.slice(0, commentIndex).trimEnd();
  const comment = command.slice(commentIndex);
  return `<span class="prompt">$</span> ${escapeHtml(cmd)} <span class="comment">${escapeHtml(
    comment,
  )}</span>`;
}

function renderInstall(): string {
  const { install } = content;
  const lines = install.commands.map(renderTerminalLine).join('\n');
  return `
  <section id="install">
    <div class="container">
      <div class="install-wrap">
        <div class="install-copy">
          <h2>${escapeHtml(install.heading)}</h2>
          <p>${escapeHtml(install.subheading)}</p>
          <a class="btn btn-primary" href="${escapeHtml(install.cta.href)}">${escapeHtml(
            install.cta.label,
          )}</a>
          <p class="footnote">${inline(install.footnote)}</p>
        </div>
        <div class="terminal" role="img" aria-label="Terminal showing the three ThinkCashBack install commands">
          <div class="terminal-bar"><span class="r"></span><span class="y"></span><span class="g"></span></div>
          <pre>${lines}</pre>
        </div>
      </div>
    </div>
  </section>`;
}

function renderAdvertisers(): string {
  const { advertisers } = content;
  const cards = advertisers.points
    .map(
      (point) => `
        <article class="adv-card">
          <h3>${escapeHtml(point.title)}</h3>
          <p>${inline(point.body)}</p>
        </article>`,
    )
    .join('');
  return `
  <section class="advertisers" id="advertisers">
    <div class="container">
      <div class="section-head">
        <h2>${escapeHtml(advertisers.heading)}</h2>
        <p>${escapeHtml(advertisers.subheading)}</p>
      </div>
      <div class="adv-grid">${cards}</div>
      <div class="adv-cta">
        <a class="btn btn-ghost" href="${escapeHtml(advertisers.cta.href)}">${escapeHtml(
          advertisers.cta.label,
        )}</a>
      </div>
    </div>
  </section>`;
}

function renderFinalCta(): string {
  const { finalCta } = content;
  return `
  <section class="final">
    <div class="container">
      <h2>${escapeHtml(finalCta.heading)}</h2>
      <p>${escapeHtml(finalCta.subheading)}</p>
      <a class="btn btn-primary" href="${escapeHtml(finalCta.cta.href)}">${escapeHtml(
        finalCta.cta.label,
      )}</a>
    </div>
  </section>`;
}

function renderFooter(): string {
  return `
  <footer class="site-footer">
    <div class="container">
      <div class="brand"><span class="dot"></span>${escapeHtml(content.brand)}</div>
      <p>${escapeHtml(content.footerNote)}</p>
    </div>
  </footer>`;
}

/** Render the complete landing-page HTML document as a string. */
export function renderPage(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(content.brand)} — ${escapeHtml(content.tagline)}</title>
  <meta name="description" content="${escapeHtml(content.seoDescription)}" />
  <meta property="og:title" content="${escapeHtml(content.brand)} — ${escapeHtml(
    content.tagline,
  )}" />
  <meta property="og:description" content="${escapeHtml(content.seoDescription)}" />
  <meta property="og:type" content="website" />
  <link rel="stylesheet" href="./styles.css" />
</head>
<body>
${renderHeader()}
<main>
${renderHero()}
${renderHowItWorks()}
${renderValueProps()}
${renderInstall()}
${renderAdvertisers()}
${renderFinalCta()}
</main>
${renderFooter()}
</body>
</html>
`;
}

/** Expose the stylesheet so the build step can emit it next to the HTML. */
export function renderStyles(): string {
  return styles.trimStart();
}
