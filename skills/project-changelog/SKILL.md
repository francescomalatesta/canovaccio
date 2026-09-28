---
name: project-changelog
description: How workflows record their changes in the project CHANGELOG.md, following Keep a Changelog - always under Unreleased, section chosen by workflow type, written for the changelog's readers. Load when a workflow reaches its docs sync step.
---

# Project changelog

Workflows record notable changes in `CHANGELOG.md` at the project root (for a greenfield project inside an existing repository, its own directory), in the [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/) format.

## If the project already has a changelog

Follow its existing format and conventions, even if they differ from this skill. Do not convert an existing changelog.

## If there is none

Create `CHANGELOG.md`:

```markdown
# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]
```

Mention semantic versioning only if the project actually uses it.

## Where entries go

Always under `## [Unreleased]`, at the top of the file; create the heading if it is missing. Never edit released sections, never add version numbers or dates: releasing is outside the workflows.

Sections, in this order, only when they have entries:

`### Added` · `### Changed` · `### Deprecated` · `### Removed` · `### Fixed` · `### Security`

## Which section, by workflow

| Workflow | Entry |
|---|---|
| `workflow-greenfield` | creates the file; one `Added` entry per core capability of the first version |
| `workflow-feature` | `Added` for new behavior, `Changed` for changed behavior, `Deprecated` / `Removed` when applicable |
| `workflow-fix` | `Fixed`; `Security` when the bug was a vulnerability |
| `workflow-refactor` | only when notable for readers: performance, dependency or runtime upgrades, changes visible to library consumers or operators. Then `Changed`. Otherwise no entry, and `closure.md` says so |
| `workflow-spike`, `workflow-docs-init` | no entry |

## How to write an entry

- One line per change, describing the effect for the reader (user, operator, library consumer), not the implementation.
- Present tense, no trailing period, consistent with existing entries.
- Group related changes of one workflow into as few entries as reads naturally; a feature is usually one or two lines, not one per task.
- Reference an issue or ticket only if the project does so.

Example:

```markdown
## [Unreleased]

### Added
- CSV export for orders, available from the orders list

### Fixed
- Login no longer fails with a 500 error when the password has expired
```

## Merge conflicts

`[Unreleased]` conflicts are common with parallel branches. Resolve them by keeping both sides' entries in their sections.
