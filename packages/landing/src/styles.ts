/** The full stylesheet for the landing page, emitted to dist/styles.css. */
export const styles = `
:root {
  --bg: #0b0e14;
  --bg-elevated: #121723;
  --bg-card: #161c2b;
  --border: #233049;
  --text: #e8edf6;
  --text-muted: #9aa7bd;
  --brand: #5eead4;
  --brand-2: #818cf8;
  --accent: #fbbf24;
  --radius: 16px;
  --maxw: 1120px;
  --shadow: 0 20px 60px -20px rgba(0, 0, 0, 0.55);
  --font: 'Inter', system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  --mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, 'SF Mono', Menlo, Consolas, monospace;
}

@media (prefers-color-scheme: light) {
  :root {
    --bg: #f7f9fc;
    --bg-elevated: #ffffff;
    --bg-card: #ffffff;
    --border: #e2e8f0;
    --text: #0f172a;
    --text-muted: #52607a;
    --brand: #0d9488;
    --brand-2: #4f46e5;
    --accent: #b45309;
    --shadow: 0 18px 48px -24px rgba(15, 23, 42, 0.25);
  }
}

* { box-sizing: border-box; }

html { scroll-behavior: smooth; }

body {
  margin: 0;
  background: var(--bg);
  color: var(--text);
  font-family: var(--font);
  line-height: 1.6;
  -webkit-font-smoothing: antialiased;
  text-rendering: optimizeLegibility;
}

a { color: inherit; text-decoration: none; }

.container {
  width: 100%;
  max-width: var(--maxw);
  margin: 0 auto;
  padding: 0 20px;
}

/* ---------- Header ---------- */
.site-header {
  position: sticky;
  top: 0;
  z-index: 10;
  backdrop-filter: blur(12px);
  background: color-mix(in srgb, var(--bg) 82%, transparent);
  border-bottom: 1px solid var(--border);
}
.site-header .container {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: 64px;
}
.brand {
  display: flex;
  align-items: center;
  gap: 10px;
  font-weight: 700;
  letter-spacing: -0.02em;
  font-size: 1.05rem;
}
.brand .dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: linear-gradient(135deg, var(--brand), var(--brand-2));
  box-shadow: 0 0 16px var(--brand);
}
.header-nav { display: none; gap: 28px; color: var(--text-muted); font-size: 0.95rem; }
.header-nav a:hover { color: var(--text); }

/* ---------- Buttons ---------- */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-weight: 600;
  font-size: 0.98rem;
  padding: 12px 22px;
  border-radius: 999px;
  border: 1px solid transparent;
  cursor: pointer;
  transition: transform 0.12s ease, box-shadow 0.2s ease, background 0.2s ease;
  white-space: nowrap;
}
.btn-primary {
  background: linear-gradient(135deg, var(--brand), var(--brand-2));
  color: #06121a;
  box-shadow: 0 10px 30px -10px var(--brand-2);
}
.btn-primary:hover { transform: translateY(-2px); }
.btn-ghost {
  background: transparent;
  color: var(--text);
  border-color: var(--border);
}
.btn-ghost:hover { border-color: var(--brand); color: var(--brand); }

/* ---------- Sections ---------- */
section { padding: 72px 0; }
.section-head { max-width: 640px; margin: 0 auto 44px; text-align: center; }
.section-head h2 {
  font-size: clamp(1.7rem, 4vw, 2.4rem);
  letter-spacing: -0.03em;
  margin: 0 0 12px;
}
.section-head p { color: var(--text-muted); margin: 0; font-size: 1.05rem; }
.eyebrow {
  display: inline-block;
  text-transform: uppercase;
  letter-spacing: 0.14em;
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--brand);
  margin-bottom: 14px;
}

/* ---------- Hero ---------- */
.hero {
  position: relative;
  overflow: hidden;
  padding: 92px 0 84px;
  text-align: center;
}
.hero::before {
  content: '';
  position: absolute;
  inset: -40% 0 auto 0;
  height: 620px;
  background: radial-gradient(60% 60% at 50% 0%, color-mix(in srgb, var(--brand-2) 30%, transparent), transparent 70%);
  pointer-events: none;
}
.hero .container { position: relative; }
.hero h1 {
  font-size: clamp(2.3rem, 6vw, 4rem);
  line-height: 1.05;
  letter-spacing: -0.04em;
  margin: 0 auto 20px;
  max-width: 16ch;
  background: linear-gradient(180deg, var(--text), color-mix(in srgb, var(--text) 60%, var(--brand)));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
}
.hero p.sub {
  font-size: clamp(1.05rem, 2.4vw, 1.3rem);
  color: var(--text-muted);
  max-width: 56ch;
  margin: 0 auto 32px;
}
.hero-actions {
  display: flex;
  gap: 14px;
  justify-content: center;
  flex-wrap: wrap;
}
.hero-note {
  margin-top: 26px;
  font-size: 0.9rem;
  color: var(--text-muted);
}
.hero-note strong { color: var(--accent); }

/* ---------- How it works ---------- */
.steps {
  display: grid;
  grid-template-columns: 1fr;
  gap: 22px;
}
.step {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 28px;
  position: relative;
}
.step .num {
  width: 42px;
  height: 42px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  font-weight: 800;
  font-size: 1.1rem;
  color: #06121a;
  background: linear-gradient(135deg, var(--brand), var(--brand-2));
  margin-bottom: 16px;
}
.step h3 { margin: 0 0 8px; font-size: 1.2rem; letter-spacing: -0.02em; }
.step p { margin: 0; color: var(--text-muted); }
.step code {
  font-family: var(--mono);
  background: color-mix(in srgb, var(--brand) 16%, transparent);
  color: var(--brand);
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 0.85em;
}

/* ---------- Value props ---------- */
.values { background: var(--bg-elevated); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.value-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 22px;
}
.value-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 30px;
  box-shadow: var(--shadow);
}
.value-card .emphasis {
  font-size: 2.6rem;
  font-weight: 800;
  letter-spacing: -0.04em;
  line-height: 1;
  background: linear-gradient(135deg, var(--brand), var(--brand-2));
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  margin-bottom: 14px;
}
.value-card h3 { margin: 0 0 8px; font-size: 1.2rem; letter-spacing: -0.02em; }
.value-card p { margin: 0; color: var(--text-muted); }
.value-card code {
  font-family: var(--mono);
  background: color-mix(in srgb, var(--brand) 16%, transparent);
  color: var(--brand);
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 0.85em;
}

/* ---------- Install ---------- */
.install-wrap {
  display: grid;
  grid-template-columns: 1fr;
  gap: 32px;
  align-items: center;
}
.terminal {
  background: #06090f;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  overflow: hidden;
  box-shadow: var(--shadow);
}
.terminal-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px 16px;
  border-bottom: 1px solid #1b2336;
  background: #0a0e16;
}
.terminal-bar span { width: 12px; height: 12px; border-radius: 50%; display: inline-block; }
.terminal-bar .r { background: #ff5f56; }
.terminal-bar .y { background: #ffbd2e; }
.terminal-bar .g { background: #27c93f; }
.terminal pre {
  margin: 0;
  padding: 22px;
  font-family: var(--mono);
  font-size: 0.92rem;
  line-height: 1.9;
  color: #d7e2f2;
  overflow-x: auto;
}
.terminal .prompt { color: var(--brand); }
.terminal .comment { color: #6b7a93; }
.install-copy h2 { font-size: clamp(1.7rem, 4vw, 2.3rem); letter-spacing: -0.03em; margin: 0 0 12px; }
.install-copy p { color: var(--text-muted); margin: 0 0 22px; }
.install-copy .footnote { font-size: 0.88rem; }
.install-copy code {
  font-family: var(--mono);
  background: color-mix(in srgb, var(--brand) 16%, transparent);
  color: var(--brand);
  padding: 1px 6px;
  border-radius: 6px;
  font-size: 0.85em;
}

/* ---------- Advertisers ---------- */
.advertisers { background: var(--bg-elevated); border-top: 1px solid var(--border); border-bottom: 1px solid var(--border); }
.adv-grid { display: grid; grid-template-columns: 1fr; gap: 22px; margin-bottom: 36px; }
.adv-card {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 26px;
  background: var(--bg-card);
}
.adv-card h3 { margin: 0 0 8px; font-size: 1.12rem; letter-spacing: -0.02em; }
.adv-card p { margin: 0; color: var(--text-muted); }
.adv-cta { text-align: center; }

/* ---------- Final CTA ---------- */
.final {
  text-align: center;
  padding: 96px 0;
  position: relative;
  overflow: hidden;
}
.final::before {
  content: '';
  position: absolute;
  inset: 0;
  background: radial-gradient(60% 100% at 50% 100%, color-mix(in srgb, var(--brand) 22%, transparent), transparent 70%);
  pointer-events: none;
}
.final .container { position: relative; }
.final h2 { font-size: clamp(1.9rem, 5vw, 3rem); letter-spacing: -0.03em; margin: 0 0 14px; }
.final p { color: var(--text-muted); max-width: 54ch; margin: 0 auto 28px; font-size: 1.1rem; }

/* ---------- Footer ---------- */
.site-footer {
  border-top: 1px solid var(--border);
  padding: 36px 0;
  color: var(--text-muted);
  font-size: 0.9rem;
}
.site-footer .container {
  display: flex;
  flex-direction: column;
  gap: 12px;
  align-items: center;
  text-align: center;
}

/* ---------- Responsive ---------- */
@media (min-width: 720px) {
  .header-nav { display: flex; }
  .steps { grid-template-columns: repeat(3, 1fr); }
  .value-grid { grid-template-columns: repeat(3, 1fr); }
  .adv-grid { grid-template-columns: repeat(3, 1fr); }
  .site-footer .container { flex-direction: row; justify-content: space-between; text-align: left; }
}
@media (min-width: 920px) {
  .install-wrap { grid-template-columns: 1.05fr 0.95fr; }
}
`;
