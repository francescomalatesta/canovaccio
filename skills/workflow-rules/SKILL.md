---
name: workflow-rules
description: Shared rules for every development workflow (greenfield, feature, refactor, fix, spike, docs-init) - gates, checkpoints, artifacts, state, resumption, system docs and changelog, the Impeccable choice, workflow switching and precedence over superpowers skills. Load before running or resuming any workflow.
---

# Workflow rules

These rules apply to every workflow. A workflow skill defines its phases and gates; this skill defines what those words mean.

## Gates and checkpoints

**GATE** — a blocking human decision.

1. Make sure the artifact under decision is written to disk, `state.md` is current, and set `Status: waiting-gate`.
2. Present it: file path, a short summary of what it decides, open questions, and what you will do after approval.
3. Stop and wait for an explicit answer (use the `question` tool when it fits, otherwise end the turn). Do not continue in the same turn.
4. Handle the answer, then set `Status: active` again:
   - **approved** → record it in `state.md` (gate, date, artifact) and proceed;
   - **approved with changes** → apply them; if a change is material to what was approved, present the result again, otherwise record and proceed;
   - **rejected or redirected** → revise, or propose another workflow, and present again.

An approval covers only the artifact that was presented. It does not approve artifacts that do not exist yet, and it does not carry over to a different task. If an approved artifact later needs a material change, it needs a new approval.

**CHECKPOINT** — a non-blocking status update. Report briefly what was done, what comes next and anything the user may want to redirect, then continue in the same turn.

**Unplanned gates** are allowed only for the escalation reasons in `AGENTS.md`: a genuine unresolved product decision, materially conflicting requirements, a material scope or UX change, or an operation that requires explicit permission. Do not invent others.

**Gate collapsing.** When a change is small, a workflow may merge consecutive gates (for example spec and plan) into one. The workflow says where this is allowed. Collapsing reduces ceremony; it never removes the decision.

## Work directory and artifacts

Each workflow instance works in `docs/work/<YYYY-MM-DD>-<slug>/` inside the target project, where the date is the start date and the slug is a short kebab-case name.

| Artifact | Purpose | Versioned |
|---|---|---|
| `brief.md` | original request, chosen workflow and why, known constraints | no |
| `spec.md` | what to build: requirements, acceptance criteria, out of scope, technical choices | **yes** |
| `plan.md` | tasks as vertical slices, each with its verification | no |
| `invariants.md` | behavior that must not change, and how it is verified | no |
| `repro.md` | reproduction, root cause, failing test | no |
| `findings.md` | spike answer, evidence and recommendation | **yes** |
| `decisions.md` | decisions taken during the work, with rationale | **yes** |
| `closure-plan.md` | closure review plan, saved by the controller | no |
| `closure-evidence.md` | evidence collected for the closure review by `@closure-auditor` | no |
| `closure.md` | written by the controller: final review verdict, verification evidence, deferred minor findings, convention proposals, detector ignore proposals | no |
| `state.md` | workflow state, see below | no |

Only the artifacts the active workflow uses are created. `decisions.md` is created on the first decision worth recording; do not create it empty.

Durable artifacts (spec, findings, decisions) are committed together with the work. Operational ones stay out of version control. On the first workflow in a project, make sure the project `.gitignore` contains:

```gitignore
# Workflow artifacts: keep only the durable ones
docs/work/*/*
!docs/work/*/spec.md
!docs/work/*/decisions.md
!docs/work/*/findings.md
```

If the project does not use git, skip this.

Work artifacts are the history of one piece of work. The rest of `docs/` holds the system docs, which describe the system as it is now: see the next section.

## state.md

`state.md` is the source of truth for where a workflow is. Keep it short and current:

```markdown
# State

- Workflow: feature
- Status: active            <!-- active | waiting-gate | closed | abandoned -->
- Phase: implementation
- Branch: feature/csv-export
- Minor findings: defer     <!-- fix | defer -->
- Impeccable: on            <!-- on | off -->
- Advisory: exclude         <!-- minor | exclude; only when Impeccable is on -->

## Gates
- [x] G1 spec+plan — approved 2026-09-27 — spec.md, plan.md
- [ ] G2 delivery

## Tasks
- [x] T1 export endpoint — reviewed, approved
- [ ] T2 download button

## Notes
- T2 blocked on nothing; next action: dispatch implementer.
- Doc discrepancy: docs/components/billing.md says VAT is computed in the job, it is in vat.ts.

## Deferred minor findings
- T1: export filename not localized (task-reviewer)

## Convention candidates
- Money amounts are integer cents, never floats — task-reviewer flagged floats in T1 and T3
```

Update it at every phase transition, gate decision and completed task, before reporting to the user. When resuming, continue from the first incomplete step; never re-run completed tasks.

If the user stops a workflow, set `Status: abandoned` with the reason in Notes and leave its branch as is. Closed and abandoned workflows are never resumed.

## Review loop

For every implementation task:

1. `@implementer`, then `@task-reviewer` on its commits;
2. Needs fixes → back to `@implementer` with the findings; if the same blocking finding survives two fix rounds, or the implementer cannot converge, dispatch `@escalator`;
3. after `@escalator`, `@task-reviewer` again; if it still needs fixes, open an unplanned gate with the findings and the escalator's diagnosis;
4. Approved with Minor findings: under `fix`, one `@implementer` round for them and a scoped re-review; under `defer`, record them.

This replaces the fix-round limits of `superpowers:subagent-driven-development`.

## Minor findings policy

Decides what happens to Minor review findings, so the flow is never interrupted for them:

- `defer` (default) — not fixed during the work. Record each one in `state.md` under Deferred minor findings; `closure.md` lists them for the user at the delivery gate.
- `fix` — fixed in the review loop like Critical and Important findings.

Use the user's choice if the request states one, otherwise the default. State the policy in one line at the workflow's first gate, where the user can change it; workflows without an initial gate use it as is. Record it in `state.md` and pass it to `@implementer` with review findings.

## Impeccable

[Impeccable](https://impeccable.style) supports UI work with design guidance while building (the `design-craft` skill) and a deterministic detector on the result (the `design-check` skill). Whether a project uses it is the user's choice, made once per project.

**Project preference.** It lives in the project `AGENTS.md`, outside the canovaccio block:

```markdown
## Impeccable

- Use: on            <!-- on | off -->
- Advisory: exclude  <!-- minor | exclude -->

Set by canovaccio from your answer. Edit it, or ask, to change it.
```

**For each workflow** whose work touches the UI (greenfield with a UI, feature, refactor, fix):

- **preference present**: use it, without asking;
- **no preference**: greenfield, feature and refactor ask at their first gate (G1, or G1a), never at a gate of their own. Three answers: no · yes, advisory findings as Minor · yes, advisory findings excluded. Advisory findings are the detector's soft signals, which may be deliberate choices. Write the answer, `off` included, as the project preference and commit it with the work, so it is never asked again. A fix never asks: without a preference it runs with Impeccable off;
- **the request says otherwise** ("without impeccable", "advisory included"): that applies to this work only. When the user asks to change the preference itself, update `AGENTS.md`.

Spike, docs-init and work that does not touch the UI run with Impeccable off, ask nothing and leave the preference as it is. Record the setting of this work in `state.md` as `Impeccable` and `Advisory`.

**Availability.** When Impeccable is on, run `design-check.mjs --check` at the start of the work. If the detector cannot run, say so in a CHECKPOINT with the reason: the work continues, the guidance still applies, and every design check is reported as not run.

**Dispatch.** With Impeccable on, add `Impeccable: on, advisory: <minor|exclude>` to every dispatch of `@implementer`, `@task-reviewer`, `@ui-prototyper` and `@closure-reviewer` in plan mode, besides what the workflow lists; give `@implementer` the commit the task starts from. With Impeccable off, do not mention it: agents use neither guidance nor design checks.

**Delivery.** When an agent reports a finding that is a deliberate choice or a recurring false positive, record it in `state.md` Notes as a detector ignore candidate. `closure.md` lists the detector ignore proposals, or "none". They are presented at the delivery gate with the convention proposals and decided the same way: one by one, no answer means rejected, accepted ones applied before integration and committed separately.

## System docs and changelog

Greenfield, feature, refactor and fix read the system docs at the start and bring them, and `CHANGELOG.md`, up to date at the end. Spikes do neither; `workflow-docs-init` has its own flow. The rules are in the `project-docs` and `project-changelog` skills.

- **At the start**, in the discovery phase: follow the `project-docs` reading protocol, and pass the relevant doc paths to `@scout` as starting points. Record doc/code discrepancies in `state.md` Notes.
- **At the end**, as a step of its own right before closure: **docs sync**. Dispatch `@doc-writer` with the work directory, the base branch, the workflow type and the recorded discrepancies; when the work built a prototype, also pass the prototyper's report so `docs/prototypes.md` is completed from it. Review its report and commit its changes with the work.
- **At closure**, the closure review also checks that the docs match the delivered code and that the changelog entry fits the work.

Docs sync adds no gate: its result is part of the diff presented at delivery. It never touches `docs/conventions.md`.

## Closure review

Where a workflow runs the closure review, it names the authorities to pass and any focus. The review is split so that the strongest model plans and judges while a cheaper one does the volume: running the verification and collecting evidence. Each phase leaves its result on disk, so any phase can be repeated alone.

1. **Plan.** Dispatch `@closure-reviewer` in plan mode with the authorities, the focus, your verification results, the deferred minor findings from `state.md` and an outline of the change: `git diff --stat <base>...HEAD` and the commit list, or the file tree when there is no base. Not the full diff. Save its plan as `closure-plan.md` in the work directory.
2. **Evidence.** Dispatch `@closure-auditor` with the work directory and the base branch. It executes the plan and writes `closure-evidence.md`.
3. **Verdict.** Dispatch `@closure-reviewer` in verdict mode with the authorities, `closure-plan.md` and `closure-evidence.md`, or continue its planning session with the evidence when the environment lets you resume a subagent. On NEEDS-EVIDENCE, send its requests to `@closure-auditor`, then ask for the verdict again; at most once per review round.

On FAIL, fix the BLOCKING findings as the workflow says, then review again, scoped: the auditor on the fix commits and the previous findings, appended to the evidence, and the verdict on the previous findings and the new changes; the plan is not rewritten. The workflow says what happens after repeated failures.

A phase that fails for a reason outside the review, such as a harness or provider error, is repeated alone from the saved artifacts. It does not count as a closure failure.

## Project conventions

`docs/conventions.md` (see `project-docs`) exists to correct the model where it errs. **Nothing enters, changes or leaves it without the user explicitly accepting that entry.**

**Collect.** During the work, record under Convention candidates in `state.md` only evidence that the model erred or had to guess, one line each with the evidence:

- a user correction at a gate;
- a recurring task-reviewer finding tagged `convention`;
- a blocker the escalator traced to a missing or unclear rule;
- a choice the implementer made between inconsistent patterns in the codebase.

A pattern that is merely observed in the code is not a candidate.

**Filter** at closure. Drop anything a linter, formatter or type checker enforces; generic good practice, or what the model already does right; one-off cases; style preferences without concrete impact. Keep at most three, strongest evidence first.

**Propose** in `closure.md` under Convention proposals, or write "none", the normal outcome. Each proposal gives the entry text, the evidence, and the action: add, change or remove an entry, or a lint rule as follow-up work. Present them at the delivery gate; each is accepted or rejected on its own, and no answer means rejected.

**Apply** only accepted proposals, before integration: `@doc-writer` writes the entries and you commit them separately. Accepted lint rules become follow-up work, not part of this workflow.

## UI prototypes

Prototypes live in the project, not in the work directory: in the project's one prototype system, described in `docs/prototypes.md` and defined by the `project-prototypes` skill. The system is chosen once, in an approved spec; `@ui-prototyper` sets it up, builds prototypes in it and never chooses it.

- A prototype is shown live at its gate as `project-prototypes` describes: the controller starts the system and presents the URLs.
- When the prototype is approved, commit it and record the commit in `state.md`.
- The approved prototype is an authority for implementation and closure. Reviewers read it from the recorded commit (`git show <commit>:<path>`) once it has been removed.
- Plans do not remove prototypes. At the delivery gate the user keeps or removes each one (default remove), and the decision is applied before integration.
- The system itself is permanent: removing a prototype never removes the system.

## Workflow switching

Stop and propose a switch when the work turns out to be of a different kind, for example:

- a fix whose correct resolution is new behavior → feature;
- a refactor that cannot preserve an invariant → feature, or an unplanned gate;
- a feature that needs a question answered before it can be specified → spike;
- a spike whose recommendation is accepted → feature or greenfield, with `findings.md` as input.

A switch is a gate. On approval, close the current `state.md` (status `closed`, with the reason) and start the new workflow in a new work directory that references the previous one.

## Branches

Unless the project says otherwise, create a branch before the first change to project files (a prototype or implementation): `<workflow>/<slug>` (for example `feature/csv-export`, `fix/login-500`). Greenfield works on the default branch of a new repository or of one with no project yet (no commits, or only the agent harness), and on `greenfield/<slug>` inside a repository that already holds a project. Spikes use `spike/<slug>` and are never merged. Docs bootstrapping uses `docs-init/<slug>`.

Work on a branch in the current checkout; use worktrees only if the user asks. Creating branches and committing are autonomous. Pushing, merging and destructive git operations are not: they happen only at the delivery gate or with explicit permission.

## Superpowers skills

Workflows decide sequencing, gates and artifacts. Superpowers skills supply technique inside a phase. Where they overlap, the workflow wins:

- `superpowers:brainstorming` — use its exploration and questioning. Its approval steps are replaced by the workflow gates, and its design document is the workflow's `spec.md`, not a file under `docs/superpowers/`. Its visual companion is not used for UI mockups or layouts: when a UI question needs to be seen, it is settled with a prototype in the project's prototype system.
- `superpowers:writing-plans` — use it to write `plan.md` in the work directory. The execution method is already chosen: subagent-driven. Do not ask the user to choose it.
- `superpowers:subagent-driven-development` — use its loop with the named agents and the Review loop above: implementer → `@implementer`, task reviewer → `@task-reviewer`, more capable implementer → `@escalator`, final whole-branch reviewer → the Closure review above. Keep its ledger in the Tasks and Notes sections of `state.md`.
- `superpowers:finishing-a-development-branch` — its integration choice (merge, PR, keep, discard) is part of the workflow's delivery gate.
- `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, `superpowers:receiving-code-review` — use them as techniques whenever they apply.

If subagent dispatch is not available in the running environment, say so at the first gate, run implementation inline with `superpowers:executing-plans`, and keep review as a separate explicit pass against the task's requirements before moving on.

## Reporting

Every report to the user, at a gate, checkpoint or delivery, states what actually ran and what actually passed, as `AGENTS.md` requires. Include the work directory path.
