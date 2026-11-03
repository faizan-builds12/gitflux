# plugin/

What Claude Code and Codex install, and what `npx github:faizan-builds12/gitflux` runs. Everything here is ready to run, with nothing to install.

| Path | What it is | Edited by hand? |
|---|---|---|
| `.claude-plugin/plugin.json` | The Claude Code plugin manifest | Yes |
| `.codex-plugin/plugin.json` | The Codex plugin manifest | Yes |
| `hooks/hooks.json`, `hooks/codex-hooks.json` | When each agent calls GitFlux (session start, prompts, before and after commands) | Yes |
| `commands/gitflux.md` | The `/gitflux` command in Claude Code | Yes |
| `bin/gitflux.mjs` | The whole CLI, server and guard in one file | No: built from `packages/cli` |
| `ui/` | The page | No: built from `packages/ui` |
| `THIRD_PARTY_LICENSES.txt` | Licenses of the code bundled into `bin/` and `ui/` | No: built |

Run `npm run build` at the repository root to rebuild the generated files.

This folder is separate from the repository root on purpose. The root has a `package.json` with build tools, and an agent that installed the root as the plugin would download all of them. This folder has no dependencies, so installing takes seconds.
