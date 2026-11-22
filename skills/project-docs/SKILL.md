---
name: project-docs
description: How a project's system docs work - a compact map of the codebase under docs/ (index, architecture, components, flows, environment, prototypes), read at the start of every workflow and synced with the code at the end, and the two overviews for people at the project root (FEATURES.md, ARCHITECTURE.md). Includes principles, templates, which workflow updates what, the reading protocol and a checker script.
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
FEATURES.md               # for people: what the software does, feature by feature
ARCHITECTURE.md           # for people: how the system works, told as a narrative
AGENTS.md                 # points to docs/index.md
docs/
  index.md                # compact entry point, read first
  architecture.md         # system overview
  components/<name>.md    # one per component
  flows/<name>.md         # optional: journeys spanning several components
  environment.md          # when the project needs services to run or test: how to start and stop them
  prototypes.md           # when the project has a prototype system: which and how
  site.md                 # when the project has a public site built with workflow-site: how a page is built
  conventions.md          # coding conventions the user explicitly accepted
  .docsignore             # optional: paths no doc needs to cover
  work/                   # workflow artifacts, not system docs
```

A component is a unit people reason about as a whole: a module, a service, a bounded area. Not a file. Keep each doc under roughly 150-200 lines; split a component that outgrows it.

### Overviews for people

`FEATURES.md` and `ARCHITECTURE.md`, at the project root (for a greenfield project built inside a repository that already holds another project, its own directory), are not part of the map. They are written for a person, the project owner or a developer new to it, who reads them from top to bottom to know what the software does and how it works. They follow principles 2, 4 and 5 above, but not the first: they explain, they do not point. They may repeat what `docs/architecture.md` or a component doc says; the readers differ, so the duplication is intended. They have no `covers`: what keeps them current is the table in Overviews by workflow below, the docs sync and the closure review.

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
- [Features](../FEATURES.md) and [architecture overview](../ARCHITECTURE.md) — for people: what the software does and how it works (only if the files exist)
- [Environment](environment.md) — services the project runs on, how to start and stop them (only if the project has them)
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
## Running locally — how to start and test, or a pointer to the README;
                    the services it needs are in environment.md
```

### `FEATURES.md`

The inventory of what the software does today, seen by the people who use it.

```markdown
# Features

What <Product> does today, feature by feature. How it changed over time is in [CHANGELOG.md](CHANGELOG.md).

## <Area, as users see it>

- **<Feature>** — <one or two sentences: what it lets whom do>.
```

- **One entry per feature**, of one or two sentences, never more. A feature is something its users would call by name and a release note would announce: "PDF export", not "the export button shows a spinner".
- **Sections by area as the users perceive it** (accounts and access, invoicing, administration), not by code module. Split a section that grows past about fifteen entries.
- **Every feature that exists is listed**, including those behind a feature flag or open to some users only, with no marker: they exist, so they are documented.
- **Include**: what each kind of user can do (end user, administrator, operator); for a library or a CLI, its commands or API capabilities; integrations as users see them ("export to Google Drive"); cross-cutting capabilities users perceive (languages, offline use, roles, notifications); a rule or limit only when it is part of what the feature is ("over the last 12 months").
- **Exclude**: how a feature is built (technologies, components, code paths: `ARCHITECTURE.md`); history (`CHANGELOG.md`); planned features and roadmap; edge cases, error messages, UI details; known bugs; internal developer tooling (scripts, seeds, dev tools).

Example:

```markdown
## Invoicing

- **Invoices** — Draft an invoice from a customer and line items; VAT and totals are computed as you type.
- **Recurring invoices** — An invoice can repeat monthly or yearly and is issued automatically on its date.
- **PDF export** — Every issued invoice can be downloaded as a PDF with the workspace logo.
```

### `ARCHITECTURE.md`

The text a person reads in ten to fifteen minutes to hold the model of the system in their head: what runs, where the code is, how a request goes through it, where the data lives, which structural decisions must not be broken. Prose, not lists of facts; typically 150-300 lines. Only the sections that apply.

```markdown
# Architecture

## In one paragraph        — what the system is and its shape: the main runtime pieces and the stack, by name
## Runtime                 — the processes and stores that run and how they talk to each other, with a
                             small diagram; what each process does and does not do
## Code map                — the top-level directories and what lives in each
## How it works            — one to three representative flows told end to end (see below)
## Data                    — where data lives, who owns what, what can be lost and what cannot
## Security and access     — how the system decides who sees and does what: authentication, roles, tenancy
## Integrations            — external services, what each is used for, where they are wrapped
## Cross-cutting           — configuration and secrets, errors and logging, i18n, feature flags: how each works
## Deployment              — where and how it runs in production, when known
## Decisions and constraints — the structural decisions in force and the system-wide invariants,
                             each with its reason in one line
```

- **The flows of How it works** are chosen because they cross most of the architecture and show mechanisms the rest of the system reuses: a request that hands work to a background job, an event arriving from an external service, a scheduled job when it is central. Not one per feature: the step-by-step journey of a feature belongs in `docs/flows/`. Name the main pieces a flow goes through when that helps find them.
- **Include**: the stack by name; processes, stores and the boundaries between them; the code map down to the top-level directories; the data model in outline (main entities, who owns them); the security model; integrations; the decisions and invariants that span the system.
- **Exclude**: the internals of single components (`docs/components/`); signatures, table fields, lists of endpoints; versions (the lockfile has them); edge cases and local workarounds; how to start the project (`docs/environment.md`, the README); coding conventions (`docs/conventions.md`); the history of decisions (only the decision in force and its reason).

Example:

```markdown
## How it works: issuing an invoice

The controller validates the input and calls the `IssueInvoice` action. Inside a transaction it locks
the workspace's counter row, assigns the number and saves the invoice, then queues `SendToExchange`.
The worker sends the invoice to the exchange, which answers later through a webhook that updates the
delivery status. External services are only ever called from jobs, so a slow provider never blocks a request.
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

### `docs/environment.md`

Created when the project needs services to run or to be tested (a database, a cache, a queue, a mail catcher, or the app itself running in containers), usually defined in a compose file, and when the project is isolated (see `project-isolation`). It is the recipe workflows follow to bring the environment up at their start and down at their end (see Environment in `workflow-rules`): with it, nobody has to work out again how the project runs.

```markdown
---
covers:
  - compose.yaml
  - docker/**
  - .canovaccio/isolation.json
---
# Environment

## Services     — each service: what it is for, how it runs (container, host install),
                  its ports, published on 127.0.0.1
## Start        — the command that starts them all, detached, and what it needs first
                  (an .env file copied from its example, a network, a build)
## Ready        — the check that tells the services are ready to use (a healthcheck,
                  pg_isready, a URL that answers), so nobody waits with a sleep
## Stop         — the command that stops them and removes containers and networks,
                  keeping the data volumes; how to drop the data too, when that is wanted
## Data         — the volumes, what they hold, which are development data and which are
                  throwaway; where test data goes (see Test data isolation in AGENTS.md)
## Isolation    — when the project is isolated: the slot variables with their base and
                  what reads each one, the pinned ports and why, how each process reads
                  the env file, what a new worktree copies and runs; the source is
                  .canovaccio/isolation.json. Otherwise: "Not isolated: one checkout runs
                  the environment at a time", with the fixed ports that prevent it
```

`covers` lists the files that define the environment and exist in the project: compose files, Dockerfiles, `.devcontainer/`, `.canovaccio/isolation.json`, the scripts the commands run. A change to them is then mapped to this doc at docs sync. Commands are written as they are typed, from the project root.

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

## Overviews by workflow

`@doc-writer` writes and updates `FEATURES.md` and `ARCHITECTURE.md` as part of the docs sync, from the diff and the current code:

| Workflow | `FEATURES.md` | `ARCHITECTURE.md` |
|---|---|---|
| `workflow-greenfield` | written at the docs sync, with the features of the first version | written with the docs scaffold, from the spec and the walking skeleton; brought up to date at the docs sync |
| `workflow-feature` | entries added, changed or removed for the behavior the work added, changed or removed, consistent with the changelog entry | updated when the work changed what it describes: runtime pieces, code map, data, security, integrations, cross-cutting mechanisms, deployment, a decision or an invariant |
| `workflow-fix` | only when the fix made an entry untrue, or the entry was already wrong | only when the fix changed what it describes |
| `workflow-refactor`, `workflow-env-init` | only when an entry was wrong | updated when the work changed what it describes; a refactor usually does |
| `workflow-site` | no change: the public site is not a feature of the software | in an existing project, updated to say where the site lives and how it is built and served; a site of its own has neither file |
| `workflow-docs-init` | written when missing, from the survey; an existing one is left as it is | written when missing, from the survey; an existing one is left as it is |
| `workflow-spike`, `workflow-security-audit`, `workflow-design-init` | no change | no change |

Every workflow corrects a statement it proves untrue in either file, and records the discrepancy like any other.

**When a file is missing**, only greenfield and docs-init create it: a docs sync elsewhere does not, because an inventory that covers only what one piece of work touched would read as complete. The docs sync reports it, and the controller mentions `/docs-init` once at the delivery gate.

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
