---
name: project-docs
description: How a project's system docs work - a compact map of the codebase under docs/ (index, architecture, components, flows), read at the start of every workflow and synced with the code at the end. Includes templates, the reading and sync protocols, and a checker script.
---

# Project docs

System docs are a **map** of the codebase: they tell an agent or a person where to look and what to know before touching an area. They do not replace reading the code.

## Principles

1. **Map, not mirror.** Document what the code does not say easily: purpose, boundaries, entry points, interactions, invariants, pitfalls. Do not restate signatures, field lists or implementation details that the code already shows; they go stale first.
2. **Code is the source of truth.** Use docs to decide where to look, then verify in the code before acting. When docs and code disagree, trust the code and record the discrepancy so the docs get fixed.
3. **Every component doc declares what it covers.** Its frontmatter lists the code paths it describes. This maps a change to the docs it impacts mechanically.
4. **Current state only.** Docs describe the system as it is now. History (why and how something changed) lives in `docs/work/` and `CHANGELOG.md`.

## Structure

```
AGENTS.md                 # points to docs/index.md
docs/
  index.md                # compact entry point, read first
  architecture.md         # system overview
  components/<name>.md    # one per component
  flows/<name>.md         # optional: journeys spanning several components
  .docsignore             # optional: paths no doc needs to cover
  work/                   # workflow artifacts, not system docs
```

A component is a unit people reason about as a whole: a module, a service, a bounded area. Not a file. Keep each doc under roughly 150-200 lines; split a component that outgrows it.

## Templates

### Project `AGENTS.md` pointer

Add to the project `AGENTS.md` (create the file if missing):

```markdown
## System docs

Start from `docs/index.md`: it maps the codebase to its components. Docs are a map; the code is the source of truth.
```

### `docs/index.md`

Keep it under about 100 lines: it is read at the start of every workflow.

```markdown
# <Project> docs

<One or two sentences: what the system is.>

- [Architecture](architecture.md) — components, boundaries, main flows

## Components

| Component | Code | What it does |
|---|---|---|
| [billing](components/billing.md) | `src/billing/`, `src/jobs/invoice-*` | invoicing, VAT, PDF export |

## Flows

| Flow | What it covers |
|---|---|
| [checkout](flows/checkout.md) | cart to paid order, across cart, billing and payments |
```

Every system doc must be linked from `index.md`.

### `docs/architecture.md`

```markdown
# Architecture

## Overview        — what the system does, main runtime pieces
## Components      — one line each, how they depend on each other
## Data            — main stores and who owns what
## Integrations    — external services and where they are wrapped
## Cross-cutting   — auth, config, errors, logging, i18n: where each lives
## Running locally — how to start and test, or a pointer to the README
```

### `docs/components/<name>.md`

```markdown
---
covers:
  - src/billing/**
  - src/jobs/invoice-*.ts
---
# Billing

## Purpose           — what it does, and what it explicitly does not
## Entry points      — the files and functions to start from
## Key concepts      — domain terms, data model outline
## Interactions      — what it depends on, what depends on it
## Invariants and pitfalls
## Testing           — where its tests are, how to run them
```

`covers` uses globs relative to the project root: `**` any path, `*` any name segment, a trailing `/` means the whole directory.

### `docs/flows/<name>.md`

For journeys that cross components: the steps, the component handling each step, where state changes, where it typically breaks. `covers` is optional.

## Reading protocol (start of a workflow)

1. If `docs/index.md` exists, read it first, then the component and flow docs relevant to the request.
2. Use them to target the code reading; dispatch `@scout` with the relevant doc paths as starting points.
3. Verify in the code before relying on a doc statement. Record any discrepancy in `state.md` Notes: it is fixed at docs sync.

If there is no `docs/index.md`, read the code as usual; docs get started at sync time.

## Docs sync (end of a workflow)

Run as its own step before closure, with the full diff of the work. Dispatch `@doc-writer` for it, passing the work directory, the base branch and the discrepancies recorded in `state.md`.

1. Run the checker in changed mode against the base branch (see below). It lists impacted docs, changed files no doc covers, and docs already changed.
2. Update every impacted doc to match the code as it is now. Only what changed; do not rewrite sections that are still correct.
3. For changed files no doc covers: extend the `covers` of the right component, or create a component doc when the work touched a new area substantially and understood it. Do not create empty stubs.
4. Fix the recorded discrepancies.
5. Update `index.md` and `architecture.md` when components were added, removed, renamed or re-bounded.
6. Update `CHANGELOG.md` following `project-changelog`.
7. Run the checker in full mode: it must report no errors.

**Project without docs** (the checker exits with code 2): create `docs/index.md`, the pointer in the project `AGENTS.md`, and docs only for the areas this work understood well. The map fills in as work touches the codebase. If the project is large and mostly undocumented, mention `/docs-init` once at the delivery gate.

## Checker script

`scripts/check-docs.mjs` in this skill's directory (the skill tool lists its absolute path). Node 18+, no dependencies. Run it from the project root:

```sh
node <skill-dir>/scripts/check-docs.mjs                 # full check
node <skill-dir>/scripts/check-docs.mjs --changed main  # impact of changes since main, uncommitted included
```

It reports errors (exit 1) for: component docs without `covers`, `covers` globs matching no file, broken relative links, docs not linked from `index.md`. It also lists files no doc covers; that list is informational. Exit code 2 means the project has no `docs/index.md`.

Paths that no doc should cover (tests, generated code, fixtures) go in `docs/.docsignore`, one glob per line.
