# @thinkcashback/cli

Earn revenue by displaying sponsored ads during Claude Code's thinking spinner.

The CLI wires two Claude Code integration points:

- **`spinnerVerbs`** — the top-line verb pool shown while Claude is thinking. We mix in sponsored verbs (tagged `✶ … ↗`) alongside your own.
- **`statusLine`** — a persistent bottom status bar. We point it at a small daemon that rotates ad copy and reports impressions.

## Install

```bash
npm install -g @thinkcashback/cli
thinkcashback login        # authenticate (GitHub OAuth, or --token / --mock)
thinkcashback install      # configure ~/.claude/settings.json + register device
```

Restart Claude Code afterwards.

## Commands

| Command | What it does |
| --- | --- |
| `thinkcashback login` | Authenticate. `--token <jwt>` pastes a token; `--mock` uses a dev token. |
| `thinkcashback install` | Registers the device, injects ad `spinnerVerbs`, and sets `statusLine`. Backs up your prior settings for clean removal. |
| `thinkcashback uninstall` | Restores `~/.claude/settings.json` to its pre-install state. Keeps your credentials. |
| `thinkcashback status` | Shows login/registration/install state and a quick earnings snapshot. |
| `thinkcashback earnings` | Detailed earnings (today, total, pending payout). |

## How it stays safe

- Only `spinnerVerbs` and `statusLine` are touched in your Claude settings. Every other key is left byte-for-byte intact, and the exact pre-install state is recorded so `uninstall` restores it.
- Credentials (`api_key`, `signing_secret`, JWT) live in `~/.thinkcashback/config.json` written with `0600` permissions. The signing secret is never logged or printed.
- All API calls have timeouts and error handling. The statusline daemon degrades to its local ad cache (and a built-in fallback) when offline — it never crashes your status bar.
- Impressions are signed with HMAC-SHA256 over a canonical message; the backend verifies the signature.

## Configuration / env overrides

| Variable | Purpose |
| --- | --- |
| `THINKCASHBACK_API_BASE` | Override the API base URL. |
| `THINKCASHBACK_HOME` | Override the config/cache directory (default `~/.thinkcashback`). |
| `CLAUDE_SETTINGS_PATH` | Override the Claude settings path (default `~/.claude/settings.json`). |
| `THINKCASHBACK_STATUSLINE_BIN` | Override the absolute statusline script path written into `statusLine`. |

## Develop

```bash
npm install
npm run build       # tsc → dist/
npm test            # node --test via tsx
npm run typecheck   # tsc --noEmit
```

## API contract

Mirrors the backend (PRO-345):

- `POST /api/v1/devices` → `{ device_id, api_key, signing_secret }`
- `GET  /api/v1/ad?platform=claude_code_cli&country=XX&lang=XX` → `{ id, headline, url, tracking_id }`
- `POST /api/v1/impressions` ← `{ campaign_id, device_id, nonce, signature, duration_ms }`
- `GET  /api/v1/me/earnings` → earnings summary
