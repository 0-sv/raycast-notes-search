# Notes Search for Raycast

A local Raycast extension with two search commands for macOS.

| Command | Searches | Preview |
|---|---|---|
| **Search Notes** | The text of every Markdown file in one folder, with [ripgrep](https://github.com/BurntSushi/ripgrep) | The matching line with the lines around it |
| **Search Mac** | Your files, with the Spotlight index (`mdfind`) | The matching lines for text files, a Quick Look thumbnail for other files (PDF, Word, slides, images) |

Typora has no global search like VS Code, and it cannot open a file at a line. This extension fills that gap. When you open a Markdown hit, the extension opens the file in Typora and types the match into Typora's find bar.

## Requirements

- macOS and [Raycast](https://raycast.com)
- Node.js 22 or later
- ripgrep: `brew install ripgrep` (for Search Notes)
- [Typora](https://typora.io) (optional, for the "Open in Typora at Match" action)

## Install

1. Clone the repo and install the dependencies:

   ```sh
   git clone https://github.com/0-sv/raycast-notes-search.git
   cd raycast-notes-search
   npm install
   ```

2. Run `npm run dev`. Raycast imports the extension.
3. Wait for `built extension successfully`, then stop the command with Ctrl+C. The commands stay in Raycast.
4. Open Raycast and run "Search Notes" or "Search Mac".

To find the match in Typora, Raycast needs Accessibility access. Give it in System Settings → Privacy & Security → Accessibility. Without it, the file still opens, but the find bar stays empty.

## Settings

| Command | Setting | Default |
|---|---|---|
| Search Notes | Notes Folder | `~/Nextcloud/Notes` |
| Search Mac | Search Folder (use `/` for the whole disk) | `~` |
| Search Mac | Include `~/Library`, `node_modules` and hidden folders | off |

## Search behaviour

- **Search Notes** treats the query as literal text and ignores case, like the VS Code default. Recently changed files come first.
- **Search Mac** sends the query to Spotlight, so Spotlight syntax works, for example `kind:pdf invoice`. File-name matches come first, then recently changed files. It shows at most 200 files.

## Keys

| Key | Search Notes | Search Mac |
|---|---|---|
| Enter | Open in Typora at the match | Open (Markdown files open in Typora at the match) |
| ⌘Enter | Open in Typora | |
| ⌘Y | | Quick Look |
| ⌘O | Open in VS Code at the line | Open in VS Code at the first hit |
| ⌘F | Show in Finder | Show in Finder |
| ⌘⇧O | | Open with another app |
| ⌘⇧C | Copy the path | Copy the path |

## Layout

```
src/
├── search-notes.tsx  Search Notes command (UI)
├── search-mac.tsx    Search Mac command (UI)
├── search.ts         ripgrep search, no Raycast imports
├── spotlight.ts      Spotlight search and previews, no Raycast imports
└── typora.ts         Open a file in Typora and fill the find bar
```

`search.ts` and `spotlight.ts` do not import Raycast, so you can test them with plain Node.

## License

MIT
