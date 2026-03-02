# mdcomments

A proposal for native comments in Markdown — structured, portable, and built from existing syntax.

## What

A lightweight comment format for Markdown files that supports anchoring, span highlighting, authorship, timestamps, threading, and metadata — using only standard footnotes, blockquotes, and @-mentions.

## Why

Markdown is rapidly becoming the universal format for LLM-generated and LLM-consumed content. Yet there is no portable way to annotate it with structured comments. Existing solutions are either unstructured (HTML comments, `%%`, CriticMarkup, kramdown directives) or platform-locked (HackMD, Notion, sidecar JSON). Comments should live *in* the file and survive round-tripping through any tool.

## How

Inline `[^c-id]` footnote markers anchor comments to specific text. For multi-word spans, `==highlighted text==[^c-id]` marks the range. Comment threads are defined at the bottom of the document using standard footnote syntax, with `@author (date):` lines and blockquoted messages:

```markdown
The ==monthly revenue grew by 15%==[^c-rev1] last quarter.

[^c-rev1]:
    @alice (2026-02-10):
    > Is this YoY?

    @bob (2026-02-11):
    > Yes. Added a clarifying note.
```

For large documents, thread definitions can live in a companion `document.comments.md` file — still plain Markdown, still human-readable.

In any standard Markdown renderer, comments degrade gracefully to ordinary footnotes — nothing breaks, nothing is lost.

## Examples

See [cross-parser examples](examples/) for a side-by-side comparison of how mdcomments renders across five Markdown systems (markdown-it, Pandoc, MkDocs, Showdown, and Comrak), both with default settings and with purpose-built plugins.
