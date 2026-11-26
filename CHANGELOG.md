# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- E2E tests run in Docker when the machine lacks what their runner needs: browsers, system libraries and runner binaries are never installed (`playwright install` and `cypress install` are denied), the conductor decides once per work whether E2E runs locally, in Docker or not at all, and records it for every agent and the final verification; Docker recipes for Playwright (browser only, tests and app on the host) and Cypress
- Pragmatic SOLID design guidance (`code-design` skill): the implementer structures the code it touches only where a signal in the task calls for it and reports the moves it made, the task reviewer reports `structure` findings (Minor by default, Important only with a concrete consequence, over-engineering included), the escalator considers structure as a root cause, and the refactor workflow justifies its target design in the same terms
- Task tracker statuses roll up the parent chain: starting the first task of a story of an epic puts the task, the story and the epic in progress, and a parent reaches in review or done only when all its children have (`Parents: off` in the preference turns it off)
- Sub-items of the tracked item are read in discovery and paired with the plan's tasks, approved with the plan, so they move with their own implementation and review

### Changed
- Task tracker items are reconciled with the board at every checkpoint, gate and resume, including after a context compaction, so a missed status change is made at the next step instead of being lost
- Work managed by canovacc.io keeps its tracker items in step too when the project has a task tracker preference, as a second writer that never moves an item backwards
