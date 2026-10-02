#!/usr/bin/env node
// Runs the Impeccable design detector and classifies its findings for canovaccio reviews.
//
//   node design-check.mjs --changed BASE [--advisory minor|exclude] [--json] [--root DIR]
//       UI files changed since BASE (uncommitted included); findings attributed to the change
//   node design-check.mjs --url URL [--url URL...] [--advisory minor|exclude] [--json]
//       rendered pages, at a desktop and a mobile viewport
//   node design-check.mjs --screenshot URL [--screenshot URL...] --out DIR
//       PNG captures for a visual review: the first viewport at desktop and at mobile width
//   node design-check.mjs --check
//       whether the detector, and a browser for --url and --screenshot, can run here
//
// Exit codes: 0 no findings to review (or captures written), 2 findings to review, 1 the check could not run (fully).
// No dependencies: Node 22.18+ (required by the detector, fetched with npx).

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const IMPECCABLE = "4.1.0"
const MIN_NODE = [22, 18]
const VIEWPORTS = { desktop: "1280x800", mobile: "390x844" }
const SCANNABLE = [".html", ".htm", ".css", ".scss", ".sass", ".less", ".jsx", ".tsx", ".js", ".ts", ".vue", ".svelte", ".astro", ".blade.php"]
const SKIP_DIRS = new Set(["node_modules", "dist", "build", "__pycache__"])
// Breakage and accessibility: Important. Every other non-advisory finding: Minor.
const IMPORTANT = new Set([
  "script-error",
  "content-hidden-at-rest",
  "broken-image",
  "low-contrast",
  "gray-on-color",
  "tiny-text",
  "skipped-heading",
  "text-overflow",
  "text-occlusion",
  "clipped-overflow-container",
])

const args = process.argv.slice(2)
const option = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const options = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []))
const root = fs.realpathSync(path.resolve(option("--root") ?? "."))
const changedBase = option("--changed")
const urls = options("--url")
const shots = options("--screenshot")
const outDir = option("--out")
const advisory = option("--advisory") ?? "minor"
const asJson = args.includes("--json")

if (!["minor", "exclude"].includes(advisory)) fail(`--advisory must be "minor" or "exclude", not "${advisory}".`)

function fail(message) {
  console.error(`design-check: ${message}`)
  process.exit(1)
}

function nodeTooOld() {
  const [major, minor] = process.versions.node.split(".").map(Number)
  return major < MIN_NODE[0] || (major === MIN_NODE[0] && minor < MIN_NODE[1])
}

const git = (...a) => {
  const r = spawnSync("git", a, { cwd: root, encoding: "utf8", maxBuffer: 64 << 20 })
  if (r.status !== 0) throw new Error((r.stderr || "").trim() || `git ${a.join(" ")} failed`)
  return r.stdout
}
const lines = (text) => text.split("\n").map((l) => l.trim()).filter(Boolean)

// Temporary directories live inside the project, in .canovaccio/tmp/, never in the system temp directory.
function scratch(prefix) {
  const dir = path.join(root, ".canovaccio", "tmp")
  fs.mkdirSync(dir, { recursive: true })
  const ignore = path.join(dir, ".gitignore")
  if (!fs.existsSync(ignore)) fs.writeFileSync(ignore, "*\n!.gitignore\n")
  return fs.mkdtempSync(path.join(dir, prefix))
}

const scannable = (file) => {
  const lower = file.toLowerCase()
  return SCANNABLE.some((ext) => lower.endsWith(ext)) && !file.split("/").some((part) => SKIP_DIRS.has(part))
}

// Runs `impeccable detect --json`. Returns { findings, error }: error is set when a target could not be scanned.
function detect(targets, extra = [], env = process.env, cwd = root) {
  const r = spawnSync("npx", ["-y", `impeccable@${IMPECCABLE}`, "detect", "--json", ...extra, ...targets], {
    cwd,
    encoding: "utf8",
    env,
    maxBuffer: 256 << 20,
  })
  const stderr = (r.stderr || "").trim()
  if (r.error) return { findings: [], error: `cannot run npx: ${r.error.message}` }
  let findings = []
  try {
    findings = JSON.parse(r.stdout || "[]")
  } catch {
    return { findings: [], error: `detector output is not JSON (exit ${r.status}): ${tail(stderr)}` }
  }
  if (r.status === 0 || r.status === 2) return { findings }
  return { findings, error: `detector exit ${r.status}: ${tail(stderr)}` }
}

const tail = (text) => text.split("\n").filter(Boolean).slice(-3).join(" | ") || "no output"

function playwrightChromium() {
  const dirs = [process.env.PLAYWRIGHT_BROWSERS_PATH, path.join(os.homedir(), ".cache/ms-playwright"), "/opt/pw-browsers"]
  const binaries = ["chrome-linux/chrome", "chrome-linux64/chrome", "chrome-mac/Chromium.app/Contents/MacOS/Chromium"]
  for (const dir of dirs.filter(Boolean)) {
    let entries = []
    try {
      entries = fs.readdirSync(dir).filter((e) => /^chromium-\d+$/.test(e)).sort().reverse()
    } catch {
      continue
    }
    for (const entry of entries) {
      for (const bin of binaries) {
        const candidate = path.join(dir, entry, bin)
        if (fs.existsSync(candidate)) return candidate
      }
    }
  }
}

// A Chromium-based browser for captures: explicit variables first, then the usual names on PATH and the
// usual install locations, then a Playwright Chromium.
function findBrowser() {
  for (const name of ["IMPECCABLE_BROWSER", "PUPPETEER_EXECUTABLE_PATH", "CHROME_PATH"]) {
    if (process.env[name] && fs.existsSync(process.env[name])) return process.env[name]
  }
  const names = ["google-chrome", "google-chrome-stable", "chromium", "chromium-browser", "chrome", "microsoft-edge", "brave-browser"]
  for (const dir of (process.env.PATH ?? "").split(path.delimiter)) {
    for (const name of names) {
      const candidate = path.join(dir, name)
      if (dir && fs.existsSync(candidate)) return candidate
    }
  }
  const apps = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ]
  return apps.find((a) => fs.existsSync(a)) ?? playwrightChromium()
}

const CAPTURES = { desktop: [1280, 800], mobile: [390, 844] }

// An http(s) URL that does not answer would be captured as the browser's error page.
async function unreachable(url) {
  if (!/^https?:\/\//i.test(url)) return null
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    return res.ok ? null : `HTTP ${res.status}`
  } catch (e) {
    return e.cause?.code ?? e.message
  }
}

// Headless Chrome's own --screenshot: a window of the given size, no device emulation.
async function capture() {
  const browser = findBrowser()
  if (!browser) fail("no Chrome, Chromium, Edge or Brave found; set IMPECCABLE_BROWSER to one.")
  fs.mkdirSync(outDir, { recursive: true })
  const errors = []
  for (const [i, url] of shots.entries()) {
    const problem = await unreachable(url)
    if (problem) {
      errors.push(`${url}: not reachable (${problem})`)
      continue
    }
    const slug = url.replace(/^[a-z]+:\/\/[^/]*/i, "").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "index"
    for (const [name, [w, h]] of Object.entries(CAPTURES)) {
      const file = path.resolve(outDir, `${String(i + 1).padStart(2, "0")}-${slug}-${name}.png`)
      const profile = scratch("design-check-profile-")
      const flags = [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-background-networking",
        "--disable-component-update",
        "--disable-extensions",
        "--disable-sync",
        "--no-pings",
      ]
      if (process.getuid?.() === 0) flags.push("--no-sandbox")
      const r = spawnSync(
        browser,
        [...flags, `--user-data-dir=${profile}`, "--virtual-time-budget=3000", `--window-size=${w},${h}`, `--screenshot=${file}`, url],
        { encoding: "utf8", timeout: 60000 },
      )
      fs.rmSync(profile, { recursive: true, force: true })
      if (r.status === 0 && fs.existsSync(file)) console.log(`${path.relative(root, file) || file}  (${url}, ${name} ${w}x${h})`)
      else errors.push(`${url} ${name}: ${r.error?.message ?? tail((r.stderr || "").trim())}`)
    }
  }
  for (const e of errors) console.log(`NOT CAPTURED: ${e}`)
  process.exit(errors.length ? 1 : 0)
}

// Browser scans: as root, Chromium only starts without its sandbox, which the detector adds under CI.
// When the detector finds no browser, retry with a Playwright Chromium if one is installed.
function detectRendered(targets, extra) {
  const env = { ...process.env }
  if (process.getuid?.() === 0 && !env.CI) env.CI = "1"
  let result = detect(targets, extra, env)
  const chromium = !env.IMPECCABLE_BROWSER && result.error?.includes("installation found") && playwrightChromium()
  if (chromium) result = detect(targets, extra, { ...env, IMPECCABLE_BROWSER: chromium })
  return result
}

function gravity(f) {
  if (f.advisory === true || f.severity === "advisory") return advisory === "minor" ? "minor" : "excluded"
  if (f.severity === "error" || IMPORTANT.has(f.antipattern)) return "important"
  return "minor"
}

const clean = (snippet) => (snippet ?? "").replace(/\s+/g, " ").trim()
const relative = (file) => (/^[a-z]+:\/\//i.test(file) ? file : path.relative(root, file) || file)

function finding(f, attribution, viewports) {
  return {
    rule: f.antipattern,
    name: f.name,
    category: f.advisory === true || f.severity === "advisory" ? "advisory" : f.category,
    gravity: gravity(f),
    attribution,
    file: relative(f.file ?? ""),
    line: f.line || 0,
    snippet: clean(f.snippet),
    ...(viewports ? { viewports } : {}),
  }
}

// Line ranges added or changed in the working tree since `base`, per file.
function changedRanges(base, files) {
  const ranges = new Map()
  for (const file of files) {
    const out = git("diff", "-U0", base, "--", file)
    const fileRanges = []
    for (const m of out.matchAll(/^@@ -\S+ \+(\d+)(?:,(\d+))? @@/gm)) {
      const start = Number(m[1])
      const count = m[2] === undefined ? 1 : Number(m[2])
      if (count > 0) fileRanges.push([start, start + count - 1])
    }
    ranges.set(file, fileRanges)
  }
  return ranges
}

// Findings without a line number (static HTML) cannot be placed in the diff: compare them with a scan of
// the base version of the same files, extracted with `git archive` along with the stylesheets they may link
// and the detector config. Returns a Set of `rule\0file\0snippet` keys found at base, or null when it fails.
function baselineKeys(base, files, extra) {
  const tracked = lines(git("ls-tree", "-r", "--name-only", base))
  const context = tracked.filter((f) => /\.(css|scss|sass|less)$/i.test(f) || f === "DESIGN.md" || f.startsWith(".impeccable/config"))
  const wanted = [...new Set([...files.filter((f) => tracked.includes(f)), ...context])]
  if (wanted.length === 0) return new Set()
  const dir = fs.realpathSync(scratch("design-check-base-"))
  try {
    const tar = spawnSync("git", ["archive", "--format=tar", base, "--", ...wanted], { cwd: root, maxBuffer: 512 << 20 })
    if (tar.status !== 0) return null
    const unpack = spawnSync("tar", ["-x", "-C", dir], { input: tar.stdout })
    if (unpack.status !== 0) return null
    const result = detect(files.filter((f) => tracked.includes(f)), extra, process.env, dir)
    if (result.error) return null
    return new Set(result.findings.map((f) => [f.antipattern, path.relative(dir, f.file ?? ""), clean(f.snippet)].join("\0")))
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
}

function checkChanged() {
  let base
  try {
    base = git("merge-base", changedBase, "HEAD").trim()
  } catch (e) {
    fail(`cannot diff against "${changedBase}": ${e.message}`)
  }
  const untracked = lines(git("ls-files", "--others", "--exclude-standard"))
  const changed = [...new Set([...lines(git("diff", "--name-only", "--diff-filter=d", base)), ...untracked])]
  const files = changed.filter((f) => scannable(f) && fs.existsSync(path.join(root, f))).sort()
  const added = new Set([...lines(git("diff", "--name-only", "--diff-filter=A", base)), ...untracked])
  const report = { mode: "changed", base: changedBase, mergeBase: base.slice(0, 12), files: files.length }
  if (files.length === 0) return { ...report, findings: [], errors: [] }

  const ranges = changedRanges(base, files.filter((f) => !added.has(f)))
  const extra = advisory === "exclude" ? ["--no-advisory"] : []
  const findings = []
  const errors = []
  for (let i = 0; i < files.length; i += 100) {
    const result = detect(files.slice(i, i + 100), extra)
    if (result.error) errors.push(result.error)
    for (const f of result.findings) {
      const file = relative(f.file ?? "")
      const line = f.line || 0
      let attribution = "unknown"
      if (added.has(file)) attribution = "introduced"
      else if (line > 0) attribution = (ranges.get(file) ?? []).some(([a, b]) => line >= a && line <= b) ? "introduced" : "pre-existing"
      findings.push(finding(f, attribution))
    }
  }
  const unplaced = findings.filter((f) => f.attribution === "unknown")
  if (unplaced.length) {
    const keys = baselineKeys(base, [...new Set(unplaced.map((f) => f.file))], extra)
    if (keys) {
      for (const f of unplaced) f.attribution = keys.has([f.rule, f.file, f.snippet].join("\0")) ? "pre-existing" : "introduced"
    }
  }
  return { ...report, findings: dedupe(findings), errors }
}

function checkUrls() {
  const extraBase = advisory === "exclude" ? ["--no-advisory"] : []
  const merged = new Map()
  const errors = []
  for (const [name, size] of Object.entries(VIEWPORTS)) {
    const result = detectRendered(urls, [...extraBase, "--viewport", size])
    if (result.error) errors.push(`${name} ${size}: ${result.error}`)
    for (const f of result.findings) {
      const key = [f.antipattern, f.file, f.snippet].join("\0")
      const known = merged.get(key)
      if (!known) merged.set(key, finding(f, "rendered", [name]))
      else if (!known.viewports.includes(name)) known.viewports.push(name)
    }
  }
  return { mode: "url", urls, viewports: VIEWPORTS, findings: [...merged.values()], errors }
}

function dedupe(findings) {
  const seen = new Set()
  return findings.filter((f) => {
    const key = [f.rule, f.file, f.line, f.snippet].join("\0")
    if (seen.has(key)) return false
    seen.add(key)
    return true
  })
}

// Findings an agent has to look at: everything not excluded, except what was already there before the change.
const toReview = (report) => report.findings.filter((f) => f.gravity !== "excluded" && f.attribution !== "pre-existing")

function print(report) {
  const count = (list, g) => list.filter((f) => f.gravity === g).length
  const short = (s) => (s.length > 110 ? `${s.slice(0, 107)}...` : s)
  const where = (f) => (f.line ? `${f.file}:${f.line}` : f.file)
  const row = (f) => `  ${f.rule} [${f.category}] ${where(f)}${f.viewports ? ` (${f.viewports.join(", ")})` : ""} — ${short(f.snippet)}`
  const review = toReview(report)
  const attributed = review.filter((f) => f.attribution !== "unknown")
  const unknown = review.filter((f) => f.attribution === "unknown")

  if (report.mode === "changed") {
    console.log(`design-check (impeccable ${IMPECCABLE}): ${report.files} UI file(s) changed since ${report.base} (${report.mergeBase}), advisory: ${advisory}`)
  } else {
    console.log(`design-check (impeccable ${IMPECCABLE}): ${report.urls.length} URL(s) at desktop ${VIEWPORTS.desktop} and mobile ${VIEWPORTS.mobile}, advisory: ${advisory}`)
  }
  for (const e of report.errors) console.log(`NOT FULLY RUN: ${e}`)
  const label = report.mode === "changed" ? "Introduced" : "Found"
  let summary = `${label}: ${count(attributed, "important")} important, ${count(attributed, "minor")} minor.`
  if (unknown.length) summary += ` Unattributed: ${unknown.length}.`
  const pre = report.findings.filter((f) => f.attribution === "pre-existing" && f.gravity !== "excluded")
  if (report.mode === "changed") summary += ` Pre-existing: ${pre.length} (not findings).`
  console.log(summary)

  for (const g of ["important", "minor"]) {
    const list = attributed.filter((f) => f.gravity === g)
    if (list.length) console.log(`\n${g.toUpperCase()}\n${list.map(row).join("\n")}`)
  }
  if (unknown.length) {
    console.log(`\nUNATTRIBUTED (no line number: check whether the change caused it)`)
    for (const f of unknown) console.log(`  ${f.gravity} ${row(f).trimStart()}`)
  }
  if (pre.length) {
    const byRule = new Map()
    for (const f of pre) byRule.set(f.rule, (byRule.get(f.rule) ?? 0) + 1)
    console.log(`\nPRE-EXISTING (context only): ${[...byRule].map(([r, n]) => `${n} ${r}`).join(", ")}`)
  }
}

function check() {
  console.log(`node ${process.versions.node}: ${nodeTooOld() ? `too old, the detector needs ${MIN_NODE.join(".")}+` : "ok"}`)
  if (nodeTooOld()) process.exit(1)
  const help = spawnSync("npx", ["-y", `impeccable@${IMPECCABLE}`, "detect", "--help"], { cwd: root, encoding: "utf8" })
  if (help.error || help.status !== 0) {
    console.log(`detector (impeccable ${IMPECCABLE}): unavailable — ${help.error?.message ?? tail((help.stderr || "").trim())}`)
    process.exit(1)
  }
  console.log(`detector (impeccable ${IMPECCABLE}): ok`)
  const dir = scratch("design-check-")
  const page = path.join(dir, "probe.html")
  fs.writeFileSync(page, "<!doctype html><html><body><h1>probe</h1></body></html>\n")
  const probe = detectRendered([`file://${page}`], [])
  fs.rmSync(dir, { recursive: true, force: true })
  console.log(`browser for --url scans: ${probe.error ? `unavailable — ${probe.error}` : "ok"}`)
  const browser = findBrowser()
  console.log(`browser for --screenshot: ${browser ?? "unavailable — set IMPECCABLE_BROWSER to a Chromium-based browser"}`)
}

if (args.includes("--check")) {
  check()
  process.exit(0)
}
if (shots.length) {
  if (!outDir) fail("--screenshot needs --out DIR.")
  await capture()
}
if (!changedBase && urls.length === 0) fail("give --changed BASE, --url URL, --screenshot URL or --check (see the header of this script).")
if (changedBase && urls.length) fail("use --changed or --url, not both.")
if (nodeTooOld()) fail(`not run: Node ${process.versions.node}, the detector needs ${MIN_NODE.join(".")}+.`)

const report = changedBase ? checkChanged() : checkUrls()
if (asJson) console.log(JSON.stringify({ impeccable: IMPECCABLE, advisory, ...report }, null, 2))
else print(report)
process.exit(report.errors.length ? 1 : toReview(report).length ? 2 : 0)
