![](https://github.com/francescomalatesta/canovaccio/blob/main/canovaccio.png)

> **canovaccio** /ka.noˈvat.tʃo/ *(Italian, noun)* — the plot outline of a *commedia dell'arte*
> play: a sketch of scenes and entrances on which the actors improvised the dialogue.

## What it is

canovaccio turns a coding agent into a small, disciplined development team. You describe *what* you want; the setup decides *how* the work proceeds.

A controller agent, the **conductor**, recognizes the kind of work you asked for and runs the matching workflow. It delegates each role to a specialized agent: one researches the codebase, one reviews specifications, one builds UI prototypes, one implements, one reviews each change, one steps in when a fix does not converge, one keeps the docs current, and one does the final review. The conductor stops at a few **human gates**, where you approve a spec, a prototype or the delivery, and works autonomously everywhere else.

Every piece of work leaves a trail: a spec or findings, the decisions taken, a changelog entry, and project docs updated to match the code. The next piece of work starts from those docs instead of rediscovering the codebase. Progress is saved to disk, so work resumes where it stopped, even in a new session.

The workflows:

- **greenfield** — a new project from scratch: explores the product with you, fixes stack and architecture in a spec, prototypes the UI, then builds it starting from a minimal end-to-end skeleton.
- **feature** — new or changed behavior in an existing project: spec and plan approved together (separately when a UI prototype is needed), then implementation task by task, each one reviewed.
- **fix** — something works wrong: reproduces it, finds the root cause, fixes it test-first. The most autonomous workflow: it asks you only when the fix is risky or the expected behavior is unclear.
- **refactor** — better structure, same behavior: pins current behavior with tests before touching the code, then restructures in small steps that keep every test green.
- **spike** — a question to answer before building (is it feasible? which library?): researches and runs throwaway experiments within a set budget, and ends with a written recommendation.
- **docs-init** — brings an existing project to a complete docs map in one pass, instead of letting it fill in as work goes.

## Layout

| Path | Role |
|---|---|
| `AGENTS.md` | universal engineering principles, always loaded |
| `opencode.jsonc` | models, plugins, permissions, compaction |
| `agents/` | the conductor (primary controller) and the specialized subagents |
| `skills/workflow-*/` | the workflows: phases, gates, artifacts |
| `commands/` | explicit entry points to the workflows, plus `/cost` |
| `install.sh` | installs canovaccio into a project or globally |

Layers, from general to specific:

- **principles** (`AGENTS.md`) — how work is done, always;
- **workflows** (`skills/`) — sequencing, human gates, artifacts;
- **roles** (`agents/`) — who executes each piece of work;
- **techniques** (superpowers) — how a single activity is done. Workflows take precedence over superpowers skills on sequencing and approvals.

## Install

`install.sh` installs canovaccio without keeping a clone: it fetches the chosen version into a temporary directory and copies `opencode.jsonc`, `agents/`, `commands/` and `skills/` into the target. Requires `git` and `sha256sum` or `shasum`.

**Into a single project** (`<project>/.opencode/`, which opencode loads on top of the global config):

```sh
cd my-project
curl -fsSL https://raw.githubusercontent.com/francescomalatesta/canovaccio/main/install.sh | sh -s -- --local
```

`AGENTS.md` is not copied in this mode, because opencode does not read it from `.opencode/`. Its content goes into the project's `AGENTS.md` between `<!-- canovaccio:start -->` and `<!-- canovaccio:end -->`; the rest of the file is untouched.

**Globally** (`$OPENCODE_CONFIG_DIR`, or `~/.config/opencode`):

```sh
curl -fsSL https://raw.githubusercontent.com/francescomalatesta/canovaccio/main/install.sh | sh -s -- --global
```

Options: `--ref <branch|tag|commit>` to install a specific version (default `main`), `--dry-run` to preview, `--uninstall` to remove, `--force` to also replace files changed locally or not installed by canovaccio (originals are backed up as `*.canovaccio-bak.<timestamp>`). See `install.sh --help`.

The target keeps a `.canovaccio-manifest` with the installed version and file checksums. Running the script again updates to the requested version: it updates files you have not changed, keeps the ones you changed (and says so), removes files dropped upstream, and never touches files it did not install. On a first install it stops if canovaccio files would overwrite existing ones, unless `--force`.

**For development of canovaccio itself**, point opencode at the working copy instead:

```sh
export OPENCODE_CONFIG_DIR=/path/to/canovaccio
```

## Usage

Start a workflow explicitly:

```
/greenfield a CLI to track reading lists
/feature export orders as CSV
/refactor split the billing module
/fix login returns 500 with an expired password
/spike can we use SQLite with concurrent writers here?
/docs-init
```

Or just describe the work: the conductor classifies it with `workflow-router`, announces the choice, and you confirm it at the first gate. Questions and trivial changes run without a workflow.

## Workflows

| Workflow | For | Human gates |
|---|---|---|
| `greenfield` | new project | spec (with stack and architecture) · prototype, if UI · plan · delivery |
| `feature` | new or changed behavior | spec+plan (split only when a prototype is needed) · prototype, if material UX · delivery |
| `refactor` | same behavior, better structure | scope and invariants · delivery |
| `fix` | wrong existing behavior | fix approach, only when the expected behavior is unclear or the fix is risky · delivery |
| `spike` | a question to answer before building | framing · decision |
| `docs-init` | bootstrapping system docs in an existing project | map (index, architecture, components) · delivery |

Shared rules are in `skills/workflow-rules`: blocking gates vs. non-blocking checkpoints, when an unplanned gate is allowed, workflow switching, branches, and how superpowers skills are used inside a phase.

Push, merge and destructive git commands also require approval through the permissions in `opencode.jsonc`.

## Session cost

Sessions with many subagents are hard to budget. `skills/session-cost/scripts/session-cost.mjs` reads the local opencode database (`~/.local/share/opencode/opencode.db`) and, given the id of the parent session, follows every sub-session to report total cost, a cost tree, and breakdowns by agent and by model, with token and cache-hit stats.

```sh
/cost <session-id>                                            # from inside opencode
node skills/session-cost/scripts/session-cost.mjs --list      # find a session id
node skills/session-cost/scripts/session-cost.mjs <id> --json # machine-readable
```

Requires Node 22.5+, no dependencies; the database is opened read-only. Costs are the ones opencode records: if a provider reports no pricing they show as 0.

## Artifacts

Each workflow works in `docs/work/<date>-<slug>/` inside the target project:

- versioned with the work: `spec.md`, `decisions.md`, `findings.md`;
- local only (git-ignored): `brief.md`, `plan.md`, `invariants.md`, `repro.md`, `closure-plan.md`, `closure-evidence.md`, `closure.md`, `state.md`.

UI prototypes are not work artifacts: they live in the project's prototype system, described below.

The conductor adds the ignore rules to the project's `.gitignore` on first use. `state.md` records phase, approved gates and completed tasks, so a workflow can resume after a context compaction or in a new session.

## UI prototypes

Each project has **one prototype system**, defined by `skills/project-prototypes`: a tool and an area where every UI prototype lives, such as Storybook for a React or Vue frontend, or a dev-only route area for server-rendered templates. It is chosen once, in the spec of the first work that needs a prototype (you approve it with the spec), documented in `docs/prototypes.md`, and reused by every later workflow. Whatever the tool, it starts with one command, lists the prototypes in an index, uses the project's real components, gives every state its own URL and stays out of production builds.

At the prototype gate the conductor starts the system and gives you the URLs to open in the browser: no screenshots or one-off formats. At delivery you keep or remove each prototype (default remove); kept ones stay in the index, grouped apart, as a record of the approved design. The system itself always stays.

## Impeccable

What canovaccio uses of [Impeccable](https://impeccable.style), and where. Integrated so far: the **design detector**, about sixty deterministic rules for design defects (low contrast, skipped headings, cramped padding, text overflow) and for the tells of generated UI (nested cards, gradient text, overused fonts, bounce easing). No LLM involved; it needs neither `PRODUCT.md` nor `DESIGN.md`. The Impeccable skill, its commands and its design context files are not used yet.

### The choice

Per workflow, yours. When the work touches the UI, the conductor asks: no · yes, advisory findings as Minor · yes, advisory findings excluded. Advisory findings are the detector's soft signals, possibly deliberate (em-dash overuse, numbered section labels). Say it in the request to skip the question: `/feature export orders as CSV, with impeccable, advisory excluded`. The answer is recorded in `state.md`.

### Coverage

| Workflow | Asked | Checked |
|---|---|---|
| greenfield | at G1, if the product has a UI | prototype states in the browser, every task, closure review |
| feature | at the first gate (G1 or G1a), if the UI changes | prototype states in the browser if there is a prototype, every task, closure review |
| refactor | at G1, if the perimeter includes UI code | every step, closure review |
| fix | at the start, if the bug concerns the UI (or when that emerges) | the fix task; closure review only when G-fix was opened |
| spike, docs-init | never | — |

Every task is checked twice: `@implementer` on its own diff before committing, `@task-reviewer` on the commits. Prototype states are scanned by `@ui-prototyper` at desktop and mobile width, and the prototype gate shows what is left.

### Rules

- Only findings the work introduced count. Breakage and accessibility are Important; everything else is Minor and follows the minor-findings policy (fix or defer).
- A choice approved in the prototype is never a finding.
- Agents never silence the detector: ignores are proposed at delivery and accepted one by one.
- When the detector cannot run, checks are reported as not run, never as passed.

### Running it

`skills/design-check/scripts/design-check.mjs` runs the detector through `npx` at a pinned version: nothing is installed in the project. Requires Node 22.18+, and a Chromium-based browser for rendered checks.

```sh
node skills/design-check/scripts/design-check.mjs --check                          # can it run here
node skills/design-check/scripts/design-check.mjs --changed main --advisory minor  # UI files changed since main
node skills/design-check/scripts/design-check.mjs --url http://localhost:6006/... --advisory exclude
```

## System docs and changelog

Projects keep a **map** of their codebase in `docs/`, defined by `skills/project-docs`:

- the project `AGENTS.md` points to `docs/index.md`, a compact index of components;
- `docs/architecture.md` gives the overview;
- `docs/components/<name>.md` describes one component, and its frontmatter `covers` lists the code paths it describes;
- `docs/flows/<name>.md`, optional, describes journeys across components.

Docs describe what the code does not say easily (purpose, boundaries, entry points, interactions, pitfalls); the code stays the source of truth.

`docs/conventions.md` is different: it prescribes how code is written in the project, to correct the model where it tends to err. Workflows collect evidence of such errors (your corrections at gates, recurring review findings, guesses between inconsistent patterns) and propose at most three entries at delivery. **Nothing enters the file unless you accept it explicitly**, entry by entry.

Every workflow except spike starts from the docs to find where to work, and ends with a **docs sync** step: `@doc-writer` maps the diff to the impacted docs through `covers`, updates them, documents new areas and adds the `CHANGELOG.md` entry ([Keep a Changelog](https://keepachangelog.com), rules in `skills/project-changelog`). The closure review checks both. Projects without docs get them incrementally, as work touches the code, or all at once with `/docs-init`.

`skills/project-docs/scripts/check-docs.mjs` (Node 18+, no dependencies) checks a project's docs: covers matching real files, links, index completeness, uncovered code; with `--changed <base>` it lists the docs a change impacts.

## First local check

Things to verify once with `opencode2`:

1. The conductor is the default agent and the six commands are listed.
2. `workflow-*` skills and superpowers skills are both available.
3. The conductor can dispatch subagents. If subagent dispatch is not available in your opencode version, the workflows fall back to inline execution (see `workflow-rules`). Also check that the `subagent` permission action used in the agents matches your version's tool name.
4. `git push` asks for approval.
5. A small `/fix` on a scratch project stops at the delivery gate with a `closure.md`, a `CHANGELOG.md` entry and, if the project has docs, a docs sync.
6. `doc-writer` can edit `docs/` and `CHANGELOG.md` but not source files.
