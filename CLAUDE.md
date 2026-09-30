@AGENTS.md

## Claude Code

- Skills: `/preflight`, `/ship-feature`, `/d1-migration`, `/steward` (see `.claude/skills/`). Path-scoped
  rules in `.claude/rules/` load automatically when you touch matching files.
- Cloud sessions run `.claude/hooks/session-start.sh` first: it installs dependencies and applies local
  D1 migrations, so lint, tests, build and `pnpm dev` work straight away. Chromium for Playwright is
  preinstalled at `/opt/pw-browsers/chromium`; do not run `playwright install`. If Playwright says its
  browser is missing, the pinned version expects a newer build: launch with
  `launchOptions.executablePath` set to that path instead of downloading.
- `.claude/settings.json` asks before deploys, `--remote` wrangler commands and `wrangler secret`.
  Treat that prompt as a stop sign unless the user asked for that exact action.
- Before calling work done, run `/preflight` and quote its results in your reply or PR body.
