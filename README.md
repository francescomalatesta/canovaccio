![](https://github.com/francescomalatesta/canovaccio/blob/main/canovaccio.png)

> **canovaccio** /ka.noˈvat.tʃo/ *(Italian, noun)* — the plot outline of a *commedia dell'arte*
> play: a sketch of scenes and entrances on which the actors improvised the dialogue.

## What it is

canovaccio turns a coding agent into a small, disciplined development team. You describe *what* you want; the setup decides *how* the work proceeds.

A controller agent, the **conductor**, recognizes the kind of work you asked for and runs the matching workflow. It delegates each role to a specialized agent: one researches the codebase, one reviews specifications, one builds UI prototypes, one implements, one reviews each change, one steps in when a fix does not converge, one keeps the docs current, and one does the final review; for a security audit, one plans and judges it while cheaper ones collect the evidence; for a public site, one writes the strategy, one the copy, and one builds the model page; with [Impeccable](#impeccable), one also captures the product and its design system, and one reviews the design. The conductor stops at a few **human gates**, where you approve a spec, a prototype or the delivery, and works autonomously everywhere else.

Every piece of work leaves a trail: a spec or findings, the decisions taken, a changelog entry, and project docs updated to match the code. The next piece of work starts from those docs instead of rediscovering the codebase. Progress is saved to disk, so work resumes where it stopped, even in a new session.

The workflows:

- **greenfield** — a new project from scratch: explores the product with you, fixes stack and architecture in a spec, prototypes the UI, then builds it starting from a minimal end-to-end skeleton.
- **site** — a product's public website: facts, strategy and every word decided by stronger models and approved by you, a model page built in production code by a stronger model, the other pages built by the cheaper implementer and checked against the approved copy by a script. See [Public sites](#public-sites).
- **feature** — new or changed behavior in an existing project: spec and plan approved together (separately when a UI prototype is needed), then implementation task by task, each one reviewed.
- **fix** — something works wrong: reproduces it, finds the root cause, fixes it test-first. The most autonomous workflow: it asks you only when the fix is risky or the expected behavior is unclear.
- **refactor** — better structure, same behavior: pins current behavior with tests before touching the code, then restructures in small steps that keep the affected tests and the invariants green.
- **spike** — a question to answer before building (is it feasible? which library?): researches and runs throwaway experiments within a set budget, and ends with a written recommendation.
- **docs-init** — brings an existing project to a complete docs map in one pass, instead of letting it fill in as work goes, and writes `FEATURES.md` and `ARCHITECTURE.md` when it has none.
- **security-audit** — how secure is an existing codebase: a strong model maps the threats and plans the audit by area, scanners and cheaper auditors collect the evidence in parallel, and the strong model confirms every finding and rates it High, Medium or Low. Ends with a prioritized list and the follow-up work to choose from; changes no code. See [Security audit](#security-audit).
- **design-init** — captures an existing project's product and visual system in `PRODUCT.md` and `DESIGN.md`, asking only what the code cannot tell, and optionally critiques its current interface.
- **env-init** — makes an existing project run in several checkouts at once: every fixed port and global name of its environment, dev servers and tests becomes a slot variable whose default is today's value, then it proves that the main checkout is unchanged and that two checkouts run side by side. See [Parallel work](#parallel-work).
- **batch** — several features built one after the other without you: every story's spec and plan approved at one gate, then a runner starts a fresh session per story and moves on only when the story is green by the conditions you set. Also one feature finished on its own. See [Batch](#batch).

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
/security-audit
/env-init
/worktree new csv-export
/batch the three knowledge base stories in docs/specs/kb/backlog.md, one after the other
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
| `security-audit` | a prioritized list of what to do to make an existing codebase more secure | scope (areas, scanners, runtime checks) · delivery (which findings become work) |
| `env-init` | making an existing project run in several checkouts at once | slot plan (variables, pinned ports, env file) · delivery |
| `batch` | features built in sequence, unattended | the batch: every spec and plan, branches, green conditions; none after it |

Shared rules are in `skills/workflow-rules`: blocking gates vs. non-blocking checkpoints, when an unplanned gate is allowed, running an approved plan to completion, workflow switching, branches, and how superpowers skills are used inside a phase.

Implementation is always one task per `@implementer` dispatch, each followed by its own `@task-reviewer` review before anything else happens: tasks are never merged into one dispatch, and no review is skipped or shared between tasks. The conductor tracks each round in `state.md` and checks it before the next task.

Once you approve a plan, the workflow runs every task to its next gate, usually delivery, without stopping to ask whether to go on: checkpoints are status lines, not questions, and before ending a turn the conductor checks that `state.md` is waiting for you. It stops early only for an unplanned gate (a product decision the artifacts do not settle, an operation that needs your permission) or a blocker it cannot resolve.

Subagents always run in the foreground. Independent research or documentation agents may run in parallel, but the conductor waits for all of them within the turn: a session is idle only when it waits for you at a gate or a question, or when the work is finished.

Push, merge and destructive git commands also require approval through the permissions in `opencode.jsonc`, and so do opening, changing and merging pull requests with `gh`.

Work stays inside the project. Temporary files (scratch scripts, logs, captures, the clean clone of the greenfield closure) go in `.canovaccio/tmp/`, whose own `.gitignore` keeps the directory versioned and its content out of git; each workflow uses a subdirectory named after its work directory and deletes it when it closes. The permissions in `opencode.jsonc` deny the system temporary directories (`/tmp`, `/var/tmp` and their macOS equivalents) instead of asking, so a stray path fails and the agent retries inside the project without stopping for approval.

Projects that run on services (a database, a cache, the app itself in containers) describe them in `docs/environment.md`: how they start, how to tell they are ready, how they stop and which volumes hold data. Each workflow brings that environment up where it first needs it, finding out how from the code when the doc is missing (the docs sync then writes it), keeps it up through its gates, and brings it down when it closes or is abandoned: containers and networks are removed, development data volumes kept, and services that were already running before the workflow are left alone. Container ports are published on `127.0.0.1`. Deleting Docker volumes or pruning asks for approval through `opencode.jsonc`. The rules are in `skills/workflow-rules` (Environment) and `AGENTS.md`.

Tests never write to your development database. When tests persist data, the project gets a dedicated test database that the test commands use by default, E2E included (their app instance runs on it, on its own port), and a test run pointed at the development database stops instead of writing to it. A greenfield project sets it up in its spec and walking skeleton; a feature or fix on a project without it sets it up before adding tests that need it. Task and closure reviews check that a test run leaves the development database unchanged. The mechanism is the project's choice; the rule is in `AGENTS.md`.

Full test suites run once, at the end of the work. While tasks are implemented, reviewed or escalated, only the tests affected by the task's changes run: the tests of the changed code and of the code that depends on it, and E2E only for the journeys the task touches. The final verification runs every suite on the work's last commit and records the result in `state.md` with that commit; the closure review quotes that record instead of running the suites again, and they run again only after the code changes (closure fixes, a merge that brought new commits). The rules are in `AGENTS.md` (Test scope) and `skills/workflow-rules`.

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

## Parallel work

Several pieces of work on one project can run at the same time, each in its own git worktree with its own session:

```
/worktree new csv-export     # creates ../myapp.wt/csv-export with slot 1
/worktree list               # checkouts, slots, environments, active workflows
/worktree remove csv-export  # after delivery: stops its environment, keeps branch and data
```

Open a new opencode session inside the worktree and start the workflow there: for that session the worktree is the project, with its own branch, work directory, temporary files and environment. Worktrees live next to the main checkout, never inside it, where test runners, linters and watchers would pick up a second copy of the code. One session per worktree.

Each checkout has a **slot**: the main checkout is slot 0, worktrees 1 to 9. In slot *n* every port is its base plus 10·*n* (Phoenix on 4000 runs on 4010, 4020…), and the environment is its own Compose project with its own containers, volumes and databases: nothing is shared between slots. At most three environments of a project run at once; a workflow that would start a fourth asks which one to stop. Slot 0 is the project as it is today: with no slot set, every port keeps its current value.

This needs a project whose ports and names are not fixed. New projects are built that way by greenfield; for an existing one, `/env-init` inventories every port bound on the host (Compose, dev servers, the test server, E2E, prototypes) and every reference to it, makes each one a variable with today's value as default, pins what must stay fixed (an OAuth redirect URI, a webhook) and verifies two slots side by side. The contract, `.canovaccio/isolation.json` and the recipes per stack are in `skills/project-isolation`; the script there creates, lists, checks and removes worktrees.

Parallel branches meet again at delivery: the branch is brought up to date with the base and, when that brought new commits, verified again before it is merged, and `CHANGELOG.md merge=union` in `.gitattributes` keeps the changelog entries of both sides.

## Batch

A batch builds several features one after the other while you are away, in a fresh session per story, so each story starts with a clean context.

You list the stories (in a message, or as tracker items) and say how you want them delivered; you do not need `/batch`, the conductor recognizes a request to work in sequence or on its own. It writes every story's spec and plan with you, as a feature would, and presents them all at one gate together with how the batch runs:

- **branches**: one branch for the whole batch, with one pull request when the project has a remote (the default); or stacked branches, one per story, each based on the previous one, with one pull request each, only when you ask for it. What you say about delivery ("a single PR for the whole epic") is recorded with your words and binds this choice; when the epic already has an open pull request, the batch adds its stories to it instead of opening another. The gate shows how many pull requests the batch will leave;
- **green**: when a story counts as done. The closure review is always required; on top of it, the final verification, any command you name (`make e2e`), and the CI of the pull request. The session runs the final verification through `batch.mjs verify`, which runs the commands and writes the record with their real exit statuses: a record written by hand never counts, and the record stays valid across later commits that only change the work's artifacts in `docs/work/`. Without a remote, a batch stays local and green is what runs locally;
- **fix sessions**: how many times a story that is not green goes back for a fix, 2 by default.

Once you approve, the conductor starts a runner, `skills/workflow-batch/scripts/batch.mjs`, as a separate process and the session can end. For each story the runner checks out its branch, starts an opencode session that implements it with no gates (a question that would need you blocks the story instead), checks the green conditions itself, pushes and opens or updates the pull request, and waits for CI. The first story that is not green, or that is blocked, stops the queue. A last session then closes the green stories, brings the environment down and writes a `summary.md` with what was done, what stopped and why, and the cost of every story, its subagents included.

The sessions never get your approval for anything: they run without `--auto`, so every permission that asks is rejected: they cannot push, nor open, change or merge a pull request. The runner pushes and opens pull requests, as the gate approved; nothing in a batch merges.

```sh
node <skill-dir>/scripts/batch.mjs status docs/work/<date>-batch-<slug>   # where it is, the cost so far, what runs now and its session id
node <skill-dir>/scripts/batch.mjs stop docs/work/<date>-batch-<slug>     # stop it
```

To resume a stopped batch, tell the conductor: it shows you the blocked story's question or the failed check, records your answer, and starts the runner again from that story. The rules are in `skills/workflow-batch` and in Unattended delivery in `skills/workflow-rules`.

## canovacc.io

canovacc.io drives opencode servers with canovaccio installed: it starts sessions, shows you their gates and questions, answers permission requests and reads `state.md`. canovaccio still decides how each piece of work is done; canovacc.io decides how pieces of work are orchestrated: queues, batches, pull requests, CI, the tracker.

A session canovacc.io starts begins with a header that sets how it runs, followed by your request as quoted data:

```
[canovacc.io]
mode: unattended
item: FAT-42
workflow: feature
work-dir: docs/work/2026-11-19-csv-export
branch: kb/csv-export
base: 4e91c0a
verify: "make test" "make e2e"
[/canovacc.io]

Export the invoices as CSV
```

- **interactive** runs the workflow as usual; every gate is a question whose title starts with the gate's label in `state.md`, so the app can show it and recognize it when it comes back after changes.
- **plan-only** writes and reviews a feature's spec and plan without opening G1, against the specs of the stories planned before it, and ends at `ready`, touching nothing outside its work directory.
- **unattended** delivers a story planned that way and approved at canovacc.io's batch gate: it creates its branch from the base, works to `ready` with no questions (what would need you blocks the story), records the final verification with `skills/workflow-rules/scripts/verify.mjs` and pushes its branch through a permission request. canovacc.io opens the pull request. **fix**, **resume** and **close** fix a story that failed its checks, continue a blocked one with your answer, and close the batch's stories.

Work started this way has `Managed by: canovacc.io` in its `state.md`. canovacc.io moves the tracker items itself, and when the project has a task tracker preference canovaccio keeps them in step too, as a second writer that never moves an item backwards; it proposes no preference and adds no pull request link in that work. `node verify.mjs check <work-dir> --json` tells whether the last recorded verification still holds for HEAD, and `isolation.mjs new` and `remove` print JSON with `--json`, for creating worktrees from a program.

Without canovacc.io you can still start such a session by hand with the header, as an advanced use: you then answer its permission requests yourself. A session without the header behaves as described in the rest of this README. The rules are in canovacc.io and Unattended mode in `skills/workflow-rules`, and Plan-only in `skills/workflow-feature`.

## Security audit

`/security-audit` studies an existing codebase and ends with a prioritized list of what to do to make it more secure. It is split like the closure review: a strong model plans and judges, cheaper ones do the volume, and every phase leaves its result on disk.

| Phase | Who (model) | Produces | Gate |
|---|---|---|---|
| attack surface | `@scout` | `surface.md`: entry points, authentication, data stores, integrations, secrets handling, dependencies, Docker, CI and IaC, the scanners available | — |
| plan | `@security-reviewer` (Opus) | `audit-plan.md`: threat model, four to eight areas with checks and hotspots, scanner commands, harmless runtime checks on the local app | G1 scope |
| scanners | `@security-auditor` (DeepSeek) | `evidence/scans.md`: `gitleaks` on the git history, the ecosystems' dependency audits or `osv-scanner`, `semgrep`, `trivy`, `zizmor`, as the stack needs | — |
| areas | one `@security-auditor` per area, in parallel | `evidence/<area>.md`: code quoted in full on the hotspots, scanner results traced to their callers | — |
| verdict | `@security-reviewer` (Opus) | `security-findings.md`: every candidate confirmed or dismissed, findings rated High, Medium or Low, grouped into follow-up work | G2 delivery |

**Severity** is what an attacker gets and how hard it is to get it in this project, not a scanner's or CVE's score: a vulnerable dependency whose vulnerable code is never reached is not High. Each finding has its category (CWE), location, quoted evidence, an attack scenario, a fix and its effort.

**Limits.** The audit changes no project files, runs nothing against deployed environments, never exploits (a weakness is shown with code, configuration or a harmless request to the app started locally) and never writes a secret in full. Scanners run through what is installed or ephemeral runners (`npx`, `uvx`, `docker run --rm`); installing one on your machine is asked at G1.

At G2 you choose which follow-up work to start, each as a `fix` or `feature` with its own gates, and whether to commit `security-findings.md` (default no: it lists open vulnerabilities). The models are set in `agents/security-reviewer.md` and `agents/security-auditor.md`.

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
- local only (git-ignored): `brief.md`, `plan.md`, `invariants.md`, `repro.md`, `design-interview.md`, `site-interview.md`, `design-review.md`, `closure-plan.md`, `closure-evidence.md`, `closure.md`, `state.md`; in a batch, `batch.json`, `summary.md` and `logs/`; in a security audit, `surface.md`, `audit-plan.md`, `evidence/` and `security-findings.md`, which you may choose to commit at delivery.

UI prototypes are not work artifacts: they live in the project's prototype system, described below.

The conductor adds the ignore rules to the project's `.gitignore` on first use. `state.md` records phase, approved gates and completed tasks, so a workflow can resume after a context compaction or in a new session.

## Code design

Whoever writes or reviews production code follows `skills/code-design`, a pragmatic reading of the SOLID principles. Each principle comes with the signal in the task that calls for it and the move it suggests: separate what changes for different reasons, gather a growing branch on kind into one dispatch point, make substitutes and test doubles honour their contract, pass narrow dependencies, keep I/O at the edges when it blocks a test. Without a signal the code stays plain: an abstraction with no present need (a single-implementation interface, a forwarding layer, options nobody uses) counts as a defect too.

- `@implementer` applies it to the code the task touches and reports the structural moves it made, or "none";
- `@task-reviewer` reports what it finds as `structure` findings, Minor by default; Important only with a concrete consequence today: a substitute that breaks its contract, a rule spread across places that must change together, logic wired to I/O so that a required test is missing or runs on the development database;
- `@escalator` checks structure as a possible root cause when fixes keep breaking something else;
- the refactor workflow names the problems its target design removes in the same terms.

It never overrides `docs/conventions.md` or the established structure of the codebase, and is never a reason to restructure code outside the task.

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
| spike, docs-init, security-audit | never: always off | — | — | — |

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
- `docs/flows/<name>.md`, optional, describes journeys across components;
- `docs/environment.md`, when the project runs on services, says how to start, check and stop them.

Docs describe what the code does not say easily (purpose, boundaries, entry points, interactions, pitfalls); the code stays the source of truth.

Two more files, at the project root, are written for you rather than for the agents, to be read from top to bottom:

- `FEATURES.md` lists what the software does today, one or two sentences per feature, in sections by area as users see them; features behind a flag are listed like the others;
- `ARCHITECTURE.md` tells how the system works: what runs, where the code is, one to three representative flows end to end, data, security, integrations, the structural decisions in force. It may repeat `docs/architecture.md`, which stays the agents' compact overview.

Greenfield writes both; feature, fix, refactor, env-init and site keep them current at the docs sync, each where its work changed what they say; `/docs-init` writes them in a project that has none. The table is in `skills/project-docs`, under Overviews by workflow.

`docs/conventions.md` is different: it prescribes how code is written in the project, to correct the model where it tends to err. Workflows collect evidence of such errors (your corrections at gates, recurring review findings, guesses between inconsistent patterns) and propose at most three entries at delivery. **Nothing enters the file unless you accept it explicitly**, entry by entry.

Every workflow except spike starts from the docs to find where to work, and every one except spike and security-audit ends with a **docs sync** step: `@doc-writer` maps the diff to the impacted docs through `covers`, updates them, `FEATURES.md` and `ARCHITECTURE.md`, documents new areas and adds the `CHANGELOG.md` entry ([Keep a Changelog](https://keepachangelog.com), rules in `skills/project-changelog`). The closure review checks all of them. Projects without docs get them incrementally, as work touches the code, or all at once with `/docs-init`.

`skills/project-docs/scripts/check-docs.mjs` (Node 18+, no dependencies) checks a project's docs: covers matching real files, links, index completeness, uncovered code; with `--changed <base>` it lists the docs a change impacts.

## Language

Commit messages, pull request titles and descriptions, and documentation are always in English, whatever language you write in: system docs, `FEATURES.md`, `ARCHITECTURE.md`, `CHANGELOG.md`, README files, `PRODUCT.md`, `DESIGN.md` and the workflow artifacts in `docs/work/`. The conductor still talks to you in your language, and product content such as UI copy follows the product's requirements. Existing docs in another language are not translated along the way: what the work adds or rewrites is in English, and a full translation is separate work you can ask for. The rule is in `AGENTS.md`, under Language.

## Task tracker

If you track the project in an external tool (GitHub Projects, Jira, Linear, ClickUp, Trello), name the item when you start the work (`/feature #42`, or a link to the card) and the conductor keeps its status, and the status of the items above it, in step with the work, as defined by `skills/project-tracker`:

| When | Status (GitHub Projects Kanban) |
|---|---|
| the workflow picks the item up | Ready |
| work on project files starts | In progress |
| the closure review starts | In review |
| canovaccio merges the work itself | Done |

- **Tasks.** Items of single plan tasks move to In progress and In review with their own implementation and review. They are the items you give one per task (`/feature #12 #13`), or the sub-items of the item you named, which the conductor reads in discovery and pairs with the plan's tasks in `plan.md`, approved with the plan.
- **Parents.** Statuses roll up the chain: starting the first task of the first story of an epic puts the task, the story and the epic In progress. A parent moves to In review or Done only when all its children are there. Write `Parents: off` in the preference to turn it off.
- **Pull requests.** When the work is delivered as a pull request, items stay In review and the PR links them (`Closes #42`), never their parents: the merge and the board's automation move them to Done.
- **Reconciling.** The conductor does not rely on remembering each move: at every checkpoint, gate and resume, including after a context compaction, it compares the status each item should have with the board and moves forward what is behind, so a missed move is made at the next step.

The first time, the conductor finds the tool through what the environment already provides (`gh`, another CLI, an MCP server), reads the board's statuses, maps them, and asks you to confirm the mapping at the first gate; the answer is saved in the project `AGENTS.md` under Task tracker and never asked again. It moves only items that exist, never creates any, never adds an issue to the board, and changes only their status. Before each move it reads the current status: an item never moves backwards, and one you moved off the path of the work (Blocked, back to Backlog) stays where you put it. When the tool cannot be reached the work goes on, and the report says which moves were not made.

## First local check

Things to verify once with opencode V2:

1. The conductor is the default agent and the workflow commands are listed.
2. `workflow-*` skills and superpowers skills are both available.
3. The conductor can dispatch subagents. If subagent dispatch is not available in your opencode version, the workflows fall back to inline execution (see `workflow-rules`). Permissions use the V2 action names (`shell`, `subagent`, `edit`) and agent models the V2 `provider/model#variant` form: a rule with a V1 name, such as `bash`, matches nothing and is ignored silently.
4. `git push` asks for approval; reading a file under `/tmp` is refused without asking; `spec-reviewer` cannot run shell commands.
5. A small `/fix` on a scratch project stops at the delivery gate with a `closure.md`, a `CHANGELOG.md` entry and, if the project has docs, a docs sync.
6. `doc-writer` can edit `docs/`, `FEATURES.md`, `ARCHITECTURE.md` and `CHANGELOG.md` but not source files.
7. `opencode run --agent conductor "…"` works from a terminal with no TTY: the batch runner starts its sessions that way; `opencode api get /api/info` answers, since the runner reads the sessions' costs through it. `node --test skills/workflow-batch/scripts/batch.test.mjs` checks the runner itself.
8. `node --test skills/workflow-rules/scripts/verify.test.mjs skills/project-isolation/scripts/isolation.test.mjs` checks `verify.mjs` and the JSON output of `isolation.mjs`.
