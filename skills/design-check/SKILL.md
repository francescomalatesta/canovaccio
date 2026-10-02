---
name: design-check
description: How UI changes are checked with the Impeccable design detector when a workflow runs with Impeccable on - the script that runs it, what counts as a finding of the change, how findings map to review severities, advisory findings, detector ignores, and what to report when the check cannot run.
---

# Design check

[Impeccable](https://impeccable.style) ships a deterministic detector for design defects and for the tells of generated UI: low contrast, skipped headings, cramped padding, nested cards, gradient text, overused fonts and about sixty more rules. No LLM is involved. A workflow uses it only when Impeccable is on for that work (see Impeccable in `workflow-rules`); agents run it only when the controller says so, with the advisory setting.

It does not need `PRODUCT.md` or `DESIGN.md`. When the project has a `DESIGN.md`, the detector also reports values outside it.

## Script

`scripts/design-check.mjs` in this skill's directory (the skill tool lists its absolute path). It fetches the detector with `npx` at a pinned version, so nothing is installed in the project. Node 22.18+. Run it from the project root:

```sh
node <skill-dir>/scripts/design-check.mjs --changed <base> --advisory minor|exclude   # source of the UI files changed since <base>, uncommitted included
node <skill-dir>/scripts/design-check.mjs --url <url> [--url <url>...] --advisory minor|exclude   # rendered pages, desktop and mobile
node <skill-dir>/scripts/design-check.mjs --screenshot <url> [--screenshot <url>...] --out <dir>   # PNG captures for a visual review
node <skill-dir>/scripts/design-check.mjs --check                                       # can the detector, and a browser, run here
```

Exit codes: 0 nothing to review, 2 findings to review, 1 the check did not run, or not on every target. `--json` gives the full classification.

- **`--changed`** scans the UI files (`.html`, stylesheets, `.jsx/.tsx/.js/.ts`, `.vue`, `.svelte`, `.astro`, `.blade.php`) changed since the base, and attributes each finding: **introduced** by the change (on a changed line, in a new file, or absent from a scan of the base version), or **pre-existing**. Pre-existing findings are context, never findings of the work. **Unattributed** ones (no line and no baseline) must be checked by hand.
- **`--screenshot`** captures each page with a local Chrome, Chromium, Edge or Brave: the first viewport at 1280×800 and in a 390×844 window. The narrow window is not device emulation. A URL that does not answer is reported, never captured as an error page.
- **`--url`** scans rendered pages at 1280×800 and 390×844. It is the more reliable mode for contrast, overflow and line length, but it cannot attribute: the agent judges whether the work caused each finding. It needs a Chromium-based browser; the script falls back to a Playwright Chromium and handles running as root.

## Severity

For findings of the change:

| Finding | Severity |
|---|---|
| breakage and accessibility: `script-error`, `content-hidden-at-rest`, `broken-image`, `low-contrast`, `gray-on-color`, `tiny-text`, `skipped-heading`, `text-overflow`, `text-occlusion`, `clipped-overflow-container` | Important |
| every other rule, design quality (`quality`) or generated-UI tells (`slop`) | Minor |
| advisory rules: soft signals that may be deliberate, such as em-dash overuse or numbered section labels | Minor with `--advisory minor`; not reported with `--advisory exclude` |

The script applies this table. Minor findings then follow the workflow's minor-findings policy (`fix` or `defer`).

Before reporting a finding, verify it in the code: regex scans of components produce false positives, which are dismissed with the reason. **The approved prototype wins**: a finding that reproduces a choice visible in the approved prototype is not a finding, since the user accepted it at the prototype gate.

## Ignores

Agents never silence the detector: no `detector` entries in `.impeccable/config.json`, no `impeccable-disable` comments in code. A deliberate choice or a recurring false positive goes into `closure.md` under Detector ignore proposals, with the evidence and the command that would apply it (for example `npx impeccable@4.1.0 ignores add-value overused-font Inter --reason "Brand font"`). At the delivery gate each one is accepted or rejected on its own, and no answer means rejected; accepted ones are applied before integration.

## When it cannot run

Missing Node, no network for `npx`, no browser for `--url`, a target that cannot be scanned: report **design check not run: <reason>**, never as passed. A run with exit 1 still lists what it scanned; report what was and was not covered.

A clean run means the detector found nothing it knows. It is evidence, not a judgement of the design.
