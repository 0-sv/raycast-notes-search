import { execFile } from 'node:child_process'
import { existsSync } from 'node:fs'
import { relative } from 'node:path'

// Raycast does not inherit the shell PATH.
const RG = ['/opt/homebrew/bin/rg', '/usr/local/bin/rg'].find((p) => existsSync(p))
const MAX_HITS = 300

export type Hit = { file: string; line: number; column: number; text: string; match: string }
export type Results = { nameMatches: string[]; hitsByFile: Map<string, Hit[]> }

function rg(args: string[], signal: AbortSignal): Promise<string> {
  if (!RG) return Promise.reject(new Error('ripgrep not found. Run: brew install ripgrep'))
  return new Promise((resolve, reject) => {
    execFile(RG, args, { signal, maxBuffer: 32 * 1024 * 1024 }, (error, stdout) => {
      // Exit code 1 means "no matches", not a failure.
      if (error && (error as { code?: unknown }).code !== 1) {
        reject(error)
      } else {
        resolve(stdout)
      }
    })
  })
}

export async function search(query: string, root: string, signal: AbortSignal): Promise<Results> {
  const [contentOut, filesOut] = await Promise.all([
    rg(
      [
        '--json',
        '--fixed-strings',
        '--ignore-case',
        '--sortr=modified',
        '--glob=*.md',
        '--max-count=5',
        '--',
        query,
        root,
      ],
      signal,
    ),
    rg(['--files', '--sortr=modified', '--glob=*.md', root], signal),
  ])

  const hitsByFile = new Map<string, Hit[]>()
  let count = 0
  for (const line of contentOut.split('\n')) {
    if (count >= MAX_HITS) break
    if (!line.startsWith('{"type":"match"')) continue
    const { data } = JSON.parse(line)
    const text: string | undefined = data.lines.text
    if (text === undefined) continue
    const file: string = data.path.text
    const sub = data.submatches[0]
    const hit: Hit = {
      file,
      line: data.line_number,
      column: (sub?.start ?? 0) + 1,
      text: text.trimEnd(),
      match: sub?.match.text ?? query,
    }
    hitsByFile.set(file, [...(hitsByFile.get(file) ?? []), hit])
    count++
  }

  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  const nameMatches = filesOut
    .split('\n')
    .filter(Boolean)
    .filter((f) => {
      const rel = relative(root, f).toLowerCase()
      return words.every((w) => rel.includes(w))
    })
    .slice(0, 20)

  return { nameMatches, hitsByFile }
}
