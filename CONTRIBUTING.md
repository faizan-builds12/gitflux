# Contributing

Thanks for helping. Bug reports, plain-English wording fixes and new git situations GitFlux should catch are all welcome.

## Set up

You need Node.js 20+ and git.

```bash
npm install
npm run build      # UI, CLI, then the self-contained plugin in plugin/
npm test           # real git operations in temporary repositories
npm run demo       # plays a scripted agent session you can watch
```

## Where things live

```
packages/cli/       the watcher, classifier, guard and hook client (TypeScript), with its tests
packages/ui/        the page (React + Vite)
plugin/             what gets installed; see plugin/README.md
scripts/            build-plugin.mjs, logo.mjs and the demo
docs/               guides, the visual guide, and the README's images and video
video/              the explainer video (Remotion)

.claude-plugin/     the Claude Code marketplace listing: points at plugin/
.agents/plugins/    the Codex marketplace listing: points at plugin/
.github/            tests on every push, issue and pull request templates
```

The two marketplace folders have to sit at the repository root, because that's where Claude Code and Codex look when someone adds `faizan-builds12/gitflux`. The plugin itself lives in `plugin/`, which has no dependencies, so installing it doesn't download the build tools.

`plugin/bin` and `plugin/ui` are committed on purpose: plugin installs and `npx github:…` run straight from the repository with nothing to build. Run `npm run build` and commit them along with your source change.

## Pull requests

- Add a test in `packages/cli/test` for any new event, alert or guard rule. Tests create real repositories, so describe the git situation, not the implementation.
- Keep wording plain: say "snapshot" and "your laptop", not "commit object" and "local ref". Name no particular agent in what the page shows; use the connected agent's name or "your agent".
- Run `npm test` before you open the PR.
