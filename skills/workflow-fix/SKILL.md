---
name: workflow-fix
description: Workflow for fixing wrong existing behavior - reproduce, find the root cause, fix test-first with review, delivery gate. The most autonomous workflow; it gates the fix only when it changes intended behavior or is large.
---

# Fix workflow

Existing behavior is wrong. Apply `workflow-conventions` throughout.

This is the most autonomous workflow: most fixes need no approval before the delivery gate.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G-fix** | only under the conditions in phase 3 | the fix approach |
| **G2 delivery** | after verification | integration of the fix |

## Phases

### 0. Setup

Create the work directory with `brief.md` and `state.md`, and the branch.

### 1. Reproduce

Use `superpowers:systematic-debugging`. Establish a reliable reproduction yourself, or dispatch `@scout` to run and observe (it can execute commands but not edit).

Record in `repro.md`: steps, expected behavior and its source (spec, docs, tests, user report), actual behavior, environment details that matter.

If the bug cannot be reproduced after a reasonable effort, open an unplanned gate: what was tried, what was observed, what information would help.

### 2. Root cause

Continue with `superpowers:systematic-debugging` until the cause is identified, not just the symptom. Record it in `repro.md`, including why existing tests did not catch it.

Look for the same cause elsewhere in the codebase and note other occurrences; fix them only if they are the same defect.

### 3. Decide whether to gate

Open **G-fix** when any of these holds:

- the correct behavior is ambiguous or the fix changes intended product behavior;
- the fix is large: several subsystems, a public API or schema change, a data migration or repair;
- the fix touches security-sensitive code or requires repairing already-corrupted data.

Present `repro.md` with root cause and the proposed fix. If the fix is really new behavior, propose `workflow-feature` instead.

Otherwise give a CHECKPOINT with root cause and intended fix, and continue.

### 4. Fix

Dispatch `@implementer` with `repro.md`. The task is test-first (`superpowers:test-driven-development`):

1. add a regression test at the cheapest layer that reproduces the bug, and show it failing;
2. fix the root cause;
3. show the regression test passing, and run the related tests.

Then `@task-reviewer` with `repro.md` and the diff. Loop on "Needs fixes"; dispatch `@escalator` if the same blocking finding survives two rounds.

### 5. Verification

Run the project's full verification yourself: tests, build, type check, lint, and startup when relevant.

Dispatch `@closure-reviewer` only when G-fix was opened or the diff is large; otherwise the task review plus full verification is the closure.

Write `closure.md`: root cause in one paragraph, what changed, verification actually run with results, other occurrences found.

### 6. Delivery

Present **G2** with `closure.md` and the integration options from `superpowers:finishing-a-development-branch`. Execute the chosen option, then set `state.md` to `closed`.

## Switching

- The expected behavior was never specified or implemented → `workflow-feature`.
- The root cause is structural and the right fix is a restructuring → finish a minimal safe fix if possible, and propose `workflow-refactor` as follow-up.
