---
name: workflow-autopilot
description: Workflow for a new project delegated end to end from a specification already in the repository - takes the spec, any layouts and any task breakdown as input, has the user approve the plan and every UI prototype up front, then implements every task without stopping, each one verified before the next, parks what blocks instead of asking, and stops again only at delivery. Started only with /autopilot.
---

# Autopilot workflow

A new project built from a product specification the user already wrote and placed in the repository. The user decides everything up front, at two gates: the plan (G1) and every UI prototype (G2). From then on the work runs task after task with no human gate until delivery (G3). Apply `workflow-rules` throughout.

This workflow is `workflow-greenfield` with given inputs and moved gates. Where a phase below says "as greenfield phase N", follow that phase of `workflow-greenfield` as written there, with the differences stated here.

- **Started only explicitly**, with `/autopilot`: delegating a whole project is the user's choice, never the router's.
- **Only new projects.** Work on an existing project, later additions to a project built with autopilot included, goes through `workflow-feature`.

## Inputs

| Input | Required | Form |
|---|---|---|
| **source spec** | yes | a document in the repository describing the product |
| **layouts** | no | anything: HTML or CSS mockups, images, exports from a design tool, PDFs, sketches, component code. They are standardized into the project's prototype system (phase 3) |
| **task breakdown** | no | a file in the repository, or cards on the board of the project's task tracker |

The source spec is the user's document and the main authority for product intent. It is never edited: what it leaves open goes in the work directory's `spec.md`, which complements it.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 plan** | after intake and plan review | what the source spec leaves open (stack, architecture, prototype system, open questions), the slicing and order, the settings of the work |
| **G2 prototypes** | only when the product has a UI | every screen and state, for every task |
| **G3 delivery** | after closure | the delivered project, the decisions taken alone, the parked tasks |

Between G2 (or G1, without a UI) and G3 there are no gates except the one Autonomy allows as a last resort.

## Autonomy

After the last gate up front, the controller does not stop to ask. It answers what comes up from the authorities: the source spec, `spec.md`, the plan, the approved prototype, `decisions.md`.

**A decision they do not settle.** When it is reversible and does not change what the user approved (a label, a default, an error message, an ordering, an edge case the spec is silent on), take the option most consistent with the authorities, the most conservative when in doubt. Record it in `decisions.md` marked `autonomous`, with the task and the reason, and continue: G3 lists every one. A decision that is not reversible, or that would change approved scope, UX or data, is not taken alone: the task is parked.

**A parked task.** A task whose Review loop cannot converge (`@task-reviewer` still asks for fixes after `@escalator`), or that needs a decision the controller may not take, is parked instead of opening an unplanned gate:

1. Revert its commits with `git revert` (never a reset), so the branch stays green and later tasks do not build on it.
2. Mark it `parked` in `state.md` Tasks, with the diagnosis: what is blocked, why, the escalator's findings, the decision needed if any.
3. Mark parked every remaining task that depends on it, with the reason.
4. Give a CHECKPOINT and continue with the next task that does not depend on a parked one.

**Last resort.** Open an unplanned gate only when:

- no remaining task can proceed, because all depend on parked ones;
- a second task is parked for the same cause, which means the plan or the authorities are wrong rather than the task;
- an operation requires explicit permission (see Branches in `workflow-rules` and the permissions of the harness), or the environment cannot start and the work cannot go on without it (see Environment in `workflow-rules`).

The gate presents the parked tasks with their diagnosis and the decisions needed, the autonomous decisions taken so far, and what will happen after the answer. Answered tasks return to the plan; the work then goes on autonomously.

Never stop for anything else: not for Minor findings (the minor-findings policy settles them), not between tasks, not for a report. A CHECKPOINT continues in the same turn.

## Phases

### 0. Setup

As greenfield phase 0. The source spec, the layouts and a task breakdown file are input, not a project: a repository holding only them and the agent harness counts as a repository with no project yet.

Identify the inputs. The source spec is the document the user names; when the user names none, look for it (`@scout` if needed). When there is none, the product has to be explored first: propose `workflow-greenfield`. When two documents are plausible, ask which one before creating anything.

Create the work directory with `brief.md` (request, the path and commit of the source spec, the paths of the layouts, where the task breakdown is, the layout of the project and why) and `state.md`.

### 1. Intake and spec

Dispatch `@scout` on the inputs, with their paths:

- the source spec: users, journeys, requirements with their modality, acceptance criteria, out of scope, and whatever it says about stack, hosting, data, integrations;
- each layout: its form, the screens and states it shows, the journey or requirement it belongs to, what in it cannot be read reliably;
- the task breakdown, from its file or from the board (each card with its title, text and status): the tasks, their order and dependencies;
- contradictions between them, and requirements that no layout or task seems to cover.

Write `spec.md` as a complement to the source spec, not a copy of it:

- **source**: path and commit of the source spec, the layouts, the task breakdown;
- **stack**, **architecture**, **quality baseline** and **prototype system** (when the product has a UI), as in greenfield phase 2: what the source spec fixes is adopted and referenced; what it leaves open is decided here, with a short rationale per choice;
- **open questions**: every gap, ambiguity or contradiction of the inputs that would force a product decision during implementation, each with a proposed answer and what it decides. After G1 nobody will be asked, so this list is complete: what is not answered here is decided alone or parks a task;
- **layouts**: which screens they cover, and the screens the journeys need that no layout shows.

Record significant technical choices in `decisions.md` with rejected alternatives.

Dispatch `@spec-reviewer` with the request, the source spec, the scout's report and `spec.md`. Besides its checks: every requirement of the source spec is reflected or referenced, every choice the source spec makes is respected, and every gap that implementation would hit is an open question. Fix BLOCKING findings.

### 2. Plan

Write `plan.md` following the rules of greenfield phase 4: task 1 is the walking skeleton, the others are vertical slices with their own tests and acceptance criteria, every requirement of the source spec is owned by at least one task.

- **With a task breakdown**: import it. Keep the user's tasks, names and order, each with its source (file and line, or card). Complete what each needs to be implemented without asking: acceptance criteria, verification, dependencies. Change the breakdown only where the rules require it: add the walking skeleton when there is none, add a task for a requirement no task owns, split a task too large to review, reorder a task before what it depends on. Every change is listed at G1 with its reason. A task split in two keeps its card for all its parts.
- **Without one**: write it as greenfield phase 4.

Each task also says whether it has a UI and which screens and states of the prototype it implements; their paths are filled in after G2.

Dispatch `@spec-reviewer` with the source spec, `spec.md` and the plan. Besides its checks: no task needs a decision the source spec, `spec.md` or the plan does not take. Fix BLOCKING findings; list at the gate any finding you chose not to address, with the reason.

Present **G1** with:

- `spec.md`: the stack, architecture, quality baseline and prototype system, and the open questions with their proposed answers, so that "ok" accepts them all;
- `plan.md`: the tasks, and the changes made to the user's breakdown;
- the settings of the work: the minor-findings policy; Impeccable, when the product has a UI and the project has no preference yet (see Impeccable in `workflow-rules`); the task tracker, when the user named one (see `project-tracker`), and the cards that will be created;
- the Autonomy rules above, in a few lines: from G2 on, what is decided alone, what is parked, when the work stops.

Write the answers to the open questions into `spec.md` before recording the approval. Then, with a task tracker, create the cards of the plan tasks (see Autopilot in `project-tracker`).

### 3. Prototypes (when the product has a UI)

With Impeccable on, build the design context as greenfield phase 3 describes. Pass `@design-director` the layouts too: when they establish a visual direction, the seed `DESIGN.md` follows them, and directions are offered only for what they leave open.

Set up the prototype system as greenfield phase 3 describes (`@ui-prototyper` in setup mode, then `@doc-writer` for `docs/prototypes.md`).

Then build one prototype for the whole work, in `<area>/<work>/`, covering every screen and state the UI tasks of the plan implement:

1. **With layouts**: dispatch `@ui-prototyper` in import mode with the approved spec, the plan, the layouts and the work directory name. It rebuilds each layout in the system with the project's components and mock data, faithful to its structure, content and visual intent, and reports what it could not read or reproduce.
2. Dispatch `@ui-prototyper` in prototype mode, with the same inputs and the imported states as the baseline, for the screens and states the plan needs and no layout shows, consistent with the imported ones. Skip it when the layouts cover everything.

Check that every UI task of the plan has its states, and write their paths into `plan.md` next to each task. A missing state goes back to `@ui-prototyper`.

Start the system and present **G2** as `project-prototypes` describes, with, besides: the states of each UI task; for each layout, the states it became and what differs from it or could not be reproduced; the screens built without a layout, and the decisions they took. Say that this is the last gate before delivery.

On approval, commit the prototype and record the commit in `state.md`; with Impeccable on, dispatch `@design-director` in sync mode as greenfield phase 3 describes. Give a CHECKPOINT: the autonomous phase starts.

### 4. Autonomous implementation

As greenfield phase 5 (walking skeleton first, then the environment and the docs scaffold), with the Autonomy rules above. Give `@implementer`, besides what greenfield lists, the source spec sections the task implements and the states of the prototype it follows.

**A task is done** only when, after `@task-reviewer` approves it, you run on the branch and see pass: the full test suite, E2E included; lint, type check and build; the app starting. A failure goes back into the Review loop as a finding of that task. Then:

1. update `state.md` (task verified, next task);
2. with a task tracker, move the task's card to its done status;
3. give a one-line CHECKPOINT and dispatch the next task, in the same turn.

`state.md` is current before every dispatch: a long run will see context compactions, and the work resumes from it.

With `Design review: on`, run the Design review of `workflow-rules` after the last task; its findings go through the Review loop under the same Autonomy rules.

### 5. Docs sync

As greenfield phase 6, with workflow type `autopilot`.

### 6. Closure

As greenfield phase 7, with the source spec among the authorities of the closure review, before `spec.md`, plan and prototype commit. The closure review also checks that every autonomous decision stays within the authorities, and that each parked task is reverted cleanly.

`closure.md` also lists: the changes made to the user's task breakdown, the autonomous decisions, the parked tasks with their diagnosis, and the tracker moves made or failed.

### 7. Delivery

Present **G3** as greenfield G4, plus:

- **autonomous decisions**, one line each: confirmed by default; one the user changes is applied through the Review loop before integration when small, otherwise proposed as a `workflow-feature` after delivery;
- **parked tasks**: for each, the user answers its blocker or leaves it out. Answered tasks go through the Review loop and a scoped closure review (the auditor on their commits, the verdict on them) before integration; tasks left out are listed in `closure.md`, and their cards stay where they are.

Execute what is approved, then set `state.md` to `closed`.

## Switching

- The source spec is missing, or too thin to plan from without exploring the product with the user → propose `workflow-greenfield`.
- The request extends a project that already exists, rather than building a new one → `workflow-feature`.
- An open question needs an experiment to be answered → propose `workflow-spike` before G1.
