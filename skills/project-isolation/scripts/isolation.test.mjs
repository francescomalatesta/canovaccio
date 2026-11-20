// Tests of the --json output of isolation.mjs new and remove.
//
//   node --test skills/project-isolation/scripts/isolation.test.mjs
//
// Scratch projects live in .canovaccio/tmp/isolation-tests/ of this repository
// and are removed at the end. They have no compose file, so Docker is not needed.

import { execFileSync, spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import { after, test } from "node:test"
import assert from "node:assert/strict"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const SCRIPT = path.join(here, "isolation.mjs")
const REPO = path.resolve(here, "../../..")
const TMP = path.join(REPO, ".canovaccio", "tmp", "isolation-tests")
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
  // Scratch directories that are not repositories must not resolve to this one.
  GIT_CEILING_DIRECTORIES: TMP,
}
const ENV = { ...process.env, ...GIT_ENV }
const git = (cwd, ...a) => execFileSync("git", a, { cwd, encoding: "utf8", env: ENV }).trim()

let counter = 0
const basePort = () => 41000 + 100 * counter

// A project in a directory of its own, so its worktrees (<project>.wt/) do not mix,
// with a base port of its own. `config` adds to the default config; null leaves it out.
function project({ config = {}, gitignore = ".env\n", trackEnv = false } = {}) {
  const dir = path.join(TMP, `case-${++counter}`, "proj")
  fs.mkdirSync(dir, { recursive: true })
  git(dir, "init", "-q", "-b", "main")
  fs.writeFileSync(path.join(dir, "README.md"), "# demo\n")
  if (gitignore !== null) fs.writeFileSync(path.join(dir, ".gitignore"), gitignore)
  if (config) {
    fs.mkdirSync(path.join(dir, ".canovaccio"), { recursive: true })
    const full = { offset: 10, activeLimit: 3, envFile: ".env", variables: { PORT: { port: basePort() } }, ...config }
    fs.writeFileSync(path.join(dir, ".canovaccio", "isolation.json"), JSON.stringify(full))
  }
  if (trackEnv) fs.writeFileSync(path.join(dir, ".env"), "SECRET=1\n")
  git(dir, "add", "-A", "-f")
  git(dir, "commit", "-q", "-m", "init")
  return fs.realpathSync(dir)
}

function run(cwd, ...args) {
  const r = spawnSync(process.execPath, [SCRIPT, ...args], { cwd, encoding: "utf8", env: ENV })
  let out
  assert.doesNotThrow(() => (out = JSON.parse(r.stdout)), `stdout is not JSON:\n${r.stdout}\nstderr:\n${r.stderr}`)
  return { status: r.status, out, stderr: r.stderr }
}

function assertFailure({ status, out }, code, pattern) {
  assert.equal(status, code)
  assert.equal(out.code, code)
  assert.equal(typeof out.error, "string")
  assert.match(out.error, pattern)
}

const wtPath = (proj, slug) => path.join(path.dirname(proj), "proj.wt", slug)

// --- new ----------------------------------------------------------------------

test("new --json: a detached worktree, with setup output kept off stdout", () => {
  const proj = project({ config: { include: [".env.local", "missing-dir"], setup: ["echo setup-says-hello"] } })
  fs.writeFileSync(path.join(proj, ".env.local"), "LOCAL=1\n")
  fs.appendFileSync(path.join(proj, ".gitignore"), ".env.local\n")
  const port = basePort()
  const { status, out, stderr } = run(proj, "new", "csv-export", "--json")
  assert.equal(status, 0)
  assert.deepEqual(Object.keys(out), ["slug", "path", "branch", "base", "slot", "env", "copied", "missing", "skipped"])
  assert.equal(out.slug, "csv-export")
  assert.equal(out.path, wtPath(proj, "csv-export"))
  assert.equal(out.branch, null)
  assert.equal(out.base, "HEAD")
  assert.equal(out.slot, 1)
  assert.deepEqual(out.env, { CANOVACCIO_SLOT: "1", COMPOSE_PROJECT_NAME: "proj-csv-export", PORT: String(port + 10) })
  assert.deepEqual(out.copied, [".env.local"])
  assert.deepEqual(out.missing, ["missing-dir"])
  assert.deepEqual(out.skipped, [])
  assert.match(stderr, /setup-says-hello/)
  assert.ok(fs.existsSync(path.join(out.path, ".env")))
})

test("new --json: a new branch from a base, in the next slot", () => {
  const proj = project()
  const base = git(proj, "rev-parse", "HEAD")
  assert.equal(run(proj, "new", "first", "--json").status, 0)
  const { status, out } = run(proj, "new", "second", "--base", base, "--branch", "feature/second", "--json")
  assert.equal(status, 0)
  assert.equal(out.branch, "feature/second")
  assert.equal(out.base, base)
  assert.equal(out.slot, 2)
  assert.equal(git(out.path, "rev-parse", "--abbrev-ref", "HEAD"), "feature/second")
})

test("new --json: an existing branch is checked out", () => {
  const proj = project()
  git(proj, "branch", "kb/existing")
  const { status, out } = run(proj, "new", "existing", "--branch", "kb/existing", "--json")
  assert.equal(status, 0)
  assert.equal(out.branch, "kb/existing")
  assert.equal(out.base, "kb/existing")
})

test("new --json: a slug that is not kebab-case", () => {
  const proj = project()
  assertFailure(run(proj, "new", "Bad_Slug", "--json"), 1, /usage/)
})

test("new --json: no slug", () => {
  const proj = project()
  assertFailure(run(proj, "new", "--json"), 1, /usage/)
})

test("new --json: a base without isolation config exits 2", () => {
  const proj = project({ config: null })
  assertFailure(run(proj, "new", "x", "--json"), 2, /isolation\.json/)
})

test("new --json: an invalid config", () => {
  const proj = project({ config: { offset: 0 } })
  assertFailure(run(proj, "new", "x", "--json"), 1, /offset must be a positive integer/)
})

test("new --json: an env file tracked by git", () => {
  const proj = project({ trackEnv: true })
  assertFailure(run(proj, "new", "x", "--json"), 1, /tracked by git/)
})

test("new --json: an env file not ignored by git", () => {
  const proj = project({ gitignore: null })
  assertFailure(run(proj, "new", "x", "--json"), 1, /not ignored by git/)
})

test("new --json: a worktree directory that already exists", () => {
  const proj = project()
  assert.equal(run(proj, "new", "twice", "--json").status, 0)
  assertFailure(run(proj, "new", "twice", "--json"), 1, /already exists/)
})

test("new --json: a branch already checked out elsewhere", () => {
  const proj = project()
  assertFailure(run(proj, "new", "dup", "--branch", "main", "--json"), 1, /git worktree add/)
})

test("new --json: a failed setup reports the worktree it left in place", () => {
  const proj = project({ config: { setup: ["echo before", "exit 3", "echo never"] } })
  const { status, out, stderr } = run(proj, "new", "broken", "--json")
  assertFailure({ status, out }, 1, /setup failed at: exit 3/)
  assert.equal(out.setupFailed, "exit 3")
  assert.equal(out.path, wtPath(proj, "broken"))
  assert.equal(out.slot, 1)
  assert.ok(fs.existsSync(out.path))
  assert.match(stderr, /before/)
  assert.doesNotMatch(stderr, /never/)
})

test("new --json: outside a git checkout", () => {
  const dir = path.join(TMP, "not-a-repo")
  fs.mkdirSync(dir, { recursive: true })
  assertFailure(run(dir, "new", "x", "--json"), 1, /not inside a git checkout/)
})

test("new without --json still prints prose", () => {
  const proj = project()
  const r = spawnSync(process.execPath, [SCRIPT, "new", "prose"], { cwd: proj, encoding: "utf8", env: ENV })
  assert.equal(r.status, 0)
  assert.match(r.stdout, /^worktree: /m)
  assert.throws(() => JSON.parse(r.stdout))
})

// --- remove -------------------------------------------------------------------

test("remove --json: a detached worktree", () => {
  const proj = project()
  const created = run(proj, "new", "gone", "--json").out
  const { status, out } = run(proj, "remove", "gone", "--json")
  assert.equal(status, 0)
  assert.deepEqual(out, { slug: "gone", path: created.path, branch: null, volumesKept: [] })
  assert.ok(!fs.existsSync(created.path))
})

test("remove --json: a worktree on a branch keeps the branch", () => {
  const proj = project()
  run(proj, "new", "kept", "--branch", "feature/kept", "--json")
  const { status, out } = run(proj, "remove", "kept", "--json")
  assert.equal(status, 0)
  assert.equal(out.branch, "feature/kept")
  assert.equal(git(proj, "branch", "--list", "feature/kept"), "feature/kept")
})

test("remove --json: no slug", () => {
  const proj = project()
  assertFailure(run(proj, "remove", "--json"), 1, /usage/)
})

test("remove --json: no such worktree", () => {
  const proj = project()
  assertFailure(run(proj, "remove", "nothing", "--json"), 1, /no worktree named nothing/)
})

test("remove --json: a worktree with untracked files", () => {
  const proj = project()
  const created = run(proj, "new", "dirty", "--json").out
  fs.writeFileSync(path.join(created.path, "scratch.txt"), "x\n")
  assertFailure(run(proj, "remove", "dirty", "--json"), 1, /uncommitted or untracked files/)
  assert.ok(fs.existsSync(created.path))
})

test("remove --json: from inside the worktree itself", () => {
  const proj = project()
  const created = run(proj, "new", "inside", "--json").out
  assertFailure(run(created.path, "remove", "inside", "--json"), 1, /remove it from another checkout/)
})
