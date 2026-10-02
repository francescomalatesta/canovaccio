---
name: workflow-router
description: Classifies a development request into the right workflow (greenfield, feature, refactor, fix, spike, docs-init, design-init) when none was named explicitly, announces the choice and loads that workflow.
---

# Workflow router

Use this when a development request needs a workflow and none was named explicitly.

## 1. Classify

When the answer depends on the codebase, take a quick look or dispatch `@scout`. Then pick the first workflow that fits:

| Workflow | Signals |
|---|---|
| `workflow-docs-init` | document an existing codebase as a whole; no code change requested |
| `workflow-design-init` | capture an existing project's product and visual system (`PRODUCT.md`, `DESIGN.md`), possibly with a critique of its interface; no code change requested |
| `workflow-spike` | a question to answer before building: feasibility, which library, how would we, compare. Questions about wrong behavior are fixes |
| `workflow-fix` | existing behavior is wrong: bug, error, crash, regression, failing test |
| `workflow-refactor` | better structure, same behavior: restructure, extract, rename, migrate internals, upgrade with no functional change. A redesign the user can see is a feature |
| `workflow-greenfield` | no project yet (no repository, or one holding only the agent harness), or a new application that needs its own stack and architecture decisions |
| `workflow-feature` | new or changed behavior in an existing project |

Mixed requests: classify by the main intent and note the rest for `brief.md`. If the parts are independent and large, propose separate workflows in sequence.

## 2. When unsure, ask

If two workflows remain plausible and the choice changes the gates (fix vs feature: "the export is missing the date column" may be a bug or a new requirement), ask the user with a short question stating both readings. This is the only gate the router may open.

## 3. Announce and hand off

State the choice and the reason in one line, in the user's language:

> Treating this as a **fix**: current behavior contradicts the expected one.

Load the chosen workflow skill; its setup records the classification and reason in `brief.md`. Present the classification again at the workflow's first gate, where the user confirms it. Workflows without an initial gate proceed; the user can redirect at any time.
