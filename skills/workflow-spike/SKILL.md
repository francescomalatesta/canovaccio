---
name: workflow-spike
description: Workflow for answering a question before building - frame the question and budget, research and run throwaway experiments, write findings with a recommendation, then decide the follow-up. Produces knowledge, never production code.
---

# Spike workflow

Answer a question that must be settled before building: feasibility, choice between options, how something behaves. Apply `workflow-conventions` throughout.

The output is `findings.md`. Experiment code is throwaway and is never merged.

## Gates

| Gate | When | Decides |
|---|---|---|
| **G1 framing** | before research | question, options, decision criteria, budget |
| **G2 decision** | after findings | what happens next |

Exhausting the budget without an answer is an unplanned gate.

## Phases

### 0. Setup

Create the work directory with `brief.md` (request, classification and reason) and `state.md`, recording in it the branch checked out now: `findings.md` is committed there.

### 1. Framing

Write the framing at the top of `findings.md`:

- **question** — one precise question, plus sub-questions if needed;
- **options** — the candidates to evaluate, if it is a choice;
- **decision criteria** — what would make an answer good enough, and how options are compared;
- **budget** — the maximum number of experiments;
- **out of scope** — what the spike will not try to settle.

Present **G1**. Keep it light: one short message.

### 2. Research

Dispatch `@scout` for documentation, existing code, prior art and known limitations. Parallelize independent sub-questions (`superpowers:dispatching-parallel-agents`).

### 3. Experiments

When research is not enough, create the branch `spike/<slug>` and dispatch `@implementer` for each experiment, stating explicitly:

- this is throwaway spike code: no production quality, tests only where they are the measurement;
- the sub-question the experiment answers;
- the evidence to return: commands run, outputs, measurements, observed limits.

Run experiments one at a time. They skip the Review loop, so no minor-findings policy applies. Keep them minimal: the smallest thing that answers the sub-question. Record each result in `findings.md` as it arrives, and track the budget in `state.md`.

If the budget runs out before the question is answered, open an unplanned gate: partial findings, what remains unknown, and whether to extend, narrow or stop.

### 4. Findings

Complete `findings.md`:

- the answer, in one paragraph;
- evidence per option or sub-question, with references to experiments and sources;
- comparison against the decision criteria;
- recommendation, risks and remaining unknowns;
- the suggested follow-up workflow and what it would take as input.

There is no closure review. Check yourself that every claim in `findings.md` rests on evidence gathered in this spike or a cited source, and mark anything else as an assumption.

### 5. Decision

Present **G2** with `findings.md` and ask, in the same message, whether to keep or delete the `spike/<slug>` branch. Possible outcomes:

- **proceed** → start `workflow-feature` or `workflow-greenfield` with `findings.md` as input, in a new work directory;
- **another spike** → frame the next question;
- **stop** → record the reason.

Then switch back to the branch recorded in `state.md`, commit `findings.md` there as a standalone commit, apply the branch decision, and set `state.md` to `closed`.
