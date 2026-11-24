# Changelog

All notable changes to this project are documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added
- Task tracker statuses roll up the parent chain: starting the first task of a story of an epic puts the task, the story and the epic in progress, and a parent reaches in review or done only when all its children have (`Parents: off` in the preference turns it off)
- Sub-items of the tracked item are read in discovery and paired with the plan's tasks, approved with the plan, so they move with their own implementation and review

### Changed
- Task tracker items are reconciled with the board at every checkpoint, gate and resume, including after a context compaction, so a missed status change is made at the next step instead of being lost
- Work managed by canovacc.io keeps its tracker items in step too when the project has a task tracker preference, as a second writer that never moves an item backwards
