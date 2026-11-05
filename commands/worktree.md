---
description: Create, list or remove the worktrees for parallel work (new <slug> [--base REF] [--branch NAME] | list | remove <slug>)
agent: conductor
---

Load the `project-isolation` skill and run its script with these arguments; with no arguments, run `list`:

$ARGUMENTS

This is not a workflow: run no workflow and change no project file yourself.

- `new`: report the worktree path, its slot and its ports, what was copied and how the setup went. The work itself happens in a new session opened in that directory: tell the user to open one there and start the workflow from it, and do not start it in this session. When the script exits with 2, the project, or the base, is not isolated yet: say so and propose `/env-init`.
- `list`: report the checkouts, their slots, branches, environments and active workflows, and how many environments run against the limit.
- `remove`: before running it, check with `list` that the worktree has no active workflow; if it has one, ask the user first. Report what was stopped and that the branch and the data volumes were kept. Delete the volumes only if the user asks, with the command the script prints.
