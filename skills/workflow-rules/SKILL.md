---
name: workflow-rules
description: Shared rules for every development workflow (greenfield, feature, refactor, fix, spike, docs-init) - gates, checkpoints, artifacts, state, resumption, system docs and changelog, workflow switching and precedence over superpowers skills. Load before running or resuming any workflow.
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
| `closure.md` | written by the controller: final review verdict, verification evidence, deferred minor findings, convention proposals | no |
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

## System docs and changelog

Greenfield, feature, refactor and fix read the system docs at the start and bring them, and `CHANGELOG.md`, up to date at the end. Spikes do neither; `workflow-docs-init` has its own flow. The rules are in the `project-docs` and `project-changelog` skills.

- **At the start**, in the discovery phase: follow the `project-docs` reading protocol, and pass the relevant doc paths to `@scout` as starting points. Record doc/code discrepancies in `state.md` Notes.
- **At the end**, as a step of its own right before closure: **docs sync**. Dispatch `@doc-writer` with the work directory, the base branch, the workflow type and the recorded discrepancies; when the work built a prototype, also pass the prototyper's report so `docs/prototypes.md` is created or completed from it. Review its report and commit its changes with the work.
- **At closure**, `@closure-reviewer` also checks that the docs match the delivered code and that the changelog entry fits the work.

Docs sync adds no gate: its result is part of the diff presented at delivery. It never touches `docs/conventions.md`.

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

Prototypes live in the project, not in the work directory: one prototypes area per project, described in `docs/prototypes.md`, each prototype in `<area>/<slug>/`. `@ui-prototyper` finds or proposes the area.

- When the prototype is approved, commit it and record the commit in `state.md`; record the area in `decisions.md` if it was chosen in this workflow.
- The approved prototype is an authority for implementation and closure. Reviewers read it from the recorded commit (`git show <commit>:<path>`) once it has been removed.
- The plan's last task removes the prototype and its dev-only wiring, keeping the area's index. Prototypes never outlive their feature.

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

- `superpowers:brainstorming` — use its exploration and questioning. Its approval steps are replaced by the workflow gates, and its design document is the workflow's `spec.md`, not a file under `docs/superpowers/`.
- `superpowers:writing-plans` — use it to write `plan.md` in the work directory. The execution method is already chosen: subagent-driven. Do not ask the user to choose it.
- `superpowers:subagent-driven-development` — use its loop with the named agents and the Review loop above: implementer → `@implementer`, task reviewer → `@task-reviewer`, more capable implementer → `@escalator`, final whole-branch reviewer → `@closure-reviewer`. Keep its ledger in the Tasks and Notes sections of `state.md`.
- `superpowers:finishing-a-development-branch` — its integration choice (merge, PR, keep, discard) is part of the workflow's delivery gate.
- `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, `superpowers:receiving-code-review` — use them as techniques whenever they apply.

If subagent dispatch is not available in the running environment, say so at the first gate, run implementation inline with `superpowers:executing-plans`, and keep review as a separate explicit pass against the task's requirements before moving on.

## Reporting

Every report to the user, at a gate, checkpoint or delivery, states what actually ran and what actually passed, as `AGENTS.md` requires. Include the work directory path.
