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
- **A repository with an existing project** (source code, package manifests or other application files): do not initialize git; create the branch `greenfield/<slug>` and the project in its own directory, which is the root for its docs, changelog, README and prototypes area. The work directory stays in `docs/work/` at the repository root.

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
- **prototypes area** (when the product has a UI): where UI prototypes live and how they are kept out of production builds.

Record significant technical choices in `decisions.md` with rejected alternatives.

Dispatch `@spec-reviewer` with the request and `spec.md`. Fix BLOCKING findings; list at the gate any finding you chose not to address, with the reason.

Present **G1**.

### 3. Prototype (when the product has a UI)

Dispatch `@ui-prototyper` with the approved spec and the work slug; it works in the prototypes area defined by the spec, with the chosen stack and UI kit. The project is not scaffolded yet: the prototype sets up only what it needs to run there, and the walking skeleton later integrates the area. Present it at **G2** with: startup command and URL, reachable states, files changed outside the prototype directory, how it is kept out of production builds, and decisions not dictated by the spec.

On approval, commit the prototype and record the commit in `state.md`. It becomes an authority for implementation and closure.

### 4. Plan

Write `plan.md` using `superpowers:writing-plans`:

- **task 1 is a walking skeleton**: project scaffold, the quality baseline wired and passing (tests, lint, type check), the app starting locally, one thin end-to-end path through the architecture with an E2E smoke test, the prototypes area integrated with its index and dev-only wiring when the product has a UI, and a README stating how to install, run and test the project;
- following tasks are vertical slices of the core journeys, each with its own tests and acceptance criteria;
- every requirement in `spec.md` is owned by at least one task;
- when a prototype exists, the last task removes it and its dev-only wiring, keeping the prototypes area's index.

Dispatch `@spec-reviewer` with spec and plan. Fix BLOCKING findings; list at the gate any finding you chose not to address, with the reason.

Present **G3**.

### 5. Implementation

Run `superpowers:subagent-driven-development` over `plan.md` with the Review loop of `workflow-rules`. Give `@implementer` the task, the relevant spec sections, the prototype commit if any and the minor-findings policy; give `@task-reviewer` the task, its requirements and the commit range.

After the walking skeleton is accepted, dispatch `@doc-writer` to scaffold the system docs from the spec and the skeleton, following `project-docs`: the pointer in the project `AGENTS.md`, `docs/index.md`, `docs/architecture.md`, component docs for the components that exist, and `CHANGELOG.md` following `project-changelog`. Review its report and commit its changes; later tasks start from these docs.

After each accepted task, update `state.md` and give a one-line CHECKPOINT. After the walking skeleton and docs scaffold, give a fuller CHECKPOINT: how to start the app and run the checks.

### 6. Docs sync

Dispatch `@doc-writer` for the docs sync described in `workflow-rules`, with the work directory, workflow type `greenfield` (there is no base branch: the whole repository is new, so the checker runs in full mode) and the discrepancies recorded in `state.md`. Every component in the spec architecture that now exists must have its doc, and the changelog lists the first version's capabilities. Review its report; commit the docs and changelog changes with the work.

### 7. Closure

1. Commit everything, including `spec.md` and `decisions.md`. Clone the repository into a temporary directory and run the full verification there: install, build, tests, type check, lint, startup; also check that the README instructions work.
2. Dispatch `@closure-reviewer` with the original request, spec, plan, the prototype commit if any, `decisions.md`, your verification results, and the whole project.
3. On FAIL, fix BLOCKING findings through the Review loop and review again; after two failures, open an unplanned gate.
4. Write `closure.md`: verdict, verification run with results, deviations, non-blocking observations, deferred minor findings.

### 8. Delivery

Present **G4** with `closure.md`, how to run the project, and the remaining decisions (remote repository, first push, deployment; when the project was built on a `greenfield/<slug>` branch inside a repository with an existing project, the integration options from `superpowers:finishing-a-development-branch`). Its convention proposals are accepted or rejected one by one, as in every workflow (see Project conventions in `workflow-rules`): `docs/conventions.md` is created only with the first accepted entry. Execute what is approved, then set `state.md` to `closed`.
