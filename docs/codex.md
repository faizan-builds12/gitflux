# GitFlux in Codex

## Install

In the Codex app:

1. Open **Plugins** and choose **Add a marketplace**.
2. For **Source**, enter `faizan-builds12/gitflux` and click **Add marketplace**.
3. Find **GitFlux** and click **+** to install it.

Or from a terminal:

```bash
codex plugin marketplace add faizan-builds12/gitflux
codex plugin add gitflux@gitflux
```

## Approve the hooks once

GitFlux works through Codex hooks: small commands Codex runs when a session starts, when you send a prompt, and before and after each shell command. Codex won't run a plugin's hooks until you trust them. Type `/hooks` in a Codex session and approve GitFlux's. You only do this once.

Until you approve them, GitFlux can still be run [by hand](getting-started.md#by-hand-no-agent), but the agent panel stays empty and the guard can't pause anything.

## How the guard asks you

Claude Code can show you a yes/no permission question for a risky command. Codex can't show one to a plugin, so in **Ask** mode GitFlux does this instead:

1. Codex tries a command that would lose work, such as `git push --force` when GitHub has snapshots your laptop doesn't.
2. GitFlux stops it and tells Codex what would be lost and the safer option. The agent panel shows **Paused. Codex will ask you first**.
3. Codex asks you in the chat whether to go ahead.
4. If you say yes, Codex runs it again as `GITFLUX_ALLOW=1 git push --force …`. GitFlux lets that through, and the panel shows that you allowed it.

In **Block** mode nothing gets through, not even with `GITFLUX_ALLOW=1`. In **Off** mode nothing is paused. Change the mode at the bottom of the agent panel.

## Without the plugin

```bash
npx github:faizan-builds12/gitflux init-hooks --agent codex
```

writes the same hooks to the project's `.codex/hooks.json`.
