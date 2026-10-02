---
name: design-context
description: How a project's PRODUCT.md and DESIGN.md work when it uses Impeccable - what each holds, their format, how @design-director builds them through a bounded interview relayed by the controller (seed before a greenfield prototype, document on an existing codebase, sync after the prototype), and how the rest of the work uses them.
---

# Design context

Two files at the project root, in [Impeccable](https://impeccable.style)'s format so its tools read them too:

- **`PRODUCT.md`**: durable product truth. Users and their situation, purpose, positioning, operating context, capabilities and constraints, brand commitments, evidence on hand, product principles, accessibility. No visual decisions. Format and what belongs in it: `reference/product.md`.
- **`DESIGN.md`**: the visual system. A YAML frontmatter of tokens (colors, typography, rounded, spacing, components), which is normative, then up to eight sections in a fixed order. Format: `reference/design.md`. When it exists, the detector of `design-check` also reports fonts, colors and radii outside it.

`@design-director` writes them, links them from `docs/index.md` when the project has one, and the controller commits them with the work. `DESIGN.md` describes the system as it is, plus the intentions the user confirmed: never a wish list. Improvements are findings, kept elsewhere.

## Modes

- **seed**: greenfield, after the spec gate and before the prototype. `PRODUCT.md` comes from the spec and the brief; ask only what they leave open (the stack is already decided in the spec). `DESIGN.md` is a seed: derive directions with `reference/directions.md` and the `reference/visual-world.md` of the `design-craft` skill, offer two or three complete directions as one question, and write the seed for the chosen one, with the SEED marker of the format and the token values the direction set (palette, faces).
- **document**: an existing codebase (`workflow-design-init`). Read first: README, docs, the existing files, then tokens, theme files, components and global styles, and rendered pages when the app runs (`reference/design.md`, Document mode). Ask only what the code cannot tell: intentions, what must be kept, what the user dislikes, descriptive language. An existing file is updated, never replaced: keep what is accurate and report what changed.
- **sync**: no questions. After the prototype gate in greenfield, replace the seed with the tokens and components the approved prototype actually uses, and remove the SEED marker.

## Interview

`@design-director` never talks to the user: it returns questions, the controller asks them and dispatches it again with the answers.

- **Read before asking.** Ask only about material gaps: what the spec, the brief, the repository and the earlier answers do not settle with strong evidence. Never ask what can be read, never ask about taste in the abstract ("what style do you like?"), never ask for CSS values.
- **Limits, per file: at most 3 rounds, at most 5 questions per round.** They are ceilings, not targets: zero rounds is a good outcome when nothing material is missing. One round may carry questions for both files.
- **Every question has a proposed answer** and one line on what it decides, so "ok" accepts them all. A choice lists its options, and "decide for me" is always one of them: it closes the question.
- **The direction** of seed mode is one choice among two or three complete directions, counted as one `DESIGN.md` question. The directions differ materially, each is viable for this product, and none is the category default.
- **After the limits**, or once nothing material is open, write the files. What is still unknown goes where it belongs, marked `Assumed:` (a reasoned default) or `Open:` (undecided), and is not asked again in this work.

Return to the controller one of:

```markdown
Status: questions
Round: 2 (PRODUCT.md 1/3, DESIGN.md 2/3)

1. [PRODUCT.md] <question> — Proposed: <answer>. Decides: <what it changes>
2. [DESIGN.md] Visual direction:
   A. <name>: <thesis> · <color strategy and key colors> · <faces> · <light or dark, and the scene that decides it> · <first viewport>
   B. <...>
   C. <...>
   D. Decide for me
```

```markdown
Status: written
Files: PRODUCT.md, DESIGN.md (seed)
Summary: <a few lines per file>
Assumed / Open: <each item, with its file>
```

**The controller** keeps the interview in `design-interview.md` in the work directory: every round's questions and answers, verbatim. It asks each round with the `question` tool when it fits, otherwise in a message, and waits for the answer; it notes the round in `state.md` so a resumed session continues the interview instead of restarting it. Then it dispatches `@design-director` again with the whole interview so far.

## Using the files

When Impeccable is on and the files exist, whoever writes or reviews UI reads them (`design-craft`, `design-review`), and the docs sync keeps them current: `@doc-writer` updates `DESIGN.md` for the tokens and components the work added or changed, in its format, and `PRODUCT.md` only where the work made a statement untrue. A project without them works as before.
