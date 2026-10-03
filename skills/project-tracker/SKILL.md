---
name: project-tracker
description: How workflows keep an external task tracker (GitHub Projects, Jira, Linear, ClickUp, Trello) in step with the work - the project preference, mapping workflow events to the board's statuses, access, and the limits on what is changed. Load when a workflow works on a tracker item, or the user names a tracker or an item and the project has no preference yet.
---

# Project tracker

When the user tracks the project in an external tool, workflows move the items they work on to the status that matches the work, so the board shows where the work is without anyone updating it by hand. The conductor does it; subagents never touch the tracker.

## The preference

It lives in the project `AGENTS.md`, outside the canovaccio block:

```markdown
## Task tracker

- Tool: GitHub Projects
- Board: https://github.com/users/<owner>/projects/3
- Access: gh            <!-- the CLI or MCP server used to reach it -->
- Statuses: picked-up=Ready · in-progress=In progress · in-review=In review · done=Done

Set by canovaccio from your answer. Edit it, or ask, to change it.
```

**Creating it.** When the request names a tracker or an item ("/feature #42", a link to a card or a board) and the project has no preference:

1. Find how to reach the tool with what the environment already provides: a CLI (`gh project`, `jira`, `linear`), an MCP server. Never install anything or ask for credentials.
2. Read the board's real statuses and map the four events below onto them. Map on your own when the names match plainly (Backlog or Todo, Ready, In progress, In review, Done, as in the GitHub Projects Kanban template); when they do not, propose a mapping. An event may map to no status: it then moves nothing.
3. Present it at the workflow's first gate for confirmation. A workflow whose first gate comes after work has started (fix, design-init) states it in its first CHECKPOINT and uses it: a status change is reversible.
4. Write the confirmed preference and commit it with the work, so it is never asked again.

A request that says otherwise ("without the tracker", another board) applies to that work only. When the user asks to change the preference itself, update `AGENTS.md`.

## Which items

Only items that already exist and that the user named: the item of the work, and items for single plan tasks when the user gave one per task (`/feature #12 #13`, or a plan built from the board's cards they listed). Never create items, and never add an existing issue to the board: report it instead. Record each item and the last status set in `state.md` (see `workflow-rules`).

## Events

| Event | Item of the work | Item of a plan task |
|---|---|---|
| **picked-up** | the workflow starts on it | — |
| **in-progress** | the first change to project files: a prototype, an implementation task, characterization tests, the fix task, a spike experiment | `@implementer` is dispatched for the task |
| **in-review** | the closure review starts; without one, the final verification; in a spike, the decision gate | `@task-reviewer` is dispatched for the task |
| **done** | canovaccio integrates the work itself (merge); in a spike, the decision gate is approved | the work it belongs to is integrated |

Each move happens once: task review rounds, closure review fix rounds and gates in between move nothing. When the work is delivered as a pull request, items stay at in-review: link them in the PR (`Closes #42`, or the tool's equivalent) and leave done to the merge and the board's automation. An abandoned workflow leaves its items where they are; the report says so.

## Rules

- **Read before moving.** Before each move, read the item's current status. Never move an item backwards: one already at or past the event's status (picked up while already In progress) stays where it is. If the user put it somewhere the work did not (Blocked, back to Backlog, Done), leave it there and say so in the next CHECKPOINT or gate; do not move it again in that work unless the user asks.
- **Status only.** Change the status field and nothing else: no comments, assignees, labels, closing or deleting, beyond the PR link above, unless the user asks.
- **Never blocking.** If the tool cannot be reached or refuses (no access, missing scope such as `project` for `gh`, rate limit), say so in a CHECKPOINT with the reason and continue the work; retry at the next event. A move that did not happen is reported as not done, never as done.
- **Report.** Gates and the delivery report list the moves made, and those that failed or were skipped.
