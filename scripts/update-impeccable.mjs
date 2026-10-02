#!/usr/bin/env node
// Maintenance script for canovaccio itself (not installed in projects): refreshes what canovaccio takes
// from Impeccable (https://github.com/pbakaus/impeccable).
//
//   node scripts/update-impeccable.mjs [--tag skill-vX.Y.Z | --source DIR] [--detector latest|X.Y.Z]
//
// - Regenerates skills/design-craft/reference/ from the sections of Impeccable's skill listed in EXTRACTS,
//   from a release tag (default: the latest skill-v* tag) or a local checkout, and copies its LICENSE.
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
const OUT = path.join(HERE, "skills/design-craft/reference")
const DETECTOR_FILES = ["skills/design-check/scripts/design-check.mjs", "skills/design-check/SKILL.md"]

// Output file → parts of Impeccable's skill/reference/, whole or by section heading.
const EXTRACTS = [
  { out: "craft-floor.md", parts: [{ file: "craft-floor.md" }] },
  { out: "visual-world.md", parts: [{ file: "new-work.md", section: "## 4. Commit the world", heading: "# Commit the world" }] },
  {
    out: "operate.md",
    parts: [{ file: "operate.md" }, { file: "mode-operate.md", section: "## Directions", heading: "## Directions" }],
  },
  {
    out: "persuade.md",
    parts: [
      { file: "mode-persuade.md", section: "## Directions", heading: "# Persuade and Experience" },
      { file: "mode-persuade.md", section: "## Comps", heading: "## The page" },
    ],
  },
  { out: "read.md", parts: [{ file: "mode-read.md", section: "## Directions", heading: "# Read" }] },
]

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

// The section starting at `heading`, up to the next heading of the same or a higher level.
function section(text, heading, file) {
  const lines = text.split("\n")
  const start = lines.findIndex((l) => l.trim() === heading)
  if (start === -1) fail(`"${heading}" not found in ${file}: the upstream file changed, update EXTRACTS.`)
  const level = heading.match(/^#+/)[0].length
  let end = lines.length
  for (let i = start + 1; i < lines.length; i++) {
    const m = lines[i].match(/^(#+) /)
    if (m && m[1].length <= level) {
      end = i
      break
    }
  }
  return lines.slice(start + 1, end).join("\n")
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
  const outputs = EXTRACTS.map(({ out, parts }) => {
    const body = parts
      .map(({ file, section: name, heading }) => {
        const text = fs.readFileSync(path.join(refDir, file), "utf8")
        return adapt(name ? `${heading}\n\n${section(text, name, file)}` : text, file)
      })
      .join("\n\n")
    const from = parts.map((p) => `skill/reference/${p.file}${p.section ? ` (${p.section.replace(/^#+ /, "")})` : ""}`).join(", ")
    const header = `<!-- Extracted from Impeccable ${tag} (Apache-2.0, https://github.com/pbakaus/impeccable): ${from}.\n     Generated by scripts/update-impeccable.mjs in canovaccio: do not edit by hand. -->`
    return [out, `${header}\n\n${body}\n`]
  })
  fs.mkdirSync(OUT, { recursive: true })
  for (const [out, content] of outputs) fs.writeFileSync(path.join(OUT, out), content)
  fs.copyFileSync(path.join(source, "LICENSE"), path.join(OUT, "LICENSE"))
  console.log(`design guidance: ${outputs.length} files from Impeccable ${tag} written to ${path.relative(HERE, OUT)}/`)
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
