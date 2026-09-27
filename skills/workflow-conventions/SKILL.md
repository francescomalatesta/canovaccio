---
name: workflow-conventions
description: Shared rules for every development workflow (greenfield, feature, refactor, fix, spike) - gates, checkpoints, artifacts, state, resumption, workflow switching and precedence over superpowers skills. Load before running or resuming any workflow.
---

# Workflow conventions

These rules apply to every workflow. A workflow skill defines its phases and gates; this skill defines what those words mean.

## Gates and checkpoints

**GATE** — a blocking human decision.

1. Make sure the artifact under decision is written to disk and `state.md` is current.
2. Present it: file path, a short summary of what it decides, open questions, and what you will do after approval.
3. Stop and wait for an explicit answer (use the `question` tool when it fits, otherwise end the turn). Do not continue in the same turn.
4. Handle the answer:
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
| `prototype/` | browser prototype under approval | no |
| `plan.md` | tasks as vertical slices, each with its verification | no |
| `invariants.md` | behavior that must not change, and how it is verified | no |
| `repro.md` | reproduction, root cause, failing test | no |
| `findings.md` | spike answer, evidence and recommendation | **yes** |
| `decisions.md` | decisions taken during the work, with rationale | **yes** |
| `closure.md` | final review verdict and verification evidence | no |
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

## state.md

`state.md` is the source of truth for where a workflow is. Keep it short and current:

```markdown
# State

- Workflow: feature
- Status: active            <!-- active | waiting-gate | closed | abandoned -->
- Phase: implementation
- Branch: feature/csv-export

## Gates
- [x] G1 spec+plan — approved 2026-09-27 — spec.md, plan.md
- [ ] G2 delivery

## Tasks
- [x] T1 export endpoint — reviewed, approved
- [ ] T2 download button

## Notes
- T2 blocked on nothing; next action: dispatch implementer.
```

Update it at every phase transition, gate decision and completed task, before reporting to the user.

**Resuming.** After a context compaction, a new session, or whenever you are unsure of the current position: re-read `state.md` and the artifacts it references, then continue from the first incomplete step. Never re-run completed tasks and never assume an approval that `state.md` does not record.

## Workflow switching

Stop and propose a switch when the work turns out to be of a different kind, for example:

- a fix whose correct resolution is new behavior → feature;
- a refactor that cannot preserve an invariant → feature, or an unplanned gate;
- a feature that needs a question answered before it can be specified → spike;
- a spike whose recommendation is accepted → feature or greenfield, with `findings.md` as input.

A switch is a gate. On approval, close the current `state.md` (status `closed`, with the reason) and start the new workflow in a new work directory that references the previous one.

## Branches

Unless the project says otherwise, create a branch at the start of implementation work: `<workflow>/<slug>` (for example `feature/csv-export`, `fix/login-500`). Greenfield projects work on the default branch of the new repository. Spikes use `spike/<slug>` and are never merged.

Creating branches and committing are autonomous. Pushing, merging and destructive git operations are not: they happen only at the delivery gate or with explicit permission.

## Superpowers skills

Workflows decide sequencing, gates and artifacts. Superpowers skills supply technique inside a phase. Where they overlap, the workflow wins:

- `superpowers:brainstorming` — use its exploration and questioning. Its approval steps are replaced by the workflow gates, and its design document is the workflow's `spec.md`, not a file under `docs/superpowers/`.
- `superpowers:writing-plans` — use it to write `plan.md` in the work directory. The execution method is already chosen: subagent-driven. Do not ask the user to choose it.
- `superpowers:subagent-driven-development` — use its loop with the named agents: implementer → `@implementer`, task reviewer → `@task-reviewer`, fresh and more capable implementer after repeated failed rounds → `@escalator`, final whole-branch reviewer → `@closure-reviewer`. Keep its ledger in the Tasks and Notes sections of `state.md`.
- `superpowers:finishing-a-development-branch` — its integration choice (merge, PR, keep, discard) is part of the workflow's delivery gate.
- `superpowers:test-driven-development`, `superpowers:systematic-debugging`, `superpowers:verification-before-completion`, `superpowers:receiving-code-review`, `superpowers:using-git-worktrees` — use them as techniques whenever they apply.

If subagent dispatch is not available in the running environment, say so at the first gate, run implementation inline with `superpowers:executing-plans`, and keep review as a separate explicit pass against the task's requirements before moving on.

## Reporting

Every report to the user, at a gate, checkpoint or delivery, states what actually ran and what actually passed, as `AGENTS.md` requires. Include the work directory path.
