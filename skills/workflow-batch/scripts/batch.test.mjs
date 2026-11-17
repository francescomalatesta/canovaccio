// Tests of batch.mjs with a fake opencode and a fake gh.
//
//   node --test skills/workflow-batch/scripts/batch.test.mjs
//
// Scratch projects live in .canovaccio/tmp/batch-tests/ of this repository and
// are removed at the end.

import { execFileSync, spawn, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { after, test } from "node:test"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(here, "batch.mjs")
const REPO = path.resolve(here, "../../..")
const TMP = path.join(REPO, ".canovaccio", "tmp", "batch-tests")
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
after(() => fs.rmSync(TMP, { recursive: true, force: true }))

const GIT_ENV = {
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@localhost",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@localhost",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
}
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", env: { ...process.env, ...GIT_ENV } }).trim()

// The fake opencode: plays the scenario's next action for the story named in
// the prompt, records every call, prints one cost event.
const FAKE_OPENCODE = `#!/usr/bin/env node
const fs = require("fs"), path = require("path"), cp = require("child_process")
const prompt = process.argv[process.argv.length - 1]
const scenario = JSON.parse(fs.readFileSync(process.env.FAKE_SCENARIO, "utf8"))
const callsFile = process.env.FAKE_SCENARIO + ".calls.json"
const calls = fs.existsSync(callsFile) ? JSON.parse(fs.readFileSync(callsFile, "utf8")) : []
const m = prompt.match(/Resume the workflow in (\\S+) as/)
const key = m ? path.basename(m[1]).replace(/^\\d{4}-\\d{2}-\\d{2}-/, "") : "wrap-up"
const n = calls.filter((c) => c.key === key).length
calls.push({ key, prompt, args: process.argv.slice(2) })
fs.writeFileSync(callsFile, JSON.stringify(calls, null, 2))
const list = scenario[key] || []
const action = list[Math.min(n, list.length - 1)] || {}
if (action.sleep) { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, action.sleep * 1000) }
const sh = (...a) => cp.execFileSync("git", a, { encoding: "utf8" }).trim()
const stateFile = m ? path.join(m[1], "state.md") : null
// verify: true runs \`batch.mjs verify\` with a passing command, a string runs
// that command instead ("exit 1").
const verify = () =>
  cp.execFileSync("node", [process.env.BATCH_SCRIPT, "verify", m[1], action.verify === true ? "true" : action.verify], { stdio: "ignore" }, )
const run = (f) => { try { f() } catch {} }
if (action.verify && action.staleVerify) run(verify)
if (action.commit) {
  fs.writeFileSync(action.commit, key + " " + n + "\\n")
  sh("add", action.commit)
  sh("commit", "-q", "-m", key + " " + n)
}
if (action.verify && !action.staleVerify) run(verify)
// artifact: a workflow artifact of the story, committed after the verification.
if (action.artifact) {
  const file = path.join(m[1], action.artifact)
  fs.appendFileSync(file, key + " " + n + "\\n")
  sh("add", "-f", file)
  sh("commit", "-q", "-m", "artifact " + key + " " + n)
}
// record: a line written by hand in the Verification section; {HEAD} is HEAD.
if (action.record) fs.appendFileSync(stateFile, action.record.replace("{HEAD}", sh("rev-parse", "--short=12", "HEAD")) + "\\n")
if (action.touch) fs.writeFileSync(action.touch, "")
if (action.dirty) fs.appendFileSync(action.dirty, "uncommitted\\n")
if (stateFile) {
  let text = fs.readFileSync(stateFile, "utf8")
  if (action.status) text = text.replace(/^- Status: .*$/m, "- Status: " + action.status)
  if (action.closure)
    text = /^- Closure: /m.test(text)
      ? text.replace(/^- Closure: .*$/m, "- Closure: " + action.closure)
      : text.replace(/^(- Status: .*)$/m, "$1\\n- Closure: " + action.closure)
  fs.writeFileSync(stateFile, text)
}
console.log(JSON.stringify({ type: "step_finish", part: { cost: 0.01 } }))
process.exit(action.exit || 0)
`

// The fake gh: pull requests in a JSON file, CI conclusions from the scenario.
const FAKE_GH = `#!/usr/bin/env node
const fs = require("fs")
const a = process.argv.slice(2)
const file = process.env.FAKE_GH_STATE
const state = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { prs: [] }
const opt = (name) => a[a.indexOf(name) + 1]
const saveState = () => fs.writeFileSync(file, JSON.stringify(state, null, 2))
if (a[0] === "--version") { console.log("gh fake"); process.exit(0) }
if (a[0] === "pr" && a[1] === "list") {
  console.log(JSON.stringify(state.prs.filter((p) => p.head === opt("--head")).map(({ number, url }) => ({ number, url }))))
  process.exit(0)
}
if (a[0] === "pr" && a[1] === "create") {
  const number = state.prs.length + 1
  const pr = { number, url: "https://example.test/pull/" + number, head: opt("--head"), base: opt("--base"), title: opt("--title"), body: opt("--body") }
  state.prs.push(pr); saveState(); console.log(pr.url); process.exit(0)
}
if (a[0] === "pr" && a[1] === "view") {
  const pr = state.prs.find((p) => p.number === Number(a[2]) || p.url === a[2])
  if (!pr) { console.error("no pull request " + a[2]); process.exit(1) }
  console.log(JSON.stringify({ state: "OPEN", headRefName: pr.head, ...pr })); process.exit(0)
}
if (a[0] === "pr" && a[1] === "edit") {
  const pr = state.prs.find((p) => p.number === Number(a[2])); pr.body = opt("--body"); saveState(); process.exit(0)
}
if (a[0] === "api" && a[1].includes("/check-runs")) {
  const conclusion = (state.ci || "success")
  const runs = conclusion === "none" ? [] : [{ name: "test", status: "completed", conclusion }]
  console.log(JSON.stringify({ total_count: runs.length, check_runs: runs })); process.exit(0)
}
if (a[0] === "api" && a[1].endsWith("/status")) { console.log(JSON.stringify({ statuses: [] })); process.exit(0) }
console.error("fake gh: unsupported " + a.join(" ")); process.exit(1)
`

let counter = 0
function project({ stories = ["first", "second"], batch = {}, remote = false } = {}) {
  const dir = path.join(TMP, `p${++counter}`)
  const root = path.join(dir, "project")
  fs.mkdirSync(root, { recursive: true })
  git(root, "init", "-q", "-b", "main")
  fs.writeFileSync(path.join(root, ".gitignore"), "docs/work/*/*\n!docs/work/*/spec.md\n!docs/work/*/decisions.md\n*.flag\n")
  git(root, "add", ".gitignore")
  git(root, "commit", "-q", "-m", "init")
  if (remote) {
    git(dir, "init", "-q", "--bare", "remote.git")
    git(root, "remote", "add", "origin", path.join(dir, "remote.git"))
    git(root, "push", "-q", "origin", "main")
  }
  const batchDir = path.join(root, "docs/work/2026-11-17-batch-demo")
  fs.mkdirSync(batchDir, { recursive: true })
  const entries = stories.map((id, i) => {
    const workDir = `docs/work/2026-11-17-${id}`
    fs.mkdirSync(path.join(root, workDir), { recursive: true })
    for (const f of ["spec.md", "plan.md"]) fs.writeFileSync(path.join(root, workDir, f), `# ${id}\n`)
    fs.writeFileSync(
      path.join(root, workDir, "state.md"),
      `# State\n\n- Workflow: feature\n- Status: queued\n- Delivery: unattended\n\n## Verification\n`,
    )
    return { id, title: `Story ${id}`, workDir, ...(batch.branches === "stacked" ? { branch: `batch/demo/${i + 1}-${id}` } : {}) }
  })
  const config = {
    version: 1,
    title: "Demo batch",
    base: "main",
    branches: "single",
    branch: "batch/demo",
    remote: remote ? "origin" : null,
    green: [{ type: "closure" }, { type: "verification" }],
    attempts: 2,
    stories: entries,
    ...batch,
  }
  if (config.branches === "stacked") delete config.branch
  fs.writeFileSync(path.join(batchDir, "batch.json"), JSON.stringify(config, null, 2))
  fs.writeFileSync(path.join(dir, "opencode"), FAKE_OPENCODE, { mode: 0o755 })
  fs.writeFileSync(path.join(dir, "gh"), FAKE_GH, { mode: 0o755 })
  const scenarioFile = path.join(dir, "scenario.json")
  const ghState = path.join(dir, "gh-state.json")
  return {
    root,
    batchDir,
    scenario: (s) => fs.writeFileSync(scenarioFile, JSON.stringify(s)),
    gh: (s) => fs.writeFileSync(ghState, JSON.stringify({ prs: [], ...s })),
    ghState: () => JSON.parse(fs.readFileSync(ghState, "utf8")),
    calls: () => (fs.existsSync(`${scenarioFile}.calls.json`) ? JSON.parse(fs.readFileSync(`${scenarioFile}.calls.json`, "utf8")) : []),
    batch: () => JSON.parse(fs.readFileSync(path.join(batchDir, "batch.json"), "utf8")),
    state: (id) => fs.readFileSync(path.join(root, `docs/work/2026-11-17-${id}/state.md`), "utf8"),
    env: {
      CANOVACCIO_OPENCODE: path.join(dir, "opencode"),
      CANOVACCIO_GH: path.join(dir, "gh"),
      CANOVACCIO_BATCH_POLL_SECONDS: "0",
      FAKE_SCENARIO: scenarioFile,
      FAKE_GH_STATE: ghState,
      BATCH_SCRIPT: SCRIPT,
    },
    run: (cmd = "run", ...extra) =>
      spawnSync("node", [SCRIPT, cmd, batchDir, ...extra], {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          ...GIT_ENV,
          CANOVACCIO_OPENCODE: path.join(dir, "opencode"),
          CANOVACCIO_GH: path.join(dir, "gh"),
          CANOVACCIO_BATCH_POLL_SECONDS: "0",
          FAKE_SCENARIO: scenarioFile,
          FAKE_GH_STATE: ghState,
          BATCH_SCRIPT: SCRIPT,
        },
      }),
  }
}

const done = (file) => ({ commit: file, verify: true, status: "ready", closure: "PASS" })

test("single branch: every story runs in its own session and the batch ends done", () => {
  const p = project({ batch: { green: [{ type: "closure" }, { type: "verification" }, { type: "command", run: "test -f first.txt" }] } })
  p.scenario({ first: [done("first.txt")], second: [done("second.txt")] })
  const r = p.run()
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const b = p.batch()
  assert.equal(b.status, "done")
  assert.deepEqual(b.stories.map((s) => s.status), ["green", "green"])
  assert.equal(b.stories[1].startCommit, b.stories[0].endCommit)
  assert.equal(git(p.root, "rev-parse", "--abbrev-ref", "HEAD"), "batch/demo")
  assert.equal(git(p.root, "rev-list", "--count", "main..batch/demo"), "2")
  const calls = p.calls()
  assert.deepEqual(calls.map((c) => c.key), ["first", "second", "wrap-up"])
  assert.match(calls[0].prompt, /^\[canovaccio batch\]/)
  assert.match(calls[0].prompt, /The branch batch\/demo is checked out/)
  assert.ok(calls[0].args.includes("--format") && !calls[0].args.includes("--auto"))
  assert.equal(b.stories[0].cost, 0.01)
  assert.ok(fs.existsSync(path.join(p.batchDir, "logs", "first.1.jsonl")))
})

test("a blocked story stops the batch before the next story", () => {
  const p = project()
  p.scenario({ first: [{ status: "blocked" }] })
  const r = p.run()
  assert.equal(r.status, 1)
  const b = p.batch()
  assert.equal(b.status, "stopped")
  assert.match(b.stopReason, /story first: its state.md is blocked/)
  assert.equal(b.stories[0].status, "blocked")
  assert.equal(b.stories[1].status, undefined)
  assert.deepEqual(p.calls().map((c) => c.key), ["first", "wrap-up"])
})

test("a stopped batch resumes from the story where it stopped", () => {
  const p = project()
  p.scenario({ first: [{ status: "blocked" }, done("first.txt")], second: [done("second.txt")] })
  assert.equal(p.run().status, 1)
  // The user answers the blocked story: its workflow is active again.
  const file = path.join(p.root, "docs/work/2026-11-17-first/state.md")
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace("- Status: blocked", "- Status: active"))
  const r = p.run()
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.deepEqual(p.batch().stories.map((s) => s.status), ["green", "green"])
})

test("a failed green condition sends the story back for a fix session", () => {
  const p = project({ stories: ["first"], batch: { green: [{ type: "closure" }, { type: "command", run: "test -f ok.flag" }] } })
  p.scenario({ first: [done("a.txt"), { ...done("b.txt"), touch: "ok.flag" }] })
  const r = p.run()
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const s = p.batch().stories[0]
  assert.equal(s.status, "green")
  assert.equal(s.attempts, 1)
  const calls = p.calls().filter((c) => c.key === "first")
  assert.equal(calls.length, 2)
  assert.match(calls[1].prompt, /The green conditions failed on .*`test -f ok.flag` exited 1/)
  assert.ok(fs.readFileSync(path.join(p.batchDir, "logs", "first.green.1.log"), "utf8").includes("NOT GREEN"))
})

test("a story still failing after the allowed fix sessions stops the batch", () => {
  const p = project({ batch: { attempts: 1, green: [{ type: "closure" }, { type: "command", run: "false" }] } })
  p.scenario({ first: [done("a.txt"), done("b.txt")] })
  const r = p.run()
  assert.equal(r.status, 1)
  const b = p.batch()
  assert.equal(b.stories[0].status, "failed")
  assert.match(b.stopReason, /still not green after 1 fix session/)
  assert.equal(p.calls().filter((c) => c.key === "first").length, 2)
  assert.equal(b.stories[1].status, undefined)
})

test("the recorded verification must be on HEAD or before commits of workflow artifacts only", () => {
  const p = project({ stories: ["first"], batch: { attempts: 0 } })
  p.scenario({ first: [{ ...done("a.txt"), staleVerify: true }] })
  assert.equal(p.run().status, 1)
  assert.match(p.batch().stories[0].note, /the recorded final verification is on \w+, and the commits after it up to HEAD \w+ change more than workflow artifacts \(a\.txt\)/)
})

test("a failing command in the recorded verification is not green", () => {
  const p = project({ stories: ["first"], batch: { attempts: 0 } })
  p.scenario({ first: [{ ...done("a.txt"), verify: "exit 1" }] })
  assert.equal(p.run().status, 1)
  assert.match(p.batch().stories[0].note, /has a failing command/)
})

test("the closure review must have passed", () => {
  const p = project({ stories: ["first"], batch: { attempts: 0 } })
  p.scenario({ first: [{ ...done("a.txt"), closure: "FAIL" }] })
  assert.equal(p.run().status, 1)
  assert.match(p.batch().stories[0].note, /the closure review is FAIL/)
})

test("two sessions in a row that change nothing block the story", () => {
  const p = project({ stories: ["first"] })
  p.scenario({ first: [{}] })
  assert.equal(p.run().status, 1)
  const s = p.batch().stories[0]
  assert.equal(s.status, "blocked")
  assert.match(s.note, /two sessions in a row changed nothing/)
  assert.equal(p.calls().filter((c) => c.key === "first").length, 2)
})

test("stacked branches: one branch and one pull request per story, each based on the previous", () => {
  const p = project({
    remote: true,
    batch: { branches: "stacked", green: [{ type: "closure" }, { type: "verification" }, { type: "ci" }] },
  })
  p.scenario({ first: [done("first.txt")], second: [done("second.txt")] })
  p.gh({ ci: "success" })
  const r = p.run()
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const prs = p.ghState().prs
  assert.deepEqual(prs.map((x) => [x.head, x.base]), [
    ["batch/demo/1-first", "main"],
    ["batch/demo/2-second", "batch/demo/1-first"],
  ])
  assert.deepEqual(p.batch().stories.map((s) => s.pr), prs.map((x) => x.url))
  git(p.root, "merge-base", "--is-ancestor", "batch/demo/1-first", "batch/demo/2-second")
  assert.match(git(p.root, "ls-remote", "origin"), /refs\/heads\/batch\/demo\/2-second/)
})

test("single branch with a remote: one pull request for the whole batch", () => {
  const p = project({ remote: true, batch: { green: [{ type: "closure" }, { type: "ci" }] } })
  const config = p.batch()
  config.stories[0].item = "#42"
  config.stories[1].item = "https://tracker.test/card/7"
  fs.writeFileSync(path.join(p.batchDir, "batch.json"), JSON.stringify(config))
  p.scenario({ first: [done("first.txt")], second: [done("second.txt")] })
  p.gh({ ci: "success" })
  assert.equal(p.run().status, 0)
  const prs = p.ghState().prs
  assert.equal(prs.length, 1)
  assert.equal(prs[0].head, "batch/demo")
  assert.match(prs[0].body, /- \[x\] Story first\n- \[x\] Story second/)
  assert.match(prs[0].body, /Closes #42\nTracker item: https:\/\/tracker.test\/card\/7/)
})

test("failing CI is not green", () => {
  const p = project({ stories: ["first"], remote: true, batch: { attempts: 0, green: [{ type: "closure" }, { type: "ci" }] } })
  p.scenario({ first: [done("first.txt")] })
  p.gh({ ci: "failure" })
  assert.equal(p.run().status, 1)
  assert.match(p.batch().stories[0].note, /CI failed on \w+: test \(failure\)/)
})

test("check rejects an invalid batch", () => {
  const p = project({ batch: { green: [{ type: "verification" }, { type: "ci" }] } })
  const r = p.run("check")
  assert.equal(r.status, 1)
  assert.match(r.stderr, /green must include closure/)
  assert.match(r.stderr, /the ci condition needs a remote/)
  const ok = project()
  assert.equal(ok.run("check").status, 0)
})

test("status reports every story", () => {
  const p = project()
  p.scenario({ first: [{ status: "blocked" }] })
  p.run()
  const r = p.run("status")
  assert.equal(r.status, 0)
  assert.match(r.stdout, /Demo batch — stopped/)
  assert.match(r.stdout, /1\. first — blocked \(state.md: blocked\)/)
  assert.match(r.stdout, /2\. second — queued \(state.md: queued\)/)
})

test("stop ends a running batch without a wrap-up", async () => {
  const p = project({ stories: ["first"] })
  p.scenario({ first: [{ sleep: 30 }] })
  const env = { ...process.env, ...GIT_ENV }
  const child = spawn("node", [SCRIPT, "run", p.batchDir], {
    cwd: p.root,
    env: { ...env, ...p.env },
    stdio: "ignore",
  })
  const exited = new Promise((resolve) => child.on("exit", resolve))
  for (let i = 0; i < 100 && p.calls().length === 0; i++) await new Promise((r) => setTimeout(r, 100))
  assert.match(p.run("status").stdout, /now: first\.1, running for \d+ min, log last written \d+ min ago \(docs\/work\/2026-11-17-batch-demo\/logs\/first\.1\.jsonl\)/)
  assert.equal(p.run("stop").status, 0)
  assert.equal(await exited, 1)
  const b = p.batch()
  assert.equal(b.status, "stopped")
  assert.equal(b.stopReason, "stopped by the user")
  assert.deepEqual(p.calls().map((c) => c.key), ["first"])
})

test("restack lists the stacked branches that no longer contain their parent", () => {
  const p = project({ batch: { branches: "stacked" } })
  p.scenario({ first: [done("first.txt")], second: [done("second.txt")] })
  assert.equal(p.run().status, 0)
  assert.match(p.run("restack").stdout, /Every stacked branch contains its parent/)
  git(p.root, "checkout", "-q", "batch/demo/1-first")
  fs.writeFileSync(path.join(p.root, "review.txt"), "fix\n")
  git(p.root, "add", "review.txt")
  git(p.root, "commit", "-q", "-m", "review fix")
  assert.match(p.run("restack").stdout, /batch\/demo\/2-second no longer contains batch\/demo\/1-first/)
})

// --- the final verification record --------------------------------------------

const verifyIn = (p, id, ...commands) =>
  spawnSync("node", [SCRIPT, "verify", `docs/work/2026-11-17-${id}`, ...commands], {
    cwd: p.root,
    encoding: "utf8",
    env: { ...process.env, ...GIT_ENV },
  })

test("verify runs the commands on HEAD and records them in the one format the runner reads", () => {
  const p = project({ stories: ["first"] })
  const head = git(p.root, "rev-parse", "HEAD")
  const ok = verifyIn(p, "first", "true", "echo hello")
  assert.equal(ok.status, 0, ok.stderr + ok.stdout)
  assert.ok(p.state("first").includes(`## Verification\n- ${head} — \`true\` exit 0; \`echo hello\` exit 0 (recorded by batch.mjs verify)\n`))
  const log = fs.readFileSync(path.join(p.root, "docs/work/2026-11-17-first/verification.log"), "utf8")
  assert.match(log, /\$ echo hello\nhello\nexit 0/)
  const failing = verifyIn(p, "first", "true", "echo broken && exit 3")
  assert.equal(failing.status, 1)
  assert.match(failing.stdout, /failed: `echo broken && exit 3`/)
  assert.match(p.state("first"), /`echo broken && exit 3` exit 3 \(recorded by batch\.mjs verify\)\n$/)
})

test("verify refuses a working tree with uncommitted changes and commands with backticks", () => {
  const p = project({ stories: ["first"] })
  fs.writeFileSync(path.join(p.root, "new.txt"), "not committed\n")
  const dirty = verifyIn(p, "first", "true")
  assert.equal(dirty.status, 1)
  assert.match(dirty.stderr, /commit the work first[\s\S]*new\.txt/)
  fs.rmSync(path.join(p.root, "new.txt"))
  assert.equal(verifyIn(p, "first", "echo `date`").status, 2)
  assert.doesNotMatch(p.state("first"), /recorded by batch\.mjs verify/)
})

test("a record written by hand is not green, and the message quotes the line", () => {
  const p = project({ stories: ["first"], batch: { attempts: 0 } })
  p.scenario({ first: [{ commit: "a.txt", record: "- `{HEAD}` — `make test` exit 0", status: "ready", closure: "PASS" }] })
  assert.equal(p.run().status, 1)
  const note = p.batch().stories[0].note
  assert.match(note, /no final verification recorded by batch\.mjs verify/)
  assert.match(note, /its last line is "- `\w{12}` — `make test` exit 0"/)
})

test("notes after the record do not hide it", () => {
  const p = project({ stories: ["first"], batch: { attempts: 0 } })
  p.scenario({
    first: [{ ...done("a.txt"), record: "- An earlier `make test` on the same commit had 2 failures, unrelated to this change" }],
  })
  const r = p.run()
  assert.equal(r.status, 0, r.stderr + r.stdout)
  assert.equal(p.batch().stories[0].status, "green")
})

test("commits of workflow artifacts after the record keep the story green", () => {
  const p = project({ stories: ["first"], batch: { attempts: 0 } })
  p.scenario({ first: [{ ...done("a.txt"), artifact: "decisions.md" }] })
  const r = p.run()
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const s = p.batch().stories[0]
  assert.equal(s.status, "green")
  assert.equal(s.endCommit, git(p.root, "rev-parse", "HEAD"))
  assert.match(fs.readFileSync(path.join(p.batchDir, "logs", "first.green.1.log"), "utf8"), /GREEN/)
})

test("uncommitted changes to tracked files are not green", () => {
  const p = project({ stories: ["first"], batch: { attempts: 0 } })
  p.scenario({ first: [{ ...done("a.txt"), dirty: "a.txt" }] })
  assert.equal(p.run().status, 1)
  assert.match(p.batch().stories[0].note, /changes that are not committed, so they would not be pushed: a\.txt/)
})

// --- fix sessions -----------------------------------------------------------------

test("a fix session that only rewrites the record is checked again, without a commit", () => {
  const p = project({ stories: ["first"] })
  p.scenario({
    first: [
      { commit: "a.txt", record: "- `{HEAD}` — `make test` exit 0", status: "ready", closure: "PASS" },
      { verify: true, status: "ready" },
    ],
  })
  const r = p.run()
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const s = p.batch().stories[0]
  assert.equal(s.status, "green")
  assert.equal(s.attempts, 1)
  assert.equal(s.sessions, 2)
  const calls = p.calls().filter((c) => c.key === "first")
  assert.equal(calls.length, 2)
  assert.match(calls[1].prompt, /fix session 1 of 2/)
  assert.match(calls[0].prompt, /Record the final verification with `node \S+batch\.mjs verify docs\/work\/2026-11-17-first/)
})

test("every fix session counts, also one that changed nothing", () => {
  const p = project({ stories: ["first"] })
  p.scenario({
    first: [
      { commit: "a.txt", record: "- `{HEAD}` — `make test` exit 0", status: "ready", closure: "PASS" },
      {},
      { verify: true, status: "ready" },
    ],
  })
  const r = p.run()
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const s = p.batch().stories[0]
  assert.equal(s.status, "green")
  assert.equal(s.attempts, 2)
  const calls = p.calls().filter((c) => c.key === "first")
  assert.equal(calls.length, 3)
  assert.match(calls[1].prompt, /fix session 1 of 2/)
  assert.match(calls[2].prompt, /fix session 2 of 2/)
  assert.match(calls[2].prompt, /The previous session of this story changed nothing/)
  // One green check per change: the session that changed nothing was not checked.
  assert.deepEqual(fs.readdirSync(path.join(p.batchDir, "logs")).filter((f) => f.includes(".green.")).sort(), [
    "first.green.1.log",
    "first.green.2.log",
  ])
})

test("fix sessions stop at the allowed number even when they change nothing", () => {
  const p = project({ stories: ["first"], batch: { attempts: 1 } })
  p.scenario({ first: [{ commit: "a.txt", record: "- `{HEAD}` — `make test` exit 0", status: "ready", closure: "PASS" }, {}] })
  assert.equal(p.run().status, 1)
  const s = p.batch().stories[0]
  assert.equal(s.status, "failed")
  assert.match(s.note, /still not green after 1 fix session/)
  assert.equal(p.calls().filter((c) => c.key === "first").length, 2)
})

// --- pull requests --------------------------------------------------------------

test("an existing pull request named in pr gets every story, and its body keeps what others wrote", () => {
  const p = project({ remote: true, batch: { pr: 7, green: [{ type: "closure" }, { type: "verification" }] } })
  p.gh({ prs: [{ number: 7, url: "https://example.test/pull/7", head: "batch/demo", base: "main", title: "Epic", body: "Epic description by a human." }] })
  p.scenario({ first: [done("first.txt")], second: [done("second.txt")] })
  const r = p.run()
  assert.equal(r.status, 0, r.stderr + r.stdout)
  const prs = p.ghState().prs
  assert.equal(prs.length, 1)
  assert.equal(prs[0].title, "Epic")
  assert.match(prs[0].body, /^Epic description by a human\.\n\n<!-- canovaccio batch 2026-11-17-batch-demo -->/)
  assert.match(prs[0].body, /- \[x\] Story first\n- \[x\] Story second/)
  assert.equal(prs[0].body.match(/<!-- canovaccio batch /g).length, 1)
  assert.deepEqual(p.batch().stories.map((s) => s.pr), ["https://example.test/pull/7", "https://example.test/pull/7"])
  assert.match(p.run("status").stdout, /pull requests: one: every story is added to the existing pull request 7, batch\/demo/)
})

test("check rejects a pr that is not on the batch branch, or with stacked branches", () => {
  const p = project({ remote: true, batch: { pr: 7 } })
  p.gh({ prs: [{ number: 7, url: "https://example.test/pull/7", head: "feature/other", base: "main" }] })
  const r = p.run("check")
  assert.equal(r.status, 1)
  assert.match(r.stderr, /pr: pull request https:\/\/example\.test\/pull\/7 is on feature\/other, not on batch\/demo/)
  const stacked = project({ remote: true, batch: { pr: 7, branches: "stacked" } })
  assert.match(stacked.run("check").stderr, /pr needs "single" branches/)
})

test("status says how many pull requests the batch leaves", () => {
  assert.match(project({ remote: true }).run("status").stdout, /pull requests: one for the whole batch, batch\/demo into main/)
  assert.match(project({ remote: true, batch: { branches: "stacked" } }).run("status").stdout, /pull requests: one per story \(2\)/)
  assert.match(project().run("status").stdout, /pull requests: none: the branches stay local/)
})
