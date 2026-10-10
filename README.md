![](https://github.com/francescomalatesta/canovaccio/blob/main/canovaccio.png)

> **canovaccio** /ka.noˈvat.tʃo/ *(Italian, noun)* — the plot outline of a *commedia dell'arte*
> play: a sketch of scenes and entrances on which the actors improvised the dialogue.

## What it is

canovaccio turns a coding agent into a small, disciplined development team. You describe *what* you want; the setup decides *how* the work proceeds.

A controller agent, the **conductor**, recognizes the kind of work you asked for and runs the matching workflow. It delegates each role to a specialized agent: one researches the codebase, one reviews specifications, one builds UI prototypes, one implements, one reviews each change, one steps in when a fix does not converge, one keeps the docs current, and one does the final review; for a public site, one writes the strategy, one the copy, and one builds the model page; with [Impeccable](#impeccable), one also captures the product and its design system, and one reviews the design. The conductor stops at a few **human gates**, where you approve a spec, a prototype or the delivery, and works autonomously everywhere else.

Every piece of work leaves a trail: a spec or findings, the decisions taken, a changelog entry, and project docs updated to match the code. The next piece of work starts from those docs instead of rediscovering the codebase. Progress is saved to disk, so work resumes where it stopped, even in a new session.

The workflows:

- **greenfield** — a new project from scratch: explores the product with you, fixes stack and architecture in a spec, prototypes the UI, then builds it starting from a minimal end-to-end skeleton.
- **site** — a product's public website: facts, strategy and every word decided by stronger models and approved by you, a model page built in production code by a stronger model, the other pages built by the cheaper implementer and checked against the approved copy by a script. See [Public sites](#public-sites).
- **feature** — new or changed behavior in an existing project: spec and plan approved together (separately when a UI prototype is needed), then implementation task by task, each one reviewed.
- **fix** — something works wrong: reproduces it, finds the root cause, fixes it test-first. The most autonomous workflow: it asks you only when the fix is risky or the expected behavior is unclear.
- **refactor** — better structure, same behavior: pins current behavior with tests before touching the code, then restructures in small steps that keep every test green.
- **spike** — a question to answer before building (is it feasible? which library?): researches and runs throwaway experiments within a set budget, and ends with a written recommendation.
- **docs-init** — brings an existing project to a complete docs map in one pass, instead of letting it fill in as work goes.
- **design-init** — captures an existing project's product and visual system in `PRODUCT.md` and `DESIGN.md`, asking only what the code cannot tell, and optionally critiques its current interface.

## Layout

| Path | Role |
|---|---|
| `AGENTS.md` | universal engineering principles, always loaded |
| `opencode.jsonc` | models, plugins, permissions, compaction |
| `agents/` | the conductor (primary controller) and the specialized subagents |
| `skills/workflow-*/` | the workflows: phases, gates, artifacts |
| `commands/` | explicit entry points to the workflows, plus `/cost` |
| `install.sh` | installs canovaccio into a project or globally |
| `scripts/` | maintenance of canovaccio itself, not installed: `update-impeccable.mjs` |

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
/site public website for the invoicing app
/feature export orders as CSV
/refactor split the billing module
/fix login returns 500 with an expired password
/spike can we use SQLite with concurrent writers here?
/docs-init
/design-init
```

Or just describe the work: the conductor classifies it with `workflow-router`, announces the choice, and you confirm it at the first gate. Questions and trivial changes run without a workflow.

## Workflows

| Workflow | For | Human gates |
|---|---|---|
| `greenfield` | new project | spec (with stack and architecture) · prototype, if UI · plan · delivery |
| `site` | a product's public website | direction (strategy, stack) · content · model page · delivery |
| `feature` | new or changed behavior | spec+plan (split only when a prototype is needed) · prototype, if material UX · delivery |
| `refactor` | same behavior, better structure | scope and invariants · delivery |
| `fix` | wrong existing behavior | fix approach, only when the expected behavior is unclear or the fix is risky · delivery |
| `spike` | a question to answer before building | framing · decision |
| `docs-init` | bootstrapping system docs in an existing project | map (index, architecture, components) · delivery |
| `design-init` | capturing an existing project's `PRODUCT.md` and `DESIGN.md` | delivery (with the optional critique) |

Shared rules are in `skills/workflow-rules`: blocking gates vs. non-blocking checkpoints, when an unplanned gate is allowed, workflow switching, branches, and how superpowers skills are used inside a phase.

Push, merge and destructive git commands also require approval through the permissions in `opencode.jsonc`.

Work stays inside the project. Temporary files (scratch scripts, logs, captures, the clean clone of the greenfield closure) go in `.canovaccio/tmp/`, whose own `.gitignore` keeps the directory versioned and its content out of git; each workflow uses a subdirectory named after its work directory and deletes it when it closes. The permissions in `opencode.jsonc` deny the system temporary directories (`/tmp`, `/var/tmp` and their macOS equivalents) instead of asking, so a stray path fails and the agent retries inside the project without stopping for approval.

Tests never write to your development database. When tests persist data, the project gets a dedicated test database that the test commands use by default, E2E included (their app instance runs on it, on its own port), and a test run pointed at the development database stops instead of writing to it. A greenfield project sets it up in its spec and walking skeleton; a feature or fix on a project without it sets it up before adding tests that need it. Task and closure reviews check that a test run leaves the development database unchanged. The mechanism is the project's choice; the rule is in `AGENTS.md`.

The full E2E suite runs once per piece of work: when all tasks are done, right before the closure review, and again only after fixes to closure findings. Each task runs only the E2E tests it adds or changes (a refactoring step, those pinning the invariants it touches), together with the rest of the test suite. A greenfield walking skeleton keeps the E2E suite runnable apart from the other tests, and a single E2E test runnable on its own. The rule is in `AGENTS.md`, under When the E2E suite runs.

## Public sites

`/site` builds a product's public website (home, features, pricing, legal pages) with the work split by what it needs: the decisions that make a site good are taken by stronger, more expensive models and approved by you; building the rest of the pages is transcription, done by the cheap implementer and checked by a script instead of by a strong reviewer.

| Phase | Who (model) | Produces | Gate |
|---|---|---|---|
| facts | `@scout` | `facts.md`: what is true about the product, each fact with its source (code, config, your answers) | — |
| strategy | `@strategist` (Opus) | `strategy.md`: audience, positioning, message, objections, conversion, voice, sitemap; plus the technical `spec.md` | G1 direction |
| content | `@copywriter` (Opus) | `content.md`: every word of every page, calls to action, titles and descriptions | G2 content |
| design | `@design-director` | `PRODUCT.md`, `DESIGN.md`: you pick one of two or three visual directions | — |
| model page | `@site-builder` (Opus) | the site set up, its building blocks and the home page in production code | G3 model page |
| plan | `@site-builder` (Opus) | one task per page, every section mapped to a block: nothing left to decide | checkpoint |
| pages | `@implementer` + `@task-reviewer` (DeepSeek) | the other pages, transcribed from the content with the model page's blocks | — |
| closure | design review, closure review | the whole site judged against content, facts and model page | G4 delivery |

**No invented claims.** Every figure, price, customer, quote, integration or certification on a page cites a fact of `facts.md`. What nobody has established is an `[OPEN: ...]` placeholder, shown on the page until you fill it, listed at the content and delivery gates, never published.

**site-check.** `skills/site-content/scripts/site-check.mjs` (Node 18+, no dependencies) verifies rendered pages against `content.md` without an LLM: every piece of copy present, text on the page that the content does not contain (invented copy), calls to action linking to their targets, title and description, `lang`, one `h1`, alt texts, broken links and anchors, sitemap. It serves a static build itself or reads a running app:

```sh
node skills/site-content/scripts/site-check.mjs --lint --content docs/work/<work>/content.md --facts docs/work/<work>/facts.md
node skills/site-content/scripts/site-check.mjs --content docs/work/<work>/content.md --dist dist --sitemap
node skills/site-content/scripts/site-check.mjs --content docs/work/<work>/content.md --url http://localhost:3000 --page /pricing
```

The implementer runs it on its pages before committing, the task reviewer again, the closure on the whole site. Later copy changes go through `/feature`, which asks `@copywriter` for the words when the project has a site built this way. The models are set in `agents/strategist.md`, `agents/copywriter.md` and `agents/site-builder.md`.

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

- versioned with the work: `spec.md`, `decisions.md`, `findings.md`; in site work also `facts.md`, `strategy.md` and the content files;
- local only (git-ignored): `brief.md`, `plan.md`, `invariants.md`, `repro.md`, `design-interview.md`, `site-interview.md`, `design-review.md`, `closure-plan.md`, `closure-evidence.md`, `closure.md`, `state.md`.

UI prototypes are not work artifacts: they live in the project's prototype system, described below.

The conductor adds the ignore rules to the project's `.gitignore` on first use. `state.md` records phase, approved gates and completed tasks, so a workflow can resume after a context compaction or in a new session.

## UI prototypes

Each project has **one prototype system**, defined by `skills/project-prototypes`: a tool and an area where every UI prototype lives, such as Storybook for a React or Vue frontend, or a dev-only route area for server-rendered templates. It is chosen once, in the spec of the first work that needs a prototype (you approve it with the spec), documented in `docs/prototypes.md`, and reused by every later workflow. Whatever the tool, it starts with one command, lists the prototypes in an index, uses the project's real components, gives every state its own URL and stays out of production builds.

At the prototype gate the conductor starts the system and gives you the URLs to open in the browser: no screenshots or one-off formats. At delivery you keep or remove each prototype (default remove); kept ones stay in the index, grouped apart, as a record of the approved design. The system itself always stays.

## Impeccable

What canovaccio uses of [Impeccable](https://impeccable.style), and where. Integrated so far:

- the **design detector**, about sixty deterministic rules for design defects (low contrast, skipped headings, cramped padding, text overflow) and for the tells of generated UI (nested cards, gradient text, overused fonts, bounce easing). No LLM involved;
- the **design guidance** for whoever writes UI (`skills/design-craft`): Impeccable's quality floor, how to commit to a palette, faces and light or dark instead of the category default, and guidance per kind of page: app (Operate), landing and marketing (Persuade), docs (Read);
- the **design context**: `PRODUCT.md` (who the product is for, its purpose, voice and constraints) and `DESIGN.md` (the visual system, with machine-readable tokens), at the project root in Impeccable's format. `@design-director` builds them through a short interview; every later UI work follows them (`skills/design-context`);
- the **design review**, optional: `@design-reviewer` looks at captures of the changed screens and scores them with Impeccable's critique method (heuristics, design specificity, personas) before closure (`skills/design-review`).

Impeccable's own skill and commands are not installed: canovaccio takes its guidance and its tools, and keeps its own gates.

### The choice

Once per project, yours. The first time a greenfield, feature or refactor touches the UI, its first gate also asks (a site always runs with it unless you say no at its first gate): no · yes, advisory findings as Minor · yes, advisory findings excluded; with a yes, also whether to run the design review before closure. Advisory findings are the detector's soft signals, possibly deliberate (em-dash overuse, numbered section labels). The answers are saved in the project `AGENTS.md` and used by every later workflow without asking again; a fix never asks. Say it in a request to override it for that work (`/feature pricing page, without impeccable`, `... with design review`), edit `AGENTS.md` or ask to change it for good.

### Design context

- **greenfield**: after the spec gate, `@design-director` writes `PRODUCT.md` from the spec and asks only what it leaves open, then offers two or three visual directions to choose from (or "decide for me") and writes a seed `DESIGN.md`. The prototype is built on it; after its approval, `DESIGN.md` is aligned with what you approved.
- **site**: after the content gate, as in greenfield, with the approved strategy and copy as input; when the product already has the two files, the site extends its identity instead of inventing one. The model page is built on them; after its approval, `DESIGN.md` is aligned with it.
- **`/design-init`**, on an existing project: reads what the code says (tokens, components, styles, rendered pages), asks only what it cannot (intentions, what to keep, what you dislike), writes both files. At delivery it offers a critique of the current interface, a report to start improving from; it changes no code.
- The interview asks only necessary questions, each with a proposed answer so "ok" accepts them all, and "decide for me" always closes a choice. At most 3 rounds of 5 questions per file; what stays unknown is written as assumed or open, not asked again.
- Every later UI work follows the files; the docs sync keeps `DESIGN.md` current with the tokens and components a work adds.

### Coverage

| Workflow | Preference asked | Design context | Guidance while building | Checked |
|---|---|---|---|---|
| greenfield | at G1, if the product has a UI and no preference exists | built before the prototype | prototype, every task | prototype states in the browser, every task, design review if on, closure review |
| site | at G1: on unless you say no | built before the model page | model page, every task | model page in the browser, every task, design review if on, closure review |
| feature | at the first gate (G1 or G1a), if the UI changes and no preference exists | followed, kept current | prototype if any, every task | prototype states in the browser if there is a prototype, every task, design review if on, closure review |
| refactor | at G1, if the perimeter includes UI code and no preference exists | followed | every step | every step, closure review |
| fix | never: follows the preference, off without one | followed | the fix task | the fix task; closure review only when G-fix was opened |
| design-init | at its first round, only the missing answers | built from the code | — | optional critique |
| spike, docs-init | never: always off | — | — | — |

Every task is checked twice: `@implementer` on its own diff before committing, `@task-reviewer` on the commits. Prototype states are scanned by `@ui-prototyper` at desktop and mobile width, and the prototype gate shows what is left. The design review runs once per work, after the last task; its P0–P1 issues are fixed like Important findings.

### Rules

- The approved prototype, the spec, `docs/conventions.md`, `DESIGN.md` and the project's existing style win over the guidance; it never restyles UI outside the task.
- Only findings the work introduced count. Breakage and accessibility are Important; everything else is Minor and follows the minor-findings policy (fix or defer).
- A choice approved in the prototype is never a finding.
- Agents never silence the detector: ignores are proposed at delivery and accepted one by one.
- When the detector cannot run, checks are reported as not run, never as passed. A design review whose model cannot see the captures says so in its first line.
- `@design-reviewer` uses a model that reads images, needed for the captures; `@design-director` reads only text and code. Change them in their agent files if your providers differ.

### Running it

`skills/design-check/scripts/design-check.mjs` runs the detector through `npx` at a pinned version: nothing is installed in the project. Requires Node 22.18+, and a Chromium-based browser for rendered checks.

```sh
node skills/design-check/scripts/design-check.mjs --check                          # can it run here
node skills/design-check/scripts/design-check.mjs --changed main --advisory minor  # UI files changed since main
node skills/design-check/scripts/design-check.mjs --url http://localhost:6006/... --advisory exclude
node skills/design-check/scripts/design-check.mjs --screenshot http://localhost:3000/ --out shots/  # captures for a review
```

### Updating Impeccable

The `reference/` files of `design-craft`, `design-context` and `design-review` are extracted from an Impeccable release (Apache 2.0, license alongside), the detector is pinned in `skills/design-check`. `scripts/update-impeccable.mjs` regenerates them from the latest release, or `--tag skill-vX.Y.Z`, and reports the latest detector on npm; `--detector latest` pins it. Review the diff before committing: an upstream rewording reaches every project.

```sh
node scripts/update-impeccable.mjs                       # references from the latest release, detector version report
node scripts/update-impeccable.mjs --detector latest     # also pin the latest detector
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

## Language

Commit messages, pull request titles and descriptions, and documentation are always in English, whatever language you write in: system docs, `CHANGELOG.md`, README files, `PRODUCT.md`, `DESIGN.md` and the workflow artifacts in `docs/work/`. The conductor still talks to you in your language, and product content such as UI copy follows the product's requirements. Existing docs in another language are not translated along the way: what the work adds or rewrites is in English, and a full translation is separate work you can ask for. The rule is in `AGENTS.md`, under Language.

## Task tracker

If you track the project in an external tool (GitHub Projects, Jira, Linear, ClickUp, Trello), name the item when you start the work (`/feature #42`, or a link to the card) and the conductor keeps its status in step with the work, as defined by `skills/project-tracker`:

| When | Status (GitHub Projects Kanban) |
|---|---|
| the workflow picks the item up | Ready |
| work on project files starts | In progress |
| the closure review starts | In review |
| canovaccio merges the work itself | Done |

Items of single plan tasks, when you give one per task (`/feature #12 #13`), move to In progress and In review with their own implementation and review. When the work is delivered as a pull request, items stay In review and the PR links them (`Closes #42`): the merge and the board's automation move them to Done.

The first time, the conductor finds the tool through what the environment already provides (`gh`, another CLI, an MCP server), reads the board's statuses, maps them, and asks you to confirm the mapping at the first gate; the answer is saved in the project `AGENTS.md` under Task tracker and never asked again. It moves only items you named, never creates any, and changes only their status. Before each move it reads the current status: an item you moved by hand stays where you put it. When the tool cannot be reached the work goes on, and the report says which moves were not made.

## First local check

Things to verify once with `opencode2`:

1. The conductor is the default agent and the workflow commands are listed.
2. `workflow-*` skills and superpowers skills are both available.
3. The conductor can dispatch subagents. If subagent dispatch is not available in your opencode version, the workflows fall back to inline execution (see `workflow-rules`). Also check that the `subagent` permission action used in the agents matches your version's tool name.
4. `git push` asks for approval; reading a file under `/tmp` is refused without asking.
5. A small `/fix` on a scratch project stops at the delivery gate with a `closure.md`, a `CHANGELOG.md` entry and, if the project has docs, a docs sync.
6. `doc-writer` can edit `docs/` and `CHANGELOG.md` but not source files.
