---
description: Open GitFlux, the live map of your git and GitHub activity
allowed-tools: Bash(node:*)
---

!`node "${CLAUDE_PLUGIN_ROOT}/bin/gitflux.mjs" open`

Tell the user, in one short sentence, that GitFlux is open and give them the link printed above. If it says GitFlux could not start, say that and suggest running `node "${CLAUDE_PLUGIN_ROOT}/bin/gitflux.mjs"` in the project folder to see the error.
