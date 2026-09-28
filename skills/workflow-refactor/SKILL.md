---
name: workflow-refactor
description: Workflow for restructuring code without changing behavior - map the area, define invariants, pin them with characterization tests before touching code, refactor in always-green steps, closure focused on behavioral equivalence.
---

# Refactor workflow

Improve structure without changing observable behavior. Apply `workflow-rules` throughout.

The defining rule: **invariants are pinned by tests before the code changes.**

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 scope** | before any code change | perimeter, target design, invariants, steps |
| **G2 delivery** | after closure | integration of the work |

Any need to change an invariant during the work is an unplanned gate.

## Phases

### 0. Setup

Create the work directory with `brief.md` (request, classification and reason) and `state.md`. The branch is created in phase 3, before the first change to project files.

### 1. Discovery

Follow the `project-docs` reading protocol for the area in scope; the Invariants and pitfalls sections of component docs are a starting point for `invariants.md`.

Dispatch `@scout`, with the relevant doc paths as starting points, to map the area: modules in scope, callers and dependents, public surface (APIs, CLI, file formats, events, DB schema), current test coverage of that surface, and the test commands.

### 2. Invariants, target and steps

Write `invariants.md`:

- **perimeter** — what is in scope and what explicitly is not;
- **invariants** — observable behavior that must not change: public interfaces, outputs, persisted formats, error behavior, and performance bounds when they matter;
- **coverage** — for each invariant, the existing tests that pin it, or the characterization test to add;
- **target design** — the intended structure and why it is better;
- **steps** — an ordered sequence of small refactoring steps, each leaving the build and all tests green, each independently committable.

Dispatch `@spec-reviewer` with the request and `invariants.md`: are the invariants complete for the perimeter, is each one verified, are the steps small and safe? Fix BLOCKING findings; list at the gate any finding you chose not to address, with the reason.

Present **G1**.

### 3. Characterization tests

Create the branch. Run the Review loop of `workflow-rules` with one task: `@implementer` adds the missing characterization tests, which pin current behavior even where it looks wrong, and must pass on the unchanged code; `@task-reviewer` checks that they pin the invariants, including edge cases and error paths. Record suspected bugs in `state.md` Notes: propose `workflow-fix` after the refactor, or open an unplanned gate if the bug blocks it.

The tests are committed on their own, before any refactoring commit.

### 4. Refactoring steps

Run the Review loop of `workflow-rules` for each step in `invariants.md`, passing the minor-findings policy and the commit range. Each step:

- leaves the full test suite green;
- modifies existing tests only mechanically (renamed imports, moved paths), which the reviewer checks;
- stops at an unplanned gate if it cannot be completed without changing an invariant.

Update `state.md` and give a one-line CHECKPOINT per step.

### 5. Docs sync

Dispatch `@doc-writer` for the docs sync described in `workflow-rules`, with the work directory, the base branch, workflow type `refactor` and the discrepancies recorded in `state.md`. A refactor changes where things live more than any other workflow: moved paths, new or merged components, changed boundaries and interactions must all be reflected, starting from the `covers` globs. Review its report; commit the docs and changelog changes with the work.

### 6. Closure

1. Commit `decisions.md` if it exists, then run the project's full verification yourself, including startup when relevant.
2. Dispatch `@closure-reviewer` with the request, `invariants.md`, `decisions.md` if any, your verification results, and the full diff, docs and changelog included. Ask it to focus on behavioral equivalence: every invariant still verified, no behavior change outside mechanical ones, no test weakened, target design reached.
3. On FAIL, fix through the Review loop and review again; after two failures, open an unplanned gate.
4. Write `closure.md`: verdict, verification run with results, deviations, non-blocking observations, deferred minor findings.

### 7. Delivery

Present **G2** with `closure.md` and the integration options from `superpowers:finishing-a-development-branch`. Execute the chosen option, then set `state.md` to `closed`.

## Switching

- A behavior change turns out to be desired → stop at a safe step and propose `workflow-feature` for it.
- Characterization reveals a suspected bug → see phase 3.
