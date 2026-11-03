# Security

## Reporting a problem

Please don't open a public issue for a security problem. Use the repository's **Security** tab → **Report a vulnerability** instead, and include the steps to reproduce it.

## What GitFlux does on your computer

- It **reads** your repository with the `git` command and watches the `.git` folder. It never changes your files, branches or history. It keeps its own notes in `.git/gitflux/` (the guard setting and the recent activity, with secrets like tokens blanked out), which git never commits or uploads. A list of running GitFlux servers lives in `~/.gitflux/`.
- The page is served on `localhost` only (port 4317 by default) and is not reachable from other machines.
- If the [GitHub CLI](https://cli.github.com) is signed in, GitFlux asks it for your pull requests and checks. It never sees or stores your GitHub token.
- Nothing is sent anywhere else: no analytics, no telemetry, no accounts.
- With an agent plugin, the agent's hooks send GitFlux your prompts and the git commands it runs, over `localhost`, so the page can show them. The last 100 are kept in `.git/gitflux/history.json` with secrets blanked out; delete that folder to clear them.

More detail in [docs/privacy-and-security.md](docs/privacy-and-security.md).
