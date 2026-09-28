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

Dispatch `@scout` for those parts of the codebase, with the relevant doc paths as starting points: relevant modules, existing conventions, test setup and commands, similar features to mirror. Skip only when you already know the area well from this session.

### 2. Spec

Write `spec.md` using `superpowers:brainstorming` as technique. Clarifying questions to the user are allowed while drafting; batch them rather than asking one per turn.

`spec.md` contains:

- problem and intended outcome;
- requirements, keeping their modality (must vs. may vs. example);
- acceptance criteria, each verifiable;
- out of scope;
- affected areas and technical approach, at the level needed to plan;
- UX changes, and whether they are material (new screens, changed flows, changed layout).

Dispatch `@spec-reviewer` with the request, `brief.md` and `spec.md`. Fix BLOCKING findings; list at the next gate any finding you chose not to address, with the reason.

### 3. Prototype (only for material UX changes)

If the spec contains material UX changes, present spec at **G1a** first. Then create the branch and dispatch `@ui-prototyper` with the approved spec and the work slug; it works in the project's prototypes area (see UI prototypes in `workflow-rules`). Present it at **G-proto** with: startup command and URL, reachable states, files changed outside the prototype directory, how it is kept out of production builds, and decisions not dictated by the spec.

On approval, commit the prototype and record the commit in `state.md`. It becomes an authority for implementation and closure.

### 4. Plan

Write `plan.md` using `superpowers:writing-plans`:

- tasks are vertical slices, each delivering observable behavior with its own tests;
- each task names its acceptance criteria and verification (unit, integration, E2E where it completes an important journey);
- dependencies between tasks are explicit;
- every requirement in `spec.md` is owned by at least one task;
- when a prototype exists, the last task removes it and its dev-only wiring, keeping the prototypes area's index.

Dispatch `@spec-reviewer` with spec and plan. Fix BLOCKING findings; list at the gate any finding you chose not to address, with the reason.

Present **G1** (spec+plan) or **G1b** (plan).

### 5. Implementation

Create the branch if it does not exist yet. Run `superpowers:subagent-driven-development` over `plan.md` with the Review loop of `workflow-rules`. Give `@implementer` the task, the relevant spec sections, the prototype commit if any, the project conventions and the minor-findings policy; give `@task-reviewer` the task, its requirements and the commit range.

After each accepted task, update `state.md` and give a one-line CHECKPOINT. Answer product decisions from spec and prototype when they settle them; otherwise open an unplanned gate. Record decisions in `decisions.md`.

### 6. Docs sync

Dispatch `@doc-writer` for the docs sync described in `workflow-rules`, with the work directory, the base branch, workflow type `feature` and the discrepancies recorded in `state.md`. New components introduced by the feature get their own doc. Review its report; commit the docs and changelog changes with the work.

### 7. Closure

1. Commit `spec.md` and `decisions.md`, then run the project's full verification yourself: tests, build, type check, lint, and application startup when relevant.
2. Dispatch `@closure-reviewer` with the original request, spec, plan, the prototype commit if any, `decisions.md`, your verification results, and the full diff against the base branch, docs and changelog included.
3. On FAIL, fix BLOCKING findings through the Review loop and review again. If closure fails twice, open an unplanned gate with the findings.
4. Write `closure.md`: verdict, verification run with results, deviations, non-blocking observations, deferred minor findings.

### 8. Delivery

Present **G2** with `closure.md`, the list of commits and the integration options from `superpowers:finishing-a-development-branch`; its convention proposals are accepted or rejected one by one, and accepted ones applied before integration (see Project conventions in `workflow-rules`). Execute the chosen option (push and merge need this approval), then set `state.md` to `closed`.

## Switching

- The spec reveals a question that cannot be answered without experimentation → propose `workflow-spike`.
- The feature turns out to be restructuring with no behavior change → propose `workflow-refactor`.
