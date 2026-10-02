---
name: workflow-greenfield
description: Workflow for a new project from scratch - brainstorm the product, spec with stack and architecture, prototype the UI, plan starting from a walking skeleton, subagent-driven implementation, closure review and delivery gate.
---

# Greenfield workflow

A new project or standalone application. Apply `workflow-rules` throughout.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 spec** | after spec review | product scope, stack, architecture |
| **G2 prototype** | only when the product has a UI | material UX and visual structure |
| **G3 plan** | before implementation | slicing and order |
| **G4 delivery** | after closure | the delivered project |

## Phases

### 0. Setup

Decide the layout from what the directory holds:

- **No repository yet**: create the project directory if needed, initialize git, work on its default branch.
- **A repository with no project yet**: it has no commits, or it holds only the agent harness and repository metadata (`.git/`, `.opencode/`, `AGENTS.md`, `README`, `LICENSE`, `.gitignore`, `.gitattributes`, `.editorconfig`, `docs/work/`). The repository root is the project root: work there, on the default branch. Do not create a subdirectory. The project's docs pointer goes into the existing `AGENTS.md`, outside the canovaccio block; an existing `README` is rewritten for the project.
- **A repository with an existing project** (source code, package manifests or other application files): do not initialize git; create the branch `greenfield/<slug>` and the project in its own directory, which is the root for its docs, changelog, README and prototype system. The work directory stays in `docs/work/` at the repository root.

If the contents do not clearly fit one case, ask the user before creating anything. Record the chosen layout and the reason in `brief.md`.

Create the work directory with `brief.md` (request, classification and reason) and `state.md`.

### 1. Product exploration

Use `superpowers:brainstorming` to understand the product: users, core journeys, constraints (hosting, budget, integrations, data, compliance), and what "first version done" means. Ask clarifying questions in batches.

If a technical question blocks the design (feasibility, choice between services or libraries), propose a `workflow-spike` for it before continuing. Use `@scout` for quick documentation checks that do not need a spike.

### 2. Spec

Write `spec.md`:

- product goal and users;
- core user journeys;
- requirements, keeping their modality, and acceptance criteria;
- explicit out of scope for the first version;
- **stack**: language, frameworks, storage, hosting target, with a short rationale per choice;
- **architecture**: main components and boundaries, data model outline, external integrations;
- **quality baseline**: test layers and tools, lint and format, type checking, how the app is started locally;
- **prototype system** (when the product has a UI): the tool and area where UI prototypes live, how it meets the contract of `project-prototypes`, and the rejected alternatives.

Record significant technical choices in `decisions.md` with rejected alternatives.

Dispatch `@spec-reviewer` with the request and `spec.md`. Fix BLOCKING findings; list at the gate any finding you chose not to address, with the reason.

Present **G1**. When the product has a UI and the project has no Impeccable preference yet, G1 also asks it (see Impeccable in `workflow-rules`).

### 3. Prototype (when the product has a UI)

Follow `project-prototypes`. Dispatch `@ui-prototyper` in setup mode with the approved spec: it creates the minimal project scaffold the prototype system needs and installs the system, which the walking skeleton later builds on instead of replacing. Commit the setup, then dispatch `@doc-writer` to write `docs/prototypes.md` from the setup report and commit it.

Dispatch `@ui-prototyper` in prototype mode with the approved spec and the work directory name. Start the system and present the prototype at **G2** as `project-prototypes` describes: index URL, prototype URL, a direct URL per state, files changed outside the prototype directory, how it is kept out of production builds, and decisions not dictated by the spec.

On approval, commit the prototype and record the commit in `state.md`. It becomes an authority for implementation and closure.

### 4. Plan

Write `plan.md` using `superpowers:writing-plans`:

- **task 1 is a walking skeleton**: project scaffold (when the product has a UI, extending the one created with the prototype system in phase 3 and keeping the system working), the quality baseline wired and passing (tests, lint, type check), the app starting locally, one thin end-to-end path through the architecture with an E2E smoke test, and a README stating how to install, run and test the project;
- following tasks are vertical slices of the core journeys, each with its own tests and acceptance criteria;
- every requirement in `spec.md` is owned by at least one task.

Dispatch `@spec-reviewer` with spec and plan. Fix BLOCKING findings; list at the gate any finding you chose not to address, with the reason.

Present **G3**.

### 5. Implementation

Run `superpowers:subagent-driven-development` over `plan.md` with the Review loop of `workflow-rules`. Give `@implementer` the task, the relevant spec sections, the prototype commit if any and the minor-findings policy; give `@task-reviewer` the task, its requirements and the commit range.

After the walking skeleton is accepted, dispatch `@doc-writer` to scaffold the system docs from the spec and the skeleton, following `project-docs`: the pointer in the project `AGENTS.md`, `docs/index.md`, `docs/architecture.md`, component docs for the components that exist, a link to `docs/prototypes.md` when it exists, and `CHANGELOG.md` following `project-changelog`. Review its report and commit its changes; later tasks start from these docs.

After each accepted task, update `state.md` and give a one-line CHECKPOINT. After the walking skeleton and docs scaffold, give a fuller CHECKPOINT: how to start the app and run the checks.

### 6. Docs sync

Dispatch `@doc-writer` for the docs sync described in `workflow-rules`, with the work directory, workflow type `greenfield` (there is no base branch: the whole repository is new, so the checker runs in full mode) and the discrepancies recorded in `state.md`. Every component in the spec architecture that now exists must have its doc, and the changelog lists the first version's capabilities. Review its report; commit the docs and changelog changes with the work.

### 7. Closure

1. Commit everything, including `spec.md` and `decisions.md`. Clone the repository into a temporary directory and run the full verification there: install, build, tests, type check, lint, startup, the prototype system's index when there is one; also check that the README instructions work.
2. Run the closure review (see Closure review in `workflow-rules`) with the original request, spec, plan, the prototype commit if any, and `decisions.md`. The change is the whole project: against the base branch when built on `greenfield/<slug>`, otherwise outlined by its file tree.
3. On FAIL, fix BLOCKING findings through the Review loop and review again; after two failures, open an unplanned gate.
4. Write `closure.md`: verdict, verification run with results, deviations, non-blocking observations, deferred minor findings.

### 8. Delivery

Present **G4** with `closure.md`, how to run the project, and the remaining decisions (remote repository, first push, deployment; when the project was built on a `greenfield/<slug>` branch inside a repository with an existing project, the integration options from `superpowers:finishing-a-development-branch`; whether to keep or remove the prototype, when one was built, see Keep or remove in `project-prototypes`). Its convention proposals are accepted or rejected one by one, as in every workflow (see Project conventions in `workflow-rules`): `docs/conventions.md` is created only with the first accepted entry. Execute what is approved, then set `state.md` to `closed`.
