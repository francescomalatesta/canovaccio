---
name: design-review
description: How @design-reviewer runs a design review with Impeccable's critique method - captures, an assessment made before seeing the detector, the detector, the report, and how findings map to canovaccio severities. Used before closure when the project has design review on, and for the optional critique of an existing interface in design-init.
---

# Design review

A design review judges what the detector cannot: hierarchy, clarity, cognitive load, coherence with the design system, and whether the result belongs to this product or could be any product of its category. `@design-reviewer` runs it in one of two modes:

- **change**: in greenfield and feature work, before the docs sync, when the project preference has `Design review: on` and the work changed the UI. It reviews the screens the work added or changed.
- **critique**: in `workflow-design-init`, when the user asks for it at delivery. It reviews the main screens of the existing interface, at most eight, and only reports.

## Inputs

The controller starts the app, or the prototype system when the app cannot run, detached, and passes: the URLs to review with what each screen is for; the work directory; the advisory setting; in change mode, the base branch and the approved prototype commit if any. `PRODUCT.md` and `DESIGN.md` are read from the project root when they exist.

## Procedure

1. **Capture.** `design-check.mjs --screenshot <url>... --out <work dir>/design-review/`, then open the captures. If you cannot view images, the report opens with `⚠️ DEGRADED: no image input (<reason>)` and the review relies on code and the rendered DOM.
2. **Assess** before running the detector, whose findings would anchor your judgement. Follow the Assessment of `reference/review.md` with `reference/heuristics.md`: design specificity, hierarchy and composition, cognitive load, the ten heuristics scored 0–4, two or three personas. Judge against `PRODUCT.md` (who it is for, what it must do) and `DESIGN.md` (the system). In change mode a choice visible in the approved prototype is not a finding: the user approved it.
3. **Detector.** `design-check.mjs` with the advisory setting: `--changed <base>` in change mode, `--url` on the screens in critique mode. Weave it in: where it agrees with you, what it caught that you missed, and its false positives.
4. **Report**, in the work directory: `design-review.md` in change mode, `findings.md` in critique mode. Structure it as the Report of `reference/review.md`: a first line with the method (`Method: captures + detector` or the degraded banner), Design Health Score, Design Specificity Verdict, Overall Impression, What's Working, Priority Issues tagged P0–P3 (each with the screen or `file:line`, why it matters and a concrete fix), Persona Red Flags, Minor Observations, and the detector summary.

## Severity

In change mode, for issues the work introduced: P0 and P1 are **Important** and are fixed in the Review loop; P2 and P3 are **Minor** and follow the minor-findings policy. Issues the work did not touch are observations, not findings. In critique mode issues keep their P0–P3 tags and nothing is fixed.

## Limits

One design review per work: the closure review verifies the fixes, there is no second design review. Never edit code or tracked files; write only the report and the captures. Stop any process you started; the controller stops what it started.
