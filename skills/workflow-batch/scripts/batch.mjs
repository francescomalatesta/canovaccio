#!/usr/bin/env node
// Runs a planned batch of stories unattended, one fresh opencode session per
// story, and decides when each story is green (see the workflow-batch skill).
//
//   node batch.mjs check <batch-dir>      validate batch.json and the story work directories
//   node batch.mjs status <batch-dir> [--json]
//                                         where the batch is, story by story
//   node batch.mjs run <batch-dir>        run the queue, resuming where it stopped
//   node batch.mjs stop <batch-dir>       stop a running runner
//   node batch.mjs restack <batch-dir>    stacked branches that no longer contain their parent
//   node batch.mjs verify <story-dir> <command>...
//                                         run a story's final verification and record it
//
// <batch-dir> is the batch's work directory, which holds batch.json; session and
// green logs go to its logs/ directory. <story-dir> is a story's work directory:
// verify runs each command from the project root, writes their output to
// verification.log there and appends the record to the Verification section of
// its state.md, in the one format the verification green condition reads.
// Exit codes: 0 ok, 1 errors, a failed verification or a batch that stopped
// before the end, 2 usage.
//
// Costs: after each session the runner reads, through `opencode api` (the client
// of opencode's background service, which finds it and authenticates), the cost
// of the session and of every session under it, its subagents and theirs:
// opencode records on each session only its own cost. When that fails, the cost
// comes from the step events of the session's log, which miss the subagents and
// may miss the last step, and is marked partial.
//
// Environment: CANOVACCIO_OPENCODE (default: opencode), CANOVACCIO_GH (default:
// gh), CANOVACCIO_BATCH_POLL_SECONDS (CI polling interval, default: 30).
// No dependencies: Node 18+.

import { spawn, spawnSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const args = process.argv.slice(2)
const [command, dirArg] = args
const flag = (name) => args.includes(name)

const OPENCODE = process.env.CANOVACCIO_OPENCODE || "opencode"
const GH = process.env.CANOVACCIO_GH || "gh"
const POLL_MS = Number(process.env.CANOVACCIO_BATCH_POLL_SECONDS || 30) * 1000
const PREFIX = "[canovaccio batch]"
const GREEN_TYPES = new Set(["closure", "verification", "command", "ci"])
const ID = /^[a-z0-9][a-z0-9-]*$/
const SCRIPT = fileURLToPath(import.meta.url)
// A final verification recorded by `batch.mjs verify`:
//   - <40-hex commit> — `make test` exit 0; `make lint` exit 0 (recorded by batch.mjs verify)
const RECORD_TAG = "(recorded by batch.mjs verify)"
const RECORD = /^- ([0-9a-f]{40}) — (.+) \(recorded by batch\.mjs verify\)$/
// Commits after the recorded one may change only workflow artifacts: they need
// no new run of the suites (see Test scope and final verification in workflow-rules).
const ARTIFACTS = /^docs\/work\//
// The marked part of a pull request body that the runner owns; the rest is kept.
const PR_START = (batchName) => `<!-- canovaccio batch ${batchName} -->`
const PR_END = "<!-- /canovaccio batch -->"

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

const now = () => new Date().toISOString()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function sh(cmd, a, cwd, timeout) {
  const r = spawnSync(cmd, a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, timeout })
  return { ok: r.status === 0, code: r.status, out: r.stdout || "", err: (r.stderr || r.error?.message || "").trim() }
}

function git(root, ...a) {
  const r = sh("git", a, root)
  if (!r.ok) throw new Error(`git ${a.join(" ")} failed: ${r.err}`)
  return r.out.trim()
}

const refExists = (root, ref) => sh("git", ["rev-parse", "--verify", "--quiet", ref], root).ok
const resolveCommit = (root, rev) => {
  const r = sh("git", ["rev-parse", "--verify", "--quiet", `${rev}^{commit}`], root)
  return r.ok ? r.out.trim() : undefined
}

// Runs a command asynchronously, so a stop signal can interrupt it. Output goes
// to `logFile` when given, otherwise it is collected and returned.
let current = null
let stopping = false
function runAsync(cmd, a, { cwd, logFile, timeoutMs }) {
  return new Promise((resolve) => {
    let out = ""
    const fd = logFile ? fs.openSync(logFile, "a") : null
    let child
    try {
      child = spawn(cmd, a, { cwd, stdio: ["ignore", fd ?? "pipe", fd ?? "pipe"] })
    } catch (e) {
      if (fd !== null) fs.closeSync(fd)
      return resolve({ code: 127, out: String(e.message), timedOut: false })
    }
    current = child
    let done = false
    let timedOut = false
    const timer = timeoutMs ? setTimeout(() => ((timedOut = true), child.kill("SIGTERM")), timeoutMs) : null
    const finish = (code) => {
      if (done) return
      done = true
      if (timer) clearTimeout(timer)
      if (fd !== null) fs.closeSync(fd)
      current = null
      resolve({ code, out, timedOut })
    }
    if (!fd) {
      child.stdout.on("data", (d) => (out += d))
      child.stderr.on("data", (d) => (out += d))
    }
    child.on("error", (e) => {
      out += String(e.message)
      if (fd !== null) fs.writeSync(fd, `${e.message}\n`)
      finish(127)
    })
    child.on("close", (code, signal) => finish(code ?? (signal ? 143 : 1)))
  })
}

// --- batch file ---------------------------------------------------------

function locate(dir) {
  if (!dir) fail("usage: batch.mjs <check|status|run|stop|restack> <batch-dir> [--json]", 2)
  const batchDir = path.resolve(dir)
  const file = path.join(batchDir, "batch.json")
  if (!fs.existsSync(file)) fail(`no batch.json in ${batchDir}`)
  const top = sh("git", ["rev-parse", "--show-toplevel"], batchDir)
  if (!top.ok) fail(`${batchDir} is not inside a git repository`)
  const root = fs.realpathSync(top.out.trim())
  return { root, batchDir: fs.realpathSync(batchDir), file, logs: path.join(batchDir, "logs") }
}

function load(ctx) {
  try {
    return JSON.parse(fs.readFileSync(ctx.file, "utf8"))
  } catch (e) {
    fail(`cannot read ${ctx.file}: ${e.message}`)
  }
}

function save(ctx, batch) {
  const tmp = `${ctx.file}.tmp`
  fs.writeFileSync(tmp, `${JSON.stringify(batch, null, 2)}\n`)
  fs.renameSync(tmp, ctx.file)
}

const rel = (ctx, p) => path.relative(ctx.root, p) || "."
const branchOf = (batch, story) => (batch.branches === "single" ? batch.branch : story.branch)
const parentOf = (batch, i) =>
  batch.branches === "single" || i === 0 ? batch.base : batch.stories[i - 1].branch
const greenOf = (batch, story) => story.green || batch.green

function validateGreen(green, where, batch, errors) {
  if (!Array.isArray(green) || green.length === 0) return errors.push(`${where}: green must be a non-empty list`)
  const types = green.map((g) => g?.type)
  for (const g of green) {
    if (!GREEN_TYPES.has(g?.type)) errors.push(`${where}: unknown green condition ${JSON.stringify(g)}`)
    if (g?.type === "command" && (typeof g.run !== "string" || !g.run.trim()))
      errors.push(`${where}: a command condition needs "run"`)
    if (g?.type === "ci" && !batch.remote) errors.push(`${where}: the ci condition needs a remote`)
  }
  if (!types.includes("closure")) errors.push(`${where}: green must include closure: the closure review is always required`)
}

function validate(ctx, batch) {
  const errors = []
  const root = ctx.root
  if (batch.version !== 1) errors.push("version must be 1")
  if (!batch.title) errors.push("title is required")
  if (!batch.base) errors.push("base is required")
  else if (!resolveCommit(root, batch.base)) errors.push(`base ${batch.base} is not a commit of this repository`)
  if (!["single", "stacked"].includes(batch.branches)) errors.push('branches must be "single" or "stacked"')
  if (batch.branches === "single" && !batch.branch) errors.push('branch is required with "single" branches')
  if (!Number.isInteger(batch.attempts) || batch.attempts < 0) errors.push("attempts must be an integer >= 0")
  if (batch.remote) {
    if (!sh("git", ["remote", "get-url", batch.remote], root).ok) errors.push(`remote ${batch.remote} is not configured`)
    if (!sh(GH, ["--version"], root).ok) errors.push(`${GH} is needed to open pull requests on ${batch.remote}`)
  }
  if (batch.pr != null) {
    if (batch.branches !== "single") errors.push('pr needs "single" branches: the batch adds its stories to that one pull request')
    else if (!batch.remote) errors.push("pr needs a remote")
    else if (batch.status !== "done")
      try {
        findPullRequest(ctx, batch, batch.branch)
      } catch (e) {
        errors.push(`pr: ${e.message}`)
      }
  }
  validateGreen(batch.green, "batch", batch, errors)
  if (!Array.isArray(batch.stories) || batch.stories.length === 0) errors.push("stories must be a non-empty list")
  const ids = new Set()
  const branches = new Set()
  for (const [i, s] of (batch.stories || []).entries()) {
    const where = `story ${i + 1}${s?.id ? ` (${s.id})` : ""}`
    if (!ID.test(s?.id || "")) errors.push(`${where}: id must be kebab-case`)
    else if (ids.has(s.id)) errors.push(`${where}: duplicate id`)
    ids.add(s?.id)
    if (!s?.title) errors.push(`${where}: title is required`)
    if (batch.branches === "stacked") {
      if (!s?.branch) errors.push(`${where}: branch is required with "stacked" branches`)
      else if (branches.has(s.branch)) errors.push(`${where}: duplicate branch ${s.branch}`)
      branches.add(s?.branch)
    } else if (s?.branch && s.branch !== batch.branch) {
      errors.push(`${where}: with "single" branches every story is on ${batch.branch}`)
    }
    if (s?.green) validateGreen(s.green, where, batch, errors)
    if (!s?.workDir) {
      errors.push(`${where}: workDir is required`)
      continue
    }
    const dir = path.join(root, s.workDir)
    for (const f of ["state.md", "spec.md", "plan.md"])
      if (!fs.existsSync(path.join(dir, f))) errors.push(`${where}: ${s.workDir}/${f} is missing`)
    const state = readState(root, s)
    if (fs.existsSync(path.join(dir, "state.md")) && state.delivery !== "unattended")
      errors.push(`${where}: ${s.workDir}/state.md must say "Delivery: unattended"`)
  }
  return errors
}

// --- story state ----------------------------------------------------------

// A record line written by `batch.mjs verify`, or undefined for any other line.
function parseRecord(line) {
  const m = line.trimEnd().match(RECORD)
  if (!m || !/^`[^`\n]+` exit \d+(; `[^`\n]+` exit \d+)*$/.test(m[2])) return undefined
  const commands = [...m[2].matchAll(/`([^`\n]+)` exit (\d+)/g)].map((p) => ({ run: p[1], exit: Number(p[2]) }))
  return { commit: m[1], commands, line: line.trimEnd() }
}

function readState(root, story) {
  const file = path.join(root, story.workDir || "", "state.md")
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
  const field = (name) => (text.match(new RegExp(`^- ${name}:[ \\t]*([^\\s<]+)`, "m")) || [])[1]
  // Records are the lines `batch.mjs verify` wrote; other lines of the section
  // (notes, hand-written runs) are kept for the messages but never decide green.
  const records = []
  const lines = []
  const section = text.split(/^## /m).find((s) => /^Verification\b/.test(s))
  if (section)
    for (const line of section.split("\n").slice(1)) {
      if (!line.trim()) continue
      lines.push(line.trimEnd())
      const record = parseRecord(line)
      if (record) records.push(record)
    }
  const hash = crypto.createHash("sha1").update(text).digest("hex")
  return { status: field("Status"), closure: field("Closure"), delivery: field("Delivery"), records, lines, hash }
}

// --- verify -----------------------------------------------------------------

// The changes of the working tree that are not in HEAD: tracked files changed,
// and untracked files that are not ignored. Untracked workflow artifacts never
// count: the specs of the stories still queued stay uncommitted until their own
// closure. With `artifacts: false`, changes to workflow artifacts do not count
// at all.
function uncommitted(root, { artifacts = true } = {}) {
  const r = sh("git", ["status", "--porcelain", "--untracked-files=all"], root)
  if (!r.ok) throw new Error(`git status failed: ${r.err}`)
  return r.out
    .split("\n")
    .filter(Boolean)
    .filter((l) => {
      const artifact = ARTIFACTS.test(l.slice(3).replace(/^"/, ""))
      return !(artifact && (!artifacts || l.startsWith("??")))
    })
}

// Appends a line at the end of the Verification section of state.md, creating
// the section when it is missing.
function appendToVerification(file, line) {
  const text = fs.readFileSync(file, "utf8")
  const lines = text.split("\n")
  const start = lines.findIndex((l) => /^## Verification\b/.test(l))
  if (start === -1) {
    fs.writeFileSync(file, `${text.replace(/\n*$/, "\n")}\n## Verification\n${line}\n`)
    return
  }
  let end = lines.findIndex((l, i) => i > start && /^## /.test(l))
  if (end === -1) end = lines.length
  let at = end
  while (at > start + 1 && !lines[at - 1].trim()) at--
  lines.splice(at, 0, line)
  fs.writeFileSync(file, lines.join("\n"))
}

function verify(storyDir, commands) {
  if (!storyDir || !commands.length)
    fail('usage: batch.mjs verify <story-dir> "<command>" ["<command>"...]', 2)
  const dir = path.resolve(storyDir)
  const stateFile = path.join(dir, "state.md")
  if (!fs.existsSync(stateFile)) fail(`no state.md in ${dir}`)
  const top = sh("git", ["rev-parse", "--show-toplevel"], dir)
  if (!top.ok) fail(`${dir} is not inside a git repository`)
  const root = top.out.trim()
  for (const c of commands)
    if (!c.trim() || /[`\n]/.test(c)) fail(`a command must be one line without backticks: ${JSON.stringify(c)}`, 2)
  const dirty = uncommitted(root, { artifacts: false })
  if (dirty.length)
    fail(`commit the work first: the final verification is recorded on a commit, and these changes are not in HEAD:\n${dirty.join("\n")}`)
  const head = git(root, "rev-parse", "HEAD")
  const logFile = path.join(dir, "verification.log")
  fs.writeFileSync(logFile, `final verification on ${head}, ${now()}\n`)
  const results = []
  for (const run of commands) {
    fs.appendFileSync(logFile, `\n$ ${run}\n`)
    const fd = fs.openSync(logFile, "a")
    const r = spawnSync("sh", ["-c", run], { cwd: root, stdio: ["ignore", fd, fd] })
    fs.closeSync(fd)
    const exit = r.status ?? (r.signal ? 143 : 127)
    fs.appendFileSync(logFile, `exit ${exit}\n`)
    results.push({ run, exit })
    console.log(`\`${run}\` exit ${exit}`)
  }
  if (git(root, "rev-parse", "HEAD") !== head || uncommitted(root, { artifacts: false }).length)
    fail(`the verification changed the working tree or HEAD, so it was not recorded: commit or revert what it changed and run it again`)
  const record = `- ${head} — ${results.map((r) => `\`${r.run}\` exit ${r.exit}`).join("; ")} ${RECORD_TAG}`
  appendToVerification(stateFile, record)
  console.log(`recorded in ${path.relative(root, stateFile)}; output in ${path.relative(root, logFile)}`)
  const failed = results.filter((r) => r.exit !== 0)
  if (failed.length) {
    console.log(`failed: ${failed.map((r) => `\`${r.run}\``).join(", ")}; the tail of the output:`)
    const tail = fs.readFileSync(logFile, "utf8").split("\n").slice(-60).join("\n")
    console.log(tail)
    return 1
  }
  return 0
}

function alive(pid) {
  if (!pid) return false
  try {
    process.kill(pid, 0)
    return true
  } catch (e) {
    return e.code === "EPERM"
  }
}

// --- sessions -----------------------------------------------------------

function costOf(logFile) {
  let cost = 0
  for (const line of fs.readFileSync(logFile, "utf8").split("\n")) {
    if (!line.startsWith("{")) continue
    try {
      const event = JSON.parse(line)
      if (event.type === "step_finish" && typeof event.part?.cost === "number") cost += event.part.cost
    } catch {
      // not an event line
    }
  }
  return cost
}

// The id of the session a log belongs to: the first event that names one. Only
// the start of the log is read, so status can call it while the session writes.
function sessionIdOf(logFile) {
  let text
  try {
    const fd = fs.openSync(logFile, "r")
    const buf = Buffer.alloc(256 * 1024)
    const n = fs.readSync(fd, buf, 0, buf.length, 0)
    fs.closeSync(fd)
    text = buf.toString("utf8", 0, n)
  } catch {
    return undefined
  }
  for (const line of text.split("\n")) {
    if (!line.startsWith("{")) continue
    try {
      const id = JSON.parse(line).sessionID
      if (typeof id === "string" && id) return id
    } catch {
      // not an event line, or cut at the end of what was read
    }
  }
  return undefined
}

function opencodeApi(root, p) {
  const r = sh(OPENCODE, ["api", "get", p], root, 60_000)
  if (!r.ok) throw new Error(`${OPENCODE} api get ${p} failed: ${r.err || `exit ${r.code}`}`)
  try {
    return JSON.parse(r.out)
  } catch {
    throw new Error(`unreadable output of ${OPENCODE} api get ${p}`)
  }
}

const payload = (json) => (json && typeof json === "object" && "data" in json ? json.data : json)

function costValue(session, id) {
  const cost = Number(session?.cost)
  if (session?.cost == null || !Number.isFinite(cost)) throw new Error(`opencode reports no cost for session ${id}`)
  return cost
}

// The cost of a session and of every session under it: opencode records on each
// session only its own cost, and a subagent is a child session of the session
// that dispatched it.
function treeCost(root, sessionID) {
  let cost = costValue(payload(opencodeApi(root, `/api/session/${encodeURIComponent(sessionID)}`)), sessionID)
  let sessions = 1
  const seen = new Set([sessionID])
  const queue = [sessionID]
  while (queue.length) {
    const parent = queue.shift()
    const cursors = new Set()
    let cursor
    do {
      const query = new URLSearchParams({ parentID: parent })
      if (cursor) query.set("cursor", cursor)
      const page = opencodeApi(root, `/api/session?${query}`)
      const children = payload(page)
      if (!Array.isArray(children)) throw new Error(`unreadable list of the sessions under ${parent}`)
      for (const child of children) {
        if (!child?.id || seen.has(child.id)) continue
        seen.add(child.id)
        queue.push(child.id)
        cost += costValue(child, child.id)
        sessions++
      }
      cursor = page?.cursor?.next
      if (cursor && cursors.has(cursor)) break
      if (cursor) cursors.add(cursor)
    } while (cursor)
  }
  return { cost, sessions }
}

async function session(ctx, batch, name, title, prompt) {
  fs.mkdirSync(ctx.logs, { recursive: true })
  const logFile = path.join(ctx.logs, `${name}.jsonl`)
  fs.writeFileSync(logFile, "")
  const a = ["run", "--agent", batch.agent || "conductor", "--title", title, "--format", "json"]
  if (batch.model) a.push("--model", batch.model)
  a.push(prompt)
  console.log(`[${now()}] session ${name}`)
  batch.session = { name, log: rel(ctx, logFile), startedAt: now() }
  save(ctx, batch)
  const r = await runAsync(OPENCODE, a, { cwd: ctx.root, logFile })
  delete batch.session
  const id = sessionIdOf(logFile)
  let cost
  let counted
  let partial
  try {
    if (!id) throw new Error("its log names no session")
    const tree = treeCost(ctx.root, id)
    cost = tree.cost
    counted = `${tree.sessions} session(s), with its subagents`
  } catch (e) {
    cost = costOf(logFile)
    partial = e.message
    counted = `partial, from its log only: ${partial}`
  }
  console.log(`[${now()}] session ${name} ended: exit ${r.code}${id ? `, ${id}` : ""}, cost ${cost.toFixed(4)} (${counted})`)
  return { name, id, code: r.code, cost, partial, log: rel(ctx, logFile) }
}

function storyPrompt(ctx, batch, i, { idle = 0 } = {}) {
  const story = batch.stories[i]
  const lines = [
    `${PREFIX} Unattended session for story ${i + 1} of ${batch.stories.length}, "${story.title}", of the batch in ${rel(ctx, ctx.batchDir)}.`,
    `Resume the workflow in ${story.workDir} as Unattended delivery in workflow-rules describes: nobody answers questions or permission requests in this session.`,
    `The branch ${branchOf(batch, story)} is checked out: do not change branch, push or open pull requests. The story starts at commit ${story.startCommit}: it is the base of the story's closure review.`,
    `Record the final verification with \`node ${SCRIPT} verify ${story.workDir} "<command>" ["<command>"...]\`, one argument per command of the project's full verification, after committing the work: it runs them and writes the only record the runner reads. Do not write or edit that record by hand.`,
  ]
  if (story.failure)
    lines.push(
      `The green conditions failed on ${story.failure.commit.slice(0, 12)} (fix session ${story.attempts || 0} of ${batch.attempts}): ${story.failure.summary}. Their output is in ${story.failure.log}. Fix it as Unattended delivery describes.`,
    )
  if (idle)
    lines.push(
      "The previous session of this story changed nothing the runner looks at (HEAD, its state.md, the working tree). If the work cannot go on, set the story to blocked with the reason in Notes.",
    )
  return lines.join("\n")
}

// --- green ----------------------------------------------------------------

function ghJson(root, a) {
  const r = sh(GH, a, root)
  if (!r.ok) return { error: r.err || `exit ${r.code}` }
  try {
    return { value: JSON.parse(r.out) }
  } catch {
    return { error: `unreadable output of ${GH} ${a.join(" ")}` }
  }
}

function prTitle(batch, story) {
  return batch.branches === "single" ? batch.title : story.title
}

// Tracker items: a GitHub issue number closes with the merge, anything else is linked.
function links(stories) {
  const items = stories.filter((s) => s.item)
  if (!items.length) return []
  return ["", ...items.map((s) => (/^#\d+$/.test(s.item) ? `Closes ${s.item}` : `Tracker item: ${s.item}`))]
}

function prSection(ctx, batch, i) {
  const name = path.basename(ctx.batchDir)
  let lines
  if (batch.branches === "stacked") {
    const parent = parentOf(batch, i)
    lines = [
      `Story ${i + 1} of ${batch.stories.length} of the batch "${batch.title}", built on \`${parent}\`.`,
      "",
      "Review and merge the stacked pull requests in order. The story's spec and decisions are in its work directory.",
      ...links([batch.stories[i]]),
    ]
  } else {
    lines = [`The stories of the batch "${batch.title}", in order:`, ""]
    for (const s of batch.stories) lines.push(`- [${s.status === "green" ? "x" : " "}] ${s.title}`)
    lines.push("", "Each story's spec and decisions are in its work directory.", ...links(batch.stories))
  }
  return [PR_START(name), ...lines, "", "Implemented unattended by the canovaccio batch workflow.", PR_END].join("\n")
}

// The body with the batch's section replaced, or appended when it has none:
// what others wrote in the body, and the sections of other batches, stay.
function mergeBody(body, section, name) {
  const start = body.indexOf(PR_START(name))
  if (start !== -1) {
    const end = body.indexOf(PR_END, start)
    if (end !== -1) return body.slice(0, start) + section + body.slice(end + PR_END.length)
  }
  return body.trim() ? `${body.trimEnd()}\n\n${section}` : section
}

// The open pull request of a branch: with "single" branches and `pr`, the one
// batch.json names; otherwise the open one whose head is the branch, if any.
function findPullRequest(ctx, batch, branch) {
  if (batch.branches === "single" && batch.pr) {
    const view = ghJson(ctx.root, ["pr", "view", String(batch.pr), "--json", "number,url,state,headRefName,body"])
    if (view.error) throw new Error(`cannot read pull request ${batch.pr}: ${view.error}`)
    if (view.value.state !== "OPEN") throw new Error(`pull request ${view.value.url} is ${view.value.state.toLowerCase()}, not open`)
    if (view.value.headRefName !== branch) throw new Error(`pull request ${view.value.url} is on ${view.value.headRefName}, not on ${branch}`)
    return view.value
  }
  const list = ghJson(ctx.root, ["pr", "list", "--head", branch, "--state", "open", "--json", "number,url"])
  if (list.error) throw new Error(`cannot list the pull requests of ${branch}: ${list.error}`)
  if (!list.value.length) return undefined
  const view = ghJson(ctx.root, ["pr", "view", String(list.value[0].number), "--json", "number,url,body"])
  if (view.error) throw new Error(`cannot read pull request ${list.value[0].url}: ${view.error}`)
  return view.value
}

function editBody(ctx, batch, i, pr) {
  const body = mergeBody(pr.body || "", prSection(ctx, batch, i), path.basename(ctx.batchDir))
  const edit = sh(GH, ["pr", "edit", String(pr.number), "--body", body], ctx.root)
  if (!edit.ok) throw new Error(`cannot update pull request ${pr.url}: ${edit.err}`)
}

function publish(ctx, batch, i) {
  const story = batch.stories[i]
  const branch = branchOf(batch, story)
  const push = sh("git", ["push", "-u", batch.remote, branch], ctx.root)
  if (!push.ok) throw new Error(`git push ${batch.remote} ${branch} failed: ${push.err}`)
  const pr = findPullRequest(ctx, batch, branch)
  if (pr) {
    editBody(ctx, batch, i, pr)
    story.pr = pr.url
    return
  }
  const base = batch.branches === "single" ? batch.base : parentOf(batch, i)
  const create = sh(GH, ["pr", "create", "--base", base, "--head", branch, "--title", prTitle(batch, story), "--body", prSection(ctx, batch, i)], ctx.root)
  if (!create.ok) throw new Error(`cannot open a pull request for ${branch}: ${create.err}`)
  story.pr = create.out.trim().split("\n").pop()
}

// After a story turns green, its box in the single pull request is ticked.
// Best effort: the story is green whether or not the body could be updated.
function updatePullRequest(ctx, batch, i) {
  try {
    const pr = findPullRequest(ctx, batch, batch.branch)
    if (pr) editBody(ctx, batch, i, pr)
  } catch (e) {
    console.log(`[${now()}] the pull request body was not updated: ${e.message}`)
  }
}

async function waitForCi(ctx, condition, sha, out) {
  const timeoutMs = (condition.timeoutMinutes ?? 60) * 60000
  const graceMs = (condition.graceMinutes ?? 5) * 60000
  const start = Date.now()
  let lastError
  while (!stopping) {
    const runs = ghJson(ctx.root, ["api", `repos/{owner}/{repo}/commits/${sha}/check-runs?per_page=100`])
    const status = ghJson(ctx.root, ["api", `repos/{owner}/{repo}/commits/${sha}/status`])
    lastError = runs.error || status.error
    if (!lastError) {
      const checks = [
        ...(runs.value.check_runs || []).map((c) => ({
          name: c.name,
          done: c.status === "completed",
          ok: ["success", "neutral", "skipped"].includes(c.conclusion),
          result: c.conclusion || c.status,
        })),
        ...(status.value.statuses || []).map((s) => ({
          name: s.context,
          done: s.state !== "pending",
          ok: s.state === "success",
          result: s.state,
        })),
      ]
      const failed = checks.filter((c) => c.done && !c.ok)
      if (failed.length) {
        out.push(...checks.map((c) => `${c.name}: ${c.result}`))
        return `CI failed on ${sha.slice(0, 12)}: ${failed.map((c) => `${c.name} (${c.result})`).join(", ")}`
      }
      if (checks.length && checks.every((c) => c.done)) {
        out.push(...checks.map((c) => `${c.name}: ${c.result}`))
        return undefined
      }
      if (!checks.length && Date.now() - start > graceMs)
        return `no CI check was reported for ${sha.slice(0, 12)} within ${condition.graceMinutes ?? 5} minutes`
    }
    if (Date.now() - start > timeoutMs)
      return `CI did not finish on ${sha.slice(0, 12)} within ${condition.timeoutMinutes ?? 60} minutes${lastError ? ` (last error: ${lastError})` : ""}`
    await sleep(POLL_MS)
  }
  return "stopped while waiting for CI"
}

// Whether the last final verification `batch.mjs verify` recorded holds for
// HEAD: every command exited 0, and HEAD is that commit or a descendant whose
// later commits change only workflow artifacts. Returns the reason it does not.
function checkRecord(root, state, head) {
  const record = state.records.at(-1)
  const expected = `record it with \`node ${SCRIPT} verify <story-dir> "<command>"...\``
  if (!record) {
    const last = state.lines.at(-1)
    return last
      ? `no final verification recorded by batch.mjs verify in the Verification section of state.md (its last line is "${last}"): ${expected}`
      : `no final verification is recorded in state.md: ${expected}`
  }
  const failed = record.commands.filter((c) => c.exit !== 0)
  if (failed.length)
    return `the recorded final verification has a failing command: ${failed.map((c) => `\`${c.run}\` exit ${c.exit}`).join(", ")} (record: "${record.line}")`
  if (record.commit === head) return undefined
  if (!resolveCommit(root, record.commit))
    return `the recorded final verification is on ${record.commit.slice(0, 12)}, which is not a commit of this repository (record: "${record.line}")`
  if (!sh("git", ["merge-base", "--is-ancestor", record.commit, head], root).ok)
    return `the recorded final verification is on ${record.commit.slice(0, 12)}, which is not in the history of HEAD ${head.slice(0, 12)}: run it again on HEAD`
  const changed = git(root, "diff", "--name-only", record.commit, head).split("\n").filter(Boolean)
  const code = changed.filter((f) => !ARTIFACTS.test(f))
  if (code.length)
    return `the recorded final verification is on ${record.commit.slice(0, 12)}, and the commits after it up to HEAD ${head.slice(0, 12)} change more than workflow artifacts (${code.slice(0, 5).join(", ")}${code.length > 5 ? ", …" : ""}): run it again on HEAD`
  return undefined
}

// Returns undefined when the story is green, otherwise a one-line reason. The
// full output of the checks goes to the green log.
async function checkGreen(ctx, batch, i, logFile) {
  const story = batch.stories[i]
  const green = greenOf(batch, story)
  const state = readState(ctx.root, story)
  const head = git(ctx.root, "rev-parse", "HEAD")
  const out = [`green conditions on ${head}`]
  const done = (reason) => {
    out.push(reason ? `NOT GREEN: ${reason}` : "GREEN")
    fs.appendFileSync(logFile, `${out.join("\n")}\n`)
    return reason
  }
  const dirty = uncommitted(ctx.root)
  if (dirty.length) {
    out.push("uncommitted changes:", ...dirty)
    return done(`the working tree has changes that are not committed, so they would not be pushed: ${dirty.slice(0, 5).map((l) => l.slice(3)).join(", ")}${dirty.length > 5 ? ", …" : ""}`)
  }
  for (const condition of green.filter((g) => g.type !== "ci")) {
    if (condition.type === "closure") {
      out.push(`closure: ${state.closure || "not recorded"}`)
      if (state.closure !== "PASS") return done(`the closure review is ${state.closure || "not recorded in state.md"}`)
    }
    if (condition.type === "verification") {
      const reason = checkRecord(ctx.root, state, head)
      out.push(`verification: ${state.records.at(-1)?.line || "not recorded"}`)
      if (reason) return done(reason)
    }
    if (condition.type === "command") {
      const r = await runAsync("sh", ["-c", condition.run], {
        cwd: ctx.root,
        timeoutMs: (condition.timeoutMinutes ?? 120) * 60000,
      })
      out.push(`$ ${condition.run}`, r.out.trimEnd(), `exit ${r.code}${r.timedOut ? " (timed out)" : ""}`)
      if (stopping) return done("stopped")
      if (r.code !== 0) return done(`\`${condition.run}\` ${r.timedOut ? "timed out" : `exited ${r.code}`}`)
    }
  }
  if (batch.remote) {
    publish(ctx, batch, i)
    out.push(`published: ${story.pr}`)
  }
  for (const condition of green.filter((g) => g.type === "ci")) {
    const reason = await waitForCi(ctx, condition, head, out)
    if (reason) return done(reason)
  }
  return done(undefined)
}

// --- the queue --------------------------------------------------------------

function prepareBranch(ctx, batch, i) {
  const story = batch.stories[i]
  const branch = branchOf(batch, story)
  const dirty = git(ctx.root, "status", "--porcelain", "--untracked-files=no")
  if (dirty) throw new Error(`the working tree has uncommitted changes, so ${branch} cannot be checked out:\n${dirty}`)
  if (!refExists(ctx.root, `refs/heads/${branch}`)) git(ctx.root, "branch", branch, parentOf(batch, i))
  if (git(ctx.root, "rev-parse", "--abbrev-ref", "HEAD") !== branch) git(ctx.root, "checkout", "--quiet", branch)
}

// What a session can change that the runner looks at: HEAD, the story's
// state.md and the working tree. A session that changes none of them did nothing.
function fingerprint(ctx, story) {
  const state = readState(ctx.root, story)
  const head = git(ctx.root, "rev-parse", "HEAD")
  const tree = git(ctx.root, "status", "--porcelain")
  return crypto.createHash("sha1").update(`${head}\n${state.hash}\n${tree}`).digest("hex")
}

async function runStory(ctx, batch, i) {
  const story = batch.stories[i]
  const stop = (status, note) => {
    story.status = status
    story.note = note
    save(ctx, batch)
    return `story ${story.id}: ${note}`
  }
  prepareBranch(ctx, batch, i)
  story.startCommit ??= git(ctx.root, "rev-parse", "HEAD")
  if (story.status === "failed") story.attempts = 0
  story.status = "running"
  delete story.note
  save(ctx, batch)
  let idle = 0
  while (!stopping) {
    const state = readState(ctx.root, story)
    const head = git(ctx.root, "rev-parse", "HEAD")
    const print = fingerprint(ctx, story)
    // A story at ready is checked whenever anything changed since its last
    // failed check, commit or not: a fix may be in state.md alone.
    const checked = story.failure && story.failure.fingerprint === print
    if (state.status === "ready" && !checked) {
      story.checks = (story.checks || 0) + 1
      fs.mkdirSync(ctx.logs, { recursive: true })
      const logFile = path.join(ctx.logs, `${story.id}.green.${story.checks}.log`)
      fs.writeFileSync(logFile, "")
      batch.session = { name: `green check ${story.checks} of ${story.id}`, log: rel(ctx, logFile), startedAt: now() }
      save(ctx, batch)
      const reason = await checkGreen(ctx, batch, i, logFile)
      delete batch.session
      if (stopping) break
      if (!reason) {
        story.status = "green"
        story.endCommit = head
        delete story.failure
        save(ctx, batch)
        if (batch.remote && batch.branches === "single") updatePullRequest(ctx, batch, i)
        console.log(`[${now()}] story ${story.id} is green`)
        return undefined
      }
      console.log(`[${now()}] story ${story.id} is not green: ${reason}`)
      // The check itself may publish: fingerprint what it left.
      story.failure = { commit: head, fingerprint: fingerprint(ctx, story), summary: reason, log: rel(ctx, logFile) }
      save(ctx, batch)
      continue
    }
    if (state.status === "queued" || state.status === "active" || state.status === "ready") {
      if (state.status === "ready") {
        // At ready and already checked: a fix session. Every one started
        // counts, whatever it changes.
        if ((story.attempts || 0) >= batch.attempts)
          return stop("failed", `still not green after ${batch.attempts} fix session(s): ${story.failure.summary}`)
        story.attempts = (story.attempts || 0) + 1
      }
      story.sessions = (story.sessions || 0) + 1
      save(ctx, batch)
      const r = await session(
        ctx,
        batch,
        `${story.id}.${story.sessions}`,
        `batch ${path.basename(ctx.batchDir)} · ${story.id} · ${story.sessions}`,
        storyPrompt(ctx, batch, i, { idle }),
      )
      story.cost = Number(((story.cost || 0) + r.cost).toFixed(6))
      if (r.partial) story.costPartial = true
      if (r.id) story.sessionIDs = [...(story.sessionIDs || []), r.id]
      story.lastSession = { name: r.name, ...(r.id ? { id: r.id } : {}), exit: r.code, log: r.log }
      save(ctx, batch)
      if (stopping) break
      idle = fingerprint(ctx, story) === print ? idle + 1 : 0
      if (idle >= 2) return stop("blocked", `two sessions in a row changed nothing (last exit ${r.code}, log ${r.log})`)
      continue
    }
    if (state.status === "blocked" || state.status === "waiting-gate")
      return stop("blocked", `its state.md is ${state.status}: the reason is in its Notes`)
    return stop("blocked", `unexpected Status ${state.status || "(missing)"} in its state.md`)
  }
  return "stopped by the user"
}

async function wrapUp(ctx, batch) {
  const outcome = batch.status === "done" ? "is done" : `stopped: ${batch.stopReason}`
  const prompt = [
    `${PREFIX} The batch in ${rel(ctx, ctx.batchDir)} ${outcome}.`,
    "Wrap it up as the Wrap-up of the workflow-batch skill describes, then end the session. Nobody answers questions or permission requests in this session.",
  ].join("\n")
  batch.wrapUps = (batch.wrapUps || 0) + 1
  const r = await session(ctx, batch, `wrap-up.${batch.wrapUps}`, `batch ${path.basename(ctx.batchDir)} · wrap-up`, prompt)
  batch.cost = Number(((batch.cost || 0) + r.cost).toFixed(6))
  if (r.partial) batch.costPartial = true
}

async function runBatch(ctx) {
  let batch = load(ctx)
  if (alive(batch.pid) && batch.pid !== process.pid) fail(`the batch is already running (pid ${batch.pid})`)
  if (batch.status === "done") {
    console.log("The batch is already done.")
    return 0
  }
  const errors = validate(ctx, batch)
  if (errors.length) fail(`batch.json is not valid:\n- ${errors.join("\n- ")}`)
  const onSignal = () => {
    stopping = true
    if (current) current.kill("SIGTERM")
  }
  process.on("SIGTERM", onSignal)
  process.on("SIGINT", onSignal)
  batch.status = "running"
  batch.pid = process.pid
  batch.startedAt ??= now()
  delete batch.stopReason
  delete batch.finishedAt
  save(ctx, batch)
  console.log(`[${now()}] batch ${path.basename(ctx.batchDir)} started (pid ${process.pid})`)
  let reason
  try {
    for (let i = 0; i < batch.stories.length && !reason && !stopping; i++) {
      if (batch.stories[i].status === "green") continue
      reason = await runStory(ctx, batch, i)
    }
  } catch (e) {
    reason = e.message
    const story = batch.stories.find((s) => s.status === "running")
    if (story) {
      story.status = "blocked"
      story.note = e.message
    }
  }
  if (stopping) reason = "stopped by the user"
  batch.status = reason ? "stopped" : "done"
  if (reason) batch.stopReason = reason
  batch.finishedAt = now()
  delete batch.pid
  save(ctx, batch)
  console.log(`[${now()}] batch ${batch.status}${reason ? `: ${reason}` : ""}`)
  if (!stopping) {
    await wrapUp(ctx, batch)
    save(ctx, batch)
  }
  return batch.status === "done" ? 0 : 1
}

// --- other commands -------------------------------------------------------------

// How many pull requests the batch leaves, in words, for the gate and status.
function pullRequests(batch) {
  if (!batch.remote) return "none: the branches stay local"
  if (batch.branches === "stacked")
    return `one per story (${(batch.stories || []).length}), each on the previous story's branch`
  if (batch.pr) return `one: every story is added to the existing pull request ${batch.pr}, ${batch.branch}`
  return `one for the whole batch, ${batch.branch} into ${batch.base}`
}

function printStatus(ctx, batch) {
  const running = batch.status === "running" && alive(batch.pid)
  const state = batch.status === "running" && !running ? "interrupted (the runner is no longer alive)" : batch.status || "planned"
  const total = (batch.cost || 0) + (batch.stories || []).reduce((sum, s) => sum + (s.cost || 0), 0)
  console.log(`${batch.title} — ${state}${running ? ` (pid ${batch.pid})` : ""}`)
  if (batch.stopReason) console.log(`  stopped: ${batch.stopReason}`)
  console.log(`  branches: ${batch.branches}${batch.branches === "single" ? ` (${batch.branch})` : ""}, base ${batch.base}, ${batch.remote ? `remote ${batch.remote}` : "no remote"}`)
  console.log(`  pull requests: ${pullRequests(batch)}`)
  if (running && batch.session) {
    const age = (t) => `${Math.max(0, Math.round((Date.now() - t) / 60000))} min`
    const log = path.join(ctx.root, batch.session.log)
    const written = fs.existsSync(log) ? `, log last written ${age(fs.statSync(log).mtimeMs)} ago` : ""
    const id = sessionIdOf(log)
    console.log(`  now: ${batch.session.name}${id ? `, session ${id}` : ""}, running for ${age(Date.parse(batch.session.startedAt))}${written} (${batch.session.log})`)
  }
  console.log(`  green: ${(batch.green || []).map((g) => (g.type === "command" ? `command \`${g.run}\`` : g.type)).join(", ")}; fix sessions per story: ${batch.attempts}`)
  const partial = batch.costPartial || (batch.stories || []).some((s) => s.costPartial)
  console.log(`  cost so far: ${total.toFixed(4)}, sessions and their subagents${partial ? " (partial: some sessions were counted from their log only, without their subagents)" : ""}`)
  for (const [i, s] of (batch.stories || []).entries()) {
    const st = readState(ctx.root, s)
    const extra = [
      batch.branches === "stacked" ? s.branch : null,
      s.attempts ? `fix sessions ${s.attempts}` : null,
      s.pr || null,
      s.cost ? `cost ${s.cost.toFixed(4)}${s.costPartial ? " (partial)" : ""}` : null,
    ].filter(Boolean)
    console.log(`  ${i + 1}. ${s.id} — ${s.status || "queued"} (state.md: ${st.status || "?"})${extra.length ? ` · ${extra.join(" · ")}` : ""}`)
    if (s.note) console.log(`     ${s.note}`)
    if (s.lastSession && s.lastSession.exit !== 0)
      console.log(`     last session ${s.lastSession.name}${s.lastSession.id ? ` (${s.lastSession.id})` : ""} exited ${s.lastSession.exit} (${s.lastSession.log})`)
    if (s.failure && s.status !== "green") console.log(`     last failure: ${s.failure.summary} (${s.failure.log})`)
  }
}

function restack(ctx, batch) {
  if (batch.branches !== "stacked") {
    console.log('Nothing to restack: the batch uses a "single" branch.')
    return 0
  }
  let needed = 0
  for (let i = 1; i < batch.stories.length; i++) {
    const parent = batch.stories[i - 1].branch
    const child = batch.stories[i].branch
    if (!refExists(ctx.root, `refs/heads/${parent}`) || !refExists(ctx.root, `refs/heads/${child}`)) continue
    if (!sh("git", ["merge-base", "--is-ancestor", parent, child], ctx.root).ok) {
      needed++
      console.log(`${child} no longer contains ${parent}: rebase it with \`git rebase --onto ${parent} <old ${parent} commit> ${child}\``)
    }
  }
  if (!needed) console.log("Every stacked branch contains its parent.")
  return 0
}

const COMMANDS = ["check", "status", "run", "stop", "restack"]
const ctx = COMMANDS.includes(command) ? locate(dirArg) : null
switch (command) {
  case "verify":
    process.exitCode = verify(dirArg, args.slice(2).filter((a, i) => !(i === 0 && a === "--")))
    break
  case "check": {
    const errors = validate(ctx, load(ctx))
    if (errors.length) fail(`batch.json is not valid:\n- ${errors.join("\n- ")}`)
    console.log("batch.json is valid.")
    break
  }
  case "status": {
    const batch = load(ctx)
    if (flag("--json")) {
      for (const s of batch.stories || []) s.state = readState(ctx.root, s).status
      batch.alive = alive(batch.pid)
      if (batch.session) {
        const id = sessionIdOf(path.join(ctx.root, batch.session.log))
        if (id) batch.session.id = id
      }
      console.log(JSON.stringify(batch, null, 2))
    } else printStatus(ctx, batch)
    break
  }
  case "run":
    process.exitCode = await runBatch(ctx)
    break
  case "stop": {
    const batch = load(ctx)
    if (!alive(batch.pid)) fail("The batch runner is not running.")
    process.kill(batch.pid, "SIGTERM")
    console.log(`Sent a stop request to the runner (pid ${batch.pid}).`)
    break
  }
  case "restack":
    process.exitCode = restack(ctx, load(ctx))
    break
  default:
    fail('usage: batch.mjs <check|status|run|stop|restack> <batch-dir> [--json]\n       batch.mjs verify <story-dir> "<command>"...', 2)
}
