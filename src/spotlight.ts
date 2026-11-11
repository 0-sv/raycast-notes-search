import { execFile, spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, openSync, readSync, closeSync, readFileSync, renameSync, rmSync, statSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { basename, join } from 'node:path'

const MAX_CANDIDATES = 1000
const MAX_RESULTS = 200
const MAX_TEXT_BYTES = 2 * 1024 * 1024

export type FileResult = { path: string; mtime: Date; size: number; nameMatch: boolean }

export type TextPreview = { kind: 'text'; markdown: string; firstHitLine?: number }
export type ImagePreview = { kind: 'image'; png: string }
export type Preview = TextPreview | ImagePreview | { kind: 'none' }

function isNoise(path: string, home: string): boolean {
  return (
    path.startsWith(`${home}/Library/`) ||
    path.startsWith(`${home}/.Trash/`) ||
    path.includes('/node_modules/') ||
    /\/\.[^/]+\//.test(path)
  )
}

function mdfind(query: string, scope: string, signal: AbortSignal, keep: (p: string) => boolean): Promise<string[]> {
  return new Promise((resolve, reject) => {
    const child = spawn('/usr/bin/mdfind', ['-onlyin', scope, query], { signal })
    const found: string[] = []
    let buffered = ''
    child.stdout.on('data', (chunk: Buffer) => {
      const lines = (buffered + chunk.toString('utf8')).split('\n')
      buffered = lines.pop() ?? ''
      for (const line of lines) {
        if (line && keep(line)) found.push(line)
      }
      // mdfind can return tens of thousands of paths for a common word.
      if (found.length >= MAX_CANDIDATES) child.kill()
    })
    child.on('error', reject)
    child.on('close', () => resolve(found.slice(0, MAX_CANDIDATES)))
  })
}

export async function spotlightSearch(
  query: string,
  scope: string,
  includeNoise: boolean,
  signal: AbortSignal,
): Promise<FileResult[]> {
  const home = homedir()
  const paths = await mdfind(query, scope, signal, (p) => includeNoise || !isNoise(p, home))
  const words = query
    .toLowerCase()
    .split(/\s+/)
    .filter((w) => w && !w.includes(':'))

  const results: FileResult[] = []
  for (const path of paths) {
    try {
      const stat = statSync(path)
      if (stat.isDirectory() && !path.endsWith('.app')) continue
      const name = basename(path).toLowerCase()
      results.push({
        path,
        mtime: stat.mtime,
        size: stat.size,
        nameMatch: words.length > 0 && words.every((w) => name.includes(w)),
      })
    } catch {
      // Spotlight can list files that were deleted after indexing.
    }
  }

  return results
    .sort((a, b) => Number(b.nameMatch) - Number(a.nameMatch) || b.mtime.getTime() - a.mtime.getTime())
    .slice(0, MAX_RESULTS)
}

function isTextFile(path: string, size: number): boolean {
  if (size > MAX_TEXT_BYTES) return false
  const fd = openSync(path, 'r')
  try {
    const head = Buffer.alloc(Math.min(size, 8192))
    readSync(fd, head, 0, head.length, 0)
    return !head.includes(0)
  } finally {
    closeSync(fd)
  }
}

function fence(body: string): string {
  const longest = Math.max(2, ...(body.match(/`+/g) ?? []).map((m) => m.length))
  const ticks = '`'.repeat(longest + 1)
  return `${ticks}\n${body}\n${ticks}`
}

export function textPreview(path: string, query: string): TextPreview {
  const lines = readFileSync(path, 'utf8').split('\n')
  const phrase = query.toLowerCase().trim()
  const words = phrase.split(/\s+/).filter((w) => w && !w.includes(':'))
  let hits = lines.flatMap((l, i) => (l.toLowerCase().includes(phrase) ? [i] : []))
  if (hits.length === 0 && words.length > 1) {
    hits = lines.flatMap((l, i) => (words.some((w) => l.toLowerCase().includes(w)) ? [i] : []))
  }

  if (hits.length === 0) {
    return { kind: 'text', markdown: fence(lines.slice(0, 30).join('\n')) }
  }

  const width = String(lines.length).length
  const blocks: string[] = []
  let shownUntil = -1
  for (const hit of hits.slice(0, 4)) {
    const start = Math.max(shownUntil + 1, hit - 3)
    const end = Math.min(lines.length, hit + 4)
    if (start >= end) continue
    blocks.push(
      lines
        .slice(start, end)
        .map((l, i) => {
          const n = start + i
          return `${hits.includes(n) ? '▶' : ' '} ${String(n + 1).padStart(width)}  ${l}`
        })
        .join('\n'),
    )
    shownUntil = end - 1
  }
  const more = hits.length > 4 ? `\n\n${hits.length - 4} more matching lines` : ''
  return { kind: 'text', markdown: fence(blocks.join('\n  ⋮\n')) + more, firstHitLine: hits[0] + 1 }
}

function thumbnail(path: string, mtime: Date, cacheDir: string): Promise<string | undefined> {
  const key = createHash('sha1').update(`${path}:${mtime.getTime()}`).digest('hex')
  const png = join(cacheDir, `${key}.png`)
  if (existsSync(png)) return Promise.resolve(png)
  mkdirSync(cacheDir, { recursive: true })

  // qlmanage names its output after the input file, so give each call its own folder.
  const outDir = mkdtempSync(join(tmpdir(), 'ql-'))
  return new Promise((resolve) => {
    execFile('/usr/bin/qlmanage', ['-t', '-s', '800', '-o', outDir, path], { timeout: 10_000 }, () => {
      const produced = join(outDir, `${basename(path)}.png`)
      if (existsSync(produced)) {
        renameSync(produced, png)
        resolve(png)
      } else {
        resolve(undefined)
      }
      rmSync(outDir, { recursive: true, force: true })
    })
  })
}

export async function preview(file: FileResult, query: string, cacheDir: string): Promise<Preview> {
  if (isTextFile(file.path, file.size)) return textPreview(file.path, query)
  const png = await thumbnail(file.path, file.mtime, cacheDir)
  return png ? { kind: 'image', png } : { kind: 'none' }
}
