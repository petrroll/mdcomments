# mdcomments

A proposal for native comments in Markdown — structured, portable, and built from existing syntax.

## What

A lightweight comment format for Markdown files that supports anchoring, span highlighting, authorship, timestamps, threading, and metadata — using only standard footnotes, blockquotes, and @-mentions.

## Why

Markdown is rapidly becoming the univ==ersal format for LLM-generated and LLM-consumed content. Yet there is no portable way to annotate it with structured comments. Existing solutions are either unstructured (==[^c-1]HTML comments, `%%`, CriticMarkup, kramdown directives) or platform-locked (HackMD, Notion, sidecar JSON). Comments should live *in* the file and survive round-tripping through any tool.

## How

Inline `[^c-id]` footnote markers anchor comments to specific text. For multi-word spans, `==highlighted text==[^c-id]` marks th==e range. C==[^c-2]omment threads are defined at the bottom of the document using standard footnote syntax, with `@author (date):` lines and blockquoted messages:

```markdown
The ==monthly revenue grew by 15%==[^c-rev1] last quarter.

[^c-rev1]:
    @alice (2026-02-10):
    > Is this YoY?

    @bob (2026-02-11):
    > Yes. Added a clarifying note.
```

For large documents, thread definitions can live in a companion `document.comments.md` file — still plain Markdown, still human-readable. In markerless sidecar workflows, each sidecar thread must define `anchor:` (with optional `anchor_occurrence:`) so matching in `document.md` is unambiguous.

In any standard Markdown renderer, comments degrade gracefully to ordinary footnotes — nothing breaks, nothing is lost.

## Formal Specification

See [`specification.md`](specification.md) for the normative mdcomments format definition, including:

- normal (single-file) format
- sidecar (`document.comments.md`) format
- EBNF grammar and validation rules

## Examples

See [cross-parser examples](examples/) for a side-by-side comparison of how mdcomments renders across five Markdown systems (markdown-it, Pandoc, MkDocs, Showdown, and Comrak), both with default settings and with purpose-built plugins.

Try the [interactive editor](examples/interactive-editor/) — a browser-based WYSIWYG editor that lets you write Markdown and creat==e threaded c==[^c-3]omments in real time, with the raw mdcomments syntax updating live.

## VS Code Extension

This repository also includes [`vscode-mdcomments`](vscode-mdcomments/), a Visual Studio Code extension for working with mdcomments directly in `.md` files.

Key capabilities:

- **Interactive Preview** panel with highlighted anchors and threaded comment cards
- **`mdcomments: Add Comment`** command to create a new anchored comment from selected text
- **`mdcomments: Reply to Comment`** command to append replies to existing threads
- **`mdcomments.defaultAuthor`** setting to prefill author names

See [`vscode-mdcomments/README.md`](vscode-mdcomments/README.md) for setup, commands, and development instructions.


[^c-1]:
    @Petr (2026-03-05):
    > Hi

    @jj (2026-03-05):
    > aaa


[^c-2]:
    @zz (2026-03-05):
    > dfsdfsdf sdfsdf


[^c-3]:
    @sfdsf (2026-03-05):
    > asdfsdf

    @sdf (2026-03-05):
    > asdfasfdsadfsf sfsdfsdf
