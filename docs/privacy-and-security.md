# Privacy and security

**Short version:** GitFlux runs only on your computer. It reads git, shows a page on `localhost`, and sends nothing to anyone.

## What it reads

- Your repository, through the `git` command: branches, snapshots (commits), tags, the reflog, and which files changed. It watches the `.git` folder so it knows when to look again.
- If the [GitHub CLI](https://cli.github.com) is signed in: your pull requests and their checks, through `gh`. GitFlux never sees your GitHub token.
- With an agent plugin: your prompts and the git commands the agent runs, sent by the agent's hooks to GitFlux over `localhost`.

## What it changes

Nothing in your project. GitFlux never runs a git command that changes anything: no commits, no checkouts, no pushes. The guard can only *stop* a command your agent was about to run; it never runs one.

## What it stores

| Where | What |
|---|---|
| `.git/gitflux/guard.json` | The guard mode (Ask, Block or Off) |
| `.git/gitflux/history.json` | The last 150 activity lines and 100 agent entries, so the page isn't empty after a restart. Tokens, passwords and keys are blanked out before saving |
| `~/.gitflux/` | Which GitFlux servers are running, so a second session finds the first instead of starting another |

Everything inside `.git/` stays on your computer: git never commits or uploads it. Delete `.git/gitflux/` to clear it.

`init-hooks` (only if you run it) adds GitFlux's hooks to `.claude/settings.json` or `.codex/hooks.json` in your project, and keeps any you had.

## Who can see the page

Only you. The server listens on `127.0.0.1` and refuses requests from other websites (it checks the `Host` and `Origin` of every request and WebSocket), so a web page you visit can't read your map.

## What it sends

Nothing. No analytics, no telemetry, no accounts, no network requests except `gh` asking GitHub for your own pull requests.

Found a problem? See [SECURITY.md](../SECURITY.md).
