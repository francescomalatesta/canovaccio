#!/usr/bin/env node
// Runs one project in several checkouts at once: git worktrees, each with a slot
// that shifts its ports and names (see the project-isolation skill).
//
//   node isolation.mjs new <slug> [--base REF] [--branch NAME]
//                          create a worktree next to the main checkout, with the
//                          next free slot, the include files and the setup commands
//   node isolation.mjs list [--json]
//                          checkouts, slots, running environments, active workflows
//   node isolation.mjs env [--slot N|free] [--project NAME] [--write FILE] [--json]
//                          the slot variables of this checkout, or of slot N
//   node isolation.mjs check
//                          whether the project meets the isolation contract
//   node isolation.mjs remove <slug>
//                          stop a worktree's environment (data volumes kept) and
//                          remove the worktree (its branch is kept)
//
// --root DIR: any checkout of the project (default: the current directory).
// Exit codes: 0 ok, 1 errors, 2 the project has no .canovaccio/isolation.json.
// No dependencies: Node 18+.

import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import net from "node:net"
import path from "node:path"

const args = process.argv.slice(2)
const command = args[0]
const option = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const flag = (name) => args.includes(name)
const positional = args[1] && !args[1].startsWith("--") ? args[1] : undefined

const CONFIG = ".canovaccio/isolation.json"
const MAX_SLOT = 9
const RESERVED = new Set(["CANOVACCIO_SLOT", "COMPOSE_PROJECT_NAME"])
const BEGIN = "# >>> canovaccio slot (managed by isolation.mjs: do not edit)"
const END = "# <<< canovaccio slot"
const OVERRIDDEN = "# canovaccio-slot: "
const COMPOSE_FILE = /(^|\/)(docker-)?compose(\.[\w-]+)?\.ya?ml$/
const COMPOSE_DEFAULTS = ["compose.yaml", "compose.yml", "docker-compose.yaml", "docker-compose.yml"]
const LOCKFILES = /(^|\/)(package-lock\.json|npm-shrinkwrap\.json|yarn\.lock|pnpm-lock\.yaml|bun\.lockb?|mix\.lock|Gemfile\.lock|poetry\.lock|uv\.lock|Pipfile\.lock|Cargo\.lock|composer\.lock|go\.sum)$/

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

const run = (cmd, a, cwd) => execFileSync(cmd, a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })
const attempt = (cmd, a, cwd) => {
  try {
    return { ok: true, out: run(cmd, a, cwd) }
  } catch (e) {
    return { ok: false, out: String(e.stdout ?? ""), err: String(e.stderr || e.message).trim() }
  }
}
const git = (cwd, ...a) => run("git", a, cwd)
const real = (p) => {
  try {
    return fs.realpathSync(p)
  } catch {
    return path.resolve(p)
  }
}

const start = path.resolve(option("--root") ?? ".")
const topResult = attempt("git", ["rev-parse", "--show-toplevel"], start)
if (!topResult.ok) fail(`${start} is not inside a git checkout`)
const top = real(topResult.out.trim())

// --- checkouts ---------------------------------------------------------------

function worktrees() {
  const list = []
  let cur
  for (const line of git(top, "worktree", "list", "--porcelain").split("\n")) {
    if (line.startsWith("worktree ")) {
      cur = { path: real(line.slice(9)), branch: null, detached: false, bare: false, prunable: false }
      list.push(cur)
    } else if (!cur) continue
    else if (line.startsWith("branch ")) cur.branch = line.slice(7).replace(/^refs\/heads\//, "")
    else if (line === "detached") cur.detached = true
    else if (line === "bare") cur.bare = true
    else if (line.startsWith("prunable")) cur.prunable = true
  }
  return list.filter((w) => !w.bare)
}

const sanitize = (s) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^[^a-z0-9]+/, "")
const wtRoot = (main) => path.join(path.dirname(main), `${path.basename(main)}.wt`)
const wtName = (w, main) => (w.path === main ? "(main)" : path.basename(w.path))

// --- config ------------------------------------------------------------------

function parseConfig(text, source) {
  let raw
  try {
    raw = JSON.parse(text)
  } catch (e) {
    return { config: null, errors: [`${source}: invalid JSON: ${e.message}`] }
  }
  const config = {
    offset: raw.offset ?? 10,
    activeLimit: raw.activeLimit ?? 3,
    envFile: raw.envFile ?? ".env",
    variables: raw.variables ?? {},
    include: raw.include ?? [],
    setup: raw.setup ?? [],
    pinned: raw.pinned ?? [],
  }
  const errors = []
  const err = (m) => errors.push(`${source}: ${m}`)
  if (!Number.isInteger(config.offset) || config.offset < 1) err("offset must be a positive integer")
  if (!Number.isInteger(config.activeLimit) || config.activeLimit < 1) err("activeLimit must be a positive integer")
  if (typeof config.envFile !== "string" || !config.envFile || path.isAbsolute(config.envFile)) err("envFile must be a path relative to the project root")
  if (typeof config.variables !== "object" || Array.isArray(config.variables)) err("variables must be an object")
  else
    for (const [name, v] of Object.entries(config.variables)) {
      if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) err(`variables.${name}: the name must be UPPER_SNAKE_CASE`)
      if (RESERVED.has(name)) err(`variables.${name}: reserved, the script sets it`)
      const kinds = v && typeof v === "object" ? ["port", "name"].filter((k) => k in v) : []
      if (kinds.length !== 1) err(`variables.${name}: needs exactly one of "port" or "name"`)
      else if (kinds[0] === "port" && !(Number.isInteger(v.port) && v.port > 0 && v.port + config.offset * MAX_SLOT <= 65535))
        err(`variables.${name}: "port" must be an integer that stays below 65536 in slot ${MAX_SLOT}`)
      else if (kinds[0] === "name" && !(typeof v.name === "string" && /^[A-Za-z0-9_.-]+$/.test(v.name)))
        err(`variables.${name}: "name" must be a non-empty string of letters, digits, _ . -`)
    }
  for (const key of ["include", "setup"])
    if (!Array.isArray(config[key]) || config[key].some((x) => typeof x !== "string" || !x)) err(`${key} must be an array of strings`)
  if (config.include.some?.((p) => path.isAbsolute(p) || p.split(/[\\/]/).includes(".."))) err("include paths must stay inside the project")
  if (!Array.isArray(config.pinned) || config.pinned.some((p) => !p || !Number.isInteger(p.port) || typeof p.reason !== "string" || !p.reason))
    err('pinned must be an array of { "port": <integer>, "reason": "<why it cannot vary>" }')
  return { config: errors.length ? null : config, errors }
}

function loadConfig(dir) {
  const file = path.join(dir, CONFIG)
  if (!fs.existsSync(file)) return null
  return parseConfig(fs.readFileSync(file, "utf8"), CONFIG)
}

function requireConfig(dir) {
  const loaded = loadConfig(dir)
  if (!loaded) fail(`${CONFIG} not found: the project is not isolated yet. Run the env-init workflow (/env-init).`, 2)
  if (loaded.errors.length) fail(loaded.errors.join("\n"))
  return loaded.config
}

// --- slots -------------------------------------------------------------------

function slotValues(config, slot, project) {
  const values = { CANOVACCIO_SLOT: String(slot) }
  if (project) values.COMPOSE_PROJECT_NAME = project
  for (const [name, d] of Object.entries(config.variables))
    values[name] = "port" in d ? String(d.port + config.offset * slot) : slot === 0 ? d.name : `${d.name}_${slot}`
  return values
}

const portsOf = (config, values) => Object.keys(config.variables).filter((n) => "port" in config.variables[n]).map((n) => Number(values[n]))

function readBlock(file) {
  if (!fs.existsSync(file)) return null
  const text = fs.readFileSync(file, "utf8")
  const s = text.indexOf(BEGIN)
  if (s === -1) return null
  const e = text.indexOf(END, s)
  if (e === -1) return null
  const vars = {}
  for (const line of text.slice(s + BEGIN.length, e).split("\n")) {
    const m = line.match(/^([A-Z_][A-Z0-9_]*)=(.*)$/)
    if (m) vars[m[1]] = m[2]
  }
  return vars
}

function writeBlock(file, values) {
  let text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
  const s = text.indexOf(BEGIN)
  if (s !== -1) {
    const e = text.indexOf(END, s)
    text = text.slice(0, s) + (e === -1 ? "" : text.slice(e + END.length).replace(/^\r?\n/, ""))
  }
  const keys = new Set(Object.keys(values))
  text = text
    .split("\n")
    .map((line) => {
      const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=/)
      return m && keys.has(m[1]) ? OVERRIDDEN + line : line
    })
    .join("\n")
  if (text && !text.endsWith("\n")) text += "\n"
  const block = [BEGIN, ...Object.entries(values).map(([k, v]) => `${k}=${v}`), END].join("\n") + "\n"
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text + block)
}

function slotOf(w, main, envFile) {
  const block = readBlock(path.join(w.path, envFile))
  if (block && /^\d+$/.test(block.CANOVACCIO_SLOT ?? "")) return Number(block.CANOVACCIO_SLOT)
  return w.path === main ? 0 : null
}

const portFree = (port) =>
  new Promise((resolve) => {
    const server = net.createServer()
    server.once("error", () => resolve(false))
    server.listen({ port, host: "127.0.0.1", exclusive: true }, () => server.close(() => resolve(true)))
  })

async function freeSlot(config, used) {
  const skipped = []
  for (let slot = 1; slot <= MAX_SLOT; slot++) {
    if (used.has(slot)) continue
    const busy = []
    for (const port of portsOf(config, slotValues(config, slot))) if (!(await portFree(port))) busy.push(port)
    if (!busy.length) return { slot, skipped }
    skipped.push(`slot ${slot}: ports in use ${busy.join(", ")}`)
  }
  return { slot: null, skipped }
}

// --- environments and workflows ----------------------------------------------

function composeState(dir) {
  if (!COMPOSE_DEFAULTS.some((f) => fs.existsSync(path.join(dir, f)))) return { label: "none", running: 0 }
  const r = attempt("docker", ["compose", "ps", "--status", "running", "-q"], dir)
  if (!r.ok) return { label: "unknown", running: 0 }
  const n = r.out.split("\n").filter(Boolean).length
  return { label: n ? `running (${n})` : "stopped", running: n }
}

function activeWorkflows(dir) {
  const work = path.join(dir, "docs", "work")
  if (!fs.existsSync(work)) return []
  const out = []
  for (const entry of fs.readdirSync(work, { withFileTypes: true })) {
    const state = path.join(work, entry.name, "state.md")
    if (!entry.isDirectory() || !fs.existsSync(state)) continue
    const m = fs.readFileSync(state, "utf8").match(/^\W*Status:\s*([a-z-]+)/im)
    const status = m ? m[1].toLowerCase() : "unknown"
    if (status !== "closed" && status !== "abandoned") out.push(`${entry.name} (${status})`)
  }
  return out
}

function defaultBase(main) {
  const head = attempt("git", ["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], main)
  if (head.ok) {
    const remote = head.out.trim()
    const local = remote.replace(/^[^/]+\//, "")
    return attempt("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${local}`], main).ok ? local : remote
  }
  return "HEAD"
}

// --- commands ----------------------------------------------------------------

async function cmdList() {
  const wts = worktrees()
  const main = wts[0].path
  const loaded = loadConfig(main) ?? loadConfig(top)
  const config = loaded?.config
  const rows = wts.map((w) => {
    const env = composeState(w.path)
    return {
      name: wtName(w, main),
      path: w.path,
      branch: w.branch ?? (w.detached ? "(detached)" : "?"),
      slot: config ? slotOf(w, main, config.envFile) : null,
      environment: env.label,
      running: env.running,
      workflows: activeWorkflows(w.path),
      current: w.path === top,
    }
  })
  const active = rows.filter((r) => r.running > 0).length
  if (flag("--json")) {
    console.log(JSON.stringify({ isolated: !!config, activeLimit: config?.activeLimit ?? null, activeEnvironments: active, checkouts: rows }, null, 2))
    return
  }
  for (const r of rows) {
    console.log(`${r.current ? "*" : " "} ${r.name}  slot ${r.slot ?? "-"}  ${r.branch}  environment: ${r.environment}`)
    console.log(`    ${r.path}`)
    for (const w of r.workflows) console.log(`    workflow: ${w}`)
  }
  console.log(
    config
      ? `\nenvironments running: ${active} of ${config.activeLimit} allowed`
      : `\nenvironments running: ${active} (the project is not isolated: ${CONFIG} not found${loaded?.errors.length ? " or invalid" : ""})`,
  )
}

async function cmdEnv() {
  const config = requireConfig(top)
  const wts = worktrees()
  const main = wts[0].path
  const requested = option("--slot")
  let values
  if (requested === undefined) {
    const block = readBlock(path.join(top, config.envFile))
    if (block) values = block
    else if (top === main) values = slotValues(config, 0)
    else fail(`${top} has no slot: it was not created by "isolation.mjs new". Write one with --slot free --write ${config.envFile}`)
  } else {
    let slot
    if (requested === "free") {
      const used = new Set(wts.map((w) => slotOf(w, main, config.envFile)).filter((s) => s !== null))
      const found = await freeSlot(config, used)
      if (found.slot === null) fail(`no free slot (1-${MAX_SLOT})${found.skipped.length ? `:\n${found.skipped.join("\n")}` : ""}`)
      slot = found.slot
    } else if (/^\d+$/.test(requested) && Number(requested) <= MAX_SLOT) slot = Number(requested)
    else fail(`--slot must be 0-${MAX_SLOT} or free`)
    values = slotValues(config, slot, option("--project") && sanitize(option("--project")))
  }
  const target = option("--write")
  if (target) writeBlock(path.resolve(top, target), values)
  if (flag("--json")) console.log(JSON.stringify(values, null, 2))
  else for (const [k, v] of Object.entries(values)) console.log(`${k}=${v}`)
}

async function cmdNew() {
  const slug = positional
  if (!slug || !/^[a-z0-9][a-z0-9-]*$/.test(slug)) fail("usage: isolation.mjs new <slug> [--base REF] [--branch NAME]  (slug: lowercase kebab-case)")
  const wts = worktrees()
  const main = wts[0].path
  const branch = option("--branch")
  const branchExists = branch && attempt("git", ["rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], main).ok
  const base = option("--base") ?? (branchExists ? branch : defaultBase(main))

  // The worktree runs the code of its base: its isolation config is the one to use.
  const atBase = attempt("git", ["show", `${base}:${CONFIG}`], main)
  if (!atBase.ok) fail(`${base} has no ${CONFIG}: a worktree of it would not be isolated. Run the env-init workflow (/env-init) and merge it first.`, 2)
  const { config, errors } = parseConfig(atBase.out, `${base}:${CONFIG}`)
  if (errors.length) fail(errors.join("\n"))
  if (attempt("git", ["ls-files", "--error-unmatch", config.envFile], main).ok) fail(`${config.envFile} is tracked by git: the slot cannot be written into it. Run check.`)
  if (!attempt("git", ["check-ignore", "-q", "--no-index", config.envFile], main).ok) fail(`${config.envFile} is not ignored by git: add it to .gitignore first. Run check.`)

  const dir = path.join(wtRoot(main), slug)
  if (fs.existsSync(dir)) fail(`${dir} already exists`)
  const used = new Set(wts.map((w) => slotOf(w, main, config.envFile)).filter((s) => s !== null))
  const { slot, skipped } = await freeSlot(config, used)
  for (const s of skipped) console.log(`skipped ${s}`)
  if (slot === null) fail(`no free slot (1-${MAX_SLOT}): remove a worktree first (isolation.mjs list)`)

  fs.mkdirSync(path.dirname(dir), { recursive: true })
  const add = branch
    ? branchExists
      ? ["worktree", "add", dir, branch]
      : ["worktree", "add", "-b", branch, dir, base]
    : ["worktree", "add", "--detach", dir, base]
  const added = attempt("git", add, main)
  if (!added.ok) fail(`git ${add.join(" ")} failed:\n${added.err}`)

  const copied = []
  const missing = []
  for (const entry of config.include) {
    const src = path.join(main, entry)
    if (!fs.existsSync(src)) {
      missing.push(entry)
      continue
    }
    if (attempt("git", ["ls-files", "--error-unmatch", entry], main).ok) continue
    fs.cpSync(src, path.join(dir, entry), { recursive: true, verbatimSymlinks: true, force: true })
    copied.push(entry)
  }

  const project = sanitize(`${path.basename(main)}-${slug}`)
  const values = slotValues(config, slot, project)
  writeBlock(path.join(dir, config.envFile), values)

  let setupFailed = null
  for (const cmd of config.setup) {
    console.log(`\n$ ${cmd}`)
    const r = spawnSync(cmd, { cwd: dir, shell: true, stdio: "inherit", env: { ...process.env, ...values } })
    if (r.status !== 0) {
      setupFailed = cmd
      break
    }
  }

  console.log(`\nworktree: ${dir}`)
  console.log(`branch:   ${branch ?? `(detached at ${base}: the workflow creates its branch)`}`)
  console.log(`slot:     ${slot}`)
  for (const [k, v] of Object.entries(values)) console.log(`  ${k}=${v}`)
  console.log(`copied:   ${copied.join(", ") || "nothing"}`)
  if (missing.length) console.log(`missing in the main checkout, not copied: ${missing.join(", ")}`)
  if (setupFailed) fail(`setup failed at: ${setupFailed}\nThe worktree is in place: fix the cause and run the remaining setup there.`)
  console.log(`\nOpen a new session in ${dir} to work there.`)
}

async function cmdRemove() {
  const slug = positional
  if (!slug) fail("usage: isolation.mjs remove <slug>")
  const wts = worktrees()
  const main = wts[0].path
  const w = wts.find((x) => x.path !== main && (x.path === real(path.join(wtRoot(main), slug)) || path.basename(x.path) === slug))
  if (!w) fail(`no worktree named ${slug} (isolation.mjs list)`)
  if (w.path === top) fail("this session runs inside that worktree: remove it from another checkout")
  const status = attempt("git", ["status", "--porcelain"], w.path)
  if (!status.ok) fail(`git status failed in ${w.path}:\n${status.err}`)
  if (status.out.trim()) fail(`${w.path} has uncommitted or untracked files; commit or discard them first:\n${status.out}`)

  const envFile = loadConfig(w.path)?.config?.envFile ?? ".env"
  const project = readBlock(path.join(w.path, envFile))?.COMPOSE_PROJECT_NAME
  if (COMPOSE_DEFAULTS.some((f) => fs.existsSync(path.join(w.path, f)))) {
    const down = spawnSync("docker", ["compose", "down", "--remove-orphans"], { cwd: w.path, stdio: "inherit" })
    if (down.status !== 0) fail("docker compose down failed: the worktree is kept, so its environment can still be stopped from there")
  }
  let volumes = []
  if (project) {
    const ls = attempt("docker", ["volume", "ls", "-q", "--filter", `label=com.docker.compose.project=${project}`])
    if (ls.ok) volumes = ls.out.split("\n").filter(Boolean)
  }
  const removed = attempt("git", ["worktree", "remove", w.path], main)
  if (!removed.ok) fail(`git worktree remove failed:\n${removed.err}`)
  try {
    fs.rmdirSync(path.dirname(w.path))
  } catch {}

  console.log(`removed ${w.path}${w.branch ? `; branch ${w.branch} kept` : ""}`)
  if (volumes.length) {
    console.log(`data volumes kept: ${volumes.join(", ")}`)
    console.log(`to delete them (needs approval): docker volume rm ${volumes.join(" ")}`)
  }
}

function listFiles() {
  return git(top, "ls-files", "--cached", "--others", "--exclude-standard")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
}

function checkCompose(file, text, pinned, errors) {
  let section = null
  text.split("\n").forEach((line, i) => {
    const where = `${file}:${i + 1}`
    const code = line.replace(/\s+#.*$/, "")
    if (/^\S/.test(code)) section = code.replace(/:.*$/, "")
    if (!code.trim() || code.trim().startsWith("#") || code.includes("${")) return
    const short = code.match(/^\s*-\s*["']?(?:(?:\d{1,3}(?:\.\d{1,3}){3}|\[[^\]]+\]):)?(\d+)(?:-\d+)?:\d+/)
    const long = code.match(/^\s*published:\s*["']?(\d+)/)
    const port = short?.[1] ?? long?.[1]
    if (port && !pinned.has(Number(port))) errors.push(`${where}: published port ${port} is fixed; use a slot variable ("127.0.0.1:\${VAR:-${port}}:<container port>")`)
    if (/^\s+container_name:/.test(code)) errors.push(`${where}: container_name is fixed: two checkouts cannot both run it; remove it`)
    if (/^\s+external:\s*true/.test(code)) errors.push(`${where}: an external ${section ? section.replace(/s$/, "") : "resource"} is shared between checkouts`)
    if ((section === "volumes" || section === "networks") && /^\s{2,}name:/.test(code))
      errors.push(`${where}: a fixed ${section.slice(0, -1)} name is shared between checkouts; remove it or derive it from \${COMPOSE_PROJECT_NAME}`)
  })
}

async function cmdCheck() {
  const config = requireConfig(top)
  const errors = []
  const warnings = []
  const pinned = new Set(config.pinned.map((p) => p.port))

  if (attempt("git", ["ls-files", "--error-unmatch", config.envFile], top).ok) errors.push(`${config.envFile} is tracked by git: it would carry one checkout's slot to every other; untrack it and keep an example file`)
  else if (!attempt("git", ["check-ignore", "-q", "--no-index", config.envFile], top).ok) errors.push(`${config.envFile} is not ignored by git: add it to .gitignore`)

  const owner = new Map()
  const clashes = new Set()
  for (let slot = 0; slot <= MAX_SLOT; slot++) {
    const values = slotValues(config, slot)
    for (const [name, d] of Object.entries(config.variables)) {
      if (!("port" in d)) continue
      const port = Number(values[name])
      const prev = owner.get(port)
      const pair = prev && [prev.name, name].sort().join(" and ")
      if (prev && prev.name !== name && !clashes.has(pair)) {
        clashes.add(pair)
        errors.push(`${pair} collide: port ${port} is ${prev.name} in slot ${prev.slot} and ${name} in slot ${slot}; choose bases that do not differ by a multiple of ${config.offset} below ${config.offset * (MAX_SLOT + 1)}`)
      } else if (!prev) owner.set(port, { name, slot })
      if (pinned.has(port) && !clashes.has(`pinned ${name}`)) {
        clashes.add(`pinned ${name}`)
        errors.push(`pinned port ${port} is also ${name} in slot ${slot}`)
      }
    }
  }

  const ports = new Set(Object.values(config.variables).filter((d) => "port" in d).map((d) => d.port))
  const names = Object.keys(config.variables)
  const portRe = ports.size ? new RegExp(`(?<![\\w.-])(${[...ports].join("|")})(?![\\w.])`) : null
  const envAccess = new RegExp(`\\$\\{|\\$[A-Z_]|env|ENV|environ|${names.join("|") || "$^"}`)

  for (const file of listFiles()) {
    if (file.startsWith("docs/work/") || file.startsWith(".canovaccio/") || file === "CHANGELOG.md" || LOCKFILES.test(file)) continue
    const abs = path.join(top, file)
    let stat
    try {
      stat = fs.statSync(abs)
    } catch {
      continue
    }
    if (!stat.isFile() || stat.size > 512 * 1024) continue
    const buf = fs.readFileSync(abs)
    if (buf.subarray(0, 8000).includes(0)) continue
    const text = buf.toString("utf8")
    if (COMPOSE_FILE.test(file)) {
      checkCompose(file, text, pinned, errors)
      continue
    }
    if (!portRe || file === config.envFile) continue
    text.split("\n").forEach((line, i) => {
      const m = line.match(portRe)
      if (m && !pinned.has(Number(m[1])) && !envAccess.test(line)) warnings.push(`${file}:${i + 1}: literal ${m[1]}: ${line.trim().slice(0, 120)}`)
    })
  }

  const show = (label, list, max) => {
    if (!list.length) return
    console.log(`${label}:`)
    for (const l of list.slice(0, max)) console.log(`  ${l}`)
    if (list.length > max) console.log(`  ... ${list.length - max} more`)
  }
  show("errors", errors, 200)
  show("warnings (a base port written as a literal: read it from its slot variable, pin it, or ignore it if it is not the dev or test port)", warnings, 100)
  console.log(`\n${Object.keys(config.variables).length} slot variables, ${config.pinned.length} pinned ports: ${errors.length} errors, ${warnings.length} warnings`)
  if (errors.length) process.exit(1)
}

const commands = { new: cmdNew, list: cmdList, env: cmdEnv, check: cmdCheck, remove: cmdRemove }
if (!commands[command]) fail("usage: isolation.mjs <new|list|env|check|remove> [options]  (see the header of this script)")
await commands[command]()
