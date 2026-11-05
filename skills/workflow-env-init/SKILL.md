---
name: workflow-env-init
description: Workflow for making an existing project run in several checkouts at once - inventory every fixed port and global name of its environment, dev servers and tests, approve the slot variables, make them variable with today's values as defaults, and prove that slot 0 is unchanged and that two slots run side by side. Load for /env-init, or when work in parallel worktrees needs a project that is not isolated yet.
---

# Env init workflow

Bring an existing project to the isolation contract of `project-isolation`, so that each piece of work can run in its own worktree. Apply `workflow-rules` and `project-isolation` throughout.

The defining rule: **slot 0 is unchanged.** In the main checkout, with no slot block, every port, name and command works exactly as before. Everything else this workflow does is verified against that.

The work is a behavior-preserving change for slot 0, so it follows the refactor's discipline: inventory first, small reviewed steps, each leaving the project working. It touches no UI behavior: Impeccable stays off.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 slot plan** | before any change to project files | slot variables and their bases, pinned ports, how each process reads the env file, include and setup, the steps |
| **G2 delivery** | after closure | integration of the work |

Pinning a port that the plan made variable, or making variable one it pinned, during the work is an unplanned gate.

## Phases

### 0. Setup

Create the work directory with `brief.md` (request, classification and reason) and `state.md`. The branch `env-init/<slug>` is created in phase 3. The work runs in the main checkout: it defines slot 0.

### 1. Inventory

Follow the `project-docs` reading protocol, `docs/environment.md` first. When `.canovaccio/isolation.json` exists, run `isolation.mjs check`: this workflow completes an isolation that is partial or broken.

Bring the environment up (see Environment in `workflow-rules`), then record the **baseline**: the published ports (`docker compose ps`, or the doc's ready check), the ports the dev servers and the test run actually open, and the output of the project's test suite.

Dispatch `@scout`, with the doc paths as starting points, to list with file and line:

- every port bound on the host in development and test: Compose published ports, dev servers run on the host, the test server, the E2E app, the prototype system, live reload, debuggers;
- every reference to those ports: URLs, dev proxies, CORS and allowed origins, E2E base URLs, readiness checks, README, docs, Makefile, package scripts, Procfiles;
- global names in Compose: `container_name`, fixed volume and network names, external resources;
- resources outside Compose with fixed names: databases on a server installed on the host, buckets, queue prefixes, files written outside the project;
- how each process gets its configuration today, and whether it reads an env file; whether that file is tracked by git; the example file, if any;
- session cookies set on `localhost`, and where their name is defined;
- ports registered with external parties (OAuth redirect URIs, webhooks, mobile or desktop clients pointing to a fixed port);
- what a fresh checkout needs that git does not hold (env file, certificates, local config) and the commands that prepare it (dependency installs, code generation), with the dependency directories worth copying instead of rebuilding;
- CI files that set ports: they stay as they are, but are listed so nobody changes them by mistake.

Ask it to report anything surprising: ports chosen at random, a port fixed by a library default, two services on bases that collide between slots (4000 and 4010 with offset 10).

### 2. Slot plan

Write `plan.md`:

- **slot variables** — one row each: name, kind (`port` or `name`), base (today's value), where it is configured, the references that derive from it;
- **pinned** — each fixed port with its reason, and what works in slot 0 only because of it;
- **env file** — which file holds the slot block (default `.env`), how each process reads it (Compose by itself; host processes through a loader, a wrapper or a task runner, chosen from the project's existing patterns); if the file is tracked, the proposal to untrack it with an example file;
- **cookies** — how the session cookie gets its slot, when there is one;
- **include and setup** — what `isolation.mjs new` copies and runs;
- **test data** — where the test database of each slot lives (see Test data isolation in `AGENTS.md`);
- **steps** — small vertical steps, each leaving the project working in slot 0 and independently committable. Usually: the config file, the env file and the Compose services; then each host process with its references; then tests and E2E; then the prototype system; then README and scripts. A project with nothing to isolate (no environment, no fixed port) has one step: the config file with no variables.

Dispatch `@spec-reviewer` with the request, the scout's inventory and `plan.md`. The questions to ask: is every inventoried port either a variable or pinned with a reason, do the bases collide, does each step keep slot 0 working, and is the env-file mechanism one the project already uses? Fix BLOCKING findings; list at the gate any finding you chose not to address, with the reason.

Present **G1** with `plan.md`, the pinned ports and what they cost, and the minor-findings policy.

### 3. Steps

Create the branch. Run the Review loop of `workflow-rules` for each step: one `@implementer` dispatch per step, passing the step, `plan.md`, the `project-isolation` skill and its recipes, and the ready check; then `@task-reviewer` on its commits, before the next step. Each step:

- keeps today's value as the default of every variable it introduces;
- runs the affected part of the project in slot 0 and the test suite, green;
- runs `isolation.mjs check` once the config file exists, and leaves no new error.

Update `state.md`, give a one-line CHECKPOINT per step and go on with the next step in the same turn: from G1 the work runs to G2 without stopping (see Run to completion in `workflow-rules`).

### 4. Verification

1. **Contract.** `isolation.mjs check`: no errors. For each warning, the line is either fixed, or its value is not a dev or test port: record those in `decisions.md`.
2. **Slot 0 unchanged.** In the main checkout, with no slot block, restart what the work touched and compare against the baseline of phase 1: same published ports, same ports opened by the dev servers and the test run, same test results, the documented commands working as written.
3. **Two slots side by side.** Commit, then create a verification worktree with `isolation.mjs new canovaccio-verify --base HEAD`, which also checks the env file rules, copies `include` and runs `setup`. In the worktree, with the main checkout's environment still running:
   - bring the environment up with the documented command, wait for its ready check;
   - start the app on the slot's port and check that it answers there, and that slot 0's app answers on its own port;
   - run the full test suite in both checkouts at the same time, E2E included;
   - check that slot 0's development data is unchanged.

   Record the commands and results in `state.md`. Then stop the worktree's app, run `docker compose -p <repo>-canovaccio-verify down -v` in the worktree (its data is throwaway) and `isolation.mjs remove canovaccio-verify` from the main checkout.
4. When a check fails, fix it through the Review loop as a new step, and verify again.

### 5. Docs sync

Dispatch `@doc-writer` for the docs sync described in `workflow-rules`, with the work directory, the base branch, workflow type `env-init` and the discrepancies recorded in `state.md`. `docs/environment.md` gets its Isolation section (see `project-docs`), created with the doc when the project had none; README and the commands in the docs read as they are typed in any slot. Review its report; commit the docs and changelog changes with the work.

### 6. Closure

1. Commit `decisions.md` if it exists.
2. Run the closure review (see Closure review in `workflow-rules`) against the base branch, with the request, `plan.md`, `decisions.md` if any and the `project-isolation` contract, plus the verification results of phase 4. The focus is slot 0 equivalence (no default changed, no test weakened), completeness against the inventory, references that still point at a fixed port, and the env file being read by every documented command.
3. On FAIL, fix through the Review loop, one fix task per `@implementer` dispatch, each reviewed by `@task-reviewer`, and review again; after two failures, open an unplanned gate.
4. Write `closure.md`: verdict, verification run with results, the slot variables and pinned ports, deviations, deferred minor findings, and how to start parallel work (`/worktree new <slug>`).

### 7. Delivery

Present **G2** with `closure.md` and the integration options from `superpowers:finishing-a-development-branch`; its convention proposals are accepted or rejected one by one (see Project conventions in `workflow-rules`). Worktrees made from the base branch become isolated only once the work is integrated: say so. Execute the chosen option, then set `state.md` to `closed`.

## Switching

- A port cannot be made variable without changing behavior the user sees in slot 0 → unplanned gate: pin it, or propose `workflow-feature` for the change.
- The inventory finds a bug (a test that writes to the development database, a service that never stops) → record it and propose `workflow-fix` afterwards, unless it blocks the verification, then an unplanned gate.
