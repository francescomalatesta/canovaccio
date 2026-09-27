# canovaccio

Versioned opencode (V2) setup: engineering principles, specialized agents and development workflows with human gates, on top of [superpowers](https://github.com/obra/superpowers).

## Layout

| Path | Role |
|---|---|
| `AGENTS.md` | universal engineering principles, always loaded |
| `opencode.jsonc` | models, plugins, permissions, compaction |
| `agents/` | the conductor (primary controller) and the specialized subagents |
| `skills/workflow-*/` | the workflows: phases, gates, artifacts |
| `commands/` | explicit entry points to the workflows |

Layers, from general to specific:

- **principles** (`AGENTS.md`) — how work is done, always;
- **workflows** (`skills/`) — sequencing, human gates, artifacts;
- **roles** (`agents/`) — who executes each piece of work;
- **techniques** (superpowers) — how a single activity is done. Workflows take precedence over superpowers skills on sequencing and approvals.

## Install

opencode reads its global configuration from `~/.config/opencode`, or from `$OPENCODE_CONFIG_DIR` when set. Either link the repository there:

```sh
ln -s /path/to/canovaccio ~/.config/opencode
```

or point opencode at it:

```sh
export OPENCODE_CONFIG_DIR=/path/to/canovaccio
```

If opencode writes cache or dependency files into the config directory, keep them out of this repository.

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
| `feature` | new or changed behavior | spec+plan (split when large or with prototype) · prototype, if material UX · delivery |
| `refactor` | same behavior, better structure | scope and invariants · delivery |
| `fix` | wrong existing behavior | fix approach, only if it changes behavior or is large · delivery |
| `spike` | a question to answer before building | framing · decision |
| `docs-init` | bootstrapping system docs in an existing project | map (index, architecture, components) · delivery |

Shared rules are in `skills/workflow-conventions`: blocking gates vs. non-blocking checkpoints, when an unplanned gate is allowed, workflow switching, branches, and how superpowers skills are used inside a phase.

Push, merge and destructive git commands also require approval through the permissions in `opencode.jsonc`.

## Artifacts

Each workflow works in `docs/work/<date>-<slug>/` inside the target project:

- versioned with the work: `spec.md`, `decisions.md`, `findings.md`;
- local only (git-ignored): `brief.md`, `plan.md`, `invariants.md`, `repro.md`, `prototype/`, `closure.md`, `state.md`.

The conductor adds the ignore rules to the project's `.gitignore` on first use. `state.md` records phase, approved gates and completed tasks, so a workflow can resume after a context compaction or in a new session.

## System docs and changelog

Projects keep a **map** of their codebase in `docs/`, defined by `skills/project-docs`:

- the project `AGENTS.md` points to `docs/index.md`, a compact index of components;
- `docs/architecture.md` gives the overview;
- `docs/components/<name>.md` describes one component, and its frontmatter `covers` lists the code paths it describes;
- `docs/flows/<name>.md`, optional, describes journeys across components.

Docs describe what the code does not say easily (purpose, boundaries, entry points, interactions, pitfalls); the code stays the source of truth.

Every workflow except spike starts from the docs to find where to work, and ends with a **docs sync** step: `@doc-writer` maps the diff to the impacted docs through `covers`, updates them, documents new areas and adds the `CHANGELOG.md` entry ([Keep a Changelog](https://keepachangelog.com), rules in `skills/project-changelog`). The closure review checks both. Projects without docs get them incrementally, as work touches the code, or all at once with `/docs-init`.

`skills/project-docs/scripts/check-docs.mjs` (Node 18+, no dependencies) checks a project's docs: covers matching real files, links, index completeness, uncovered code; with `--changed <base>` it lists the docs a change impacts.

## First local check

Things to verify once with `opencode2`:

1. The conductor is the default agent and the six commands are listed.
2. `workflow-*` skills and superpowers skills are both available.
3. The conductor can dispatch subagents. If subagent dispatch is not available in your opencode version, the workflows fall back to inline execution (see `workflow-conventions`). Also check that the `subagent` permission action used in the agents matches your version's tool name.
4. `git push` asks for approval.
5. A small `/fix` on a scratch project stops at the delivery gate with a `closure.md`, a `CHANGELOG.md` entry and, if the project has docs, a docs sync.
6. `doc-writer` can edit `docs/` and `CHANGELOG.md` but not source files.
