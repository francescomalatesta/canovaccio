---
name: project-isolation
description: How one project runs in several checkouts at once - a git worktree per piece of work next to the main checkout, each with a slot that shifts its ports and names, so environments, dev servers and tests never collide. Defines the slot model, the isolation contract, .canovaccio/isolation.json, the slot block of the env file, worktree rules and a script to create, list, check and remove worktrees. Load when creating or removing a worktree, when bringing up the environment of an isolated project, in workflow-env-init, and when a change touches ports, compose files or dev server configuration.
---

# Project isolation

A project is **isolated** when several checkouts of it can run at the same time, each with its own environment, dev servers and tests, without colliding. Parallel work then means one git worktree per piece of work and one session per worktree.

## Slots

- The **main checkout** is slot 0. Each **worktree** gets a slot from 1 to 9 when it is created.
- **Slot 0 is the project as it is today.** With no slot variables set, every port and name keeps the value it had before the project was isolated.
- In slot *n*, every port variable is its base plus `offset × n` (offset 10: Phoenix on 4000 runs on 4010, 4020…), and every name variable gets the suffix `_<n>`.
- **Full isolation.** Each slot runs its own environment: its own Compose project (`COMPOSE_PROJECT_NAME`), containers, networks and data volumes, its own databases, created by the project's migrations and seed. Slots share nothing but package-manager caches and Docker images.
- At most `activeLimit` environments of the project run at once, all slots counted (default 3). Environments of other checkouts are never stopped or changed without the user's choice (see Environment in `workflow-rules`).

## The contract

The behavior is binding; the mechanism is the project's choice. A project is isolated when:

1. **Every port it binds on the host** in development and test comes from a slot variable whose default is today's value: ports published by Compose, dev servers run on the host, the test server, the E2E app, the prototype system, live reload and debuggers that open a port. Ports inside containers and container-to-container addresses (`db:5432`) do not change.
2. **Every reference to those ports derives from the same variable**: base URLs, dev proxies, CORS and allowed origins, the E2E `baseURL`, readiness checks run from the host, the commands in README and `docs/environment.md`.
3. **Compose names nothing globally**: no `container_name`, no fixed `name:` on volumes or networks, no `external` networks or volumes shared between checkouts. The project name comes from `COMPOSE_PROJECT_NAME`.
4. **Resources outside Compose carry the slot**: a database on a server installed on the host, buckets, queue prefixes, files written outside the project.
5. **Session cookies are named per slot** when the app sets cookies on `localhost`: browsers do not separate cookies by port, so two slots open in one browser would share a login.
6. **The documented commands read the slot by themselves**: start, ready check, stop, tests, dev server. Compose reads the env file on its own; host processes read it through the project's mechanism (a dotenv loader, a wrapper script, a task runner). Nobody exports variables by hand. An interactive shell hook such as direnv alone is not enough: agents run commands in non-interactive shells.
7. **Tests follow the slot**: the test database lives in the slot's environment or carries its suffix, and the E2E app listens on the slot's test port or on a free port.
8. **What must stay fixed is pinned**: a port registered with an external party (an OAuth redirect URI, a webhook endpoint, a device or app that points to a fixed port) is listed under `pinned` with its reason. What depends on it works in slot 0 only.

CI configuration is not part of the contract: it runs one checkout per job and keeps its ports.

## `.canovaccio/isolation.json`

The machine-readable side of the contract, versioned with the project. The script reads it; `docs/environment.md` explains it to people.

```json
{
  "offset": 10,
  "activeLimit": 3,
  "envFile": ".env",
  "variables": {
    "PORT": { "port": 4000 },
    "TEST_PORT": { "port": 4002 },
    "DB_PORT": { "port": 5432 }
  },
  "include": [".env", "deps"],
  "setup": ["mix deps.get", "npm ci --prefix assets"],
  "pinned": [{ "port": 4100, "reason": "OAuth redirect URI registered with the provider" }]
}
```

- `variables` — each one is either `{ "port": <base> }` or `{ "name": "<base>" }`. Bases that differ by a multiple of the offset below `offset × 10` collide between slots (4000 and 4010): `check` reports them.
- `envFile` — where the slot block is written. It must be untracked and ignored by git; an example file (`.env.example`) holds what newcomers copy.
- `include` — untracked paths copied from the main checkout into a new worktree: the env file with its local secrets, local certificates, dependency directories worth reusing (`deps`, `node_modules`). Do not copy build output whose content depends on the slot, such as `_build` when a cookie name is compiled in.
- `setup` — commands run in the new worktree, with the slot variables set: dependency installs, the steps a fresh checkout needs. Bringing the environment up is not setup: the workflow that runs in the worktree does it.
- `pinned` — ports that stay fixed in every slot, each with its reason.

## The slot block

`isolation.mjs new` writes the worktree's slot at the end of its env file, between markers:

```sh
# >>> canovaccio slot (managed by isolation.mjs: do not edit)
CANOVACCIO_SLOT=2
COMPOSE_PROJECT_NAME=myapp-csv-export
PORT=4020
TEST_PORT=4022
DB_PORT=5452
# <<< canovaccio slot
```

The rest of the file is left alone, except that lines setting one of the slot variables are commented out with `# canovaccio-slot:`, so no loader reads two values. The main checkout has no block: the defaults are slot 0.

## Worktrees

- A worktree lives **next to the main checkout**: `<parent>/<repo>.wt/<slug>/`. Never inside the project: test runners, type checkers, linters, file watchers and Docker build contexts would pick up a second copy of the code.
- **The worktree is the project** for the session opened in it: work, temporary files (`.canovaccio/tmp/`), work directories (`docs/work/`) and the environment all belong to that worktree.
- **One session per worktree.** Git already refuses to check out the same branch in two worktrees.
- A new worktree starts detached at its base (by default the default branch): the workflow run in it creates its branch as usual. `--branch` checks out a branch instead, existing or new.
- Removing a worktree stops its environment and keeps its branch and data volumes. Deleting the volumes is a separate command that needs approval.

## The script

`scripts/isolation.mjs` in this skill's directory (the skill tool lists its absolute path). Node 18+, no dependencies. Run it from any checkout of the project, or with `--root <dir>`.

```sh
node <skill-dir>/scripts/isolation.mjs new <slug> [--base <ref>] [--branch <name>]
node <skill-dir>/scripts/isolation.mjs list [--json]
node <skill-dir>/scripts/isolation.mjs env [--slot <n>|free] [--project <name>] [--write <file>] [--json]
node <skill-dir>/scripts/isolation.mjs check
node <skill-dir>/scripts/isolation.mjs remove <slug>
```

- `new` reads the config **at the base**, refuses when the base is not isolated or the env file is tracked or not ignored, picks the lowest slot not used by another worktree whose ports are free on `127.0.0.1`, adds the worktree, copies `include`, writes the slot block and runs `setup`.
- `list` shows every checkout with its slot, branch, environment (running containers of its Compose project) and active workflows (`docs/work/*/state.md` not closed or abandoned), and how many environments run against the limit. It also works on a project that is not isolated.
- `env` prints the slot variables of the current checkout: these are the ports and names to use and to give to agents. `--slot free --project <name> --write <file>` gives a throwaway checkout, such as a verification clone, a slot of its own.
- `check` verifies the contract: errors for a tracked or unignored env file, colliding bases, a pinned port that is also a slot port, and in Compose files fixed published ports, `container_name`, fixed volume or network names and external resources; warnings for base ports written as literals elsewhere, on lines that read no variable. A warning is fixed, pinned, or recorded as not a dev or test port.
- `remove` refuses a worktree with uncommitted or untracked files and the worktree the session runs in, stops its environment with `docker compose down` (volumes kept), removes the worktree and prints the command that would delete its volumes.

Exit codes: 0 ok, 1 errors, 2 the project has no `.canovaccio/isolation.json`.

## Recipes

`reference/recipes.md` shows the usual changes for Compose, Phoenix and Ecto, Vite, Next.js, Node servers, Rails, Django, Playwright and Storybook. They are starting points: the project's own patterns come first.
