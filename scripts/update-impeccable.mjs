#!/usr/bin/env node
// Maintenance script for canovaccio itself (not installed in projects): refreshes what canovaccio takes
// from Impeccable (https://github.com/pbakaus/impeccable).
//
//   node scripts/update-impeccable.mjs [--tag skill-vX.Y.Z | --source DIR] [--detector latest|X.Y.Z]
//
// - Regenerates the reference/ directories of the design-* skills from the sections of Impeccable's skill
//   listed in EXTRACTS, from a release tag (default: the latest skill-v* tag) or a local checkout, and copies
//   its LICENSE next to them.
// - Prints the detector version pinned in skills/design-check and the latest one on npm; with --detector,
//   pins that version instead.
//
// It writes the files and stops: review `git diff` before committing. Requires git, and npm for --detector.

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const REPO = "https://github.com/pbakaus/impeccable.git"
const HERE = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..")
const DETECTOR_FILES = ["skills/design-check/scripts/design-check.mjs", "skills/design-check/SKILL.md"]
const ASK = "Ask through the controller, within the limits of the `design-context` skill."

// Skill reference directory → output file → parts of Impeccable's skill/reference/. A part is a whole file or
// a section (from its heading to the next heading of the same or a higher level), optionally retitled
// (`heading`), cut at the first line starting with `until`, without the subsections in `drop` or the lines
// matching `dropLines`, and with the `replace` pairs applied; every one of them must match, so an upstream
// change stops the update instead of slipping through.
const EXTRACTS = {
  "skills/design-craft/reference": {
    "craft-floor.md": [{ file: "craft-floor.md" }],
    "visual-world.md": [{ file: "new-work.md", section: "## 4. Commit the world", heading: "# Commit the world" }],
    "operate.md": [{ file: "operate.md" }, { file: "mode-operate.md", section: "## Directions", heading: "## Directions" }],
    "persuade.md": [
      { file: "mode-persuade.md", section: "## Directions", heading: "# Persuade and Experience" },
      { file: "mode-persuade.md", section: "## Comps", heading: "## The page" },
    ],
    "read.md": [{ file: "mode-read.md", section: "## Directions", heading: "# Read" }],
  },
  "skills/design-context/reference": {
    "product.md": [
      { file: "init.md", section: "## Step 2: Explore the project", heading: "# PRODUCT.md\n\n## Explore the project" },
      {
        file: "init.md",
        section: "## Step 3: Interview for product truth",
        heading: "## Interview for product truth",
        dropLines: [/^Use the structured question tool when available/, /^Whether anyone can answer is a mechanical test/],
        replace: [["{{ask_instruction}}", ASK]],
      },
      {
        file: "init.md",
        section: "## Step 4: Write PRODUCT.md",
        heading: "## Write PRODUCT.md",
        drop: ["### Completion gate"],
        dropLines: [/^When the platform you just recorded is/],
      },
    ],
    "design.md": [
      { file: "document.md", section: "## The frontmatter: token schema", heading: "# DESIGN.md\n\n## The frontmatter: token schema" },
      { file: "document.md", section: "## The markdown body: eight sections (canonical order)" },
      {
        file: "document.md",
        section: "## Scan mode (approach C: auto-extract, then confirm descriptive language)",
        heading: "## Document mode: extract, then confirm descriptive language",
        drop: ["### Step 4b: Write .impeccable/design.json sidecar (extensions only)", "### Step 5: Confirm and refine"],
        replace: [["Ask them in two structured rounds of no more than three questions each (or the harness's lower limit), waiting between rounds", ASK.replace(/\.$/, "")]],
      },
      { file: "document.md", section: "## Seed mode", drop: ["### Step 1: Route through new-work's workshop", "### Step 3: Confirm"] },
      { file: "document.md", section: "## Style guidelines" },
      { file: "document.md", section: "## Pitfalls" },
    ],
    "directions.md": [
      { file: "new-work.md", section: "## 1. Decide what is already true", heading: "# Visual directions\n\n## Decide what is already true" },
      { file: "new-work.md", section: "### Create or replace the visual world", heading: "## Derive directions", until: "4. Run " },
    ],
  },
  "skills/design-review/reference": {
    "review.md": [
      { file: "critique.md", section: "### Assessment A: Design Review", heading: "# Design review\n\n## Assessment", replace: [["](#", "](heuristics.md#"]] },
      {
        file: "critique.md",
        section: "### Generate Combined Critique Report",
        heading: "## Report",
        drop: ["#### Report header provenance"],
        dropLines: [/^The chat response is the primary/, /^\*\*Visual overlays\*\*/, /^- \*\*Suggested command\*\*/],
        replace: [
          ["](#", "](heuristics.md#"],
          [
            "If `{{config_file}}` contains a `## Design Context` section from `impeccable init`, also generate 1-2 project-specific personas from the audience/brand info.",
            "When PRODUCT.md exists, also generate 1-2 project-specific personas from its users.",
          ],
        ],
      },
    ],
    "heuristics.md": [
      {
        file: "critique.md",
        section: "## Reference Material",
        heading: "# Reference material",
        replace: [
          [
            "If `{{config_file}}` contains a `## Design Context` section (generated by `impeccable init`), derive 1–2 additional personas from the audience and brand information:",
            "When PRODUCT.md exists, derive 1–2 additional personas from its users and brand commitments:",
          ],
        ],
      },
    ],
  },
}

const args = process.argv.slice(2)
const option = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const run = (cmd, a, opts = {}) => execFileSync(cmd, a, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], ...opts }).trim()

function fail(message) {
  console.error(`update-impeccable: ${message}`)
  process.exit(1)
}

function latestTag() {
  const tags = run("git", ["ls-remote", "--tags", "--refs", REPO])
    .split("\n")
    .map((l) => l.split("refs/tags/")[1])
    .filter((t) => /^skill-v\d+\.\d+\.\d+$/.test(t ?? ""))
  const key = (t) => t.slice(7).split(".").map(Number)
  tags.sort((a, b) => {
    const [x, y] = [key(a), key(b)]
    return x[0] - y[0] || x[1] - y[1] || x[2] - y[2]
  })
  if (tags.length === 0) fail("no skill-v* tag found on the Impeccable repository.")
  return tags.at(-1)
}

// Markdown headings outside code fences, as [index, level, text].
function headings(lines) {
  const out = []
  let fence = false
  lines.forEach((line, i) => {
    if (line.trimStart().startsWith("```")) fence = !fence
    const m = !fence && line.match(/^(#+) /)
    if (m) out.push([i, m[1].length, line.trim()])
  })
  return out
}

// Lines from the heading at `start` (excluded) to the next heading of the same or a higher level.
function sectionRange(lines, start, level) {
  const next = headings(lines).find(([i, l]) => i > start && l <= level)
  return [start + 1, next ? next[0] : lines.length]
}

function extract(text, part) {
  const { file, section: name, heading, until, drop = [], dropLines = [], replace = [] } = part
  let lines = text.split("\n")
  if (name) {
    const found = headings(lines).find(([, , t]) => t === name)
    if (!found) fail(`"${name}" not found in ${file}: the upstream file changed, update EXTRACTS.`)
    const [from, to] = sectionRange(lines, found[0], found[1])
    lines = [heading ?? name, "", ...lines.slice(from, to)]
  }
  if (until) {
    const cut = lines.findIndex((l) => l.trimStart().startsWith(until))
    if (cut === -1) fail(`no line starting with "${until}" in ${file}${name ? ` (${name})` : ""}.`)
    lines = lines.slice(0, cut)
  }
  for (const sub of drop) {
    const found = headings(lines).find(([, , t]) => t === sub)
    if (!found) fail(`"${sub}" not found in ${file}: the upstream file changed, update EXTRACTS.`)
    const [, to] = sectionRange(lines, found[0], found[1])
    lines.splice(found[0], to - found[0])
  }
  for (const re of dropLines) {
    if (!lines.some((l) => re.test(l))) fail(`no line matching ${re} in ${file}: the upstream file changed, update EXTRACTS.`)
    lines = lines.filter((l) => !re.test(l))
  }
  let out = lines.join("\n")
  for (const [from, to] of replace) {
    if (!out.includes(from)) fail(`"${from.slice(0, 60)}" not found in ${file}: the upstream file changed, update EXTRACTS.`)
    out = out.split(from).join(to)
  }
  return adapt(out, file)
}

// What Impeccable's own OpenCode build does: model-specific blocks (<claude>, <codex>...) are dropped,
// <opencode> blocks are kept without their tags. Rule markers are internal and removed.
function adapt(text, file) {
  let out = text.replace(/^<([a-z][a-z-]*)>\s*\n([\s\S]*?)^<\/\1>\s*$\n?/gm, (_, tag, body) => (tag === "opencode" ? body : ""))
  out = out.replace(/[ \t]*<!-- rule:[^>]*-->/g, "")
  out = out.replace(/\n{3,}/g, "\n\n").trim()
  if (/\{\{[a-z_]+\}\}/.test(out)) fail(`${file} contains template placeholders: decide how to adapt them before extracting it.`)
  return out
}

const detectorOption = option("--detector")
if (detectorOption && detectorOption !== "latest" && !/^\d+\.\d+\.\d+$/.test(detectorOption)) {
  fail(`--detector must be "latest" or a version like 4.1.0, not "${detectorOption}".`)
}

let source = option("--source")
let tag = option("--tag")
let cleanup
if (source) {
  source = path.resolve(source)
  try {
    tag = run("git", ["-C", source, "describe", "--tags"])
  } catch {
    tag = "local checkout"
  }
} else {
  tag ??= latestTag()
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "impeccable-"))
  cleanup = () => fs.rmSync(dir, { recursive: true, force: true })
  process.on("exit", cleanup)
  try {
    run("git", ["clone", "--quiet", "--depth", "1", "--branch", tag, REPO, dir])
  } catch (e) {
    fail(`cannot clone ${REPO} at ${tag}: ${e.stderr || e.message}`)
  }
  source = dir
}

try {
  const refDir = path.join(source, "skill/reference")
  if (!fs.existsSync(refDir)) fail(`${refDir} not found: not an Impeccable checkout.`)
  const outputs = []
  for (const [dir, files] of Object.entries(EXTRACTS)) {
    for (const [out, parts] of Object.entries(files)) {
      const body = parts.map((part) => extract(fs.readFileSync(path.join(refDir, part.file), "utf8"), part)).join("\n\n")
      const from = parts.map((p) => `skill/reference/${p.file}${p.section ? ` (${p.section.replace(/^#+ /, "")})` : ""}`).join(", ")
      const header = `<!-- Extracted from Impeccable ${tag} (Apache-2.0, https://github.com/pbakaus/impeccable): ${from}.\n     Generated by scripts/update-impeccable.mjs in canovaccio: do not edit by hand. -->`
      outputs.push([path.join(HERE, dir, out), `${header}\n\n${body}\n`])
    }
  }
  for (const dir of Object.keys(EXTRACTS)) {
    fs.mkdirSync(path.join(HERE, dir), { recursive: true })
    fs.copyFileSync(path.join(source, "LICENSE"), path.join(HERE, dir, "LICENSE"))
  }
  for (const [file, content] of outputs) fs.writeFileSync(file, content)
  console.log(`design references: ${outputs.length} files from Impeccable ${tag} written to ${Object.keys(EXTRACTS).join(", ")}`)
} finally {
  cleanup?.()
}

const scriptPath = path.join(HERE, DETECTOR_FILES[0])
const pinned = fs.readFileSync(scriptPath, "utf8").match(/const IMPECCABLE = "([^"]+)"/)?.[1]
let latest
try {
  latest = run("npm", ["view", "impeccable", "version"])
} catch {
  latest = "unknown (npm view failed)"
}
const wanted = detectorOption === "latest" ? latest : detectorOption
if (wanted && wanted !== pinned) {
  if (!/^\d+\.\d+\.\d+$/.test(wanted)) fail(`cannot pin "${wanted}": the latest version on npm is unknown.`)
  for (const rel of [...DETECTOR_FILES, "README.md"]) {
    const file = path.join(HERE, rel)
    const text = fs.readFileSync(file, "utf8")
    const updated = text.replace(/const IMPECCABLE = "[^"]+"/, `const IMPECCABLE = "${wanted}"`).replaceAll(`impeccable@${pinned}`, `impeccable@${wanted}`)
    if (updated !== text) fs.writeFileSync(file, updated)
  }
  console.log(`detector: pinned ${wanted} (was ${pinned}); latest on npm: ${latest}`)
} else {
  console.log(`detector: pinned ${pinned}; latest on npm: ${latest}${latest !== pinned ? " (pin it with --detector latest)" : ""}`)
}
console.log("Review the changes with `git diff` before committing.")
