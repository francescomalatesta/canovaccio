---
name: workflow-site
description: Workflow for a product's public website (marketing site, landing pages, pricing, legal pages) - facts with sources, strategy and copy written by stronger agents and approved at gates, a model page built in production code by a stronger agent, the remaining pages transcribed by the implementer and verified by deterministic checks, design review, closure review and delivery gate.
---

# Site workflow

A public website for a product: home, features, pricing, about, legal pages, landing pages; new, or rebuilt from scratch. Its pages persuade and inform; they are not the product's app. Apply `workflow-rules` and `site-content` throughout.

The work is split by what it needs. The decisions that make a site good (whom it addresses, what it claims, every word, the look) are taken by stronger agents and approved by the user: `@strategist`, `@copywriter`, `@design-director`, `@site-builder`. What follows is transcription: `@implementer` builds the remaining pages from the approved content, the model page and a prescriptive plan, and deterministic checks (`site-check`, the design detector) verify them, so the stronger agents are not needed inside the loop.

Not this workflow: one more page, or copy changes, on a site whose building blocks already exist → `workflow-feature`, which follows `site-content` for the copy.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 direction** | after strategy and spec review | audience, positioning, message, sitemap, conversion; stack and integration with the product |
| **G2 content** | after the content | every word of every page, calls to action, metadata |
| **G3 model page** | after the model page is built | the look and the building blocks every page reuses |
| **G4 delivery** | after closure | the delivered site |

The interviews are questions, not gates. The plan is a CHECKPOINT: it follows from what G1 to G3 approved.

## Impeccable

This workflow implies Impeccable: on a public site the look is the point. Without a project preference, write `Use: on` and ask at G1 the two other preference questions (advisory findings, design review; propose design review on). With `Use: on` and no `Design review` line, G1 asks that question alone. With `Use: off`, G1 asks whether to run this work with it on (proposed: yes); kept off, phase 4 is skipped, `@site-builder` sets the direction itself and reports it at G3, and no detector or design review runs. Record the setting in `state.md` as `workflow-rules` describes.

## Phases

### 0. Setup

Decide where the site lives, and record the choice and the reason in `brief.md`:

- **Its own project**: no repository yet, a repository with no project (as in greenfield), or the user wants it separate. The site is the project root, on the default branch of a new or empty repository.
- **Inside an existing repository**, usually the product's: in the product's app when it already serves public pages or the user asks for it; otherwise in a directory of its own (for example `site/`), which is the root for its build, README and changelog. Work on the branch `site/<slug>`.

Also record where the product is: this repository, another path or repository the user names, or only the user's description. If either is unclear, ask before creating anything.

Create the work directory with `brief.md` (request, classification and reason, layout, product source) and `state.md`.

### 1. Facts

When the site goes into an existing project, follow the `project-docs` reading protocol.

Dispatch `@scout` on the product, with its location and doc paths, for facts with a source each (`file:line`, URL, document): what the product does and how it is used, plans, prices and limits, integrations and platforms, signup, login and contact URLs, existing public copy, brand assets (name, logo, screenshots, colors), legal entity and existing legal texts, analytics in place, existing `PRODUCT.md` and `DESIGN.md`. Competitors only when the user names them: their public pages, for positioning, never to copy.

Write `facts.md` as `site-content` describes, from the scout's report and from what the user wrote in the request. What the site will likely need and nobody established goes under `Unknown`.

### 2. Strategy and spec

Dispatch `@strategist` with the brief, `facts.md`, `PRODUCT.md` when it exists, the work directory and the interview so far (empty at first). It returns questions or writes `strategy.md` and adds the facts the user confirmed to `facts.md`. Relay its questions as `design-context` describes for `@design-director` (each with a proposed answer, "decide for me" closes a choice), keep them verbatim in `site-interview.md`, note the round in `state.md`, and dispatch it again with the whole interview. At most 2 rounds of 5 questions.

Write `spec.md`, the technical frame of the site:

- **layout and stack**: where the site lives (phase 0), and the stack with a short rationale. For a site of its own, the default is a static site generator with components and content files (such as Astro), built to static files; inside an app that already serves public pages, its own rendering. Another choice is fine with a reason;
- **hosting target** and how the site is built and run locally;
- **integration with the product**: signup, login and contact targets; forms, what they send and where; shared brand assets;
- **languages** and the URL scheme for each;
- **SEO baseline**: `<title>` and meta description per page from the content, canonical URLs, Open Graph tags and images, `sitemap.xml` and `robots.txt`, `<html lang>`; structured data only when the strategy asks for it;
- **analytics and consent**, only when the user wants analytics: which tool, and the consent notice it requires;
- **legal pages**: which ones, and that their text comes from the user or a provider (see `site-content`);
- **quality baseline**: build, lint and format where the stack has them, `site-check` on every page (`--dist` on the build, or `--url` on the running app), the design check, an E2E smoke test of the primary action reaching its target when the site has a form or logic of its own, tests for that logic;
- **no prototype**: the model page is production code judged at G3; the project's prototype system, if any, is not used.

Record significant choices in `decisions.md` with the rejected alternatives.

Dispatch `@spec-reviewer` with the request, `brief.md`, `facts.md`, `strategy.md` and `spec.md`; besides its checks, every claim in the strategy cites a fact or carries an open placeholder, and the sitemap is covered by the spec. Fix BLOCKING findings; list at the gate any finding you chose not to address, with the reason.

Present **G1** with `strategy.md` and `spec.md`: the sitemap and the model page, the primary action, the open items, the stack and layout, and the preference questions due at this gate (Impeccable, minor-findings policy, tracker).

A correction to the strategy at the gate goes back to `@strategist`, with no new questions; to the spec, you apply it.

### 3. Content

Dispatch `@copywriter` with `strategy.md`, `facts.md`, `spec.md` (languages, routes, forms, legal pages), `PRODUCT.md` when it exists, the work directory and the interview so far. It returns at most one round of questions, relayed and recorded as in phase 2, or writes `content.md` (and `content.<lang>.md` per other language) and lints it.

Run `site-check.mjs --lint` on the content files with `--facts`. Format errors and unknown facts go back to `@copywriter`.

Present **G2** with the content files, page by page: the number of pages and sections, the open placeholders (the user may fill them now; filled text that states a fact is added to `facts.md` first), and the assets to produce. Ask the user to read it as a visitor would. Corrections go back to `@copywriter`; one that contradicts `strategy.md` goes to `@strategist` first, and the changed strategy is presented with the content again.

### 4. Design context

With Impeccable on: dispatch `@design-director` in seed mode with the approved strategy, spec and content, the brief and the work directory, and relay its questions as `design-context` describes until it writes the files. When the project already has `PRODUCT.md` and `DESIGN.md` (a site for an app that has them), the site extends that identity: `PRODUCT.md` is updated only with confirmed facts, and the directions keep the brand commitments of `DESIGN.md` (see `design-context`). Commit the files.

### 5. Model page

The model page is the home, unless `strategy.md` marks another page that carries more of the site's kinds of section.

Dispatch `@site-builder` in model mode with the approved spec, strategy and content files, `PRODUCT.md` and `DESIGN.md`, the model page route, the work directory and the Impeccable setting. It sets up the site (scaffold, quality baseline, SEO baseline, shared layout, tokens), builds the building blocks the model page needs and the model page itself with the approved copy, verifies it and commits.

Start the site detached, as `project-prototypes` describes for a prototype (command and process in `state.md` Notes), and present **G3**: the model page URL, to open at desktop and mobile width; the `site-check` result for the page; with Impeccable on, the design check summary and the findings left to judge; the building blocks; the direction taken when phase 4 was skipped; the decisions not dictated by the content or `DESIGN.md`. Stop the site after the answer.

Changes go back to `@site-builder` in model mode, with the feedback, and are presented again when material. On approval, record the commit in `state.md` as the model page commit: it is an authority for implementation and closure, as an approved prototype is elsewhere. Then:

- with Impeccable on, dispatch `@design-director` in sync mode with the model page commit, so that `DESIGN.md` records the tokens and components it uses;
- dispatch `@doc-writer` to write `docs/site.md` from the site-builder's report (see `project-docs`), and the docs pointer when the project has no docs yet;
- commit both.

### 6. Plan

Dispatch `@site-builder` in plan mode with the approved artifacts, the model page commit and `docs/site.md`. It writes `plan.md`: one task per page (short pages made of the same blocks, such as legal pages, may share one), plus the tasks for what the spec requires and the model page did not settle (forms, analytics and consent, the 404 page, the sitemap if not generated yet). Each task maps every section to a building block, with what to pass it, and specifies completely any new block it needs; nothing is left for the implementer to decide.

Dispatch `@spec-reviewer` with spec, content and plan: every page of the content and every requirement of the spec owned by a task, no task needing a decision the artifacts do not take. Fix BLOCKING findings, then give a CHECKPOINT with the task list.

### 7. Implementation

Run `superpowers:subagent-driven-development` over `plan.md` with the Review loop of `workflow-rules`.

Give `@implementer` the task, the content files, `docs/site.md`, the model page commit, the minor-findings policy, the Impeccable setting, and these rules of the task:

- the copy is the content's, verbatim: nothing reworded, added or dropped; an `[OPEN: ...]` placeholder is rendered as written;
- build with the existing blocks; a new block only as the task specifies it, consistent with the model page;
- what the task, the content, `DESIGN.md` and the model page do not settle is a blocker to report, never a decision to take;
- before committing: the build, and `site-check.mjs` with `--page` on the task's routes; no Important finding and no unlisted text left.

Give `@task-reviewer` the task, the content files, the commit range and the model page commit. Besides its checks, it runs `site-check` on the task's routes, building the site first when it checks a static build: Important findings stay Important; unlisted text that the content does not contain is invented copy, Important; a page that departs from the model page's blocks, tokens or spacing without the task saying so is Important.

A piece of copy the content lacks (a form error, a confirmation message) goes to `@copywriter`, who adds it to the content; you record it in `state.md` Notes as copy added after G2, and it is listed at delivery. Changing approved copy is not this: it is an unplanned gate.

After each accepted task, update `state.md` and give a one-line CHECKPOINT. With `Design review: on`, run the Design review of `workflow-rules` after the last task, with the URL of every page.

### 8. Docs sync

Dispatch `@doc-writer` for the docs sync described in `workflow-rules`, with the work directory, the base branch (none for a site of its own: full mode), workflow type `site` and the discrepancies recorded in `state.md`. `docs/site.md` is completed with what the tasks added, and the changelog gets the site's entry. Review its report; commit the docs and changelog changes with the work.

### 9. Closure

1. Commit everything, including `spec.md`, `strategy.md`, the content files, `facts.md` and `decisions.md`. Run the full verification: build, lint, tests; `site-check` on every content file, all pages, with `--sitemap`; with Impeccable on, the design check with `--url` on every page. For a site of its own, also the clean-clone verification of greenfield (its phase 7, step 1).
2. Run the closure review (see Closure review in `workflow-rules`) against the base branch, or by its file tree for a site of its own, with the original request, `facts.md`, `strategy.md`, the content files, `spec.md`, `plan.md`, the model page commit and `decisions.md`. Focus: every page says what the content says (the `site-check` output is evidence); every factual claim on the pages traces to a fact; no invented proof; the primary action of each page reaches its target; the SEO baseline of the spec; the pages consistent with the model page.
3. On FAIL, fix BLOCKING findings through the Review loop and review again; after two failures, open an unplanned gate.
4. Write `closure.md`: verdict, verification run with results, deviations, non-blocking observations, deferred minor findings, the open placeholders still on the pages, the copy added after G2, the assets still to produce.

### 10. Delivery

Present **G4** with `closure.md`, how to build and run the site, and the remaining decisions:

- each open placeholder: the user gives the text (`@copywriter` adds it to the content, a fact to `facts.md` first, `@implementer` transcribes it and `site-check` confirms it) or drops the element. A site with a placeholder on a page is not ready to publish, and the gate says so;
- the copy added after G2, for the user to read;
- integration: the options from `superpowers:finishing-a-development-branch`, or for a site of its own the remote repository and the first push;
- deployment: the target and the domain are the user's decision; nothing is deployed without explicit approval of where.

Its convention and detector ignore proposals are accepted or rejected one by one (see Project conventions in `workflow-rules`). Execute what is approved, then set `state.md` to `closed`.

## Switching

- A question of the strategy needs research or an experiment (a pricing integration, a claim to measure) → propose `workflow-spike`.
- The request turns out to be the product's own UI → `workflow-feature` or `workflow-greenfield`.
- Only copy or one page on an existing site → `workflow-feature`.
