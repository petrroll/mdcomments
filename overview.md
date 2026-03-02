# Survey: How Markdown Tools Serialize Comments & Annotations

A comprehensive comparison of how existing Markdown plugins, editors, and
platforms handle comments — and a proposed design that fills the gaps.

---

## Approaches That Modify the Markdown Source

### 1. HTML Comments (Universal)

The most basic and universally supported approach.

```markdown
<!-- This is a comment, hidden from rendered output -->
<!-- TODO: needs review —alice -->
```

- ✅ Works in virtually every Markdown parser
- ❌ No anchoring, no author, no threading — just invisible text
- Used by: **Pandoc, kramdown, Typora, iA Writer, Hugo, Docsify**

### 2. Reference-Link Hack

Abuse of reference-link syntax to create invisible comments.

```markdown
[//]: # (This is a comment that won't render)
[comment]: <> (Another hidden comment)
```

- ✅ Works in most parsers (unused reference = invisible)
- ❌ No anchoring, no structure
- Used by: **remark-comment, markdown-it-comment, Obsidian**

### 3. Obsidian Native `%%` Comments

Obsidian's built-in (non-standard) comment syntax.

```markdown
Here is visible text.

%% This is a comment, hidden in preview and export %%

More visible text.
```

- ✅ Simple, hidden in preview/export
- ❌ No anchoring, no author, no threading
- ❌ Non-standard — only Obsidian understands `%%`
- Used by: **Obsidian core, obsidian-comments-plugin (hipstersmoothie)**

### 4. CriticMarkup

A dedicated editorial markup syntax using `{}` delimiters.

```markdown
This needs {>>a comment<<} here.
This is {++inserted text++}.
This is {--deleted text--}.
This is {~~old~>new~~} substitution.
This is {==highlighted==}{>>with a comment<<}.
```

- ✅ Inline, anchored to text, supported by Pandoc natively
- ❌ No threading, no author attribution (by spec)
- ❌ `{}` collides with attribute syntax in Pandoc/kramdown
- Community workaround: `{>>@alice: comment<<}` (informal)
- Used by: **Pandoc (built-in), MultiMarkdown, some editors**

### 5. kramdown `{::comment}` Directive

kramdown has its own block-level comment directive.

```markdown
{::comment}
This is a kramdown comment block, stripped from output.
{:/comment}
```

- ✅ Explicitly a comment (not an HTML hack)
- ❌ kramdown-only, no anchoring, no structure
- Used by: **kramdown (Jekyll)**

### 6. MDX / JSX Comments

MDX (Markdown + React) uses JSX comment syntax.

```mdx
{/* This is a comment in MDX */}

{/*
  Multi-line
  comment
*/}
```

- ✅ Native to JSX/React ecosystem
- ❌ Only works in MDX-aware parsers
- ❌ No anchoring, no identity, no threading

### 7. Pandoc Footnotes

Two forms — reference-style and inline — sometimes repurposed for comments.

```markdown
Reference style: Here is some text.[^1]

[^1]: This is the footnote content.

Inline style: Here is some text.^[This could serve as an inline comment.]
```

- ✅ Concise; reference-style cleanly separates anchor from content
- ❌ Renders visibly as a footnote (not hidden)
- ❌ No identity, no threading
- Used by: **Pandoc, markdown-it-footnote, PHP Markdown Extra, kramdown**

### 8. Marker / PyMdown Highlight Syntax

Overlaps with CriticMarkup; uses `{== ==}` for highlighting.

```markdown
{==This is highlighted text==}
{>>This is a marginal note<<}
```

- ✅ Visual anchoring
- ❌ Same limitations as CriticMarkup — no threads, no identity
- Used by: **Marker, PyMdown Extensions**

---

## Obsidian Plugins (Analyzed in Detail)

### 9. JasperSurmont/obsidian-comments — Callout Syntax

Repurposes Obsidian's callout (blockquote) syntax. Comments live inline in the
document body.

```markdown
> [!comment] Alice | 14/02/2026
> This paragraph needs a citation.
>
>> [!comment] Bob | 15/02/2026
>> Added a reference to the appendix.
```

| Aspect       | Detail                                          |
| ------------ | ----------------------------------------------- |
| Anchoring    | Positional (line where callout sits)            |
| Author       | ✅ `NAME` field in callout title                |
| Date         | ✅ `| DATE` in callout title                    |
| Threading    | ✅ Nested blockquotes (`>>`)                    |
| Hidden       | ✅ Hidden in reading mode / PDF export          |
| Portability  | ❌ Obsidian only (`[!comment]` callout type)    |
| Prose impact | ❌ Large blockquote blocks interrupt the prose  |

### 10. HQuaiato/obsidian-comment-plugin — Inline HTML

Wraps selected text in raw HTML `<span>` tags with `data-comment` attributes.

```markdown
This is text and <span class="comment" data-comment="Is this correct?"
style="border-bottom: 1px dotted; cursor: pointer;">revenue grew by
15%</span> last quarter.
```

| Aspect       | Detail                                          |
| ------------ | ----------------------------------------------- |
| Anchoring    | ✅ Wraps exact selected text                    |
| Author       | ❌ None                                         |
| Date         | ❌ None                                         |
| Threading    | ❌ One comment per span                         |
| Hidden       | ⚠️ Comment in `data-` attr, invisible w/o plugin |
| Portability  | ⚠️ HTML renders, but comment content is hidden  |
| Prose impact | ❌ Verbose HTML tags clutter the source         |

### 11. ChobbyCode/Obsidian-Comments — Sidecar JSON

Stores comments in a separate JSON file alongside the Markdown. The `.md` file
is never touched.

```
Note.md                   ← untouched
Note.md.comments.json     ← comments here
```

```json
{
  "comments": [
    {
      "comment": "Is this number correct?",
      "startPos": 42,
      "endPos": 67,
      "uuid": "a1b2c3d4-..."
    }
  ]
}
```

| Aspect       | Detail                                          |
| ------------ | ----------------------------------------------- |
| Anchoring    | ✅ Character offsets (`startPos` / `endPos`)    |
| Author       | ❌ None                                         |
| Date         | ❌ None                                         |
| Threading    | ❌ Flat list                                    |
| Hidden       | ✅ Markdown source is pristine                  |
| Portability  | ❌ Comments lost without the JSON sidecar       |
| Fragility    | ⚠️ Offsets break if file edited externally      |

---

## Collaborative Platforms (Comments Don't Survive Export)

These have full Google Docs–style comment UIs, but comments are stored in
the platform's database and **stripped from Markdown exports**.

| Platform    | Comment UI | Threaded | Author | In Markdown export? |
| ----------- | ---------- | -------- | ------ | ------------------- |
| **HackMD**  | ✅         | ✅       | ✅     | ❌ Stripped          |
| **GitBook** | ✅         | ✅       | ✅     | ❌ Stripped          |
| **Notion**  | ✅         | ✅       | ✅     | ❌ Stripped          |
| **Nota**    | ✅         | ✅       | ✅     | ❌ Stripped          |

---

## Other Notable Tools

| Tool                | Comment mechanism                    | Notes                                                              |
| ------------------- | ------------------------------------ | ------------------------------------------------------------------ |
| **Quarto**          | `#\| comment:` in code cells        | Code-only, not for prose                                           |
| **Moment.dev**      | Local-first collaborative Markdown   | Stores docs as `.md` in Git; collaboration features in development |
| **Obsidian Callouts** | `> [!NOTE]` / `> [!WARNING]`      | Visible admonitions, not hidden comments                           |
| **Docsify**         | HTML comments + page-level plugins   | No inline comments; uses Utterances/Disqus for page comments       |
| **Typora / iA Writer** | HTML `<!-- -->` only             | No unique comment mechanism beyond standard HTML comments           |

---

## Master Comparison Table

| Approach             | Anchored | Author | Threading | Hidden | Portable          | Survives export |
| -------------------- | -------- | ------ | --------- | ------ | ----------------- | --------------- |
| HTML `<!-- -->`      | ❌       | ❌     | ❌        | ✅     | ✅ Universal      | ✅              |
| Ref-link hack        | ❌       | ❌     | ❌        | ✅     | ✅ Most parsers   | ✅              |
| Obsidian `%%`        | ❌       | ❌     | ❌        | ✅     | ❌ Obsidian       | ✅              |
| CriticMarkup         | ✅       | ❌*    | ❌        | ❌     | ⚠️ Pandoc+few     | ✅              |
| kramdown `{::}`      | ❌       | ❌     | ❌        | ✅     | ❌ kramdown       | ✅              |
| MDX `{/* */}`        | ❌       | ❌     | ❌        | ✅     | ❌ MDX only       | ✅              |
| Pandoc `^[]`         | ✅       | ❌     | ❌        | ❌     | ⚠️ Pandoc         | ✅              |
| Marker/PyMdown       | ✅       | ❌     | ❌        | ❌     | ⚠️ Limited        | ✅              |
| JasperSurmont        | ~line    | ✅     | ✅        | ✅     | ❌ Obsidian       | ✅              |
| HQuaiato             | ✅       | ❌     | ❌        | ⚠️     | ⚠️ HTML parsers   | ✅              |
| ChobbyCode           | ✅       | ❌     | ❌        | ✅     | ❌ Plugin only    | ⚠️ (sidecar)    |
| HackMD/GitBook/...   | ✅       | ✅     | ✅        | ✅     | ❌ Platform       | ❌ **Lost**     |

\* CriticMarkup: author by informal convention only

---

## The Gap

The landscape splits into two camps:

1. **In-file but unstructured** — HTML comments, `%%`, CriticMarkup, ref-link
   hacks. Comments survive in the Markdown source but lack identity, threading,
   and proper anchoring.

2. **Structured but platform-locked** — HackMD, GitBook, Notion, sidecar JSON.
   Full comment features exist but don't survive Markdown export or
   round-tripping.

**No existing approach bridges both**: structured, threaded, author-attributed
comments that live in the Markdown file and degrade gracefully in standard
renderers.

---

## Proposed Design: Footnote-Based Comments

Fills the gap by reusing three battle-tested Markdown primitives: **footnotes**
(`[^ref]`), **blockquotes** (`>`), and **@-mentions**.

### Inline anchor

```markdown
The monthly revenue grew by 15%[^c-rev1] and user retention
improved across all cohorts[^c-ret1].
```

### Thread definitions (bottom of document)

```markdown
[^c-rev1]:
    status: resolved

    @alice (2026-02-10):
    > Are we comparing this to the same quarter last year?

    @bob (2026-02-11):
    > Yes, it's YoY. Added a clarifying footnote.

    @alice (2026-02-11):
    > 👍

[^c-ret1]:
    @carol (2026-02-12):
    > Can we break this down by cohort in an appendix?
```

| Aspect       | Detail                                            |
| ------------ | ------------------------------------------------- |
| Anchoring    | ✅ Inline `[^c-id]` at exact text location        |
| Author       | ✅ `@author` lines                                |
| Date         | ✅ `(YYYY-MM-DD)` timestamps                      |
| Threading    | ✅ Sequential `@author` entries in one definition  |
| Status       | ✅ `key: value` metadata (avoids `{}` collisions)  |
| Prose impact | ✅ Only a tiny `[^c-id]` marker in the prose       |
| Portability  | ✅ Degrades to standard footnotes in any parser    |
| Extensible   | ✅ Suggestions, reactions, visibility tags          |

### Syntax collision notes

- **`@`** has no special meaning in CommonMark. GFM treats `@user` as a
  mention autolink, which is a bonus (free clickable links).
- **`{}`** is used as attribute syntax by Pandoc, kramdown, and others.
  This design deliberately avoids `{}` for metadata tags and uses
  `key: value` lines instead (YAML/front-matter style).
- **`[^...]`** is the widely supported footnote syntax. The `c-` namespace
  prefix avoids collision with regular document footnotes.