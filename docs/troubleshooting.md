# Troubleshooting

**The page didn't open.**
With a plugin, it only opens by itself the first time in each project; after that the session prints the link when it starts (`GitFlux is watching my-app: http://localhost:4317`); in Claude Code, `/gitflux` opens it. By hand, the link is printed in the terminal.

**The map is empty.**
If the folder isn't a git repository yet, that's fine: the map appears the moment `git init` runs. If you started GitFlux in a parent folder, run it inside the project instead, or pass the path: `npx github:faizan-builds12/gitflux path/to/project`.

**The agent panel says "No agent".**
GitFlux hasn't heard from an agent in this project. Working by hand, that's expected; everything else still works. With a plugin, start a new session after installing. In Codex, approve the hooks once with `/hooks` (see [GitFlux in Codex](codex.md)).

**Pull requests and checks don't show.**
Install the [GitHub CLI](https://cli.github.com) and run `gh auth login`, then restart GitFlux.

**Port 4317 is busy.**
GitFlux tries the next port by itself and prints the one it used. To pick one: `--port 5000`.

**The guard paused something I wanted to run.**
In Claude Code, answer yes to the permission question. In Codex, tell it to go ahead in the chat. To stop the pauses, set the guard to **Off** at the bottom of the agent panel. The setting is per project.

**`npx` asks to install a package.**
That's GitFlux being downloaded from GitHub. Say yes. To skip it next time: `npm install -g github:faizan-builds12/gitflux`, then just run `gitflux`.

**Still stuck?** [Open an issue](https://github.com/faizan-builds12/gitflux/issues/new/choose) with what you ran and what GitFlux printed.
