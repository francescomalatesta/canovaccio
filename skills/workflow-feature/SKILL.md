---
name: workflow-feature
description: Workflow for adding or changing behavior in an existing project - scout, spec, optional prototype, plan, gated approval, subagent-driven implementation, closure review and delivery gate.
---

# Feature workflow

New or changed behavior in an existing project. Apply `workflow-conventions` throughout.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 spec+plan** | before implementation | what to build and how it is sliced |
| **G1a spec**, **G1b plan** | instead of G1, when the feature is large or needs a prototype | same, in two steps |
| **G-proto** | only when a prototype is built | material UX and visual structure |
| **G2 delivery** | after closure | integration of the finished work |

Use the split G1a/G1b when a prototype is needed, when the plan exceeds about six tasks, or when the feature spans several subsystems. Otherwise present spec and plan together at G1.

## Phases

### 0. Setup

Create the work directory with `brief.md` and `state.md`.

### 1. Discovery

Dispatch `@scout` for the parts of the codebase the feature touches: relevant modules, existing conventions, test setup and commands, similar features to mirror. Skip only when you already know the area well from this session.

### 2. Spec

Write `spec.md` using `superpowers:brainstorming` as technique. Clarifying questions to the user are allowed while drafting; batch them rather than asking one per turn.

`spec.md` contains:

- problem and intended outcome;
- requirements, keeping their modality (must vs. may vs. example);
- acceptance criteria, each verifiable;
- out of scope;
- affected areas and technical approach, at the level needed to plan;
- UX changes, and whether they are material (new screens, changed flows, changed layout).

Dispatch `@spec-reviewer` with the request, `brief.md` and `spec.md`. Fix BLOCKING findings; consider the rest.

### 3. Prototype (only for material UX changes)

If the spec contains material UX changes, present spec at **G1a** first. Then dispatch `@ui-prototyper` with the approved spec and the existing UI conventions, output in `prototype/`. Present it at **G-proto** with the startup command, URL and reachable states.

The approved prototype becomes an authority for implementation and closure.

### 4. Plan

Write `plan.md` using `superpowers:writing-plans`:

- tasks are vertical slices, each delivering observable behavior with its own tests;
- each task names its acceptance criteria and verification (unit, integration, E2E where it completes an important journey);
- dependencies between tasks are explicit;
- every requirement in `spec.md` is owned by at least one task.

Dispatch `@spec-reviewer` with spec and plan. Fix BLOCKING findings.

Present **G1** (spec+plan) or **G1b** (plan).

### 5. Implementation

Create the branch. Run `superpowers:subagent-driven-development` over `plan.md`, task by task:

1. `@implementer` with the task, the relevant spec sections, approved prototype if any, and project conventions;
2. `@task-reviewer` with the task, its requirements and the diff;
3. on "Needs fixes", back to `@implementer` with the findings;
4. if the same blocking finding survives two fix rounds, or the implementer reports it cannot converge, dispatch `@escalator`.

After each accepted task, update `state.md` and give a one-line CHECKPOINT.

Product decisions surfaced by agents: answer from spec and prototype when they settle it; otherwise open an unplanned gate. Record decisions in `decisions.md`.

### 6. Closure

1. Run the project's full verification yourself: tests, build, type check, lint, and application startup when relevant.
2. Dispatch `@closure-reviewer` with the original request, spec, plan, prototype if any, `decisions.md`, and the full diff against the base branch.
3. On FAIL, fix BLOCKING findings through the implementation loop and review again. If closure fails twice, open an unplanned gate with the findings.
4. Write `closure.md`: verdict, verification actually run with results, deviations, non-blocking observations.
5. Commit `spec.md` and `decisions.md` with the work.

### 7. Delivery

Present **G2** with `closure.md`, the list of commits and the integration options from `superpowers:finishing-a-development-branch`. Execute the chosen option (push and merge need this approval), then set `state.md` to `closed`.

## Switching

- The spec reveals a question that cannot be answered without experimentation → propose `workflow-spike`.
- The feature turns out to be restructuring with no behavior change → propose `workflow-refactor`.
