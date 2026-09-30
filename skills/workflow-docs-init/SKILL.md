---
name: workflow-docs-init
description: Workflow for bootstrapping system docs in an existing, undocumented or partially documented project - survey the codebase, propose the map (index, architecture, components), then write and verify the component docs. Changes no code.
---

# Docs init workflow

Bring an existing project to a complete docs map in one pass, instead of letting it fill in incrementally. Apply `workflow-rules` and `project-docs` throughout.

This workflow changes only docs, `.docsignore` and the project `AGENTS.md`. It adds no changelog entry, and has no Review loop, so no minor-findings policy applies.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 map** | before writing component docs | component boundaries, covers, flows, scope |
| **G2 delivery** | after verification | integration of the docs |

## Phases

### 0. Setup

Create the work directory with `brief.md` (request, classification and reason) and `state.md`, and the branch.

### 1. Current state

Run the `project-docs` checker. Exit code 2 is expected when the project has no docs yet. If docs already exist, this workflow completes and repairs them: keep what is accurate, and list what is missing, broken or uncovered.

### 2. Survey

Identify the top-level areas from the repository layout, build files and entry points. Dispatch `@scout` for each area, in parallel (`superpowers:dispatching-parallel-agents`), asking for:

- responsibilities and what the area does not do;
- entry points;
- dependencies on other areas and on external services;
- data it owns;
- where its tests are and how they run;
- for UI areas, any tool for previewing UI in isolation (Storybook, a dev-only playground);
- anything surprising: pitfalls, dead code, unclear boundaries.

### 3. Map proposal

From the survey, write the proposal yourself: it is the gate artifact.

- `docs/architecture.md`, following the `project-docs` template;
- `docs/index.md`, listing every proposed component with its code paths and a one-line purpose, and the proposed flows;
- the proposed `covers` of each component, in `plan.md`, one entry per component;
- `docs/.docsignore` for tests, generated code, fixtures and other paths no doc should cover;
- when the project has a tool meeting the prototype system contract of `project-prototypes` (Storybook or similar), `docs/prototypes.md` in the index, adopting it as the project's prototype system.

Aim for components that are meaningful units, typically a handful to a few dozen for a large system, not one per directory.

Present **G1** with the index, the architecture, the proposed covers and the files that would remain uncovered. For large projects, the user may choose to document a priority subset now; record the choice in `state.md`. After approval, `index.md` lists only the approved components and flows; the rest stays uncovered.

G1 may also propose up to three entries for `docs/conventions.md`: the least obvious patterns of the project, the ones a model would most likely get wrong. This is the one case without an error history; the filter of `workflow-rules` still applies, and each entry is accepted or rejected on its own. `@doc-writer` writes accepted ones in phase 4.

### 4. Writing

Dispatch `@doc-writer` with the docs writing task for each approved component, in parallel batches, passing the approved index, architecture and the component's covers. Then dispatch it for the flows, and for `docs/prototypes.md` when the map includes it.

Add the system docs pointer to the project `AGENTS.md` yourself, outside the canovaccio block if there is one.

### 5. Verification

1. Commit the docs, then run the checker in full mode: no errors.
2. Run the closure review (see Closure review in `workflow-rules`) against the base branch, with the approved map; the change is the written docs. The focus is accuracy against the code, checking a meaningful sample of concrete statements in every doc (entry points, dependencies, invariants), and adherence to `project-docs`.
3. On FAIL, send the findings to `@doc-writer` and verify again; after two failures, open an unplanned gate.
4. Write `closure.md`: docs written, coverage report, verification run, known gaps.

### 6. Delivery

Present **G2** with `closure.md` and the integration options from `superpowers:finishing-a-development-branch`. Execute the chosen option, then set `state.md` to `closed`.

## Switching

- The survey finds bugs → record them in `closure.md` and propose `workflow-fix` afterwards; do not fix them here.
- Boundaries are so unclear that documenting them would describe a mess → record it and propose `workflow-refactor` as follow-up; document the system as it is.
