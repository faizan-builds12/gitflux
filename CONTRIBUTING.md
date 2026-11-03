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

| Folder | What's in it |
|---|---|
| `packages/cli` | The watcher, classifier, guard and hook client (TypeScript) |
| `packages/ui` | The page (React + Vite) |
| `plugin/` | What gets installed: `bin/gitflux.mjs` and `ui/` are **built**, the manifests and hooks are hand-written |
| `scripts/` | `build-plugin.mjs` and the demo |
| `video/` | The explainer video (Remotion) |
| `docs/` | Guides and the README's images and video |

`plugin/bin` and `plugin/ui` are committed on purpose: plugin installs and `npx github:…` run straight from the repository with nothing to build. Run `npm run build` and commit them along with your source change.

## Pull requests

- Add a test in `packages/cli/test` for any new event, alert or guard rule. Tests create real repositories, so describe the git situation, not the implementation.
- Keep wording plain: say "snapshot" and "your laptop", not "commit object" and "local ref". Name no particular agent in what the page shows; use the connected agent's name or "your agent".
- Run `npm test` before you open the PR.
