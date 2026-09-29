---
name: session-cost
description: Cost and token report for an opencode session and all its sub-sessions (subagents), read from the local opencode database. Load when the user asks how much a session cost or where the spend went.
---

# Session cost

Run the bundled script with the id of the parent session; it follows `parent_id` down through every sub-session and prints the total, a cost tree, and breakdowns by agent and by model.

```sh
node <skill-dir>/scripts/session-cost.mjs --list            # find the session id
node <skill-dir>/scripts/session-cost.mjs <session-id>      # id prefix is enough
node <skill-dir>/scripts/session-cost.mjs <session-id> --json
```

Options: `--db PATH` (default `$OPENCODE_DB`, else `~/.local/share/opencode/opencode.db`), `--sort cost|time`.

- Node 22.5+ (`node:sqlite`), no dependencies. The database is opened read-only.
- Costs are the per-session `cost` and `tokens_*` columns of `session_v2`, as recorded by opencode. They are treated as the session's own spend and summed up the tree. If a provider reports no pricing the cost is 0.
- Report the numbers as printed; do not estimate costs the script did not show.
