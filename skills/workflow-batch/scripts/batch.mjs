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
//
// <batch-dir> is the batch's work directory, which holds batch.json; session and
// green logs go to its logs/ directory. Exit codes: 0 ok, 1 errors or a batch
// that stopped before the end, 2 usage.
//
// Environment: CANOVACCIO_OPENCODE (default: opencode), CANOVACCIO_GH (default:
// gh), CANOVACCIO_BATCH_POLL_SECONDS (CI polling interval, default: 30).
// No dependencies: Node 18+.

import { spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const [command, dirArg] = args
const flag = (name) => args.includes(name)

const OPENCODE = process.env.CANOVACCIO_OPENCODE || "opencode"
const GH = process.env.CANOVACCIO_GH || "gh"
const POLL_MS = Number(process.env.CANOVACCIO_BATCH_POLL_SECONDS || 30) * 1000
const PREFIX = "[canovaccio batch]"
const GREEN_TYPES = new Set(["closure", "verification", "command", "ci"])
const ID = /^[a-z0-9][a-z0-9-]*$/

function fail(message, code = 1) {
  console.error(message)
  process.exit(code)
}

const now = () => new Date().toISOString()
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function sh(cmd, a, cwd) {
  const r = spawnSync(cmd, a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 })
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

function readState(root, story) {
  const file = path.join(root, story.workDir || "", "state.md")
  const text = fs.existsSync(file) ? fs.readFileSync(file, "utf8") : ""
  const field = (name) => (text.match(new RegExp(`^- ${name}:[ \\t]*([^\\s<]+)`, "m")) || [])[1]
  const verification = []
  const section = text.split(/^## /m).find((s) => /^Verification\b/.test(s))
  if (section)
    for (const line of section.split("\n").slice(1)) if (/^- \S/.test(line)) verification.push(line.slice(2).trim())
  return { status: field("Status"), closure: field("Closure"), delivery: field("Delivery"), verification }
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

async function session(ctx, batch, name, title, prompt) {
  fs.mkdirSync(ctx.logs, { recursive: true })
  const logFile = path.join(ctx.logs, `${name}.jsonl`)
  fs.writeFileSync(logFile, "")
  const a = ["run", "--agent", batch.agent || "conductor", "--title", title, "--format", "json"]
  if (batch.model) a.push("--model", batch.model)
  a.push(prompt)
  console.log(`[${now()}] session ${name}`)
  const r = await runAsync(OPENCODE, a, { cwd: ctx.root, logFile })
  const cost = costOf(logFile)
  console.log(`[${now()}] session ${name} ended: exit ${r.code}, cost ${cost.toFixed(4)}`)
  return { code: r.code, cost, log: rel(ctx, logFile) }
}

function storyPrompt(ctx, batch, i) {
  const story = batch.stories[i]
  const lines = [
    `${PREFIX} Unattended session for story ${i + 1} of ${batch.stories.length}, "${story.title}", of the batch in ${rel(ctx, ctx.batchDir)}.`,
    `Resume the workflow in ${story.workDir} as Unattended delivery in workflow-rules describes: nobody answers questions or permission requests in this session.`,
    `The branch ${branchOf(batch, story)} is checked out: do not change branch, push or open pull requests. The story starts at commit ${story.startCommit}: it is the base of the story's closure review.`,
  ]
  if (story.failure)
    lines.push(
      `The green conditions failed on ${story.failure.commit.slice(0, 12)} (fix session ${story.attempts} of ${batch.attempts}): ${story.failure.summary}. Their output is in ${story.failure.log}. Fix it as Unattended delivery describes.`,
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

function prBody(batch, i) {
  if (batch.branches === "stacked") {
    const parent = parentOf(batch, i)
    return [
      `Story ${i + 1} of ${batch.stories.length} of the batch "${batch.title}", built on \`${parent}\`.`,
      "",
      "Review and merge the stacked pull requests in order. The story's spec and decisions are in its work directory.",
      ...links([batch.stories[i]]),
      "",
      "Implemented unattended by the canovaccio batch workflow.",
    ].join("\n")
  }
  const lines = [`The stories of the batch "${batch.title}", in order:`, ""]
  for (const s of batch.stories) lines.push(`- [${s.status === "green" ? "x" : " "}] ${s.title}`)
  lines.push("", "Each story's spec and decisions are in its work directory.", ...links(batch.stories), "", "Implemented unattended by the canovaccio batch workflow.")
  return lines.join("\n")
}

function publish(ctx, batch, i) {
  const story = batch.stories[i]
  const branch = branchOf(batch, story)
  const push = sh("git", ["push", "-u", batch.remote, branch], ctx.root)
  if (!push.ok) throw new Error(`git push ${batch.remote} ${branch} failed: ${push.err}`)
  const list = ghJson(ctx.root, ["pr", "list", "--head", branch, "--state", "open", "--json", "number,url"])
  if (list.error) throw new Error(`cannot list the pull requests of ${branch}: ${list.error}`)
  const body = prBody(batch, i)
  if (list.value.length) {
    const pr = list.value[0]
    const edit = sh(GH, ["pr", "edit", String(pr.number), "--body", body], ctx.root)
    if (!edit.ok) throw new Error(`cannot update pull request ${pr.url}: ${edit.err}`)
    story.pr = pr.url
  } else {
    const base = batch.branches === "single" ? batch.base : parentOf(batch, i)
    const create = sh(GH, ["pr", "create", "--base", base, "--head", branch, "--title", prTitle(batch, story), "--body", body], ctx.root)
    if (!create.ok) throw new Error(`cannot open a pull request for ${branch}: ${create.err}`)
    story.pr = create.out.trim().split("\n").pop()
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
  for (const condition of green.filter((g) => g.type !== "ci")) {
    if (condition.type === "closure") {
      out.push(`closure: ${state.closure || "not recorded"}`)
      if (state.closure !== "PASS") return done(`the closure review is ${state.closure || "not recorded in state.md"}`)
    }
    if (condition.type === "verification") {
      const last = state.verification.at(-1)
      out.push(`verification: ${last || "not recorded"}`)
      if (!last) return done("no final verification is recorded in state.md")
      const sha = resolveCommit(ctx.root, last.split(/\s/)[0])
      if (sha !== head) return done(`the recorded final verification is on ${last.split(/\s/)[0]}, not on HEAD ${head.slice(0, 12)}`)
      const exits = [...last.matchAll(/\bexit (\d+)/g)].map((m) => Number(m[1]))
      if (!exits.length) return done("the recorded final verification has no exit status")
      if (exits.some((c) => c !== 0)) return done(`the recorded final verification has a failing command: ${last}`)
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
    const fixPending = state.status === "ready" && story.failure?.commit === head
    if (state.status === "queued" || state.status === "active" || fixPending) {
      story.sessions = (story.sessions || 0) + 1
      save(ctx, batch)
      const r = await session(
        ctx,
        batch,
        `${story.id}.${story.sessions}`,
        `batch ${path.basename(ctx.batchDir)} · ${story.id} · ${story.sessions}`,
        storyPrompt(ctx, batch, i),
      )
      story.cost = Number(((story.cost || 0) + r.cost).toFixed(6))
      save(ctx, batch)
      if (stopping) break
      const after = readState(ctx.root, story)
      const changed = after.status !== state.status || git(ctx.root, "rev-parse", "HEAD") !== head
      idle = changed ? 0 : idle + 1
      if (idle >= 2) return stop("blocked", `two sessions in a row changed nothing (last exit ${r.code}, log ${r.log})`)
      continue
    }
    if (state.status === "ready") {
      const n = (story.attempts || 0) + 1
      fs.mkdirSync(ctx.logs, { recursive: true })
      const logFile = path.join(ctx.logs, `${story.id}.green.${n}.log`)
      fs.writeFileSync(logFile, "")
      const reason = await checkGreen(ctx, batch, i, logFile)
      if (stopping) break
      if (!reason) {
        story.status = "green"
        story.endCommit = head
        delete story.failure
        save(ctx, batch)
        if (batch.remote && batch.branches === "single") {
          const list = ghJson(ctx.root, ["pr", "list", "--head", batch.branch, "--state", "open", "--json", "number"])
          if (list.value?.length) sh(GH, ["pr", "edit", String(list.value[0].number), "--body", prBody(batch, i)], ctx.root)
        }
        console.log(`[${now()}] story ${story.id} is green`)
        return undefined
      }
      console.log(`[${now()}] story ${story.id} is not green: ${reason}`)
      story.failure = { commit: head, summary: reason, log: rel(ctx, logFile) }
      if (n > batch.attempts)
        return stop("failed", `still not green after ${batch.attempts} fix session(s): ${reason}`)
      story.attempts = n
      save(ctx, batch)
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

function printStatus(ctx, batch) {
  const running = batch.status === "running" && alive(batch.pid)
  const state = batch.status === "running" && !running ? "interrupted (the runner is no longer alive)" : batch.status || "planned"
  const total = (batch.cost || 0) + (batch.stories || []).reduce((sum, s) => sum + (s.cost || 0), 0)
  console.log(`${batch.title} — ${state}${running ? ` (pid ${batch.pid})` : ""}`)
  if (batch.stopReason) console.log(`  stopped: ${batch.stopReason}`)
  console.log(`  branches: ${batch.branches}${batch.branches === "single" ? ` (${batch.branch})` : ""}, base ${batch.base}, ${batch.remote ? `remote ${batch.remote}` : "no remote"}`)
  console.log(`  green: ${(batch.green || []).map((g) => (g.type === "command" ? `command \`${g.run}\`` : g.type)).join(", ")}; fix sessions per story: ${batch.attempts}`)
  console.log(`  cost so far: ${total.toFixed(4)}`)
  for (const [i, s] of (batch.stories || []).entries()) {
    const st = readState(ctx.root, s)
    const extra = [
      batch.branches === "stacked" ? s.branch : null,
      s.attempts ? `fix sessions ${s.attempts}` : null,
      s.pr || null,
    ].filter(Boolean)
    console.log(`  ${i + 1}. ${s.id} — ${s.status || "queued"} (state.md: ${st.status || "?"})${extra.length ? ` · ${extra.join(" · ")}` : ""}`)
    if (s.note) console.log(`     ${s.note}`)
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
    fail("usage: batch.mjs <check|status|run|stop|restack> <batch-dir> [--json]", 2)
}
