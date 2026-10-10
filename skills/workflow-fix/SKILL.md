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

When the bug or its fix concerns the UI, follow the project's Impeccable preference; a fix never asks it (see Impeccable in `workflow-rules`).

### 1. Reproduce

Follow the `project-docs` reading protocol to locate the area involved.

Use `superpowers:systematic-debugging`. Establish a reliable reproduction yourself, or dispatch `@scout` to run and observe (it can execute commands but not edit).

Record in `repro.md`: steps, expected behavior and its source (spec, docs, tests, user report), actual behavior, environment details that matter, and whether tests that persist data are isolated from the development database.

If the bug cannot be reproduced after a reasonable effort, open an unplanned gate: what was tried, what was observed, what information would help.

### 2. Root cause

Continue with `superpowers:systematic-debugging` until the cause is identified, not just the symptom. Record it in `repro.md`, including why existing tests did not catch it, and whether a wrong or missing doc contributed to the bug.

Look for the same cause elsewhere in the codebase and note other occurrences; fix them only if they are the same defect.

### 3. Decide whether to gate

Open **G-fix** when any of these holds:

- the expected behavior is not established by spec, docs, tests or the user's report;
- the fix also changes behavior others may rely on, beyond the bug;
- it changes a public API or a schema, or needs a data migration or repair;
- it touches security-sensitive code;
- the regression test needs test data isolation the project lacks (see `AGENTS.md`), and setting it up changes shared configuration in a risky way.

Present `repro.md` with root cause and the proposed fix. If the fix is really new behavior, propose `workflow-feature` instead.

Otherwise give a CHECKPOINT with root cause and intended fix, and continue. When the regression test persists data and the project has no test data isolation, the CHECKPOINT also says it is set up first.

### 4. Fix

Run the Review loop of `workflow-rules` with one task: give `@implementer` `repro.md`, the minor-findings policy and these instructions (`superpowers:test-driven-development`):

1. when the regression test persists data and the project has no test data isolation, set it up first, as `AGENTS.md` describes;
2. add a regression test at the cheapest layer that reproduces the bug, and show it failing;
3. fix the root cause, and other occurrences of the same defect;
4. show the regression test passing, and run the related tests; of the E2E tests, only the regression test when it is one, never the full E2E suite.

Give `@task-reviewer` `repro.md` and the commit range.

### 5. Docs sync

Dispatch `@doc-writer` for the docs sync described in `workflow-rules`, with the work directory, the base branch, workflow type `fix` and the discrepancies recorded in `state.md`. For a fix this is usually small: correct the docs that were wrong, and describe any behavior the fix made explicit. Review its report; commit the docs and changelog changes with the work.

### 6. Verification

Run the project's full verification yourself: tests, the full E2E suite included, build, type check, lint, and startup when relevant.

Run the closure review (see Closure review in `workflow-rules`) only when G-fix was opened, against the base branch, with `repro.md` and the approved fix approach; docs and changelog are part of the change. Otherwise the task review plus full verification is the closure.

Write `closure.md`: root cause in one paragraph, what changed, verification run with results, other occurrences found, deferred minor findings.

### 7. Delivery

Present **G2** with `closure.md` and the integration options from `superpowers:finishing-a-development-branch`; its convention proposals are accepted or rejected one by one, and accepted ones applied before integration (see Project conventions in `workflow-rules`). Execute the chosen option, then set `state.md` to `closed`.

## Switching

- The expected behavior was never specified or implemented → `workflow-feature`.
- The root cause is structural and the right fix is a restructuring → finish a minimal safe fix if possible, and propose `workflow-refactor` as follow-up.
