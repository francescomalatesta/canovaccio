---
name: workflow-greenfield
description: Workflow for a new project from scratch - brainstorm the product, spec with stack and architecture, prototype the UI, plan starting from a walking skeleton, subagent-driven implementation, closure review and delivery gate.
---

# Greenfield workflow

A new project or standalone application. Apply `workflow-conventions` throughout.

Decisions made here are the most expensive to change later, so this workflow has the most gates.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 spec** | after spec review | product scope, stack, architecture |
| **G2 prototype** | only when the product has a UI | material UX and visual structure |
| **G3 plan** | before implementation | slicing and order |
| **G4 delivery** | after closure | the delivered project |

## Phases

### 0. Setup

Create the project directory if needed, initialize git, create the work directory with `brief.md` and `state.md`. The work happens on the default branch of the new repository.

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

Dispatch `@spec-reviewer` with the request and `spec.md`. Fix BLOCKING findings.

Present **G1**.

### 3. Prototype (when the product has a UI)

Dispatch `@ui-prototyper` with the approved spec and the work slug; it works in the prototypes area defined by the spec, with the chosen stack and UI kit. The project is not scaffolded yet: the prototype sets up only what it needs to run there, and the walking skeleton later integrates the area. Present it at **G2** with: startup command and URL, reachable states, files changed outside the prototype directory, how it is kept out of production builds, and decisions not dictated by the spec.

On approval, commit the prototype and record the commit in `state.md`. It becomes an authority for implementation and closure.

### 4. Plan

Write `plan.md` using `superpowers:writing-plans`:

- **task 1 is a walking skeleton**: project scaffold, the quality baseline wired and passing (tests, lint, type check), the app starting locally, one thin end-to-end path through the architecture with an E2E smoke test, and the prototypes area integrated with its index and dev-only wiring when the product has a UI;
- following tasks are vertical slices of the core journeys, each with its own tests and acceptance criteria;
- every requirement in `spec.md` is owned by at least one task;
- when a prototype exists, the last task removes it and its dev-only wiring, keeping the prototypes area's index.

Dispatch `@spec-reviewer` with spec and plan. Fix BLOCKING findings.

Present **G3**.

### 5. Implementation

Run `superpowers:subagent-driven-development` over `plan.md`, as in `workflow-feature`: `@implementer`, then `@task-reviewer`, fix rounds, `@escalator` when the same blocking finding survives two rounds.

After the walking skeleton is accepted, dispatch `@doc-writer` to scaffold the system docs from the spec and the skeleton, following `project-docs`: the pointer in the project `AGENTS.md`, `docs/index.md`, `docs/architecture.md`, component docs for the components that exist, and `CHANGELOG.md` following `project-changelog`. Later tasks then start from these docs.

After each accepted task, update `state.md` and give a one-line CHECKPOINT. After the walking skeleton and docs scaffold, give a fuller CHECKPOINT: how to start the app and run the checks.

### 6. Docs sync

Dispatch `@doc-writer` for the docs sync described in `workflow-conventions`, with the work directory, workflow type `greenfield` (there is no base branch: the whole repository is new, so the checker runs in full mode) and the discrepancies recorded in `state.md`. Every component in the spec architecture that now exists must have its doc, and the changelog lists the first version's capabilities. Review its report; commit the docs and changelog changes with the work.

### 7. Closure

1. From a clean checkout, run the full verification yourself: install, build, tests, type check, lint, and application startup.
2. Make sure the project README states how to install, run and test it.
3. Dispatch `@closure-reviewer` with the original request, spec, plan, the prototype commit if any, `decisions.md` and the whole repository, docs and changelog included.
4. On FAIL, fix BLOCKING findings through the implementation loop and review again; after two failures, open an unplanned gate.
5. Write `closure.md` and commit `spec.md` and `decisions.md`.

### 8. Delivery

Present **G4** with `closure.md`, how to run the project, and the remaining decisions (remote repository, first push, deployment). Execute what is approved, then set `state.md` to `closed`.
