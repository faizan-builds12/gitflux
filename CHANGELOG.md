# Changelog

## 0.2.0

- **Works with any way of using git.** By hand in any terminal or app (`npx github:faizan-builds12/gitflux`), with the Claude Code plugin, or with the Codex plugin. Nothing in the page assumes a particular agent.
- **Codex support.** A Codex plugin (`.codex-plugin`, `.agents/plugins/marketplace.json`) with the same hooks. Codex can't show a permission prompt to a plugin, so in Ask mode GitFlux stops the risky command and Codex asks you in the chat; your yes re-runs it as `GITFLUX_ALLOW=1 git …`.
- `gitflux init-hooks --agent codex` connects Codex without the plugin.
- The agent panel names the connected agent, or says "No agent" when you work by hand.
- Fixed: on Windows, hooks couldn't find the running GitFlux when the folder was spelled with a short name (such as `C:\PROGRA~1`).
- Fixed: GitFlux credited agent commands to "Claude Code" even when Codex ran them.
- A guided tour, a rule book of safe requests to paste to your agent, and a 30-second explainer video.

## 0.1.0

- First version: live map of your laptop and GitHub, plain-English activity, Needs attention alerts, and the risky command guard for Claude Code.
