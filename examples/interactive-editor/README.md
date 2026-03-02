# mdcomments — Interactive Editor

A self-contained HTML page that provides a live Markdown editor with support for
creating and replying to threaded comments using the
[mdcomments](https://github.com/petrroll/mdcomments) syntax.

## Features

- **Three-pane layout** — Markdown source editor, rendered preview, and comment sidebar
- **Live preview** — edits in the source are reflected instantly in the preview and sidebar
- **Add comments** — select text in the preview and click 💬 to create a new comment thread
- **Threaded replies** — reply to existing threads directly from the sidebar
- **Full round-trip** — every comment action updates the raw `.md` source, so you can see exactly what the mdcomments syntax looks like
- **Author & timestamp** — each comment is attributed with `@author (date):`
- **Status badges** — threads display their open/resolved status
- **Highlight anchors** — `==highlighted text==` ranges are visually marked in the preview
- **Dark mode** — respects `prefers-color-scheme`

## Usage

Open `index.html` in any modern browser — no build step or server required.

```bash
# From the repo root:
open examples/interactive-editor/index.html       # macOS
xdg-open examples/interactive-editor/index.html   # Linux
```

Click **Load Sample** to populate the editor with the shared sample document,
or start typing your own Markdown.

### Creating a Comment

1. Select any text in the **Preview** pane.
2. Click the **💬 Comment** tooltip that appears.
3. Write your comment and click **Add**.
4. The source is updated with `==text==[^c-xxxx]` inline and a footnote definition
   at the bottom of the document.

### Replying to a Thread

Type in the reply box at the bottom of any sidebar thread card and press
**Enter** (or click ↩). The reply is appended to the footnote definition in the
source.

## Dependencies

- [marked.js](https://github.com/markedjs/marked) — loaded from CDN for Markdown rendering

No other dependencies. Everything else (comment parsing, sidebar, highlight
logic) is implemented inline.
