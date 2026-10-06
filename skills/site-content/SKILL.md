---
name: site-content
description: The artifacts that carry a public site from decisions to pages in workflow-site - facts.md (what is true about the product, with sources), strategy.md (audience, positioning, message, sitemap), content.md (every page's copy, calls to action and metadata in a checkable format) - the rules against fabricated claims, open placeholders, and the site-check script that verifies rendered pages against the content without an LLM.
---

# Site content

A site is built from three artifacts, written in this order, in the work directory. Each one is the authority for the next: the strategy uses only facts, the content follows the strategy and uses only facts, the pages show only the content. All three are written in English except the copy of a language other than English, which is written in that language (see Language in `AGENTS.md`: copy is product content).

## Claims and facts

A public site makes claims, and a claim nobody can back is a liability. **Every factual claim on a page comes from `facts.md`**: numbers, prices, plans and limits, features and integrations, platforms, customers and logos, testimonials and quotes, awards and press, certifications and compliance, security and privacy statements, comparisons with competitors.

- No agent invents a fact, a customer, a quote, a figure or a comparison, even as an example, even plausible.
- A claim the strategy or the copy needs and no fact backs is an **open placeholder**: `[OPEN: what is needed]`, written where the claim goes, for example `Used by [OPEN: number of active teams] teams`. Placeholders are listed at G2 and at delivery; the user fills them or drops the element. A page is never shipped with one.
- Persuasion is not a fact: a promise of outcome ("save hours every week") needs a fact behind it; a description of how the product works ("one click sends the invoice") needs a fact that it works that way.

## facts.md

What is true about the product, each fact with its source. Written by the controller from `@scout`'s report and from the user's answers; `@strategist` adds the facts the user confirms in its interview. Versioned with the work, since the content cites it.

```markdown
# Facts

Product source: <this repository | path or repository | the user's description>

## Product
- F1: Invoices are sent as PDF by email from the editor — Source: src/invoices/send.ts:40
- F2: Exports to CSV and PDF — Source: src/export/index.ts:12

## Plans and prices
- F3: Pro plan, €19/month, unlimited invoices — Source: config/plans.php:8

## Proof
- F4: "We closed the month in a day" — Anna Rossi, Studio Rossi; permission given — Source: user, 2026-10-07

## Links
- F5: Signup URL https://app.example.com/signup — Source: routes/web.php:21

## Company
- F6: Example S.r.l., VAT IT01234567890 — Source: user, 2026-10-07

## Unknown
- Number of active customers: not in the code; asked at G1
```

Group by topic as fits the product; keep each fact one line and checkable. Ids are stable once cited: a fact that turns out wrong is corrected or struck through (`~~F7~~ wrong: ...`), never renumbered. `Unknown` lists what the site may need and nobody has established yet.

## strategy.md

How the site persuades: written by `@strategist`, approved at G1, versioned. It decides, so that the copy and the pages do not have to.

```markdown
# Strategy

## Audience          — who arrives, from where, in what situation, what they already know; primary and secondary
## Job and trigger   — what they are trying to get done, and what made them look now
## Positioning       — the mechanism or claim a neighboring product could not truthfully copy, against the
                       alternatives the visitor actually weighs (including doing nothing) [facts]
## Message           — one-line promise; three to five supporting messages in order, each with its proof [facts]
## Objections        — what stops them, and the answer the site gives, with its proof or an open placeholder
## Conversion        — the primary action (the working action, not a link to it), where it leads, secondary actions;
                       what counts as success for the site
## Voice             — how the copy sounds: register, person, what it never says; from PRODUCT.md when it has a voice
## Sitemap           — every page: route, purpose, mode (Persuade or Read), the messages and objections it carries,
                       its primary action; the model page, marked
## Search            — per page, the queries it should answer, as hypotheses unless the user brought data
## Languages         — which, and whether each page exists in each
## Open              — what is undecided, with the proposed default
```

Facts are cited inline as `[F3]`. A message without proof is either reworded until a fact backs it, or carries an open placeholder.

## content.md

Every word a visitor reads, page by page, section by section. Written by `@copywriter`, approved at G2, versioned. It is the copy authority for implementation: builders transcribe it, `site-check.mjs` verifies the pages against it. One file per language: `content.md` for the primary one, `content.<lang>.md` for each other, with the same structure and their own routes.

```markdown
# Content

- Language: en

## Shared

### Header
- Link: Pricing → /pricing
- CTA: Start free → https://app.example.com/signup

### Footer
- Text: © 2026 Example S.r.l. · VAT IT01234567890 [F6]
- Link: Privacy → /privacy

## Page: Home

- Route: /
- Title: Example — invoices sent in one click
- Description: Write, send and track invoices from one screen. Free for your first ten invoices.
- Image: /og/home.png

### Hero
Purpose: say what it is and for whom, in one look; the primary action in reach.
- H1: Invoices sent in one click
- Lead: Write the invoice, press send: your client gets a PDF by email. [F1]
- CTA: Start free → https://app.example.com/signup
- Alt: The invoice editor with a draft ready to send
- Asset: screenshot of the editor with a realistic draft (to produce; no real client data)

### Proof
- Quote: We closed the month in a day. [F4]
- Caption: Anna Rossi, Studio Rossi [F4]
- Body: Used by [OPEN: number of active teams] teams.
```

**Format**, which the checker parses:

- `## Shared` holds what every page shows (header, footer); `## Page: <name>` opens a page. No other `##` sections.
- Page metadata, before the first `###`: `Route` (from `/`), `Title` (the `<title>`), `Description` (the meta description), optional `Image` (the Open Graph image).
- `### <section>` opens a section, in page order. Free lines (`Purpose:`, notes) are for builders and are not checked.
- Each piece of copy is one bullet, `- <Role>: <text>`, one text block per bullet, in reading order. Roles: `H1`, `H2`, `H3` (the heading level the page uses: one `H1` per page), `Lead`, `Body`, `Item` (one list item), `Label`, `Caption`, `Quote`, `Text`, or another one-word role when it reads better; `CTA` and `Link` as `<label> → <target>` (absolute URL, or a route of the site); `Alt` for an image's alt text, exactly.
- Not copy, never shown: `Asset` (what image or media goes there, and whether it exists, with its path, or must be produced), `Note`, `Component`.
- Inline markdown (emphasis, links) is allowed in copy and ignored by the check. Facts are cited at the end of the bullet: `[F1]` or `[F1, F4]`; they are never shown.
- Placeholders: `[OPEN: ...]` inside the copy, rendered as is until filled.

**What it holds**: all of it. Navigation and footer labels, button labels, form labels, helper texts and errors, empty and success messages, the 404 page, the cookie notice when the spec has one, legal pages. Legal texts (privacy, terms, cookie policy, imprint) come from the user or from their provider: the copywriter structures the page and writes `[OPEN: privacy policy text from <provider or counsel>]`, never a legal text of its own.

## site-check

`scripts/site-check.mjs` in this skill's directory (the skill tool lists its absolute path). Node 18+, no dependencies. Run it from the project root:

```sh
node <skill-dir>/scripts/site-check.mjs --lint --content <work>/content.md [--content <work>/content.it.md] --facts <work>/facts.md
node <skill-dir>/scripts/site-check.mjs --content <work>/content.md --dist <build dir> [--page /pricing] [--sitemap]
node <skill-dir>/scripts/site-check.mjs --content <work>/content.md --url http://localhost:4321 [--page /pricing] [--sitemap]
```

- `--lint` checks the content files alone: format, required metadata, duplicate routes, cited facts that `facts.md` does not have, and lists the open placeholders.
- With `--dist` it serves a built static site itself; with `--url` it reads a running server (an app that renders the pages). `--page` limits the check to some routes; `--sitemap` adds `robots.txt` and the sitemap, which must list every route of the content.
- Exit codes: 0 nothing to review, 2 findings to review, 1 the check could not run (file missing, server unreachable). `--json` gives the full list.

Per page it checks: every piece of copy present (`missing-copy`), shared copy on every page, each `CTA` and `Link` a link to its target (`link-missing`, `link-target`), `Title` and `Description` as written, `<html lang>`, one `<h1>`, heading levels, every `Alt` on an image and no image without `alt`, internal links and anchors that resolve (`broken-link`, `broken-anchor`); canonical and Open Graph tags as Minor. Comparison ignores case, whitespace and typographic quotes and dashes.

| Finding | Severity |
|---|---|
| copy, CTA, link, metadata, `lang`, `h1`, alt, broken link or anchor, page not loading, sitemap missing a page | Important |
| heading level, canonical, Open Graph, `robots.txt` | Minor |
| `unlisted-text`: text on the page that the content does not contain | Review: invented copy is Important; legitimate text the content forgot (a date, a form's built-in message) goes back to the copywriter |
| `placeholder`: an `[OPEN: ...]` on the page | Open: listed at delivery, never shipped |

A clean run means the pages say what the content says and link where it says. It does not judge design, nor whether the content is good: the gates and reviews do.
