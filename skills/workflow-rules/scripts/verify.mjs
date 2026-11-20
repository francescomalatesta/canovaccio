#!/usr/bin/env node
// Records a workflow's final verification with real exit statuses, and says
// whether the last record still holds (see Test scope and final verification in
// the workflow-rules skill).
//
//   node verify.mjs run <work-dir> "<command>" ["<command>"...]
//       refuses a working tree with uncommitted changes outside docs/work/, runs
//       each command from the project root, writes their output to
//       verification.log in the work directory and appends the record to the
//       Verification section of its state.md:
//         - <40-hex commit> — `make test` exit 0; `make lint` exit 0 (recorded by verify.mjs)
//       Exit 0 when every command exited 0, 1 otherwise.
//
//   node verify.mjs check <work-dir> [--json]
//       whether the last record written by `run` holds for HEAD: every command
//       exited 0, HEAD is the recorded commit or a descendant whose later commits
//       change only files under docs/work/, and the working tree has no changes
//       outside docs/work/. Lines written by hand never count. With --json:
//         {"valid": true, "head": "<40-hex>", "commit": "<40-hex>", "commands": [{"cmd": "make test", "exit": 0}]}
//         {"valid": false, "head": "…", "commit": "…" | null, "commands": […], "reason": "<why it does not hold>"}
//       and on an error {"error": "<message>", "code": <exit code>}.
//       Exit 0 when the record holds, 1 when it does not or on an error.
//
// <work-dir> is a workflow work directory (docs/work/<dir>/) holding state.md,
// relative to the current directory or absolute.
// Exit code 2: usage. No dependencies: Node 18+.

import { spawnSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const args = process.argv.slice(2)
const [command, dirArg] = args
const json = command === "check" && args.includes("--json")

const RECORD_TAG = "(recorded by verify.mjs)"
const RECORD = /^- ([0-9a-f]{40}) — (.+) \(recorded by verify\.mjs\)$/
// Commits after the recorded one may change only workflow artifacts: they need
// no new run of the suites.
const ARTIFACTS = /^docs\/work\//
const USAGE = 'usage: verify.mjs run <work-dir> "<command>" ["<command>"...]\n       verify.mjs check <work-dir> [--json]'

function fail(message, code = 1) {
  if (json) console.log(JSON.stringify({ error: message, code }, null, 2))
  else console.error(message)
  process.exit(code)
}

function sh(cmd, a, cwd) {
  const r = spawnSync(cmd, a, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024 })
  return { ok: r.status === 0, out: r.stdout || "", err: (r.stderr || r.error?.message || "").trim() }
}

function git(root, ...a) {
  const r = sh("git", a, root)
  if (!r.ok) fail(`git ${a.join(" ")} failed: ${r.err}`)
  return r.out.trim()
}

// The work directory, its state.md and the project root.
function locate(dir) {
  if (!dir || dir.startsWith("--")) fail(USAGE, 2)
  const workDir = path.resolve(dir)
  const stateFile = path.join(workDir, "state.md")
  if (!fs.existsSync(stateFile)) fail(`no state.md in ${workDir}`)
  const top = sh("git", ["rev-parse", "--show-toplevel"], workDir)
  if (!top.ok) fail(`${workDir} is not inside a git repository`)
  return { workDir, stateFile, root: top.out.trim() }
}

// Changes of the working tree that are not in HEAD, outside docs/work/: tracked
// files changed, and untracked files that are not ignored.
function uncommitted(root) {
  const r = sh("git", ["status", "--porcelain", "--untracked-files=all"], root)
  if (!r.ok) fail(`git status failed: ${r.err}`)
  return r.out
    .split("\n")
    .filter(Boolean)
    .filter((l) => !ARTIFACTS.test(l.slice(3).replace(/^"/, "")))
}

// A record line written by `run`, or undefined for any other line.
function parseRecord(line) {
  const m = line.trimEnd().match(RECORD)
  if (!m || !/^`[^`\n]+` exit \d+(; `[^`\n]+` exit \d+)*$/.test(m[2])) return undefined
  const commands = [...m[2].matchAll(/`([^`\n]+)` exit (\d+)/g)].map((p) => ({ cmd: p[1], exit: Number(p[2]) }))
  return { commit: m[1], commands, line: line.trimEnd() }
}

// The records of the Verification section, and its other lines.
function readVerification(stateFile) {
  const text = fs.readFileSync(stateFile, "utf8")
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
  return { records, lines }
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

// --- run -----------------------------------------------------------------------

function run(dir, commands) {
  if (!commands.length) fail(USAGE, 2)
  const { workDir, stateFile, root } = locate(dir)
  for (const c of commands)
    if (!c.trim() || /[`\n]/.test(c)) fail(`a command must be one line without backticks: ${JSON.stringify(c)}`, 2)
  const dirty = uncommitted(root)
  if (dirty.length)
    fail(`commit the work first: the final verification is recorded on a commit, and these changes are not in HEAD:\n${dirty.join("\n")}`)
  const head = git(root, "rev-parse", "HEAD")
  const logFile = path.join(workDir, "verification.log")
  fs.writeFileSync(logFile, `final verification on ${head}, ${new Date().toISOString()}\n`)
  const results = []
  for (const cmd of commands) {
    fs.appendFileSync(logFile, `\n$ ${cmd}\n`)
    const fd = fs.openSync(logFile, "a")
    const r = spawnSync("sh", ["-c", cmd], { cwd: root, stdio: ["ignore", fd, fd] })
    fs.closeSync(fd)
    const exit = r.status ?? (r.signal ? 143 : 127)
    fs.appendFileSync(logFile, `exit ${exit}\n`)
    results.push({ cmd, exit })
    console.log(`\`${cmd}\` exit ${exit}`)
  }
  if (git(root, "rev-parse", "HEAD") !== head || uncommitted(root).length)
    fail("the verification changed the working tree or HEAD, so it was not recorded: commit or revert what it changed and run it again")
  appendToVerification(stateFile, `- ${head} — ${results.map((r) => `\`${r.cmd}\` exit ${r.exit}`).join("; ")} ${RECORD_TAG}`)
  console.log(`recorded in ${path.relative(root, stateFile)}; output in ${path.relative(root, logFile)}`)
  const failed = results.filter((r) => r.exit !== 0)
  if (!failed.length) return 0
  console.log(`failed: ${failed.map((r) => `\`${r.cmd}\``).join(", ")}; the tail of the output:`)
  console.log(fs.readFileSync(logFile, "utf8").split("\n").slice(-60).join("\n"))
  return 1
}

// --- check ---------------------------------------------------------------------

// The reason the last record does not hold for HEAD, or undefined when it does.
function reasonAgainst(root, { records, lines }, head) {
  const record = records.at(-1)
  const expected = 'record it with `node verify.mjs run <work-dir> "<command>"...`'
  if (!record) {
    const last = lines.at(-1)
    return last
      ? `no final verification recorded by verify.mjs in the Verification section of state.md (its last line is "${last}"): ${expected}`
      : `no final verification is recorded in state.md: ${expected}`
  }
  const failed = record.commands.filter((c) => c.exit !== 0)
  if (failed.length)
    return `the recorded final verification has a failing command: ${failed.map((c) => `\`${c.cmd}\` exit ${c.exit}`).join(", ")} (record: "${record.line}")`
  if (record.commit !== head) {
    if (!sh("git", ["rev-parse", "--verify", "--quiet", `${record.commit}^{commit}`], root).ok)
      return `the recorded final verification is on ${record.commit.slice(0, 12)}, which is not a commit of this repository (record: "${record.line}")`
    if (!sh("git", ["merge-base", "--is-ancestor", record.commit, head], root).ok)
      return `the recorded final verification is on ${record.commit.slice(0, 12)}, which is not in the history of HEAD ${head.slice(0, 12)}: run it again on HEAD`
    const code = git(root, "diff", "--name-only", record.commit, head).split("\n").filter((f) => f && !ARTIFACTS.test(f))
    if (code.length)
      return `the recorded final verification is on ${record.commit.slice(0, 12)}, and the commits after it up to HEAD ${head.slice(0, 12)} change more than workflow artifacts (${code.slice(0, 5).join(", ")}${code.length > 5 ? ", …" : ""}): run it again on HEAD`
  }
  const dirty = uncommitted(root)
  if (dirty.length)
    return `the working tree has changes outside docs/work/ that are not in HEAD: ${dirty.slice(0, 5).map((l) => l.slice(3)).join(", ")}${dirty.length > 5 ? ", …" : ""}`
  return undefined
}

function check(dir) {
  const { stateFile, root } = locate(dir)
  const verification = readVerification(stateFile)
  const head = git(root, "rev-parse", "HEAD")
  const record = verification.records.at(-1)
  const reason = reasonAgainst(root, verification, head)
  const result = { valid: !reason, head, commit: record?.commit ?? null, commands: record?.commands ?? [], ...(reason ? { reason } : {}) }
  if (json) console.log(JSON.stringify(result, null, 2))
  else console.log(reason ? `not valid: ${reason}` : `valid: the record on ${record.commit.slice(0, 12)} holds for HEAD ${head.slice(0, 12)}`)
  return reason ? 1 : 0
}

if (command === "run") process.exitCode = run(dirArg, args.slice(2).filter((a, i) => !(i === 0 && a === "--")))
else if (command === "check") process.exitCode = check(dirArg)
else fail(USAGE, 2)
