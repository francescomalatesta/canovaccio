---
name: workflow-fix
description: Workflow for fixing wrong existing behavior - reproduce, find the root cause, fix test-first with review, delivery gate. The most autonomous workflow; it gates the fix only when it changes intended behavior or is large.
---

# Fix workflow

Existing behavior is wrong. Apply `workflow-rules` throughout.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G-fix** | only under the conditions in phase 3 | the fix approach |
| **G2 delivery** | after verification | integration of the fix |

## Phases

### 0. Setup

Create the work directory with `brief.md` (request, classification and reason) and `state.md`, and the branch.

### 1. Reproduce

Follow the `project-docs` reading protocol to locate the area involved.

Use `superpowers:systematic-debugging`. Establish a reliable reproduction yourself, or dispatch `@scout` to run and observe (it can execute commands but not edit).

Record in `repro.md`: steps, expected behavior and its source (spec, docs, tests, user report), actual behavior, environment details that matter.

If the bug cannot be reproduced after a reasonable effort, open an unplanned gate: what was tried, what was observed, what information would help.

### 2. Root cause

Continue with `superpowers:systematic-debugging` until the cause is identified, not just the symptom. Record it in `repro.md`, including why existing tests did not catch it, and whether a wrong or missing doc contributed to the bug.

Look for the same cause elsewhere in the codebase and note other occurrences; fix them only if they are the same defect.

### 3. Decide whether to gate

Open **G-fix** when any of these holds:

- the expected behavior is not established by spec, docs, tests or the user's report;
- the fix also changes behavior others may rely on, beyond the bug;
- it changes a public API or a schema, or needs a data migration or repair;
- it touches security-sensitive code.

Present `repro.md` with root cause and the proposed fix. If the fix is really new behavior, propose `workflow-feature` instead.

Otherwise give a CHECKPOINT with root cause and intended fix, and continue.

### 4. Fix

Run the Review loop of `workflow-rules` with one task: give `@implementer` `repro.md`, the minor-findings policy and these instructions (`superpowers:test-driven-development`):

1. add a regression test at the cheapest layer that reproduces the bug, and show it failing;
2. fix the root cause, and other occurrences of the same defect;
3. show the regression test passing, and run the related tests.

Give `@task-reviewer` `repro.md` and the commit range.

### 5. Docs sync

Dispatch `@doc-writer` for the docs sync described in `workflow-rules`, with the work directory, the base branch, workflow type `fix` and the discrepancies recorded in `state.md`. For a fix this is usually small: correct the docs that were wrong, and describe any behavior the fix made explicit. Review its report; commit the docs and changelog changes with the work.

### 6. Verification

Run the project's full verification yourself: tests, build, type check, lint, and startup when relevant.

Dispatch `@closure-reviewer` only when G-fix was opened, with your verification results and the full diff, docs and changelog included. Otherwise the task review plus full verification is the closure.

Write `closure.md`: root cause in one paragraph, what changed, verification run with results, other occurrences found, deferred minor findings.

### 7. Delivery

Present **G2** with `closure.md` and the integration options from `superpowers:finishing-a-development-branch`; its convention proposals are accepted or rejected one by one, and accepted ones applied before integration (see Project conventions in `workflow-rules`). Execute the chosen option, then set `state.md` to `closed`.

## Switching

- The expected behavior was never specified or implemented → `workflow-feature`.
- The root cause is structural and the right fix is a restructuring → finish a minimal safe fix if possible, and propose `workflow-refactor` as follow-up.
