---
name: project-docs
description: How a project's system docs work - a compact map of the codebase under docs/ (index, architecture, components, flows, prototypes), read at the start of every workflow and synced with the code at the end. Includes principles, templates, the reading protocol and a checker script.
---

# Project docs

System docs are a **map** of the codebase: they tell an agent or a person where to look and what to know before touching an area. They do not replace reading the code.

## Principles

1. **Map, not mirror.** Document what the code does not say easily: purpose, boundaries, entry points, interactions, invariants, pitfalls. Do not restate signatures, field lists or implementation details that the code already shows; they go stale first.
2. **Code is the source of truth.** Use docs to decide where to look, then verify in the code before acting. When docs and code disagree, trust the code and record the discrepancy so the docs get fixed.
3. **Every component doc declares what it covers.** Its frontmatter lists the code paths it describes. This maps a change to the docs it impacts mechanically.
4. **English.** Docs are written in English, even when the project's existing docs or the request are in another language. Existing text in another language is not translated as a side effect (see Language in `AGENTS.md`).
5. **Current state only.** Docs describe the system as it is now. History (why and how something changed) lives in `docs/work/` and `CHANGELOG.md`.

## Structure

```
AGENTS.md                 # points to docs/index.md
docs/
  index.md                # compact entry point, read first
  architecture.md         # system overview
  components/<name>.md    # one per component
  flows/<name>.md         # optional: journeys spanning several components
  prototypes.md           # when the project has a prototype system: which and how
  site.md                 # when the project has a public site built with workflow-site: how a page is built
  conventions.md          # coding conventions the user explicitly accepted
  .docsignore             # optional: paths no doc needs to cover
  work/                   # workflow artifacts, not system docs
```

A component is a unit people reason about as a whole: a module, a service, a bounded area. Not a file. Keep each doc under roughly 150-200 lines; split a component that outgrows it.

## Templates

### Project `AGENTS.md` pointer

Add to the project `AGENTS.md`, outside the canovaccio block if there is one (create the file if missing):

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
- [UI prototypes](prototypes.md) — how to write prototypes (only if the project has them)
- [Conventions](conventions.md) — how code is written here (only if the file exists)
- [Product](../PRODUCT.md) and [design system](../DESIGN.md) — who the product is for and how its UI looks (only if the files exist, see `design-context`)

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

### `docs/prototypes.md`

Created when the project's prototype system is set up (see `project-prototypes`), before its first prototype is judged. It is the recipe for writing a prototype in this project: with it and the spec, a new prototype needs no further research, and every workflow uses the same system.

```markdown
---
covers:
  - src/prototypes/**
---
# UI prototypes

## System                — the tool and why it was chosen, how it meets each point
                           of the contract, the decision it comes from
## Location              — the area; each prototype in <area>/<work>/ with its PROTOTYPE.md
## Adding a prototype    — steps: create the directory, register it in the index,
                           wire the dev-only route; reference files to copy from
## Building blocks       — components, layout, theme, icons to use and where they
                           are imported from; what not to use
## Mock data and states  — where mock data lives and its shape; how loading, error
                           and empty states are simulated and given their own URL
## Running               — command and URL of the prototypes index; how to check
                           every kept prototype still loads
## Production isolation  — how the area stays out of production builds, how to verify
## Keep or remove        — what removing a prototype deletes, what always stays
                           (the system), how a kept one is marked and grouped
```

More prescriptive than other docs, but still no copied code: point to reference files in the project instead, so the checker catches them when they move. The doc describes the system and how to work in it, not individual prototypes: those are listed by the area's index, which is permanent and keeps `covers` matching.

### `docs/site.md`

Created when a site's model page is approved (see `workflow-site`), from `@site-builder`'s report. It is the recipe for a page of the site: with it and the page's content, a new page needs no further research and looks like the others.

```markdown
---
covers:
  - src/components/site/**
  - src/pages/**
---
# Public site

## Stack and layout    — where the site lives, how it builds and runs, where it is hosted
## Building blocks     — each block: file, the kind of section it serves, variants and parameters,
                         the page that shows it best
## Adding a page       — files to create, where its copy goes, how it reaches the navigation
                         and the sitemap
## Tokens              — where colors, type, spacing and radii live; DESIGN.md is their description
## SEO and metadata    — how title, description, canonical, Open Graph, sitemap and robots are produced
## Integrations        — signup and contact targets, forms, analytics and consent
## Checks              — the build, site-check with the content files of the work that built each page,
                         the design check
```

Like `prototypes.md`, more prescriptive than other docs and without copied code: it points to the model page and the blocks as reference files.

### `docs/conventions.md`

How code is written in this project, where the model would otherwise get it wrong. Unlike other docs it prescribes, and **it contains only entries the user explicitly accepted**; nothing is added, changed or removed without that. It exists only once the first entry is accepted. How entries are proposed is in `workflow-rules`.

```markdown
# Conventions

## Code structure       — where new code goes, module and file naming
## Errors               — how errors are raised, wrapped, surfaced
## Data and persistence — query patterns, migrations, transactions
## APIs                 — request and response shapes, validation, versioning
## Testing              — layers, naming, fixtures, what to mock
## Dependencies         — when adding one is acceptable
## Git                  — commit and branch conventions
```

Only the sections that have entries. One entry per line: the rule, a short reason, and a reference file as example. Nothing a linter, formatter or type checker already enforces. Keep it under about 150 lines: it is read for every task.

## Reading protocol (start of a workflow)

1. If `docs/index.md` exists, read it first, then `conventions.md` if it exists, then the component and flow docs relevant to the request.
2. Use them to target the code reading; dispatch `@scout` with the relevant doc paths as starting points.
3. Verify in the code before relying on a doc statement. Record any discrepancy in `state.md` Notes: it is fixed at docs sync.

If there is no `docs/index.md`, read the code as usual; docs get started at sync time.

## Docs sync (end of a workflow)

Done by `@doc-writer` as a step of its own before closure; its procedure is in its instructions, the step in `workflow-rules`.

**Project without docs** (the checker exits with code 2): create `docs/index.md`, the pointer in the project `AGENTS.md`, and docs only for the areas this work understood well. The map fills in as work touches the codebase. If the project is large and mostly undocumented, mention `/docs-init` once at the delivery gate.

## Checker script

`scripts/check-docs.mjs` in this skill's directory (the skill tool lists its absolute path). Node 18+, no dependencies. Run it from the project root:

```sh
node <skill-dir>/scripts/check-docs.mjs                 # full check
node <skill-dir>/scripts/check-docs.mjs --changed main  # impact of changes since main, uncommitted included
```

It reports errors (exit 1) for: component docs without `covers`, `covers` globs matching no file, broken relative links, docs not linked from `index.md`. It also lists files no doc covers; that list is informational. Exit code 2 means the project has no `docs/index.md`.

Paths that no doc should cover (tests, generated code, fixtures) go in `docs/.docsignore`, one glob per line.
