---
name: project-prototypes
description: How a project's UI prototypes work - one prototype system per project, chosen once in an approved spec, documented in docs/prototypes.md and reused by every later workflow. The contract every system meets, how to choose one by stack, how prototypes are organized, how they are shown live in the browser at a gate, and how they are kept or removed at delivery.
---

# Project prototypes

A UI prototype lets the user judge an experience in the browser before production work starts. Every project has **one prototype system**: a tool and the area where all its prototypes live. It is chosen once, approved by the user, documented in `docs/prototypes.md`, and used by every later workflow. Prototypes come and go; the system stays.

## Contract

Whatever the tool, the system provides:

1. **One command, one URL.** A single command starts it; one entry URL shows the index of the prototypes, grouped into in progress and kept.
2. **Real building blocks.** Prototypes use the project's own components, styles and design conventions, not copies of them.
3. **Mock data, every state addressable.** Data is mocked inside the area and backend behavior simulated; every important state (empty, loading, error, responsive variants) has its own direct URL.
4. **Out of production.** Nothing in the area is reachable or bundled in a production build, and there is a way to check it.
5. **Verifiable headlessly.** Every state loads in a headless browser, or at least answers an HTTP request.

A prototype is delivered only through the system: never as a standalone HTML file outside it, a screenshot, an image mockup or a mockup in the visual companion of `superpowers:brainstorming`.

## Choosing the system

The system is decided once per project, in a spec, and approved at that spec's gate:

- **greenfield**: in `spec.md`, together with the stack;
- **feature** in a project without a system: in the spec of the first feature that needs a prototype;
- a project that already has a tool meeting the contract (Storybook, Histoire, Ladle, Lookbook, a dev-only playground) adopts it: the spec states it, nothing is chosen.

Defaults by frontend. They are guidance, not rules: another choice is fine when the spec gives the reason.

| Frontend | Default | Why |
|---|---|---|
| component-based JS (React, Vue, Svelte, Angular), including server frameworks with such a frontend (Laravel + Inertia, Rails + React) | Storybook | renders the real components in isolation, one story per state, dev-only by construction |
| server-rendered templates (Blade and Livewire, ERB, Django or Jinja, Twig) | a dev-only route area inside the app, such as `/_prototypes`, rendering the real views and components with mock data; Lookbook for Rails ViewComponent | Storybook does not render these templates natively; the app's own renderer does |

Criteria for any choice: meets the contract, renders the real components, smallest dependency footprint, fits the project's dev server and build. When nothing can meet the contract (for example a native mobile app), say so in the spec and propose the closest alternative.

The spec records the tool, the area, how the contract is met and the rejected alternatives; `decisions.md` records the choice. Replacing the system later is a material change: it goes through a spec and its gate, and says what happens to the kept prototypes.

## Setup

`@ui-prototyper` in setup mode installs the approved system: dev dependencies, configuration, the index, shared mock-data helpers, dev-only wiring and the production exclusion. Commit the setup on its own, since it stays whatever happens to the first prototype. Then dispatch `@doc-writer` to write `docs/prototypes.md` from the setup report, following the `project-docs` template, and commit it: the recipe exists before the first prototype is judged.

## Organization

Each prototype lives in `<area>/<work>/`, where `<work>` is the name of the work directory that built it (`<YYYY-MM-DD>-<slug>`): unique, and traceable to its spec and decisions. It holds a `PROTOTYPE.md`:

```markdown
---
title: CSV export
status: in-progress        # in-progress | kept
work: docs/work/2026-09-27-csv-export/
approved: <commit>         # set when the prototype is approved
kept: <date>               # set when it is kept at delivery
---
<What it shows, in a few lines, and each state with its path from the index URL.>
```

The index lists every prototype with its title, status and link. When the tool has its own navigation, such as the Storybook sidebar, the grouping is its title hierarchy: `Prototypes/In progress/<title>` and `Prototypes/Kept/<title>`.

## Presenting at a gate

The user looks at the prototype live, in the browser:

1. The controller starts the system with its documented command, detached so it survives the end of the turn (for example with `nohup`), waits until the index URL responds, and notes the command and process in `state.md` Notes.
2. The gate gives the index URL, the prototype's URL, one direct URL per state, and the decisions not dictated by the spec; with Impeccable on, also the design check summary and the findings left for the user to judge (see `design-check`). The user opens them in any browser, including one embedded in their tool.
3. The system keeps running until the gate is answered, then the controller stops it. When resuming at that gate, start it again before presenting.

## Keep or remove

At the delivery gate each prototype of the work gets one line: **remove** (default, also when there is no answer) or **keep**. Apply the answer before integration:

- **remove**: `@ui-prototyper` in finalize mode deletes `<area>/<work>/` and the wiring it added for it, never the system. The approved commit stays the reference for reviewers.
- **keep**: `@ui-prototyper` in finalize mode sets `status: kept` and the date in `PROTOTYPE.md`, and moves it to the kept group of the index.

Then verify (production build without the area, system starting, index and kept prototypes loading) and commit.

A kept prototype records the design approved at its commit. It is not a mirror of the product and is not updated when the product changes, but it must keep running: loading every kept prototype is part of the verification of greenfield and feature work. Work that breaks one fixes it inside the area when the fix is small; otherwise the prototype is proposed for removal at that work's delivery gate.
