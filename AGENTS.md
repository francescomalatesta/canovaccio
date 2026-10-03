# Global Software Engineering Instructions

These instructions define universal engineering behavior.

They do NOT define a specific development workflow.

Workflow-specific sequencing, human gates, branching strategy, planning requirements and approval points are defined by the active workflow, skill or command.

## Product intent

Treat the user's request as the source of product intent.

The user should be able to describe WHAT they want to build without also having to describe HOW the development process should operate.

Do not require workflow instructions to be repeated in product prompts.

When a project-specific `AGENTS.md`, approved specification, approved plan, approved prototype or active workflow exists, respect its authority within its stated scope.

## Workflows

Development workflows are defined as skills: `workflow-greenfield`, `workflow-feature`, `workflow-refactor`, `workflow-fix`, `workflow-spike`, `workflow-docs-init` and `workflow-design-init`, with shared rules in `workflow-rules`.

A workflow is active when it was started explicitly, selected by `workflow-router`, or recorded as active in a project's `docs/work/*/state.md`.

Questions, explanations and trivial changes do not need a workflow.

## System docs

When a project has `docs/index.md`, start from it to find where to work: it maps the codebase to its components. Docs are a map; the code is the source of truth. Verify in the code before relying on a doc, and report discrepancies.

Keeping docs and changelog current is part of finishing a change, as defined by `project-docs` and `project-changelog`.

## Autonomy

Operate autonomously on routine engineering decisions.

Do not ask the user to approve:

- ordinary implementation details;
- file organization;
- routine library usage;
- small refactorings;
- test implementation details;
- equivalent technical mechanisms;
- reversible engineering decisions.

Escalate only when:

- the active workflow explicitly requires a human gate;
- a genuine product decision is unresolved;
- requirements materially conflict;
- proceeding would require a material scope or UX change;
- an operation requires explicit permission.

Do not manufacture approval points.

## Scope discipline

Implement only behavior required by:

- the product request;
- approved project artifacts;
- the active workflow;
- necessary engineering support for those requirements.

Do not silently add product features.

Prefer the smallest coherent solution that satisfies the requirements.

Avoid speculative abstractions and infrastructure.

## Temporary files

Work only inside the project directory. Never write to or work in `/tmp`, `$TMPDIR` or any other directory outside the project: not for scratch scripts, logs, server output, captures, downloads, clones or checkouts of other revisions. This also applies when a skill, including a superpowers skill, suggests a system temporary directory.

Temporary files go in `.canovaccio/tmp/`. If it does not exist, create it with a `.gitignore` that keeps the directory versioned and its content out of version control:

```gitignore
*
!.gitignore
```

Inside a workflow, use `.canovaccio/tmp/<work directory name>/`. Delete what you put there once it is no longer needed, with `rm -rf .canovaccio/tmp/<name>`; keep `.canovaccio/tmp/.gitignore`.

To read a file at another revision, prefer `git show <rev>:<path>` to a checkout.

## Requirement modality

Preserve requirement strength.

Treat explicit requirements and acceptance criteria as binding.

Do not promote:

- examples;
- suggestions;
- implementation ideas;
- "where useful";
- "where practical";
- technically equivalent mechanisms

into mandatory requirements unless explicitly stated.

Prefer behavioral conformance over literal implementation conformance unless the implementation mechanism itself is a requirement.

## Incremental implementation

Prefer small, coherent vertical slices.

A feature slice should normally include:

1. implementation;
2. appropriate automated verification;
3. focused E2E coverage when it completes an important user journey;
4. review;
5. blocking fixes before dependent work proceeds.

Avoid organizing development primarily as:

- all backend first;
- all frontend second;
- all tests afterward;
- all E2E afterward.

Avoid meaningless micro-tasks as well.

## Testing

Testing is part of implementation.

Choose the cheapest reliable verification layer:

- unit tests for isolated behavior;
- integration/API tests for component boundaries;
- E2E tests for important complete user journeys.

E2E coverage should be pragmatic and risk-based.

Do not maximize browser test count.

Do not duplicate substantial lower-level coverage through E2E unless the complete journey provides meaningful additional confidence.

Tests should be deterministic and should not depend on arbitrary sleeps when observable readiness conditions are available.

### Test data isolation

Tests never write to the local development database. When tests persist data, the development environment provides a dedicated, isolated test database:

- the test commands use it by default, with no variable to set by hand;
- a test run pointed at the development database stops before running instead of writing to it;
- E2E tests start their own app instance on the test database and on its own port, never reusing a development server already running;
- the test database is created, migrated and cleaned automatically, so runs do not depend on each other.

The mechanism is free (a separate database configured for the test environment, an in-memory or temporary database, a container, a schema per worker); the behavior is binding.

## Reviews

Review findings must be pragmatic.

Blocking findings should normally involve:

- correctness;
- security;
- data integrity;
- explicitly required behavior;
- meaningful missing verification;
- significant realistic regression risk.

Normally non-blocking:

- stylistic preferences;
- speculative refactors;
- minor theoretical edge cases;
- redundant tests;
- equivalent implementation choices;
- low-value additional browser coverage.

Do not create review churn for its own sake.

## UI

When an approved browser prototype exists, treat it as the baseline for material visual structure and interaction behavior.

Production implementation may naturally differ in technical implementation.

Minor implementation details do not require further approval.

Material UX or visual departures must follow the active workflow's policy.

## Agent specialization

Use specialized agents when their role matches the work.

The controller should coordinate rather than silently perform every role itself. The default controller is the `conductor` agent.

Normal role boundaries:

- repository or documentation exploration → scout;
- specification or plan review → spec-reviewer;
- browser prototype implementation → ui-prototyper;
- production implementation → implementer;
- task-level review → task-reviewer;
- difficult failed implementation → escalator;
- system docs and changelog → doc-writer;
- product and design context (`PRODUCT.md`, `DESIGN.md`) → design-director;
- design review of rendered UI → design-reviewer;
- whole-project final review → closure-reviewer, with closure-auditor collecting its evidence.

Do not dispatch agents recursively unless a workflow explicitly requires it.

## Evidence

Do not claim completion based only on code inspection.

Use executable evidence where reasonably possible:

- tests;
- builds;
- type checks;
- linters;
- application startup;
- focused functional verification.

Report what actually ran and what actually passed.

Never claim a check passed if it was not executed.

