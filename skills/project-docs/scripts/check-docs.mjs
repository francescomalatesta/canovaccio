#!/usr/bin/env node
// Checks a project's system docs (docs/, excluding docs/work/) against its code.
//
//   node check-docs.mjs [--root DIR]            consistency check + coverage report
//   node check-docs.mjs [--root DIR] --changed BASE
//                                               docs impacted by changes since BASE
//
// Exit codes: 0 ok, 1 errors found, 2 the project has no docs/index.md.
// No dependencies: Node 18+.

import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const option = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const root = path.resolve(option("--root") ?? ".")
const changedBase = option("--changed")

const DOCS = "docs"
const WORK = "docs/work/"
const META = new Set(["README.md", "CHANGELOG.md", "AGENTS.md", "CLAUDE.md", "LICENSE", "LICENSE.md"])

const git = (...a) => execFileSync("git", a, { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] })
const isGit = (() => {
  try {
    git("rev-parse", "--is-inside-work-tree")
    return true
  } catch {
    return false
  }
})()
const lines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean)

function listFiles() {
  if (isGit) return lines(git("ls-files", "--cached", "--others", "--exclude-standard"))
  const out = []
  const walk = (dir) => {
    for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
      if (entry.name.startsWith(".") || entry.name === "node_modules") continue
      const rel = dir ? `${dir}/${entry.name}` : entry.name
      entry.isDirectory() ? walk(rel) : out.push(rel)
    }
  }
  walk("")
  return out
}

function globToRegExp(glob) {
  let g = glob.trim().replace(/^\.\//, "")
  if (g.endsWith("/")) g += "**"
  let re = ""
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === "*" && g[i + 1] === "*") {
      if (g[i + 2] === "/") {
        re += "(?:.*/)?"
        i += 2
      } else {
        re += ".*"
        i += 1
      }
    } else if (c === "*") re += "[^/]*"
    else if (c === "?") re += "[^/]"
    else re += c.replace(/[.+^${}()|[\]\\]/g, "\\$&")
  }
  return new RegExp(`^${re}$`)
}

function frontmatter(text) {
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return {}
  const data = {}
  let key
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z_][\w-]*):\s*(.*)$/)
    if (kv) {
      key = kv[1]
      const value = kv[2].trim()
      if (value.startsWith("[")) data[key] = value.replace(/^\[|\]$/g, "").split(",").map(unquote).filter(Boolean)
      else data[key] = value ? unquote(value) : []
      continue
    }
    const item = line.match(/^\s*-\s+(.*)$/)
    if (item && key && Array.isArray(data[key])) data[key].push(unquote(item[1]))
  }
  return data
}
const unquote = (s) => s.trim().replace(/^["']|["']$/g, "")

const files = listFiles()
const fileSet = new Set(files)
if (!fileSet.has(`${DOCS}/index.md`)) {
  console.log("No docs/index.md: this project has no system docs yet.")
  process.exit(2)
}

const docs = files.filter((f) => f.startsWith(`${DOCS}/`) && f.endsWith(".md") && !f.startsWith(WORK))
const covers = new Map() // doc -> RegExp[]
const errors = []
const coverGlobs = new Map()

for (const doc of docs) {
  const text = fs.readFileSync(path.join(root, doc), "utf8")
  const fm = frontmatter(text)
  const globs = Array.isArray(fm.covers) ? fm.covers : fm.covers ? [fm.covers] : []
  if (doc.startsWith(`${DOCS}/components/`) && globs.length === 0) errors.push(`${doc}: missing "covers" in frontmatter`)
  if (globs.length) {
    coverGlobs.set(doc, globs)
    covers.set(doc, globs.map(globToRegExp))
  }
  // Relative links must resolve.
  for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const target = m[1]
    if (/^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith("#")) continue
    const clean = decodeURI(target.split("#")[0])
    const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(doc), clean)).replace(/\/$/, "")
    const exists = fileSet.has(resolved) || files.some((f) => f.startsWith(`${resolved}/`)) || fs.existsSync(path.join(root, resolved))
    if (!exists) errors.push(`${doc}: broken link "${target}"`)
  }
}

// Every covers glob must match at least one existing file.
for (const [doc, regexps] of covers) {
  regexps.forEach((re, i) => {
    if (!files.some((f) => re.test(f))) errors.push(`${doc}: covers "${coverGlobs.get(doc)[i]}" matches no file`)
  })
}

// Every system doc must be reachable from the index.
const index = fs.readFileSync(path.join(root, DOCS, "index.md"), "utf8")
const linked = new Set(
  [...index.matchAll(/\]\(([^)\s#]+)/g)].map((m) => path.posix.normalize(path.posix.join(DOCS, decodeURI(m[1])))),
)
for (const doc of docs) if (doc !== `${DOCS}/index.md` && !linked.has(doc)) errors.push(`${doc}: not linked from docs/index.md`)

// Files that no doc is expected to cover.
const ignoreFile = path.join(root, DOCS, ".docsignore")
const ignores = fs.existsSync(ignoreFile)
  ? lines(fs.readFileSync(ignoreFile, "utf8")).filter((l) => !l.startsWith("#")).map(globToRegExp)
  : []
const relevant = (f) =>
  !f.startsWith(`${DOCS}/`) && !f.split("/").some((p) => p.startsWith(".")) && !META.has(f) && !ignores.some((re) => re.test(f))
const coveredBy = (f) => [...covers].filter(([, res]) => res.some((re) => re.test(f))).map(([doc]) => doc)

function groupByDir(list) {
  const groups = new Map()
  for (const f of list) {
    const dir = path.posix.dirname(f)
    groups.set(dir, (groups.get(dir) ?? 0) + 1)
  }
  return [...groups].sort(([a], [b]) => a.localeCompare(b)).map(([dir, n]) => `  ${dir === "." ? "(root)" : `${dir}/`} (${n} file${n > 1 ? "s" : ""})`)
}

if (changedBase) {
  let changed
  try {
    changed = [...new Set([...lines(git("diff", "--name-only", changedBase)), ...lines(git("ls-files", "--others", "--exclude-standard"))])]
  } catch {
    console.error(`Cannot diff against "${changedBase}".`)
    process.exit(1)
  }
  const impacted = new Map()
  const uncovered = []
  for (const f of changed.filter(relevant)) {
    const owners = coveredBy(f)
    if (!owners.length) uncovered.push(f)
    for (const doc of owners) impacted.set(doc, [...(impacted.get(doc) ?? []), f])
  }
  console.log(`Changes since ${changedBase}: ${changed.length} file(s)\n`)
  console.log("Impacted docs:")
  if (!impacted.size) console.log("  (none)")
  for (const [doc, fs_] of [...impacted].sort()) console.log(`  ${doc}\n${fs_.map((f) => `    - ${f}`).join("\n")}`)
  console.log("\nChanged files covered by no doc:")
  console.log(uncovered.length ? groupByDir(uncovered).join("\n") : "  (none)")
  const docsChanged = changed.filter((f) => docs.includes(f))
  console.log("\nDocs already changed:")
  console.log(docsChanged.length ? docsChanged.map((f) => `  ${f}`).join("\n") : "  (none)")
} else {
  const uncovered = files.filter(relevant).filter((f) => !coveredBy(f).length)
  console.log(`System docs: ${docs.length} file(s), ${covers.size} with covers.`)
  console.log("\nFiles covered by no doc (informational):")
  console.log(uncovered.length ? groupByDir(uncovered).join("\n") : "  (none)")
}

if (errors.length) {
  console.log(`\nErrors:\n${errors.map((e) => `  ${e}`).join("\n")}`)
  process.exit(1)
}
console.log("\nNo errors.")
