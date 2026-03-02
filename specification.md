# mdcomments Formal Specification

This document defines the mdcomments format as a strict profile over [extended Markdown with footnotes](https://www.markdownlang.com/extended/footnotes.html).

- inline anchors
- comment threads in footnote definitions
- optional sidecar thread storage

## 1. Terminology

- **Host document**: the primary Markdown file (for example `document.md`).
- **Comment marker**: an inline footnote reference with a comment identifier, for example `[^c-1]`.
- **Thread definition**: a footnote definition whose identifier matches a marker.
- **Entry header**: a line in the form `@author (date):`.
- **Entry body**: one or more blockquoted lines belonging to an entry.
- **Sidecar file**: a companion Markdown file storing thread definitions, typically `document.comments.md`.

## 2. Conformance

A document conforms to mdcomments normal format if all of the following hold:

1. Every mdcomments marker uses an identifier with prefix `c-`.
2. Every referenced `c-*` identifier has exactly one thread definition in scope.
3. Every thread definition contains one or more entries.
4. Every entry has exactly one entry header followed by one or more blockquote lines.

A sidecar configuration conforms if:

1. The host document contains markers but no required in-document thread definitions for those markers.
2. The sidecar file provides the missing thread definitions.
3. Identifier uniqueness is preserved across host + sidecar combined scope.

## 3. Normal Format (single-file)

### 3.1 Informal shape

```markdown
Revenue grew by 15%[^c-rev1].

[^c-rev1]:
    @alice (2026-02-10):
    > Is this YoY?

    @bob (2026-02-11):
    > Yes. Added a clarifying note.
```

### 3.2 Anchoring variants

mdcomments supports two anchor styles:

1. **Point anchor** (marker after token/span):

   `text[^c-id]`

2. **Range anchor** (highlight + marker):

   `==selected text==[^c-id]`

When `==...==` is not recognized by a renderer, producers may add an `anchor:` metadata line inside the thread definition.

Example:

```markdown
[^c-rev1]:
    anchor: monthly revenue grew by 15%
    @alice (2026-02-10):
    > Is this YoY?
```

## 4. Sidecar Format (two-file)

### 4.1 File naming

Recommended naming:

- host: `document.md`
- sidecar: `document.comments.md`

### 4.2 Resolution rules

Given host `document.md`, a consumer:

1. Parses markers in the host.
2. Parses thread definitions in host.
3. If definitions are missing, loads `document.comments.md` if present.
4. Merges definition maps by identifier.
5. Raises an error on duplicate identifier definitions.

### 4.3 Sidecar example

Host (`document.md`):

```markdown
Revenue grew by 15%[^c-rev1].
```

Sidecar (`document.comments.md`):

```markdown
[^c-rev1]:
    @alice (2026-02-10):
    > Is this YoY?

    @bob (2026-02-11):
    > Yes. Added a clarifying note.
```

## 5. Formal Grammar (EBNF)

The grammar below defines mdcomments-specific structures. Non-mdcomments Markdown content is treated as `MarkdownLine`.

```ebnf
Document         = { Block } ;

Block            = ThreadDefinition | MarkdownLine ;

ThreadDefinition = FootnoteLabel, ":", NL,
                   IndentedThreadContent ;

FootnoteLabel    = "[^", CommentId, "]" ;
CommentId        = "c-", IdChar, { IdChar } ;
IdChar           = ALPHA | DIGIT | "-" | "_" | "." ;

IndentedThreadContent
                 = Indent, ThreadItem, { NL, Indent, ThreadItem }, [ NL ] ;

ThreadItem       = AnchorMeta | EntryHeader | EntryBodyLine | Blank ;

AnchorMeta       = "anchor:", SP, AnchorText ;
AnchorText       = { AnyCharExceptNL } ;

EntryHeader      = "@", Author, SP, "(", Date, ")", ":" ;
Author           = AuthorChar, { AuthorChar } ;
AuthorChar       = ALPHA | DIGIT | "-" | "_" | "." ;
Date             = DIGIT, DIGIT, DIGIT, DIGIT, "-", DIGIT, DIGIT, "-", DIGIT, DIGIT ;

EntryBodyLine    = ">", [ SP ], BodyText ;
BodyText         = { AnyCharExceptNL } ;

MarkdownLine     = { AnyCharExceptNL }, NL ;
Blank            = "" ;

Indent           = "    " | "\t" ;
NL               = "\n" ;
SP               = " " ;
ALPHA            = "A".."Z" | "a".."z" ;
DIGIT            = "0".."9" ;
```

## 6. Marker Grammar (inline)

```ebnf
CommentMarker    = "[^", CommentId, "]" ;
RangeAnchor      = "==", RangeText, "==", CommentMarker ;
PointAnchor      = InlineText, CommentMarker ;
```

Where `RangeText` and `InlineText` are delegated to the host Markdown parser.

## 7. Validation Rules

A validator SHOULD enforce:

1. All markers reference existing thread definitions.
2. All thread definitions referenced by markers are unique.
3. Each thread has at least one entry header + body pair.
4. Entry headers use ISO date `YYYY-MM-DD`.
5. Entry order is preserved as source order.

A validator MAY warn for:

- non-`c-` footnote ids used as comments
- missing `anchor:` in range-less ambiguous anchors
- duplicate author/date tuples within one thread

## 8. Rendering Expectations

- In mdcomments-aware renderers, thread entries are rendered as structured comments.
- In standard footnote renderers, content degrades to ordinary footnotes.
- In parsers without footnotes, literal markers remain visible and non-destructive.

## 9. Compatibility Notes

- mdcomments does not require new Markdown tokens.
- mdcomments is intentionally a profile over existing footnote + blockquote behavior.
- Sidecar mode is optional and intended for large-document workflows.