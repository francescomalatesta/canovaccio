---
name: workflow-design-init
description: Workflow for capturing an existing project's product and visual system in PRODUCT.md and DESIGN.md (Impeccable format) - read what the code already says, ask only what it cannot, write both files, and optionally critique the current interface as a base for improving it. Changes no code.
---

# Design init workflow

Bring an existing project to a `PRODUCT.md` and a `DESIGN.md` that describe it as it is: the base every later UI work builds on, and the starting point for improving it. Apply `workflow-rules` and `design-context` throughout.

This workflow changes only `PRODUCT.md`, `DESIGN.md`, the link to them in `docs/index.md` and the Impeccable preference in the project `AGENTS.md`; with the critique, also `findings.md`. It adds no changelog entry and has no Review loop, so no minor-findings policy applies.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 delivery** | after verification | the two files, the optional critique, integration |

The interview rounds are questions, not gates.

## Phases

### 0. Setup

Create the work directory with `brief.md` (request, classification and reason) and `state.md`, and the branch `design-init/<slug>`.

This workflow implies Impeccable. Without a project preference, write `Use: on` and add to the first interview round the two other preference questions (advisory findings, design review), outside the interview limits. With `Use: off`, add one question: turn it on? The files are written either way.

### 1. Current state

Read `docs/index.md` when it exists, and any existing `PRODUCT.md` or `DESIGN.md`: this workflow completes and corrects them. Find how the app starts (docs, README, package scripts). When it can start, start it detached so rendered styles and pages can be read, and note the command and process in `state.md`.

### 2. Interview and writing

Dispatch `@design-director` in document mode with the work directory, the existing files and the app's URL if it runs. Relay its questions as `design-context` describes, until it returns the files written. Stop the app.

### 3. Verification

1. Check a sample of the `DESIGN.md` frontmatter tokens against the code (each value appears where the project defines it), the canonical section order, and that `PRODUCT.md` holds no visual decisions. Run the `project-docs` checker when the project has docs.
2. Commit the files.
3. Write `closure.md`: the files, what came from the code and what from the answers, what stayed `Assumed:` or `Open:`, the verification run.

There is no closure review: the user reviews the files themselves at G1.

### 4. Delivery

Present **G1** with `closure.md`, both files, the assumed and open items, the integration options from `superpowers:finishing-a-development-branch`, and one offer: **critique the current interface?** (default no).

- Corrections to the files: dispatch `@design-director` in document mode with them, without new questions, then commit.
- Critique: start the app, or report that it cannot run, and dispatch `@design-reviewer` in critique mode with the main screens (at most five, from the navigation or the routes; the user may name them). Stop the app, commit `findings.md`, and summarize scores and the top issues. Nothing is fixed here: the findings are the input of later `feature` or `fix` work, which you may propose.

Execute the chosen integration, then set `state.md` to `closed`.

## Switching

- The interface is so inconsistent that no system can be described → document what dominates, list the inconsistencies as `Open:`, and propose the critique and follow-up work.
- The user wants the interface changed → finish the files, then propose `workflow-feature`.
