---
name: workflow-batch
description: Workflow for running several feature stories in sequence without the user - every story's spec and plan written up front and approved at one gate, then a runner script starts a fresh unattended session per story, checks the user's green conditions after each one, and stops the queue at the first story that is not green. Also delivers a single story unattended.
---

# Batch workflow

Several stories implemented one after the other, with the user present only at the start. Apply `workflow-rules` throughout.

The work has two parts:

- **Planning**, this workflow, interactive: every story gets its spec and plan, the user approves them all at one gate together with how the batch runs, then you launch the runner and the session ends.
- **Execution**, by `scripts/batch.mjs`, unattended: for each story it starts a fresh opencode session that implements it under Unattended delivery (see `workflow-rules`), then decides whether the story is green. The first story that is not green stops the queue. At the end it starts one last session for the Wrap-up.

A single story the user wants finished without them ("finish it on your own", "close it when CI is green") is a batch of one story.

**What a story can be.** A feature (see `workflow-feature`). A story whose spec has material UX changes needs a prototype approved at G-proto, which an unattended session cannot ask: propose running it as a feature before the batch, or leaving it out. A fix or a refactoring is proposed as its own workflow, before or after the batch.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 batch** | after every story's spec and plan | the stories and their order, every spec and plan, branches, green conditions, fix sessions |

There is no delivery gate: the batch ends at the Wrap-up, and the user reviews the pull requests or branches it leaves.

## Phases

### 0. Setup

Create the batch work directory `docs/work/<YYYY-MM-DD>-batch-<slug>/` with `brief.md` (the request, the stories as the user gave them, the classification and reason) and `state.md` (`Workflow: batch`). List the stories in order. When they come from a task tracker, each story has its item (see `project-tracker`), recorded in its `state.md` and in `batch.json`.

### 1. Discovery

Follow the `project-docs` reading protocol for every area the stories touch, then dispatch `@scout` once for all of them: modules, conventions, test setup and commands (and whether tests that persist data are isolated from the development database), similar features to mirror. Also establish:

- the remote and whether pull requests can be opened (`git remote -v`, `gh auth status`);
- whether the project has CI (`.github/workflows/`, other CI configuration);
- the commands of the project's full verification.

Bring the environment up (see Environment in `workflow-rules`).

### 2. Stories

For each story, in order, create its work directory `docs/work/<YYYY-MM-DD>-<story-slug>/` with `brief.md` (the story as given, quoted, and the batch it belongs to) and `state.md`, then write its `spec.md` and `plan.md` as `workflow-feature` does (phases 2 and 4), each reviewed by `@spec-reviewer`. Clarifying questions are allowed while drafting; batch them across stories rather than asking one per turn.

A story is planned against the code as it will be when the stories before it are done: its plan names what it builds on from earlier stories, by their specs. Every task the unattended session runs must be decidable from the approved artifacts: settle product decisions now, in the spec or in `decisions.md`, since nobody answers questions later.

The `state.md` of a story:

```markdown
# State

- Workflow: feature
- Status: queued
- Phase: implementation
- Delivery: unattended
- Batch: docs/work/2026-11-17-batch-kb-languages
- Branch: batch/kb-languages
- Minor findings: defer
- Impeccable: off

## Gates
- [ ] G1 spec+plan — approved with the batch

## Tasks
- [ ] T1 …

## Verification
```

### 3. How the batch runs

Write `batch.json` in the batch work directory (see Batch file below), proposing:

- **base**: the branch the batch starts from, normally the default branch;
- **branches**: `single` by default, one branch `batch/<slug>` and, with a remote, one pull request for the whole batch; `stacked` when the user wants one branch and one pull request per story, `batch/<slug>/<nn>-<story-slug>`, each based on the previous one;
- **remote**: the project's remote when it has one and `gh` works, otherwise `null`: the branches stay local;
- **green**: `closure` (always) and `verification`, plus the commands the user names and `ci` when there is a remote and the project has CI;
- **attempts**: `2` fix sessions per story.

Then run `batch.mjs check` and fix what it reports.

### 4. G1 batch

Present **G1**: the output of `batch.mjs status`, then for each story its `spec.md` and `plan.md` with a two-line summary and what it builds on, the minor-findings policy, the Impeccable preference when a story changes the UI and the project has none yet (see Impeccable in `workflow-rules`), the tracker mapping when it is new. Say what happens after approval: the runner starts, nobody is asked anything until the end, how to follow it and how to stop it.

The approval covers every spec and plan presented, and their unattended delivery. Record it in the batch's `state.md` and in each story's `state.md` (G1 checked with the date). A later change to a story's spec or plan needs a new approval.

### 5. Launch

1. Leave no tracked change uncommitted: the runner refuses to check out a branch over one. Create the first branch (`single`: the batch branch; `stacked`: the first story's) from the base and commit there what the first workflow in a project sets up (`.gitignore`, `.gitattributes`, `.canovaccio/tmp/.gitignore`, see Work directory and artifacts in `workflow-rules`). Specs stay uncommitted: each story commits its own at its closure.
2. Set the batch's `state.md` to `Status: running` and start the runner, detached, so it outlives this session:

   ```sh
   mkdir -p <batch-dir>/logs && nohup node <skill-dir>/scripts/batch.mjs run <batch-dir> >> <batch-dir>/logs/runner.log 2>&1 &
   ```

3. Check after a few seconds with `batch.mjs status` that it runs (`running`, with its pid). If it stopped at once, `logs/runner.log` says why: fix it and start it again.
4. Report: the runner's pid, how to follow it (`batch.mjs status <batch-dir>`, `logs/runner.log`), how to stop it (`batch.mjs stop <batch-dir>`), and that this session can be closed. Then end the turn.

The runner is the one process a workflow leaves running when its turn ends, by design. The environment stays up for the stories; the Wrap-up brings it down.

### 6. Execution

The runner, not you. For each story, in order:

1. it checks out the story's branch, creating it from its parent when missing (`single`: the batch branch, from the base; `stacked`: from the previous story's branch), and records the commit the story starts from;
2. it starts a session whose prompt begins with `[canovaccio batch]`, names the story's work directory, branch and start commit; the session runs Unattended delivery (see `workflow-rules`) and ends with the story's `state.md` at `ready` or `blocked`;
3. at `ready`, it checks the green conditions in order: `closure`, `verification`, each `command`; then, with a remote, it pushes the branch and opens or updates the pull request; then `ci`;
4. not green: it starts a fix session with the reason and the log, up to `attempts` times; still not green, the story is `failed` and the queue stops;
5. `blocked`, `waiting-gate`, or two sessions in a row that change nothing (no commit, same `Status`): the story is `blocked` and the queue stops.

When the queue is done or stops, it starts the Wrap-up session. `batch.mjs stop` ends the runner and its current session without a Wrap-up.

### 7. Wrap-up

A session the runner starts at the end, with a prompt beginning with `[canovaccio batch]` and naming this Wrap-up. Nobody answers in it: do not ask anything.

1. Read the batch with `batch.mjs status <batch-dir> --json`.
2. Each green story: set its `state.md` to `closed` and delete its temporary directory (see Work directory and artifacts in `workflow-rules`). Tracker items stay at in-review: nothing in a batch merges (see `project-tracker`).
3. The story that stopped keeps its `state.md` and temporary directory as they are; queued stories are left untouched.
4. Bring the environment down (see Environment in `workflow-rules`), from the Environment sections of the batch and of its stories.
5. Write `summary.md` in the batch work directory: the outcome; for each story its status, its commits (`<start>..<end>`), its pull request, its fix sessions and cost; the deferred minor findings and convention candidates of every story, by story; when the batch stopped, why, where the details are (the story's Notes, the green log) and what the user can do.
6. Set the batch's `state.md` to `closed` when the batch is done, or to `blocked` with the reason in Notes when it stopped. End the session.

### 8. Resume

When the user comes back to a batch (a question about it, an answer to a blocked story, "resume the queue"):

- **running**: report `batch.mjs status`; never resume a story yourself while the runner owns it;
- **stopped on a blocked story**: present its question or reason from its Notes. Record the user's answer in the story's `decisions.md` and set the story's `state.md` to `active`; when the answer changes what was approved, it is a new approval of that story's spec or plan;
- **stopped on a failed story**: present the reason and the green log. The user may fix the cause, change the green conditions in `batch.json` (run `batch.mjs check`), or ask for more fix sessions: starting the runner again gives a failed story a new round of `attempts`;
- then start the runner again as in Launch: it resumes from the first story that is not green.

A user who wants to stop for good: set the batch and its remaining stories to `abandoned`, with the reason. Reviews of the delivered pull requests that ask for changes are new work (a feature or a fix); with `stacked` branches, `batch.mjs restack` lists the branches that no longer contain their parent after such a change.

## Batch file

`batch.json`, in the batch work directory, is written at planning and updated by the runner as it goes.

```json
{
  "version": 1,
  "title": "Knowledge base languages",
  "base": "main",
  "branches": "single",
  "branch": "batch/kb-languages",
  "remote": "origin",
  "green": [
    { "type": "closure" },
    { "type": "verification" },
    { "type": "command", "run": "make e2e", "timeoutMinutes": 60 },
    { "type": "ci", "timeoutMinutes": 60, "graceMinutes": 5 }
  ],
  "attempts": 2,
  "stories": [
    { "id": "add-languages", "title": "Add languages to a knowledge base", "workDir": "docs/work/2026-11-17-add-languages" },
    { "id": "manual-translation", "title": "Translate entries by hand", "workDir": "docs/work/2026-11-17-manual-translation" }
  ]
}
```

| Field | Meaning |
|---|---|
| `title` | the batch's name; also the pull request title with `single` branches |
| `base` | the branch or commit the batch starts from |
| `branches` | `single` or `stacked` |
| `branch` | with `single`, the batch branch |
| `stories[].branch` | with `stacked`, each story's branch |
| `remote` | the remote to push to and open pull requests on, or `null` to keep everything local |
| `green` | the conditions of a green story, checked in this order: `closure` (required: `Closure: PASS` in the story's `state.md`), `verification` (the last line of its Verification section is on HEAD and every command in it exited 0), `command` (`run` exits 0 from the project root), `ci` (every check reported on HEAD succeeded; needs a remote) |
| `stories[].green` | the conditions of one story, instead of the batch's |
| `stories[].item` | the story's tracker item (`#42`, a card link); the pull request links it |
| `attempts` | fix sessions a story gets after a failed green check |
| `agent`, `model` | the agent (default `conductor`) and model of the sessions, when not the project default |

The runner adds `status`, `pid`, `startedAt`, `finishedAt` and `stopReason` to the batch, and `status` (`running`, `green`, `blocked`, `failed`), `startCommit`, `endCommit`, `pr`, `attempts`, `sessions`, `cost`, `failure` and `note` to each story. Session logs and green logs go to `logs/` in the batch work directory.

## Script

`scripts/batch.mjs` in this skill's directory (the skill tool lists its absolute path). Node 18+, no dependencies. `<batch-dir>` is the batch work directory.

```sh
node <skill-dir>/scripts/batch.mjs check <batch-dir>
node <skill-dir>/scripts/batch.mjs status <batch-dir> [--json]
node <skill-dir>/scripts/batch.mjs run <batch-dir>
node <skill-dir>/scripts/batch.mjs stop <batch-dir>
node <skill-dir>/scripts/batch.mjs restack <batch-dir>
```

The sessions run `opencode run --agent conductor --format json` without `--auto`: a permission that asks is rejected, so a session cannot push, merge or delete what the configuration gates. The runner does the pushing and opens the pull requests itself.

## Switching

- A story turns out to need a prototype, or to be a fix or a refactoring → take it out of the batch and propose its own workflow, before or after.
- The user wants to supervise each story → run them as separate features.
