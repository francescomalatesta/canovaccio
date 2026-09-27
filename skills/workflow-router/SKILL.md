---
name: workflow-router
description: Classifies a development request into the right workflow (greenfield, feature, refactor, fix, spike, docs-init) when none was named explicitly, announces the choice and loads that workflow.
---

# Workflow router

Use this when a development request arrives without an explicit workflow. Apply `workflow-conventions` throughout.

## 1. Is a workflow needed at all?

No workflow for:

- questions, explanations, reviews of existing code;
- trivial changes whose outcome is obvious and verifiable in one step (typo, config value, a one-line change the user fully specified).

Handle these directly under `AGENTS.md`. If the "trivial" change turns out not to be, stop and route it.

## 2. Classify

Read the request and, when the answer depends on the codebase, do a quick read-only look (or dispatch `@scout`). Then pick the first workflow that fits:

| Workflow | Signals |
|---|---|
| `workflow-docs-init` | document an existing codebase as a whole: "document this project", "map the system", "create the docs"; no code change requested |
| `workflow-spike` | the request is a question to answer before building: "is it feasible", "which library", "how would we", "evaluate", "compare", "prototype to find out" |
| `workflow-fix` | existing behavior is wrong: bug, error, crash, regression, failing test, "it should do X but does Y" |
| `workflow-refactor` | improve structure without changing behavior: restructure, extract, rename, migrate internals, pay down debt, upgrade with no functional change |
| `workflow-greenfield` | no existing project, or a new standalone application or service |
| `workflow-feature` | new or changed behavior in an existing project |

Mixed requests: classify by the main intent and note the rest in `brief.md`. If the parts are independent and large, propose running them as separate workflows in sequence.

## 3. When unsure, ask

If two workflows remain plausible and the choice changes the gates (for example fix vs feature: "the export is missing the date column" may be a bug or a new requirement), ask the user with a short question that states both readings. This is the only gate the router may open.

## 4. Announce and hand off

State the choice in one line with the reason, in the user's language, for example:

> Treating this as a **fix**: current behavior contradicts the expected one (500 on login with an expired password).

Then create the work directory with `brief.md` and `state.md`, and load the chosen workflow skill.

The user confirms or corrects the classification at the workflow's first gate, which you must present together with the classification. `workflow-fix` has no initial gate: announce and proceed; the user can redirect at any time.
