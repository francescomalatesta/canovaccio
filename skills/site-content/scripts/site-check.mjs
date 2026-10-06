#!/usr/bin/env node
// Checks a public site against its approved content (content.md) without an LLM.
//
//   node site-check.mjs --lint --content FILE [--content FILE...] [--facts FILE] [--json]
//       the content files alone: structure, metadata, fact references, open placeholders
//   node site-check.mjs --content FILE [--content FILE...] (--url BASE | --dist DIR) [--page ROUTE...] [--sitemap] [--json]
//       the rendered pages against the content: copy, calls to action, metadata, alt texts, headings,
//       language, internal links; --dist serves a built site itself, --url uses a running server
//
// Exit codes: 0 nothing to review, 2 findings to review, 1 the check could not run.
// No dependencies: Node 18+.

import fs from "node:fs"
import http from "node:http"
import path from "node:path"

const args = process.argv.slice(2)
const option = (name) => {
  const i = args.indexOf(name)
  return i === -1 ? undefined : args[i + 1]
}
const options = (name) => args.flatMap((a, i) => (a === name && args[i + 1] ? [args[i + 1]] : []))
const contentFiles = options("--content")
const factsFile = option("--facts")
const baseOption = option("--url")
const distOption = option("--dist")
const onlyPages = options("--page")
const lintOnly = args.includes("--lint")
const checkSitemap = args.includes("--sitemap")
const asJson = args.includes("--json")

function fail(message) {
  console.error(`site-check: ${message}`)
  process.exit(1)
}

if (!contentFiles.length) fail("give at least one --content file.")
if (!lintOnly && !baseOption === !distOption) fail("give exactly one of --url and --dist, or --lint.")

// ---------------------------------------------------------------------------------------------------------
// content.md

const META_KEYS = new Set(["Route", "Title", "Description", "Image"])
const NOTE_KEYS = new Set(["Asset", "Note", "Component"])
const LINK_KEYS = new Set(["CTA", "Link"])
const BULLET = /^\s*[-*]\s+([A-Z][A-Za-z0-9 ]{0,24}):\s+(.*\S)\s*$/
const FACT_REFS = /\s*\[F\d+(?:\s*,\s*F\d+)*\]/g
const PLACEHOLDER = /\[OPEN:[^\]]*\]/g

// Markdown emphasis and links are formatting, not copy; fact references are sources, not copy.
const plain = (text) =>
  text
    .replace(FACT_REFS, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_]+)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/`([^`]+)`/g, "$1")
    .trim()

function splitLink(value) {
  const m = value.match(/^(.*?)\s*(?:→|->)\s*(\S+)$/)
  return m ? { label: plain(m[1]), target: m[2] } : { label: plain(value), target: undefined }
}

function parseContent(file) {
  let text
  try {
    text = fs.readFileSync(file, "utf8")
  } catch (e) {
    fail(`cannot read ${file}: ${e.message}`)
  }
  const doc = { file, language: undefined, shared: [], pages: [], errors: [], placeholders: [], facts: new Set() }
  let page = null
  let section = null
  let inShared = false
  let inFence = false
  text.split("\n").forEach((line, i) => {
    const at = `${file}:${i + 1}`
    if (/^\s*```/.test(line)) inFence = !inFence
    if (inFence) return
    const h2 = line.match(/^##\s+(.*\S)\s*$/)
    if (h2) {
      section = null
      inShared = /^shared$/i.test(h2[1])
      const p = h2[1].match(/^Page:\s*(.+)$/i)
      page = p ? { name: p[1], meta: {}, items: [], line: i + 1 } : null
      if (page) doc.pages.push(page)
      else if (!inShared) doc.errors.push(`${at}: "## ${h2[1]}" is neither "## Shared" nor "## Page: <name>"`)
      return
    }
    const h3 = line.match(/^###\s+(.*\S)\s*$/)
    if (h3) {
      section = h3[1]
      return
    }
    const m = line.match(BULLET)
    if (!m) return
    const [, key, raw] = m
    for (const refs of raw.match(FACT_REFS) ?? []) for (const ref of refs.match(/F\d+/g)) doc.facts.add(ref)
    for (const ph of raw.match(PLACEHOLDER) ?? []) doc.placeholders.push({ at, page: page?.name ?? "Shared", text: ph })
    if (!page && !inShared) {
      if (key === "Language") doc.language = raw.trim()
      return
    }
    if (page && !section) {
      if (META_KEYS.has(key)) page.meta[key] = plain(raw)
      else doc.errors.push(`${at}: "${key}" before the first section of page ${page.name}; page metadata is ${[...META_KEYS].join(", ")}`)
      return
    }
    if (NOTE_KEYS.has(key)) return
    const item = { key, section, at }
    if (LINK_KEYS.has(key)) {
      const link = splitLink(raw)
      Object.assign(item, link, { text: link.label })
    } else item.text = plain(raw)
    if (!item.text) doc.errors.push(`${at}: "${key}" has no text`)
    else (page ? page.items : doc.shared).push(item)
  })
  const routes = new Map()
  for (const p of doc.pages) {
    for (const key of ["Route", "Title", "Description"]) {
      if (!p.meta[key]) doc.errors.push(`${file}:${p.line}: page ${p.name} has no ${key}`)
    }
    if (p.meta.Route && !p.meta.Route.startsWith("/")) doc.errors.push(`${file}:${p.line}: route of page ${p.name} must start with "/"`)
    if (p.meta.Route && routes.has(p.meta.Route)) doc.errors.push(`${file}:${p.line}: route ${p.meta.Route} also used by page ${routes.get(p.meta.Route)}`)
    if (p.meta.Route) routes.set(p.meta.Route, p.name)
    if (!p.items.length) doc.errors.push(`${file}:${p.line}: page ${p.name} has no copy`)
  }
  if (!doc.pages.length) doc.errors.push(`${file}: no "## Page: <name>" section`)
  return doc
}

function knownFacts(file) {
  let text
  try {
    text = fs.readFileSync(file, "utf8")
  } catch (e) {
    fail(`cannot read ${file}: ${e.message}`)
  }
  const ids = new Set()
  for (const line of text.split("\n")) {
    const m = line.match(/^\s*(?:[-*]|#{2,4})\s+\**(F\d+)\b/)
    if (m) ids.add(m[1])
  }
  return ids
}

// ---------------------------------------------------------------------------------------------------------
// HTML: a small tolerant extractor. It reads what a visitor reads, not the markup.

const VOID = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "source", "track", "wbr"])
const SKIP = new Set(["script", "style", "noscript", "template", "svg", "math", "iframe", "canvas", "head"])
const BLOCK = new Set([
  "address", "article", "aside", "blockquote", "body", "button", "caption", "dd", "details", "dialog", "div", "dl", "dt",
  "fieldset", "figcaption", "figure", "footer", "form", "h1", "h2", "h3", "h4", "h5", "h6", "header", "hr", "label",
  "legend", "li", "main", "nav", "ol", "optgroup", "option", "p", "pre", "section", "select", "summary", "table",
  "tbody", "td", "textarea", "tfoot", "th", "thead", "tr", "ul",
])
const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", copy: "©", reg: "®", trade: "™", euro: "€", middot: "·", shy: "" }
const decode = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
    if (e[0] === "#") {
      const code = e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : all
    }
    return ENTITIES[e.toLowerCase()] ?? all
  })

function attributes(source) {
  const out = {}
  for (const m of source.matchAll(/([^\s"'>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
    out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "")
  }
  return out
}

function extract(html) {
  const page = { blocks: [], headings: [], anchors: [], images: [], ids: new Set(), meta: {}, lang: undefined, title: undefined }
  const head = html.match(/<head[\s>][\s\S]*?<\/head>/i)?.[0] ?? ""
  page.title = decode(head.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? "").trim() || undefined
  for (const tag of head.matchAll(/<(meta|link)\b([^>]*)>/gi)) {
    const a = attributes(tag[2])
    const key = (a.name ?? a.property ?? "").toLowerCase()
    if (tag[1].toLowerCase() === "meta" && key) page.meta[key] = a.content
    if (tag[1].toLowerCase() === "link" && (a.rel ?? "").toLowerCase().split(/\s+/).includes("canonical")) page.meta.canonical = a.href
  }
  page.lang = html.match(/<html\b([^>]*)>/i) ? attributes(html.match(/<html\b([^>]*)>/i)[1]).lang : undefined

  const body = html.replace(/<!--[\s\S]*?-->|<![^>]*>|<\?[^>]*>/g, "")
  const stack = []
  let hidden = 0
  let text = ""
  const flush = () => {
    const t = text.replace(/\s+/g, " ").trim()
    if (t) page.blocks.push(t)
    text = ""
  }
  const open = (name, a) => {
    const el = { name, hidden: hidden > 0 || "hidden" in a || a["aria-hidden"] === "true" || SKIP.has(name) }
    if (el.hidden && hidden === 0) flush()
    if (el.hidden) hidden++
    if (BLOCK.has(name)) flush()
    if (/^h[1-6]$/.test(name)) el.heading = { level: Number(name[1]), text: "" }
    if (name === "a") el.anchor = { href: a.href, text: "", label: a["aria-label"] }
    stack.push(el)
  }
  const close = (name) => {
    const i = stack.map((e) => e.name).lastIndexOf(name)
    if (i === -1) return
    for (const el of stack.splice(i).reverse()) {
      if (el.hidden) hidden--
      if (el.heading && !el.hidden) page.headings.push({ level: el.heading.level, text: el.heading.text.replace(/\s+/g, " ").trim() })
      if (el.anchor && !el.hidden) page.anchors.push({ href: el.anchor.href, text: (el.anchor.text.replace(/\s+/g, " ").trim() || el.anchor.label) ?? "" })
      if (BLOCK.has(el.name)) flush()
    }
  }
  const addText = (t) => {
    if (hidden || !t) return
    text += t
    for (const el of stack) {
      if (el.heading) el.heading.text += t
      if (el.anchor) el.anchor.text += t
    }
  }
  // Raw-text elements first, so that markup inside a script or style is not read as tags.
  const tokens = /<(script|style|textarea|title)\b[^>]*>[\s\S]*?<\/\1\s*>|<\/?([a-zA-Z][a-zA-Z0-9-]*)((?:\s+[^\s"'>/=]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+))?)*)\s*\/?>/g
  let last = 0
  for (const m of body.matchAll(tokens)) {
    addText(decode(body.slice(last, m.index)))
    last = m.index + m[0].length
    if (m[1]) continue
    const name = m[2].toLowerCase()
    if (m[0][1] === "/") {
      close(name)
      continue
    }
    const a = attributes(m[3] ?? "")
    if (a.id && !hidden) page.ids.add(a.id)
    if (a.name && name === "a") page.ids.add(a.name)
    if (name === "img" && !hidden && !("hidden" in a) && a["aria-hidden"] !== "true") page.images.push({ src: a.src, alt: a.alt })
    if (name === "input" && /^(submit|button)$/i.test(a.type ?? "") && a.value) {
      flush()
      addText(a.value)
      flush()
    }
    if (name === "br") addText(" ")
    if (VOID.has(name) || m[0].endsWith("/>")) {
      if (BLOCK.has(name)) flush()
      continue
    }
    open(name, a)
  }
  addText(decode(body.slice(last)))
  close("html")
  flush()
  return page
}

// Typography and case are not what a review of the copy is about.
const norm = (s) =>
  (s ?? "")
    .normalize("NFKC")
    .replace(/[‘’‚′]/g, "'")
    .replace(/[“”„″]/g, '"')
    .replace(/[–—−]/g, "-")
    .replace(/­/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase()

// ---------------------------------------------------------------------------------------------------------
// Fetching: a running server, or a built directory served here.

const TYPES = { ".html": "text/html; charset=utf-8", ".css": "text/css", ".js": "text/javascript", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain", ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".avif": "image/avif", ".ico": "image/x-icon", ".woff2": "font/woff2" }

function serve(dir) {
  const root = path.resolve(dir)
  if (!fs.existsSync(root) || !fs.statSync(root).isDirectory()) fail(`--dist ${dir} is not a directory.`)
  const resolve = (pathname) => {
    let rel
    try {
      rel = decodeURIComponent(pathname)
    } catch {
      return undefined
    }
    const base = path.join(root, path.normalize(rel).replace(/^(\.\.[/\\])+/, ""))
    if (!base.startsWith(root)) return undefined
    for (const candidate of [base, path.join(base, "index.html"), `${base.replace(/\/$/, "")}.html`]) {
      if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
    }
  }
  const server = http.createServer((req, res) => {
    const file = resolve(new URL(req.url, "http://x").pathname)
    const notFound = path.join(root, "404.html")
    const send = (status, f) => {
      res.writeHead(status, { "content-type": TYPES[path.extname(f).toLowerCase()] ?? "application/octet-stream" })
      fs.createReadStream(f).pipe(res)
    }
    if (file) send(200, file)
    else if (fs.existsSync(notFound)) send(404, notFound)
    else res.writeHead(404).end()
  })
  return new Promise((ok) => server.listen(0, "127.0.0.1", () => ok({ server, base: `http://127.0.0.1:${server.address().port}` })))
}

const fetched = new Map()
function get(url) {
  if (!fetched.has(url)) {
    fetched.set(
      url,
      fetch(url, { redirect: "follow", signal: AbortSignal.timeout(20000) })
        .then(async (res) => ({ status: res.status, url: res.url, type: res.headers.get("content-type") ?? "", body: await res.text() }))
        .catch((e) => ({ status: 0, error: e.cause?.code ?? e.message })),
    )
  }
  return fetched.get(url)
}

// ---------------------------------------------------------------------------------------------------------
// Checks

const findings = []
const add = (where, severity, rule, message) => findings.push({ where, severity, rule, message })

const sameUrl = (a, b) => {
  const strip = (u) => `${u.origin}${u.pathname.replace(/\/(index\.html)?$/, "") || "/"}${u.search}`
  return strip(a) === strip(b)
}

function checkCopy(where, page, items, shared) {
  const text = page.blocks.map(norm).join("\n")
  const owned = []
  for (const item of items) {
    const label = `${item.key}${shared ? " (shared)" : ""}`
    if (item.key === "Alt") {
      if (!page.images.some((img) => norm(img.alt) === norm(item.text))) add(where, "Important", "alt-missing", `${label}: no image has the alt text "${item.text}"`)
      continue
    }
    owned.push(norm(item.text))
    if (!text.includes(norm(item.text))) {
      add(where, "Important", "missing-copy", `${label} [${item.at}]: "${item.text}" is not on the page`)
      continue
    }
    const heading = item.key.match(/^H([1-6])$/)
    if (heading && !page.headings.some((h) => h.level === Number(heading[1]) && norm(h.text).includes(norm(item.text)))) {
      add(where, "Minor", "heading-level", `${label}: "${item.text}" is on the page but not in an <h${heading[1]}>`)
    }
    if (LINK_KEYS.has(item.key) && item.target) {
      const anchors = page.anchors.filter((a) => norm(a.text) === norm(item.label))
      const expected = new URL(item.target, page.url)
      if (!anchors.length) add(where, "Important", "link-missing", `${label}: "${item.label}" is not a link (expected → ${item.target})`)
      else if (!anchors.some((a) => a.href !== undefined && sameUrl(new URL(a.href, page.url), expected))) {
        add(where, "Important", "link-target", `${label}: "${item.label}" links to ${anchors.map((a) => a.href ?? "(no href)").join(", ")}, expected ${item.target}`)
      }
    }
  }
  return owned
}

// Text a visitor reads that the approved content does not contain: invented copy, or legitimate
// text the content forgot. The reviewer decides which.
function unlisted(where, page, owned) {
  const sorted = [...new Set(owned)].sort((a, b) => b.length - a.length)
  for (const block of page.blocks) {
    let rest = norm(block)
    for (const copy of sorted) rest = rest.split(copy).join(" ")
    if (/\p{L}{3,}/u.test(rest.replace(/\[open:[^\]]*\]/g, ""))) add(where, "Review", "unlisted-text", `"${block.length > 140 ? `${block.slice(0, 137)}...` : block}"`)
  }
}

async function checkPage(doc, p, base, linkTargets) {
  const route = p.meta.Route
  const where = `${route} (${p.name})`
  const res = await get(new URL(route, base).href)
  if (res.status !== 200) {
    add(where, "Important", "page-status", res.status ? `HTTP ${res.status}` : `not reachable (${res.error})`)
    return
  }
  const page = { ...extract(res.body), url: res.url }
  if (norm(page.title) !== norm(p.meta.Title)) add(where, "Important", "meta-title", `<title> is "${page.title ?? ""}", expected "${p.meta.Title}"`)
  if (norm(page.meta.description) !== norm(p.meta.Description)) add(where, "Important", "meta-description", `meta description is "${page.meta.description ?? ""}", expected "${p.meta.Description}"`)
  if (doc.language && (page.lang ?? "").toLowerCase().split("-")[0] !== doc.language.toLowerCase().split("-")[0]) add(where, "Important", "lang", `<html lang> is "${page.lang ?? ""}", expected "${doc.language}"`)
  const h1 = page.headings.filter((h) => h.level === 1).length
  if (h1 !== 1) add(where, "Important", "h1-count", `${h1} <h1> elements, expected one`)
  if (!page.meta.canonical) add(where, "Minor", "canonical", "no canonical link")
  for (const key of ["og:title", "og:description"]) if (!page.meta[key]) add(where, "Minor", "open-graph", `no ${key}`)
  if (p.meta.Image && !(page.meta["og:image"] && sameUrl(new URL(page.meta["og:image"], page.url), new URL(p.meta.Image, page.url)))) {
    add(where, "Minor", "open-graph", `og:image is "${page.meta["og:image"] ?? ""}", expected "${p.meta.Image}"`)
  }
  for (const img of page.images) if (img.alt === undefined) add(where, "Important", "alt-missing", `image ${img.src ?? "(no src)"} has no alt attribute`)
  const owned = [...checkCopy(where, page, p.items, false), ...checkCopy(where, page, doc.shared, true)]
  unlisted(where, page, owned)
  for (const block of page.blocks) for (const ph of block.match(PLACEHOLDER) ?? []) add(where, "Open", "placeholder", ph)

  const origin = new URL(base).origin
  for (const a of page.anchors) {
    if (!a.href || /^(mailto|tel|javascript|data):/i.test(a.href)) continue
    const target = new URL(a.href, page.url)
    if (target.origin !== origin) continue
    const key = target.href
    if (!linkTargets.has(key)) linkTargets.set(key, new Set())
    linkTargets.get(key).add(route)
  }
  for (const img of page.images) {
    if (!img.src || img.src.startsWith("data:")) continue
    const target = new URL(img.src, page.url)
    if (target.origin !== origin) continue
    if (!linkTargets.has(target.href)) linkTargets.set(target.href, new Set())
    linkTargets.get(target.href).add(route)
  }
}

async function checkLinks(linkTargets) {
  for (const [href, from] of linkTargets) {
    const url = new URL(href)
    const hash = decodeURIComponent(url.hash.slice(1))
    url.hash = ""
    const res = await get(url.href)
    const sources = [...from].join(", ")
    if (res.status === 0 || res.status >= 400) {
      add("Site", "Important", "broken-link", `${url.pathname}${url.search} → ${res.status || res.error} (from ${sources})`)
      continue
    }
    if (hash && res.type.includes("html") && !extract(res.body).ids.has(hash)) {
      add("Site", "Important", "broken-anchor", `${url.pathname}#${hash}: no element with that id (from ${sources})`)
    }
  }
}

async function checkSite(docs, base) {
  const robots = await get(new URL("/robots.txt", base).href)
  if (robots.status !== 200) add("Site", "Minor", "robots", "no /robots.txt")
  const sitemapUrl = robots.body?.match(/^\s*sitemap:\s*(\S+)/im)?.[1] ?? new URL("/sitemap.xml", base).href
  const sitemap = await get(new URL(new URL(sitemapUrl).pathname, base).href)
  if (sitemap.status !== 200) {
    add("Site", "Important", "sitemap", `no sitemap at ${new URL(sitemapUrl).pathname}`)
    return
  }
  // A sitemap index lists other sitemaps: read them too.
  let locs = [...sitemap.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1]))
  if (/<sitemapindex/i.test(sitemap.body)) {
    const nested = await Promise.all(locs.map((l) => get(new URL(new URL(l).pathname, base).href)))
    locs = nested.flatMap((r) => [...(r.body ?? "").matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => decode(m[1])))
  }
  const paths = new Set(locs.map((l) => new URL(l).pathname.replace(/\/(index\.html)?$/, "") || "/"))
  for (const doc of docs) {
    for (const p of doc.pages) {
      const route = p.meta.Route.replace(/\/$/, "") || "/"
      if (!paths.has(route)) add("Site", "Important", "sitemap", `${p.meta.Route} (${p.name}) is not in the sitemap`)
    }
  }
}

// ---------------------------------------------------------------------------------------------------------
// Report

const ORDER = ["Important", "Minor", "Review", "Open"]

function report(header, extra = {}) {
  const counts = Object.fromEntries(ORDER.map((s) => [s, findings.filter((f) => f.severity === s).length]))
  if (asJson) {
    console.log(JSON.stringify({ ...extra, counts, findings }, null, 2))
  } else {
    console.log(header)
    const groups = [...new Set(findings.map((f) => f.where))]
    for (const where of groups) {
      console.log(`\n${where}`)
      const list = findings.filter((f) => f.where === where).sort((a, b) => ORDER.indexOf(a.severity) - ORDER.indexOf(b.severity))
      for (const f of list) console.log(`  ${f.severity.padEnd(9)} ${f.rule.padEnd(16)} ${f.message}`)
    }
    console.log(
      `\nSummary: ${counts.Important} Important, ${counts.Minor} Minor, ${counts.Review} to review, ${counts.Open} open placeholder${counts.Open === 1 ? "" : "s"}`,
    )
  }
  process.exit(findings.length ? 2 : 0)
}

const docs = contentFiles.map(parseContent)
for (const doc of docs) for (const e of doc.errors) add(doc.file, "Important", "content-format", e)
if (factsFile) {
  const known = knownFacts(factsFile)
  for (const doc of docs) for (const ref of doc.facts) if (!known.has(ref)) add(doc.file, "Important", "unknown-fact", `${ref} is not in ${factsFile}`)
}

if (lintOnly) {
  for (const doc of docs) for (const ph of doc.placeholders) add(doc.file, "Open", "placeholder", `${ph.text} (${ph.page}, ${ph.at})`)
  const pages = docs.reduce((n, d) => n + d.pages.length, 0)
  const items = docs.reduce((n, d) => n + d.shared.length + d.pages.reduce((m, p) => m + p.items.length, 0), 0)
  report(`site-check --lint: ${docs.length} content file${docs.length === 1 ? "" : "s"}, ${pages} pages, ${items} copy items`, { pages, items })
}

if (docs.some((d) => d.errors.length)) report("site-check: the content files have format errors; fix them before checking pages")

let base = baseOption
let server
if (distOption) ({ server, base } = await serve(distOption))
try {
  new URL(base)
} catch {
  fail(`--url ${base} is not a URL.`)
}
const reach = await get(new URL("/", base).href)
if (reach.status === 0) fail(`${base} is not reachable (${reach.error}); start the site first, or use --dist.`)

const linkTargets = new Map()
let checked = 0
for (const doc of docs) {
  for (const p of doc.pages) {
    if (onlyPages.length && !onlyPages.includes(p.meta.Route)) continue
    checked++
    await checkPage(doc, p, base, linkTargets)
  }
}
if (onlyPages.length && checked < onlyPages.length) {
  const known = new Set(docs.flatMap((d) => d.pages.map((p) => p.meta.Route)))
  for (const r of onlyPages) if (!known.has(r)) add("Site", "Important", "unknown-page", `${r} is not a route in the content`)
}
await checkLinks(linkTargets)
if (checkSitemap) await checkSite(docs, base)
server?.close()

const where = distOption ? `${base} serving ${distOption}` : base
report(`site-check: ${checked} page${checked === 1 ? "" : "s"} against ${contentFiles.join(", ")} at ${where}`, { checked, base: where })
