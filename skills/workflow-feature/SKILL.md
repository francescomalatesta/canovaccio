---
name: workflow-feature
description: Workflow for adding or changing behavior in an existing project - scout, spec, optional prototype, plan, gated approval, subagent-driven implementation, closure review and delivery gate.
---

# Feature workflow

New or changed behavior in an existing project. Apply `workflow-rules` throughout.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 spec+plan** | before implementation | what to build and how it is sliced |
| **G1a spec**, **G1b plan** | instead of G1, when a prototype is needed | same, in two steps |
| **G-proto** | only when a prototype is built | material UX and visual structure |
| **G2 delivery** | after closure | integration of the finished work |

Split into G1a and G1b only when a prototype is needed, since it must be built on an approved spec. Otherwise present spec and plan together at G1.

## Phases

### 0. Setup

Create the work directory with `brief.md` (request, classification and reason) and `state.md`.

### 1. Discovery

Follow the `project-docs` reading protocol: `docs/index.md` first, then the docs of the components the feature touches.

Dispatch `@scout` for those parts of the codebase, with the relevant doc paths as starting points: relevant modules, existing conventions, test setup and commands (including whether tests that persist data are isolated from the development database), similar features to mirror, and, when the feature may change the UI, the prototype system if `docs/prototypes.md` does not describe one (an existing Storybook or similar tool). Skip only when you already know the area well from this session.

### 2. Spec

Write `spec.md` using `superpowers:brainstorming` as technique. Clarifying questions to the user are allowed while drafting; batch them rather than asking one per turn.

`spec.md` contains:

- problem and intended outcome;
- requirements, keeping their modality (must vs. may vs. example);
- acceptance criteria, each verifiable;
- out of scope;
- affected areas and technical approach, at the level needed to plan;
- UX changes, and whether they are material (new screens, changed flows, changed layout);
- when a prototype is needed and the project has no prototype system: the system to adopt or set up, following `project-prototypes`.

When the feature adds or changes pages of a public site built with `workflow-site` (the project has `docs/site.md`), their words are not written in the spec: dispatch `@copywriter` with the spec, the site's strategy if the user points to it, and a `facts.md` for what the new copy claims, following `site-content`. The content file is presented with the spec at its gate, `@implementer` transcribes it with the site's blocks, and `site-check` on the changed routes is part of each task's verification.

Dispatch `@spec-reviewer` with the request, `brief.md` and `spec.md`. Fix BLOCKING findings; list at the next gate any finding you chose not to address, with the reason.

When the feature changes the UI and the project has no Impeccable preference yet, its first gate (G1a or G1) also asks it (see Impeccable in `workflow-rules`).

### 3. Prototype (only for material UX changes)

If the spec contains material UX changes, present spec at **G1a** first. Then create the branch. If the project has no prototype system yet, dispatch `@ui-prototyper` in setup mode with the approved spec, commit the setup, then dispatch `@doc-writer` to write `docs/prototypes.md` from the setup report and commit it (see `project-prototypes`).

Dispatch `@ui-prototyper` in prototype mode with the approved spec and the work directory name. Start the system and present the prototype at **G-proto** as `project-prototypes` describes: index URL, prototype URL, a direct URL per state, files changed outside the prototype directory, how it is kept out of production builds, and decisions not dictated by the spec.

On approval, commit the prototype and record the commit in `state.md`. It becomes an authority for implementation and closure.

### 4. Plan

Write `plan.md` using `superpowers:writing-plans`:

- tasks are vertical slices, each delivering observable behavior with its own tests;
- each task names its acceptance criteria and verification (unit, integration, E2E where it completes an important journey); the E2E tests it names are its own, never the full E2E suite, which runs at closure;
- dependencies between tasks are explicit;
- every requirement in `spec.md` is owned by at least one task;
- when the feature adds or changes tests that persist data and the project has no test data isolation (see `AGENTS.md`), the first task sets it up; it is engineering support, listed at the gate, not a product change.

Dispatch `@spec-reviewer` with spec and plan. Fix BLOCKING findings; list at the gate any finding you chose not to address, with the reason.

Present **G1** (spec+plan) or **G1b** (plan).

### 5. Implementation

Create the branch if it does not exist yet. Run `superpowers:subagent-driven-development` over `plan.md` with the Review loop of `workflow-rules`. Give `@implementer` the task, the relevant spec sections, the prototype commit if any, the project conventions and the minor-findings policy; give `@task-reviewer` the task, its requirements and the commit range.

After each accepted task, update `state.md` and give a one-line CHECKPOINT. Answer product decisions from spec and prototype when they settle them; otherwise open an unplanned gate. Record decisions in `decisions.md`.

When the feature changed the UI and `Design review: on`, run the Design review of `workflow-rules` after the last task.

### 6. Docs sync

Dispatch `@doc-writer` for the docs sync described in `workflow-rules`, with the work directory, the base branch, workflow type `feature` and the discrepancies recorded in `state.md`. New components introduced by the feature get their own doc. Review its report; commit the docs and changelog changes with the work.

### 7. Closure

1. Commit `spec.md` and `decisions.md`, then run the project's full verification yourself: tests, the full E2E suite included, build, type check, lint, and application startup when relevant; when the project has a prototype system, the index and every kept prototype load.
2. Run the closure review (see Closure review in `workflow-rules`) against the base branch, with the original request, spec, plan, the prototype commit if any, and `decisions.md`. Docs and changelog are part of the change.
3. On FAIL, fix BLOCKING findings through the Review loop and review again. If closure fails twice, open an unplanned gate with the findings.
4. Write `closure.md`: verdict, verification run with results, deviations, non-blocking observations, deferred minor findings.

### 8. Delivery

Present **G2** with `closure.md`, the list of commits and the integration options from `superpowers:finishing-a-development-branch`; its convention proposals are accepted or rejected one by one, and accepted ones applied before integration (see Project conventions in `workflow-rules`). When a prototype was built, the user also keeps or removes it (see Keep or remove in `project-prototypes`). Execute the chosen option (push and merge need this approval), then set `state.md` to `closed`.

## Switching

- The spec reveals a question that cannot be answered without experimentation → propose `workflow-spike`.
- The feature turns out to be restructuring with no behavior change → propose `workflow-refactor`.
