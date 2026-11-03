# Getting started

You need [Node.js 20+](https://nodejs.org) and git. Check with `node --version` and `git --version`.

GitFlux works the same way however you use git. Pick the one that sounds like you:

| You… | Install |
|---|---|
| type git commands yourself, or use VS Code, GitHub Desktop or another app | [By hand](#by-hand-no-agent): one command, nothing to install |
| use Claude Code | [Claude Code plugin](#claude-code) |
| use Codex | [Codex plugin](#codex) |
| use another agent, or don't want a plugin | [By hand](#by-hand-no-agent) still shows every git change; the agent panel stays empty |

## By hand (no agent)

Open a terminal **in your project folder** and run:

```bash
npx github:faizan-builds12/gitflux
```

The first run asks to download GitFlux (say yes). Your browser opens the map at `http://localhost:4317`. Leave the terminal open while you work: every commit, branch, push and pull appears as it happens, whichever app you use. Press `Ctrl+C` to stop.

- Another folder: `npx github:faizan-builds12/gitflux path/to/project`
- Another port: `npx github:faizan-builds12/gitflux --port 5000`
- Don't open the browser: add `--no-open`

To skip the download each time, install it once: `npm install -g github:faizan-builds12/gitflux`, then run `gitflux` in any project.

## Claude Code

In a terminal, or the Code tab of the desktop app:

```bash
claude plugin marketplace add faizan-builds12/gitflux
claude plugin install gitflux@gitflux
```

Start a new session in your project. The first time, the map opens in your browser. After that the session prints the link when it starts, and `/gitflux` opens it again.

## Codex

In the Codex app: **Plugins** → **Add a marketplace** → enter `faizan-builds12/gitflux` → find **GitFlux** and click **+**.

Or from a terminal:

```bash
codex plugin marketplace add faizan-builds12/gitflux
codex plugin add gitflux@gitflux
```

Codex asks you to approve the plugin's hooks once. More in [GitFlux in Codex](codex.md).

## Pull requests and checks (optional)

Install the [GitHub CLI](https://cli.github.com) and run `gh auth login`. GitFlux then shows your open pull requests and whether their checks passed. Without it, everything you push and pull still shows.

## Connect an agent without the plugin

This writes GitFlux's hooks into the project's settings, so the agent panel works without installing a plugin:

```bash
npx github:faizan-builds12/gitflux init-hooks                 # Claude Code: .claude/settings.json
npx github:faizan-builds12/gitflux init-hooks --agent codex   # Codex: .codex/hooks.json
```

It keeps any hooks you already have. Run it again to update; it won't add duplicates.

## Uninstall

- By hand: nothing to remove (or `npm uninstall -g gitflux` if you installed it globally).
- Claude Code: `claude plugin uninstall gitflux@gitflux`
- Codex: remove GitFlux under **Plugins**
- In any project, delete `.git/gitflux/` to clear GitFlux's notes.
