// Tests of verify.mjs.
//
//   node --test skills/workflow-rules/scripts/verify.test.mjs
//
// Scratch projects live in .canovaccio/tmp/verify-tests/ of this repository and
// are removed at the end.

import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { after, test } from "node:test"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(here, "verify.mjs")
const REPO = path.resolve(here, "../../..")
const TMP = path.join(REPO, ".canovaccio", "tmp", "verify-tests")
fs.rmSync(TMP, { recursive: true, force: true })
fs.mkdirSync(TMP, { recursive: true })
after(() => fs.rmSync(TMP, { recursive: true, force: true }))

const ENV = {
  ...process.env,
  GIT_AUTHOR_NAME: "test",
  GIT_AUTHOR_EMAIL: "test@localhost",
  GIT_COMMITTER_NAME: "test",
  GIT_COMMITTER_EMAIL: "test@localhost",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CEILING_DIRECTORIES: TMP,
}
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", env: ENV }).trim()

const WORK = "docs/work/2026-11-20-demo"
let counter = 0
function project() {
  const root = path.join(TMP, `p${++counter}`)
  fs.mkdirSync(path.join(root, WORK), { recursive: true })
  git(root, "init", "-q", "-b", "main")
  fs.writeFileSync(path.join(root, ".gitignore"), "docs/work/*/*\n!docs/work/*/spec.md\n!docs/work/*/decisions.md\n")
  fs.writeFileSync(path.join(root, "app.txt"), "v1\n")
  git(root, "add", "-A")
  git(root, "commit", "-q", "-m", "init")
  fs.writeFileSync(path.join(root, WORK, "state.md"), "# State\n\n- Workflow: feature\n- Status: active\n\n## Verification\n\n## Notes\n- none\n")
  return {
    root,
    state: () => fs.readFileSync(path.join(root, WORK, "state.md"), "utf8"),
    append: (line) => fs.writeFileSync(path.join(root, WORK, "state.md"), fs.readFileSync(path.join(root, WORK, "state.md"), "utf8").replace("\n## Notes", `${line}\n\n## Notes`)),
    commit: (file, text = "x\n", force = false) => {
      fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true })
      fs.writeFileSync(path.join(root, file), text)
      git(root, "add", ...(force ? ["-f"] : []), file)
      git(root, "commit", "-q", "-m", `change ${file}`)
    },
    head: () => git(root, "rev-parse", "HEAD"),
  }
}

const verify = (p, ...a) => spawnSync(process.execPath, [SCRIPT, ...a], { cwd: p.root, encoding: "utf8", env: ENV })
const check = (p) => {
  const r = verify(p, "check", WORK, "--json")
  return { status: r.status, out: JSON.parse(r.stdout) }
}

// --- run -------------------------------------------------------------------------

test("run executes the commands on HEAD and records them in its one format", () => {
  const p = project()
  const head = p.head()
  const ok = verify(p, "run", WORK, "true", "echo hello")
  assert.equal(ok.status, 0, ok.stderr + ok.stdout)
  assert.ok(p.state().includes(`## Verification\n- ${head} — \`true\` exit 0; \`echo hello\` exit 0 (recorded by verify.mjs)\n\n## Notes`))
  const log = fs.readFileSync(path.join(p.root, WORK, "verification.log"), "utf8")
  assert.match(log, /\$ echo hello\nhello\nexit 0/)
})

test("run exits 1 on a failing command, records it and prints the tail of the output", () => {
  const p = project()
  const failing = verify(p, "run", WORK, "true", "echo broken && exit 3")
  assert.equal(failing.status, 1)
  assert.match(failing.stdout, /failed: `echo broken && exit 3`/)
  assert.match(failing.stdout, /broken/)
  assert.match(p.state(), /`echo broken && exit 3` exit 3 \(recorded by verify\.mjs\)\n/)
})

test("run runs the commands from the project root", () => {
  const p = project()
  assert.equal(verify(p, "run", WORK, "test -f app.txt").status, 0)
})

test("run creates the Verification section when it is missing", () => {
  const p = project()
  fs.writeFileSync(path.join(p.root, WORK, "state.md"), "# State\n\n- Status: active\n")
  assert.equal(verify(p, "run", WORK, "true").status, 0)
  assert.match(p.state(), /\n## Verification\n- [0-9a-f]{40} — `true` exit 0 \(recorded by verify\.mjs\)\n$/)
})

test("run refuses uncommitted changes outside docs/work, and accepts them inside", () => {
  const p = project()
  fs.writeFileSync(path.join(p.root, "new.txt"), "not committed\n")
  const dirty = verify(p, "run", WORK, "true")
  assert.equal(dirty.status, 1)
  assert.match(dirty.stderr, /commit the work first[\s\S]*new\.txt/)
  assert.doesNotMatch(p.state(), /recorded by verify\.mjs/)
  fs.rmSync(path.join(p.root, "new.txt"))
  fs.writeFileSync(path.join(p.root, WORK, "decisions.md"), "# Decisions\n")
  assert.equal(verify(p, "run", WORK, "true").status, 0)
})

test("run refuses a command that changes the working tree", () => {
  const p = project()
  const r = verify(p, "run", WORK, "echo v2 > app.txt")
  assert.equal(r.status, 1)
  assert.match(r.stderr, /changed the working tree or HEAD/)
  assert.doesNotMatch(p.state(), /recorded by verify\.mjs/)
})

test("run rejects commands with backticks, and usage errors exit 2", () => {
  const p = project()
  assert.equal(verify(p, "run", WORK, "echo `date`").status, 2)
  assert.equal(verify(p, "run", WORK).status, 2)
  assert.equal(verify(p, "run").status, 2)
  assert.equal(verify(p, "nothing").status, 2)
  assert.doesNotMatch(p.state(), /recorded by verify\.mjs/)
})

test("run refuses a directory without state.md", () => {
  const p = project()
  const r = verify(p, "run", "docs", "true")
  assert.equal(r.status, 1)
  assert.match(r.stderr, /no state\.md/)
})

// --- check -----------------------------------------------------------------------

test("check: a passing record on HEAD holds", () => {
  const p = project()
  verify(p, "run", WORK, "true", "echo ok")
  const { status, out } = check(p)
  assert.equal(status, 0)
  assert.deepEqual(out, { valid: true, head: p.head(), commit: p.head(), commands: [{ cmd: "true", exit: 0 }, { cmd: "echo ok", exit: 0 }] })
})

test("check without --json prints one line and uses the same exit codes", () => {
  const p = project()
  verify(p, "run", WORK, "true")
  const r = verify(p, "check", WORK)
  assert.equal(r.status, 0)
  assert.match(r.stdout, /^valid: /)
})

test("check: no record at all", () => {
  const p = project()
  const { status, out } = check(p)
  assert.equal(status, 1)
  assert.equal(out.valid, false)
  assert.equal(out.commit, null)
  assert.deepEqual(out.commands, [])
  assert.match(out.reason, /no final verification is recorded/)
})

test("check: a record written by hand does not count, and the reason quotes the line", () => {
  const p = project()
  p.append(`- ${p.head()} — \`make test\` exit 0`)
  const { status, out } = check(p)
  assert.equal(status, 1)
  assert.match(out.reason, /no final verification recorded by verify\.mjs/)
  assert.match(out.reason, /its last line is "- [0-9a-f]{40} — `make test` exit 0"/)
})

test("check: a record of batch.mjs verify does not count", () => {
  const p = project()
  p.append(`- ${p.head()} — \`true\` exit 0 (recorded by batch.mjs verify)`)
  assert.equal(check(p).out.valid, false)
})

test("check: a failing command in the last record", () => {
  const p = project()
  verify(p, "run", WORK, "true")
  verify(p, "run", WORK, "exit 1")
  const { status, out } = check(p)
  assert.equal(status, 1)
  assert.deepEqual(out.commands, [{ cmd: "exit 1", exit: 1 }])
  assert.match(out.reason, /has a failing command: `exit 1` exit 1/)
})

test("check: notes after the record do not hide it", () => {
  const p = project()
  verify(p, "run", WORK, "true")
  p.append("- An earlier `make test` on the same commit had 2 failures, unrelated to this change")
  assert.equal(check(p).out.valid, true)
})

test("check: commits that change only docs/work keep the record valid", () => {
  const p = project()
  verify(p, "run", WORK, "true")
  const recorded = p.head()
  p.commit(`${WORK}/decisions.md`, "# Decisions\n", true)
  const { status, out } = check(p)
  assert.equal(status, 0)
  assert.equal(out.commit, recorded)
  assert.equal(out.head, p.head())
  assert.notEqual(out.head, out.commit)
})

test("check: a commit of code after the record invalidates it", () => {
  const p = project()
  verify(p, "run", WORK, "true")
  p.commit("app.txt", "v2\n")
  const { status, out } = check(p)
  assert.equal(status, 1)
  assert.match(out.reason, /change more than workflow artifacts \(app\.txt\)/)
})

test("check: a record on a commit outside the history of HEAD", () => {
  const p = project()
  git(p.root, "checkout", "-q", "-b", "other")
  p.commit("other.txt")
  verify(p, "run", WORK, "true")
  git(p.root, "checkout", "-q", "main")
  const { out } = check(p)
  assert.match(out.reason, /not in the history of HEAD/)
})

test("check: a record on a commit that does not exist", () => {
  const p = project()
  p.append(`- ${"0".repeat(40)} — \`true\` exit 0 (recorded by verify.mjs)`)
  assert.match(check(p).out.reason, /not a commit of this repository/)
})

test("check: uncommitted changes outside docs/work make it not valid", () => {
  const p = project()
  verify(p, "run", WORK, "true")
  fs.writeFileSync(path.join(p.root, "app.txt"), "edited\n")
  const { status, out } = check(p)
  assert.equal(status, 1)
  assert.match(out.reason, /changes outside docs\/work\/ that are not in HEAD: app\.txt/)
})

test("check --json: errors are JSON too", () => {
  const p = project()
  const r = verify(p, "check", "docs", "--json")
  assert.equal(r.status, 1)
  const out = JSON.parse(r.stdout)
  assert.equal(out.code, 1)
  assert.match(out.error, /no state\.md/)
})
