#!/usr/bin/env node
// Cost and token report for an opencode session and all its sub-sessions.
//
//   node session-cost.mjs <session-id|prefix>   report for that session tree
//   node session-cost.mjs --list [N]            most recent root sessions (default 15)
//
// Options: --db PATH (default $OPENCODE_DB, else <XDG data>/opencode/opencode.db)
//          --json     machine-readable output
//          --sort cost|time   order of siblings in the tree (default cost)
//
// Reads the `session_v2` table read-only. Requires Node 22.5+ (node:sqlite), no dependencies.

import fs from "node:fs"
import os from "node:os"
import path from "node:path"

const args = process.argv.slice(2)
const option = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const flag = (name) => args.includes(name)

let DatabaseSync
try {
  ;({ DatabaseSync } = await import("node:sqlite"))
} catch {
  console.error("session-cost needs Node 22.5+ (node:sqlite).")
  process.exit(2)
}

const dataHome = process.env.XDG_DATA_HOME || path.join(os.homedir(), ".local", "share")
const dbPath = option("--db") ?? process.env.OPENCODE_DB ?? path.join(dataHome, "opencode", "opencode.db")
if (!fs.existsSync(dbPath)) {
  console.error(`opencode database not found: ${dbPath} (use --db)`)
  process.exit(2)
}
const db = new DatabaseSync(dbPath, { readOnly: true })

const COLS = `id, parent_id, title, agent, model, cost, tokens_input, tokens_output, tokens_reasoning,
  tokens_cache_read, tokens_cache_write, time_created, time_updated`

// ---------- formatting ----------
const usd = (n) => (n < 0.005 && n > 0 ? "<$0.01" : `$${n.toFixed(2)}`)
const num = (n) =>
  n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}k` : String(n)
const dur = (ms) => {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return m < 60 ? `${m}m${String(s % 60).padStart(2, "0")}s` : `${Math.floor(m / 60)}h${String(m % 60).padStart(2, "0")}m`
}
const pad = (s, n) => String(s).padEnd(n)
const rpad = (s, n) => String(s).padStart(n)
const modelName = (raw) => {
  if (!raw) return "unknown"
  try {
    const m = JSON.parse(raw)
    if (m && typeof m === "object") {
      const id = m.modelID ?? m.id ?? m.model
      const provider = m.providerID ?? m.provider
      if (id) return provider ? `${provider}/${id}` : String(id)
    }
    if (typeof m === "string") return m
  } catch {}
  return String(raw)
}

// ---------- --list ----------
if (flag("--list")) {
  const n = Number(args[args.indexOf("--list") + 1]) || 15
  const rows = db
    .prepare(
      `SELECT ${COLS}, (SELECT count(*) FROM session_v2 c WHERE c.parent_id = s.id) AS children
       FROM session_v2 s WHERE parent_id IS NULL ORDER BY time_updated DESC LIMIT ?`,
    )
    .all(n)
  for (const r of rows)
    console.log(
      `${pad(r.id, 32)} ${new Date(r.time_updated).toISOString().slice(0, 16).replace("T", " ")}  ` +
        `${rpad(usd(r.cost), 8)}  ${rpad(r.children, 3)} sub  ${r.title ?? ""}`,
    )
  process.exit(0)
}

// ---------- resolve session ----------
const ref = args.find((a, i) => !a.startsWith("--") && !["--db", "--sort", "--list"].includes(args[i - 1]))
if (!ref) {
  console.error("usage: session-cost.mjs <session-id|prefix> | --list [N]   (see header for options)")
  process.exit(2)
}
const matches = db.prepare(`SELECT id FROM session_v2 WHERE id = ? OR id LIKE ? ORDER BY time_created`).all(ref, `${ref}%`)
if (matches.length === 0) {
  console.error(`no session matches "${ref}"`)
  process.exit(1)
}
const exact = matches.find((m) => m.id === ref)
if (!exact && matches.length > 1) {
  console.error(`"${ref}" is ambiguous:\n${matches.map((m) => `  ${m.id}`).join("\n")}`)
  process.exit(1)
}
const rootId = (exact ?? matches[0]).id

// ---------- load the tree ----------
const rows = db
  .prepare(
    `WITH RECURSIVE tree(id) AS (
       SELECT id FROM session_v2 WHERE id = ?
       UNION SELECT s.id FROM session_v2 s JOIN tree t ON s.parent_id = t.id
     ) SELECT ${COLS} FROM session_v2 WHERE id IN (SELECT id FROM tree)`,
  )
  .all(rootId)

const empty = () => ({ cost: 0, input: 0, output: 0, reasoning: 0, cacheRead: 0, cacheWrite: 0 })
const add = (a, b) => {
  for (const k of Object.keys(b)) a[k] += b[k]
  return a
}
const nodes = new Map(
  rows.map((r) => [
    r.id,
    {
      ...r,
      model: modelName(r.model),
      own: {
        cost: r.cost,
        input: r.tokens_input,
        output: r.tokens_output,
        reasoning: r.tokens_reasoning,
        cacheRead: r.tokens_cache_read,
        cacheWrite: r.tokens_cache_write,
      },
      children: [],
    },
  ]),
)
for (const n of nodes.values()) if (n.parent_id && nodes.has(n.parent_id)) nodes.get(n.parent_id).children.push(n)

const sortKey = option("--sort") === "time" ? (n) => n.time_created : (n) => -n.total.cost
const rollup = (n) => {
  n.total = add(empty(), n.own)
  n.last = n.time_updated
  for (const c of n.children) {
    rollup(c)
    add(n.total, c.total)
    n.last = Math.max(n.last, c.last)
  }
  n.children.sort((a, b) => sortKey(a) - sortKey(b))
}
const root = nodes.get(rootId)
rollup(root)

// ---------- breakdowns ----------
const group = (keyFn) => {
  const m = new Map()
  for (const n of nodes.values()) {
    const k = keyFn(n)
    const g = m.get(k) ?? { ...empty(), sessions: 0 }
    add(g, n.own)
    g.sessions++
    m.set(k, g)
  }
  return [...m].sort((a, b) => b[1].cost - a[1].cost)
}
const byAgent = group((n) => n.agent ?? (n.id === rootId ? "(root)" : "(unknown)"))
const byModel = group((n) => n.model)
const T = root.total
const promptTokens = T.input + T.cacheRead + T.cacheWrite
const cacheHit = promptTokens ? T.cacheRead / promptTokens : 0
const wall = root.last - root.time_created

if (flag("--json")) {
  const strip = (n) => ({
    id: n.id,
    parent_id: n.parent_id,
    title: n.title,
    agent: n.agent,
    model: n.model,
    own: n.own,
    total: n.total,
    started: n.time_created,
    updated: n.time_updated,
    children: n.children.map(strip),
  })
  const rec = (arr) => arr.map(([k, v]) => ({ key: k, ...v }))
  console.log(
    JSON.stringify(
      { root: strip(root), sessions: nodes.size, wall_ms: wall, cache_hit: cacheHit, by_agent: rec(byAgent), by_model: rec(byModel) },
      null,
      2,
    ),
  )
  process.exit(0)
}

// ---------- text report ----------
const out = []
out.push(`Session ${root.id} — ${root.title ?? "(untitled)"}`)
out.push(`${nodes.size} session${nodes.size === 1 ? "" : "s"} · wall time ${dur(wall)} · total ${usd(T.cost)}`)
out.push("")
out.push(
  `Tokens: in ${num(T.input)} · out ${num(T.output)} · reasoning ${num(T.reasoning)} · ` +
    `cache read ${num(T.cacheRead)} · cache write ${num(T.cacheWrite)} · cache hit ${(cacheHit * 100).toFixed(0)}%`,
)
out.push("")
out.push("Tree (cost = own; subtree in brackets when it has children)")
const label = (n) => `${n.agent ?? (n.id === rootId ? "root" : "?")} — ${n.title ?? n.id}`.slice(0, 60)
const walk = (n, prefix, last, top) => {
  const branch = top ? "" : last ? "└ " : "├ "
  const sub = n.children.length ? `  [subtree ${usd(n.total.cost)}, ${((n.total.cost / (T.cost || 1)) * 100).toFixed(0)}%]` : ""
  out.push(`${pad(prefix + branch + label(n), 64)} ${rpad(usd(n.own.cost), 8)}  ${rpad(dur(n.time_updated - n.time_created), 7)}${sub}`)
  const next = prefix + (top ? "" : last ? "  " : "│ ")
  n.children.forEach((c, i) => walk(c, next, i === n.children.length - 1, false))
}
walk(root, "", true, true)
out.push("")

const table = (title, entries) => {
  out.push(title)
  out.push(`  ${pad("", 34)} ${rpad("sess", 5)} ${rpad("cost", 8)} ${rpad("%", 5)} ${rpad("in", 8)} ${rpad("out", 8)} ${rpad("cache-r", 8)}`)
  for (const [k, v] of entries)
    out.push(
      `  ${pad(k.slice(0, 34), 34)} ${rpad(v.sessions, 5)} ${rpad(usd(v.cost), 8)} ${rpad(((v.cost / (T.cost || 1)) * 100).toFixed(0), 5)} ` +
        `${rpad(num(v.input), 8)} ${rpad(num(v.output), 8)} ${rpad(num(v.cacheRead), 8)}`,
    )
  out.push("")
}
table("By agent", byAgent)
table("By model", byModel)

const top = [...nodes.values()].sort((a, b) => b.own.cost - a.own.cost).slice(0, 5)
out.push("Most expensive sessions")
for (const n of top) out.push(`  ${rpad(usd(n.own.cost), 8)}  ${label(n)}  (${n.id})`)
if (T.cost === 0) out.push("", "Note: total cost is 0 — the provider may not report pricing for these models.")

console.log(out.join("\n"))
