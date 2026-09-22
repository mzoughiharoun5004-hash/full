// One-shot split of InlineScenarioCourseEditor.tsx (Session G / task 14).
// Usage:  node scripts/split-inline-editor/split.mjs [--dry] [--dir <editor dir>]
// Reads the original, cuts each component out verbatim by line range (only imports
// and `export` keywords change), writes the new tree, backs the original up to
// full/backups/, then swaps in the slim main component.
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import zlib from 'node:zlib'
import { fileURLToPath } from 'node:url'

const MANIFEST_SHA256 = '5b14055c7891deb6ea54ba149fae3ad9838aa8d50f11bd95aa078ac741652a64'

const here = path.dirname(fileURLToPath(import.meta.url))
const fullRoot = path.resolve(here, '..', '..')
const args = process.argv.slice(2)
const dry = args.includes('--dry')
const dirArg = args.indexOf('--dir')
const editorDir = dirArg >= 0
  ? path.resolve(args[dirArg + 1])
  : path.join(fullRoot, 'pfe-frontend', 'pfe', 'app', 'dashboard', 'scenarios', '[id]', 'edit', '_components', 'inline-course-editor')
const mainPath = path.join(editorDir, 'InlineScenarioCourseEditor.tsx')
const backupPath = path.join(fullRoot, 'backups', 'InlineScenarioCourseEditor.original.tsx')
const fail = (msg) => { console.error('ABORT: ' + msg); process.exit(1) }

// The manifest ships gzipped+base64 so it survives being copied through a chat.
// Its sha256 is checked below, and a readable copy is written out on first run.
const manifestPath = path.join(here, 'manifest.json')
let manifestJson
if (fs.existsSync(manifestPath)) manifestJson = fs.readFileSync(manifestPath, 'utf8')
else {
  const b64 = fs.readFileSync(path.join(here, 'manifest.b64'), 'utf8').replace(/\s+/g, '')
  try { manifestJson = zlib.gunzipSync(Buffer.from(b64, 'base64')).toString('utf8') }
  catch { fail('manifest.b64 is corrupt (gunzip failed) - it was not copied across intact') }
}
if (crypto.createHash('sha256').update(manifestJson).digest('hex') !== MANIFEST_SHA256) fail('manifest.b64 is corrupt (sha256 mismatch) - it was not copied across intact')
const manifest = JSON.parse(manifestJson)
if (!fs.existsSync(manifestPath)) fs.writeFileSync(manifestPath, manifestJson)

const current = fs.readFileSync(mainPath, 'utf8')
const shaOf = (t) => crypto.createHash('sha256').update(t.replace(/\r\n/g, '\n')).digest('hex')
// Source of truth is the original file: the live one on the first run, the backup afterwards.
let raw = current
let fromBackup = false
if (shaOf(raw) !== manifest.originalSha256) {
  if (fs.existsSync(backupPath) && shaOf(fs.readFileSync(backupPath, 'utf8')) === manifest.originalSha256) { raw = fs.readFileSync(backupPath, 'utf8'); fromBackup = true }
  else fail('InlineScenarioCourseEditor.tsx is not the file this manifest was built from (sha256 mismatch) and no matching backup exists. Line ranges would be wrong.')
}
const eol = raw.includes('\r\n') ? '\r\n' : '\n'
const L = raw.split(/\r?\n/)
if (L.length !== manifest.originalLines) fail('line count mismatch: ' + L.length)

const build = (f) => {
  const segs = []
  let tight = false
  for (const p of f.parts) {
    if (p === '~R') { tight = true; continue }
    let text
    if (typeof p === 'string') text = p.replace(/\n/g, eol)
    else {
      const [from, to, exp] = p
      const seg = L.slice(from - 1, to)
      if (exp) seg[exp - from] = 'export ' + seg[exp - from]
      text = seg.join(eol)
    }
    segs.push({ text, tight })
    tight = false
  }
  let text = (f.header ? f.header + eol + eol : '')
    + (f.imports.length ? f.imports.join(eol) + eol + eol : '')
    + segs.map((x, i) => (i === 0 ? '' : x.tight ? eol : eol + eol) + x.text).join('') + eol
  for (const [a, b] of f.replace) {
    if (text.split(a).length !== 2) fail('replace target not found exactly once in ' + f.path)
    text = text.replace(a, b.replace(/\n/g, eol))
  }
  return text
}

const out = new Map()
let mainText = null
for (const f of manifest.files) {
  if (f.main) mainText = build(f)
  else out.set(f.path, build(f))
}

if (current === mainText) { console.log('Already split: the main file is already the slim version. Nothing to do.'); process.exit(0) }
if (fromBackup) fail('the main file was edited after the split ran; refusing to overwrite it. Delete it and restore from full/backups if you want to redo the split.')
let create = 0, same = 0
for (const [rel, text] of out) {
  const p = path.join(editorDir, ...rel.split('/'))
  if (fs.existsSync(p)) {
    if (fs.readFileSync(p, 'utf8') === text) { same++; continue }
    fail('refusing to overwrite differing existing file ' + rel)
  }
  create++
}
console.log(`${out.size} files: ${create} to create, ${same} already identical`)
if (dry) { console.log('Dry run - nothing written.'); process.exit(0) }

fs.mkdirSync(path.dirname(backupPath), { recursive: true })
if (!fs.existsSync(backupPath)) fs.copyFileSync(mainPath, backupPath)
if (fs.readFileSync(backupPath, 'utf8') !== raw) fail('backup exists but differs from the current original; move it away and rerun')
for (const [rel, text] of out) {
  const p = path.join(editorDir, ...rel.split('/'))
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, text)
}
fs.writeFileSync(mainPath, mainText)
console.log('Done. Original backed up to ' + backupPath)
console.log('Next: npm run build && npm run lint (in pfe-frontend/pfe)')
