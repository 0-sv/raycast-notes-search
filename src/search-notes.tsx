import {
  Action,
  ActionPanel,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
} from '@raycast/api'
import { usePromise } from '@raycast/utils'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { relative } from 'node:path'
import { useRef, useState } from 'react'
import { type Hit, search } from './search'
import { openInTypora } from './typora'

const CONTEXT_BEFORE = 4
const CONTEXT_AFTER = 10

function notesRoot(): string {
  const dir = getPreferenceValues<{ notesDir?: string }>().notesDir || '~/Nextcloud/Notes'
  return dir.replace(/^~(?=$|\/)/, homedir())
}

function contextMarkdown(hit: Hit, cache: Map<string, string[]>): string {
  let lines = cache.get(hit.file)
  if (!lines) {
    lines = readFileSync(hit.file, 'utf8').split('\n')
    cache.set(hit.file, lines)
  }
  const start = Math.max(0, hit.line - 1 - CONTEXT_BEFORE)
  const end = Math.min(lines.length, hit.line + CONTEXT_AFTER)
  const width = String(end).length
  const body = lines
    .slice(start, end)
    .map((l, i) => {
      const n = start + i + 1
      return `${n === hit.line ? '▶' : ' '} ${String(n).padStart(width)}  ${l}`
    })
    .join('\n')
  return `\`\`\`\n${body}\n\`\`\``
}

function FileActions({ file, root, hit }: { file: string; root: string; hit?: Hit }) {
  return (
    <ActionPanel>
      <Action
        title={hit ? 'Open in Typora at Match' : 'Open in Typora'}
        icon={Icon.Document}
        onAction={() => openInTypora(file, hit?.match)}
      />
      {hit && (
        <Action
          title="Open in Typora"
          icon={Icon.Document}
          shortcut={{ modifiers: ['cmd'], key: 'enter' }}
          onAction={() => openInTypora(file)}
        />
      )}
      <Action.Open
        title="Open in VS Code at Line"
        icon={Icon.Code}
        target={`vscode://file${file}${hit ? `:${hit.line}:${hit.column}` : ''}`}
        shortcut={{ modifiers: ['cmd'], key: 'o' }}
      />
      <Action.ShowInFinder path={file} shortcut={{ modifiers: ['cmd'], key: 'f' }} />
      <Action.CopyToClipboard
        title="Copy Path"
        content={file}
        shortcut={{ modifiers: ['cmd', 'shift'], key: 'c' }}
      />
      <Action.CopyToClipboard
        title="Copy Relative Path"
        content={relative(root, file)}
        shortcut={{ modifiers: ['cmd', 'opt'], key: 'c' }}
      />
    </ActionPanel>
  )
}

export default function Command() {
  const root = notesRoot()
  const [query, setQuery] = useState('')
  const abortable = useRef<AbortController>(null)
  const cache = useRef(new Map<string, string[]>())

  const { data, isLoading } = usePromise(
    async (q: string) => {
      cache.current.clear()
      return search(q, root, abortable.current?.signal ?? new AbortController().signal)
    },
    [query.trim()],
    {
      abortable,
      execute: query.trim().length >= 2,
      onError: (error) => {
        if (error.name === 'AbortError') return
        showToast({ style: Toast.Style.Failure, title: 'Search failed', message: error.message })
      },
    },
  )

  const tooShort = query.trim().length < 2
  const results = tooShort ? undefined : data

  return (
    <List
      isLoading={isLoading}
      throttle
      filtering={false}
      isShowingDetail={!!results && results.hitsByFile.size > 0}
      onSearchTextChange={setQuery}
      searchBarPlaceholder={`Search notes in ${root.replace(homedir(), '~')}`}
    >
      {tooShort ? (
        <List.EmptyView icon={Icon.MagnifyingGlass} title="Type at least 2 characters" />
      ) : (
        <List.EmptyView icon={Icon.XMarkCircle} title="No matches" />
      )}

      {results && results.nameMatches.length > 0 && (
        <List.Section title="File names">
          {results.nameMatches.map((file) => (
            <List.Item
              key={`name:${file}`}
              icon={Icon.Document}
              title={relative(root, file)}
              detail={<List.Item.Detail markdown={`\`${relative(root, file)}\``} />}
              actions={<FileActions file={file} root={root} />}
            />
          ))}
        </List.Section>
      )}

      {results &&
        [...results.hitsByFile].map(([file, hits]) => (
          <List.Section key={file} title={relative(root, file)}>
            {hits.map((hit) => (
              <List.Item
                key={`${file}:${hit.line}`}
                icon={Icon.Text}
                title={hit.text.trim() || ' '}
                accessories={[{ text: `:${hit.line}` }]}
                detail={<List.Item.Detail markdown={contextMarkdown(hit, cache.current)} />}
                actions={<FileActions file={file} root={root} hit={hit} />}
              />
            ))}
          </List.Section>
        ))}
    </List>
  )
}
