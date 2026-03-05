# vscode-mdcomments

A VS Code extension for mdcomments with a dedicated **interactive preview** panel,
letting you **view**, **add**, and **reply to** comments directly in `.md` files.

## Features

### Interactive Preview

Open any `.md` file and run **mdcomments: Open Interactive Preview**.
The extension opens a custom side-by-side preview with a comment sidebar, with:

- Author avatars, names, and dates
- Threaded replies
- Status badges (open / resolved)
- Highlighted anchor text with 💬 badges
- Click a highlight ↔ focus the sidebar card (and vice versa)
- Inline **Reply** and **+ New** buttons that trigger extension actions directly
- Create a new thread straight from preview: select text, right-click, then choose **New thread from selection**

### Add Comment (command)

1. Open a `.md` file in the editor.
2. Select the text you want to comment on.
3. Run **mdcomments: Add Comment** from the Command Palette or the
   editor context menu.
4. Enter your author name (or set `mdcomments.defaultAuthor` in settings).
   If unset, the extension tries VS Code GitHub account name, then Git `user.name`.
   and comment text.

The extension wraps the selected text in `==…==` highlight markers, inserts a
`[^c-N]` reference, and appends a properly formatted footnote definition at the
end of the file.

### Reply to Comment (command)

1. Place your cursor near a comment marker or inside a thread definition.
2. Run **mdcomments: Reply to Comment** from the Command Palette or context
   menu.
3. Pick the thread, enter author and reply text.

The reply is inserted at the end of the chosen thread block.

## Settings

| Setting                    | Default | Description                                      |
|----------------------------|---------|--------------------------------------------------|
| `mdcomments.defaultAuthor` | `""`    | Author name for new comments. If empty, auto-detects from VS Code GitHub account, then Git `user.name`, otherwise prompts. |
| `mdcomments.commentPlacement` | `"nearAnchor"` | Unified behavior for both preview and editor: `sidebar` keeps preview sidebar and no editor-side snippets; `nearAnchor` enables right-side near-anchor comments in both places (Google Docs style). |

## mdcomments Format (quick reference)

```markdown
Revenue grew by 15%[^c-rev1].

[^c-rev1]:
    @alice (2026-02-10):
    > Is this YoY?

    @bob (2026-02-11):
    > Yes. Added a clarifying note.
```

See the full specification in the `specification.md` file in the mdcomments repository.

## Installation

Download the latest extension package (`.vsix`) from:

- https://github.com/petrroll/mdcomments/releases

Install it in VS Code:

1. Open Extensions view.
2. Click `...` (top-right menu).
3. Choose **Install from VSIX...**.
4. Select the downloaded `vscode-mdcomments-*.vsix` file.

Or with the VS Code CLI:

```bash
code --install-extension vscode-mdcomments-*.vsix --force
```

## Development

```bash
cd vscode-mdcomments
npm install
npm run compile   # or: npm run watch
```

Then press **F5** in VS Code to launch the Extension Development Host.
