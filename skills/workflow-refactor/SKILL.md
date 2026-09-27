---
name: workflow-refactor
description: Workflow for restructuring code without changing behavior - map the area, define invariants, pin them with characterization tests before touching code, refactor in always-green steps, closure focused on behavioral equivalence.
---

# Refactor workflow

Improve structure without changing observable behavior. Apply `workflow-conventions` throughout.

The defining rule: **invariants are pinned by tests before the code changes.** Without that, a refactor is a rewrite on hope.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 scope** | before any code change | perimeter, target design, invariants, steps |
| **G2 delivery** | after closure | integration of the work |

Any need to change an invariant during the work is an unplanned gate.

## Phases

### 0. Setup

Create the work directory with `brief.md` and `state.md`.

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

Dispatch `@spec-reviewer` with the request and `invariants.md`: are the invariants complete for the perimeter, is each one verified, are the steps small and safe? Fix BLOCKING findings.

Present **G1**.

### 3. Characterization tests

Create the branch. Dispatch `@implementer` to add the missing characterization tests. They must pass against the unchanged code; a characterization test that needs a code change to pass has found a bug, which is reported, not fixed here.

Dispatch `@task-reviewer`: do the tests actually pin the invariants, including edge cases and error paths?

Commit the tests on their own, before any refactoring commit.

### 4. Refactoring steps

For each step in `invariants.md`, run the `superpowers:subagent-driven-development` loop with `@implementer` and `@task-reviewer`:

- the full relevant test suite passes after every step;
- existing tests are not modified to make them pass, except for mechanical changes the refactor itself requires (renamed imports, moved paths), which the reviewer checks explicitly;
- a step that cannot be completed without changing an invariant stops the loop: open an unplanned gate.

Dispatch `@escalator` if a step does not converge after two fix rounds. Update `state.md` and give a one-line CHECKPOINT per step.

### 5. Docs sync

Dispatch `@doc-writer` for the docs sync described in `workflow-conventions`, with the work directory, the base branch, workflow type `refactor` and the discrepancies recorded in `state.md`. A refactor changes where things live more than any other workflow: moved paths, new or merged components, changed boundaries and interactions must all be reflected, starting from the `covers` globs. Review its report; commit the docs and changelog changes with the work.

### 6. Closure

1. Run the project's full verification yourself, including startup when relevant.
2. Dispatch `@closure-reviewer` with the request, `invariants.md`, `decisions.md` if any, and the full diff, docs and changelog included. Ask it to focus on behavioral equivalence: every invariant still verified, no behavior change outside mechanical ones, no test weakened, target design reached.
3. On FAIL, fix through the step loop and review again; after two failures, open an unplanned gate.
4. Write `closure.md` and commit `decisions.md` if it exists.

### 7. Delivery

Present **G2** with `closure.md` and the integration options from `superpowers:finishing-a-development-branch`. Execute the chosen option, then set `state.md` to `closed`.

## Switching

- A behavior change turns out to be desired → stop at a safe step and propose `workflow-feature` for it.
- Characterization reveals a bug → record it; propose `workflow-fix` after the refactor, or before it if it blocks.
