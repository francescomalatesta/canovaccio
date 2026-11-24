---
name: project-tracker
description: How workflows keep an external task tracker (GitHub Projects, Jira, Linear, ClickUp, Trello) in step with the work - the project preference, which items are tracked (the item of the work, plan task items and sub-items, parents), the status each should have at each point of the work, reconciling the board with it, rolling statuses up to parent items, access, and the limits on what is changed. Load when a workflow works on a tracker item, when `state.md` has a `Tracker` line, or when the user names a tracker or an item and the project has no preference yet.
---

# Project tracker

When the user tracks the project in an external tool, workflows keep the items they work on, and the items above them, at the status that matches the work, so the board shows where the work is without anyone updating it by hand. The conductor does it; subagents never touch the tracker.

The board is kept in step by **reconciling**, not by remembering single moves: each tracked item has an expected status that `state.md` determines, and at fixed points the conductor compares it with the board and moves forward what is behind. A move missed at one point is made at the next.

## Managed work

When `state.md` says `Managed by: canovacc.io` (see canovacc.io in `workflow-rules`), canovacc.io moves the items of the work too. canovaccio still keeps them in step, as a second writer, so the board is right whichever of the two runs the work:

- with a Task tracker preference in the project `AGENTS.md`, the item of the work is the `item:` of the header, and statuses, sub-items and parents follow this skill;
- without one, nothing is done: no preference is created or proposed (managed sessions have no gate to confirm it), and no `Tracker` line is written;
- no link is added to pull requests: canovacc.io opens them and links the items.

A status canovacc.io set is treated as one set by someone else (see Rules): never moved backwards, never undone.

## The preference

It lives in the project `AGENTS.md`, outside the canovaccio block:

```markdown
## Task tracker

- Tool: GitHub Projects
- Board: https://github.com/users/<owner>/projects/3
- Access: gh            <!-- the CLI or MCP server used to reach it -->
- Statuses: picked-up=Ready · in-progress=In progress · in-review=In review · done=Done
- Parents: roll up      <!-- roll up | off -->

Set by canovaccio from your answer. Edit it, or ask, to change it.
```

A preference without the `Parents` line rolls up.

**Creating it.** When the request names a tracker or an item ("/feature #42", a link to a card or a board), the project has no preference and the work is not managed:

1. Find how to reach the tool with what the environment already provides: a CLI (`gh project`, `jira`, `linear`), an MCP server. Never install anything or ask for credentials.
2. Read the board's real statuses and map the four statuses of Expected status onto them. Map on your own when the names match plainly (Backlog or Todo, Ready, In progress, In review, Done, as in the GitHub Projects Kanban template); when they do not, propose a mapping. A status may map to nothing: items then never move to it. Check whether the tool exposes parent items (GitHub sub-issues, a Jira parent or epic link, Linear and ClickUp parent tasks); without them, write `Parents: off`.
3. Present it at the workflow's first gate for confirmation. A workflow whose first gate comes after work has started (fix, design-init) states it in its first CHECKPOINT and uses it: a status change is reversible.
4. Write the confirmed preference and commit it with the work, so it is never asked again.

A request that says otherwise ("without the tracker", another board, "leave the epic alone") applies to that work only. When the user asks to change the preference itself, update `AGENTS.md`.

## Which items

Only items that already exist:

- **the item of the work**: the one the user named, or the `item:` of the header in managed work;
- **items of plan tasks**: those the user gave one per task (`/feature #12 #13`, or a plan built from the board's cards they listed), and the sub-items of the item of the work paired with plan tasks (see Sub-items);
- **parents**: the chain of items above every tracked item, when the preference rolls up (see Parents).

Never create items, and never add an existing issue to the board: report it instead.

## Sub-items

When the item of the work has children on the tracker (sub-issues, sub-tasks), read them in discovery. While writing the plan, pair a child with a plan task when it describes that task's work, and write the pairing next to the task in `plan.md`: approving the plan approves the pairing (G1, or the batch gate for plans written in plan-only or for a batch). Never split, merge or rename children to make them match. Children left unpaired are listed in `plan.md` as not tracked by this work and stay as they are. Items the user named per task take the place of the pairing.

## Expected status

Each tracked item is expected at the furthest status whose condition `state.md` shows as reached, through its phase, its Tasks section and its gates:

| Status | Item of the work | Item of a plan task |
|---|---|---|
| **picked-up** | the workflow has started on it | — |
| **in-progress** | the first change to project files has been made: a prototype, an implementation task, characterization tests, the fix task, a spike experiment; in a security audit, the scanners have run | `@implementer` has been dispatched for the task |
| **in-review** | the closure review has started; without one, the final verification; in a spike, the decision gate is open; in a security audit, the delivery gate is open | `@task-reviewer` has been dispatched for the task |
| **done** | canovaccio has integrated the work itself (merge); in a spike, the decision gate is approved; in a security audit, the delivery gate is answered | the work it belongs to has been integrated |

Statuses only go forward: task review rounds, closure review fix rounds and gates in between change nothing, and a task sent back to its implementer after a review stays in-review. When the work is delivered as a pull request, done is never expected: items stay in-review, the pull request links them (`Closes #42`, or the tool's equivalent) and the merge and the board's automation move them to done. Parents are never linked in a pull request: a parent is done when all its children are, not with one pull request. An abandoned workflow leaves its items where they are and stops reconciling; the report says so.

## Parents

With `Parents: roll up`, every tracked item rolls up to its parents, to the top of the chain (task → story → epic). Read the chain once, the first time an item is tracked, through the tool's native parent relation, and record it in `state.md`. A parent that the work tracks itself (the item of the work above its paired sub-items) follows its own row of Expected status and is not rolled up.

The expected status of a parent comes from its children, all of them, tracked by this work or not:

- **picked-up, in-progress**: the furthest of the two that any child has reached. Starting the first task of the first story of an epic puts the task, the story and the epic in progress.
- **in-review, done**: reached only when every child is at that status or past it. Read the siblings to know it. Children closed without being done (cancelled, won't do, duplicate) do not count; any other child holds the parent back.

Reconcile the chain bottom up: the direct parent first, then its own parent with the status just set. When a parent is not on the board, or cannot be read, report it and stop the roll-up there: never add it to the board.

## Reconcile

Reconcile:

- right before each point that raises an expected status: the first change to project files, the dispatch of `@implementer` and of `@task-reviewer` for a task with an item, the start of the closure review or of the final verification, the merge, a gate that moves a spike or an audit;
- at every CHECKPOINT and gate;
- when the work resumes: a new session, a context compaction, a session canovacc.io or the batch runner starts on the work.

To reconcile, for each tracked item and then for its parents: compute the expected status, read the current status on the tracker, and move the item to the expected status when it is behind it. Update `state.md` with what was set and read. A reconcile that finds nothing behind moves nothing and reports nothing.

## State

Record in `state.md`, so a resumed workflow knows what it set and what someone else changed:

- `Tracker: #42 — In progress · parents: #40 In progress, #12 In progress`: the item of the work with the last status set, then its parents up the chain with the last status set or read; a held item carries `(held)`;
- the item of a plan task at the end of the task's line in the Tasks section, with its last status (`— #43 In review`); its parents, when they differ from those of the item of the work, after it (`· parents: #39 In progress`).

## Batch

In a batch (see `workflow-batch`), each story is a piece of work with its own item, kept in step by its own sessions; the batch itself has none. Put the item in the story's `item` in `batch.json`, so the pull request the runner opens links it. Nothing in a batch merges, so items stay at in-review. Stories under the same parent roll it up one after the other: an epic reaches in-progress with its first story and in-review only when every child is there.

## Rules

- **Read before moving.** Never move an item backwards: one already at or past its expected status stays where it is.
- **Someone else's status holds.** When an item's current status differs from the last one `state.md` records and this work did not set it, someone moved it: the user, or canovacc.io in managed work. If it is ahead on the path of the work, take it as the new last status. If it is behind it or off it (Blocked, back to Backlog, an unmapped status), leave it there, mark it `(held)` in `state.md`, say so in the next CHECKPOINT or gate (in Notes when nobody watches the session), and do not move it again in that work unless the user asks. An item the work never recorded has no such history: move it when it is behind.
- **Status only.** Change the status field and nothing else: no comments, assignees, labels, closing or deleting, beyond the pull request link above, unless the user asks.
- **Never blocking.** If the tool cannot be reached or refuses (no access, missing scope such as `project` for `gh`, rate limit), say so in a CHECKPOINT with the reason and continue the work: the next reconcile tries again. A move that did not happen is reported as not done, never as done.
- **Report.** Gates and the delivery report list the moves made, parents included, and those held, failed or skipped.
