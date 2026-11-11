import {
  Action,
  ActionPanel,
  environment,
  getPreferenceValues,
  Icon,
  List,
  showToast,
  Toast,
} from '@raycast/api'
import { usePromise } from '@raycast/utils'
import { homedir } from 'node:os'
import { dirname, extname, join } from 'node:path'
import { useRef, useState } from 'react'
import { type FileResult, type Preview, preview, spotlightSearch } from './spotlight'
import { openInTypora } from './typora'

const MARKDOWN = new Set(['.md', '.markdown', '.mdown'])

type Prefs = { searchScope?: string; includeHidden?: boolean }

function tilde(path: string): string {
  const home = homedir()
  return path.startsWith(home) ? `~${path.slice(home.length)}` : path
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function previewMarkdown(p: Preview | undefined): string {
  if (!p) return ''
  if (p.kind === 'text') return p.markdown
  if (p.kind === 'image') return `![preview](${encodeURI(`file://${p.png}`)}?raycast-height=320)`
  return '_No preview for this file type. Press ⌘Y for Quick Look._'
}

function FileDetail({ file, preview: p, loading }: { file: FileResult; preview?: Preview; loading: boolean }) {
  return (
    <List.Item.Detail
      isLoading={loading}
      markdown={previewMarkdown(p)}
      metadata={
        <List.Item.Detail.Metadata>
          <List.Item.Detail.Metadata.Label title="Folder" text={tilde(dirname(file.path))} />
          <List.Item.Detail.Metadata.Label title="Modified" text={file.mtime.toLocaleString()} />
          <List.Item.Detail.Metadata.Label title="Size" text={formatSize(file.size)} />
        </List.Item.Detail.Metadata>
      }
    />
  )
}

function FileActions({ file, query, firstHitLine }: { file: FileResult; query: string; firstHitLine?: number }) {
  const isMarkdown = MARKDOWN.has(extname(file.path).toLowerCase())
  return (
    <ActionPanel>
      {isMarkdown ? (
        <Action
          title="Open in Typora at Match"
          icon={Icon.Document}
          onAction={() => openInTypora(file.path, query)}
        />
      ) : (
        <Action.Open title="Open" target={file.path} />
      )}
      <Action.ToggleQuickLook shortcut={{ modifiers: ['cmd'], key: 'y' }} />
      <Action.ShowInFinder path={file.path} shortcut={{ modifiers: ['cmd'], key: 'f' }} />
      <Action.OpenWith path={file.path} shortcut={{ modifiers: ['cmd', 'shift'], key: 'o' }} />
      <Action.Open
        title="Open in VS Code"
        icon={Icon.Code}
        target={`vscode://file${file.path}${firstHitLine ? `:${firstHitLine}` : ''}`}
        shortcut={{ modifiers: ['cmd'], key: 'o' }}
      />
      <Action.CopyToClipboard
        title="Copy Path"
        content={file.path}
        shortcut={{ modifiers: ['cmd', 'shift'], key: 'c' }}
      />
    </ActionPanel>
  )
}

export default function Command() {
  const prefs = getPreferenceValues<Prefs>()
  const scope = (prefs.searchScope || '~').replace(/^~(?=$|\/)/, homedir())
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const abortable = useRef<AbortController>(null)
  const q = query.trim()

  const { data: results, isLoading } = usePromise(
    (text: string) =>
      spotlightSearch(text, scope, !!prefs.includeHidden, abortable.current?.signal ?? new AbortController().signal),
    [q],
    {
      abortable,
      execute: q.length >= 2,
      onError: (error) => {
        if (error.name === 'AbortError') return
        showToast({ style: Toast.Style.Failure, title: 'Spotlight search failed', message: error.message })
      },
    },
  )

  const shown = q.length >= 2 ? results : undefined
  const selectedFile = shown?.find((f) => f.path === selected) ?? shown?.[0]

  // Only the selected row gets a preview, so a list of 200 files costs one thumbnail.
  const { data: selectedPreview, isLoading: previewLoading } = usePromise(
    async (file: FileResult, text: string) => ({
      path: file.path,
      preview: await preview(file, text, join(environment.supportPath, 'thumbnails')),
    }),
    [selectedFile as FileResult, q],
    { execute: !!selectedFile },
  )

  return (
    <List
      isLoading={isLoading}
      throttle
      filtering={false}
      isShowingDetail={!!shown && shown.length > 0}
      onSearchTextChange={setQuery}
      onSelectionChange={setSelected}
      searchBarPlaceholder={`Spotlight search in ${tilde(scope)} (try kind:pdf invoice)`}
    >
      {q.length < 2 ? (
        <List.EmptyView icon={Icon.MagnifyingGlass} title="Type at least 2 characters" />
      ) : (
        <List.EmptyView icon={Icon.XMarkCircle} title="No matches" />
      )}
      {shown?.map((file) => {
        const isSelected = file.path === selectedFile?.path
        const p = selectedPreview?.path === file.path ? selectedPreview.preview : undefined
        return (
          <List.Item
            key={file.path}
            id={file.path}
            icon={{ fileIcon: file.path }}
            title={file.path.split('/').pop() ?? file.path}
            subtitle={tilde(dirname(file.path))}
            quickLook={{ path: file.path }}
            detail={<FileDetail file={file} preview={p} loading={isSelected && previewLoading} />}
            actions={
              <FileActions file={file} query={q} firstHitLine={p?.kind === 'text' ? p.firstHitLine : undefined} />
            }
          />
        )
      })}
    </List>
  )
}
