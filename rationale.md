# Why This Format

An explanation of the design choices behind mdcomments and the alternatives we considered.

For the normative syntax and grammar, see [`specification.md`](specification.md).

---

## Design Goals

Any Markdown comment format worth adopting must satisfy all of these:

1. **Anchored** — comments attach to specific text, not just float in the file.
2. **Attributed** — each comment carries an author and timestamp.
3. **Threaded** — replies form a conversation, not a flat list.
4. **Hidden or graceful** — comments don't pollute rendered output; or, if they appear, they appear as sensible footnotes rather than garbage.
5. **Portable** — the file works in any standard Markdown parser without a plugin.
6. **Survives round-tripping** — comments aren't stripped on export/import.
7. **Minimal prose impact** — the writing remains readable in source view.

No existing approach meets all seven. That's the gap mdcomments fills.

---

## Alternatives Considered

### HTML Comments (`<!-- -->`)

```markdown
<!-- TODO: verify this number —alice -->
```

The most widely supported option. Every parser ignores them in output.

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Universal support | No anchoring to specific text |
| Truly hidden in output | No author, date, or threading |
| | Unstructured — just free text |

**Verdict:** Good for TODO markers, too primitive for collaborative review.

### Reference-Link Hack

```markdown
[//]: # (This is a comment that won't render)
```

Exploits the fact that unused reference links are invisible in output.

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Works in most parsers | No anchoring |
| Hidden in output | No structure at all |
| | Fragile — some parsers may handle these differently |

**Verdict:** A clever trick, but not a foundation for structured comments.

### Obsidian `%%` Comments

```markdown
%% This is hidden in preview %%
```

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Simple syntax | Obsidian-only — no other parser understands `%%` |
| Hidden in preview/export | No anchoring, author, or threading |

**Verdict:** Non-standard. Locks you into one tool.

### CriticMarkup

```markdown
This needs {>>a comment<<} here.
{==highlighted==}{>>with annotation<<}
```

The closest prior art for inline editorial markup.

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Inline, anchored to text | No threading or author attribution by spec |
| Supported by Pandoc & MultiMarkdown | `{}` collides with attribute syntax in Pandoc/kramdown |
| | Not hidden — renders visibly in most tools |
| | Limited adoption outside Pandoc |

**Verdict:** Great for track-changes, but the `{}` collision and lack of threading make it unsuitable for comments.

### kramdown `{::comment}` Directive

```markdown
{::comment}
This is a kramdown comment block, stripped from output.
{:/comment}
```

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Explicitly a comment (not an HTML hack) | kramdown-only — no other parser supports it |
| | No anchoring, no structure |

**Verdict:** Ecosystem-specific. Only works in kramdown (Jekyll).

### MDX / JSX Comments

```mdx
{/* This is a comment in MDX */}
```

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Native to the React/JSX ecosystem | Only works in MDX-aware parsers |
| | No anchoring, identity, or threading |

**Verdict:** Ecosystem-specific. Not portable Markdown.

### Pandoc Footnotes

```markdown
Reference style: Here is some text.[^1]

[^1]: This is the footnote content.

Inline style: Here is some text.^[This could serve as an inline comment.]
```

Two forms — reference-style and inline — sometimes repurposed for comments.

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Concise; reference-style cleanly separates anchor from content | Renders visibly as a footnote (not hidden) |
| | No identity, no threading |

**Verdict:** Useful building block, but footnotes alone lack structure for collaborative comments.

### Marker / PyMdown Highlight Syntax

```markdown
{==This is highlighted text==}
{>>This is a marginal note<<}
```

Overlaps with CriticMarkup; uses `{== ==}` for highlighting.

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Visual anchoring | Same limitations as CriticMarkup — no threads, no identity |
| | Limited adoption |

**Verdict:** Niche. Same structural shortcomings as CriticMarkup.

### Ad-Hoc Styled Blockquotes

```markdown
> **@Petr** *2025-02-03* The `CH-*` headers are placeholders pending
> Max's plans for a better client telemetry system.
>
>> **@Max** *2025-02-05* Acknowledged — will share the new schema by
>> end of sprint.
```

A convention (not a spec) sometimes seen in PR descriptions, design docs, and RFCs: bold `**@name**`, italic `*date*`, then the comment text, threaded via nested `>>`.

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Pure standard Markdown — every parser | No anchoring to specific text |
| Threading via nested blockquotes | Multiple threads at the same location are hard to distinguish |
| Author + date by convention | Structure is informal / unenforced |
| | Visible in output (not hidden or graceful) |

**Verdict:** Close in spirit to mdcomments — threaded and attributed — but lacks anchoring and a formal grammar. mdcomments adds anchoring (`[^c-id]`), a namespace, and a normative spec while keeping the same Markdown-native philosophy.

### Sidecar Files (JSON alongside `.md`)

```
Note.md
Note.md.comments.json
```

Comments stored as character offsets in a separate file.

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Markdown source stays pristine | Comments lost if sidecar is missing |
| Can store rich structured data | Character offsets break on any external edit |
| | Two files to track instead of one |

**Verdict:** Fragile and non-portable. Defeats the single-file simplicity of Markdown.

### Platform Databases (HackMD, GitBook, Notion)

Full Google Docs–style comment UIs, but comments live in the platform's database.

| ✅ Strengths | ❌ Weaknesses |
|---|---|
| Rich UI: threading, authorship, resolution | **Comments are stripped on Markdown export** |
| Real-time collaboration | Platform lock-in |

**Verdict:** Great UX, zero portability. Comments simply vanish when you leave the platform.

---

## Comparison Matrix

| Approach | Anchored | Author | Threaded | Hidden/Graceful | Portable | Survives Export | Prose Impact |
|---|---|---|---|---|---|---|---|
| HTML `<!-- -->` | ❌ | ❌ | ❌ | ✅ Hidden | ✅ | ✅ | Low |
| Ref-link hack | ❌ | ❌ | ❌ | ✅ Hidden | ✅ | ✅ | Low |
| Obsidian `%%` | ❌ | ❌ | ❌ | ✅ Hidden | ❌ | ✅ | Low |
| CriticMarkup | ✅ | ❌ | ❌ | ❌ Visible | ⚠️ Pandoc | ✅ | Medium |
| kramdown `{::}` | ❌ | ❌ | ❌ | ✅ Hidden | ❌ | ✅ | Low |
| MDX `{/* */}` | ❌ | ❌ | ❌ | ✅ Hidden | ❌ | ✅ | Low |
| Pandoc `^[]` | ✅ | ❌ | ❌ | ❌ Visible | ⚠️ Pandoc | ✅ | Low |
| Marker/PyMdown | ✅ | ❌ | ❌ | ❌ Visible | ⚠️ Limited | ✅ | Medium |
| Styled Blockquotes | ❌ | ✅* | ⚠️* | ❌ Visible | ✅ | ✅ | Medium |
| Sidecar JSON | ✅ | ❌ | ❌ | ✅ Hidden | ❌ | ⚠️ | None |
| Platform DB | ✅ | ✅ | ✅ | ✅ Hidden | ❌ | ❌ Lost | None |
| **mdcomments** | **✅** | **✅** | **✅** | **✅ Graceful** | **✅** | **✅** | **Minimal** |

---

## Why Footnotes?

We chose to build on footnote syntax (`[^ref]`) for several specific reasons:

1. **Already standardized.** Footnotes are supported by GitHub Flavored Markdown, Pandoc, PHP Markdown Extra, Hugo, Obsidian, and most CommonMark extensions. They are the closest thing to a universal Markdown extension.

2. **Graceful degradation.** In renderers that support footnotes, comments appear as numbered references — odd but harmless. In renderers that don't, the raw `[^c-id]` is visible but small and unintrusive.

3. **Natural separation of concerns.** Footnotes already establish the pattern of a tiny inline marker with a longer definition elsewhere. This keeps prose clean and comments organized.

4. **No new syntax to invent.** We combine three existing primitives — footnotes, blockquotes, and @-mentions — rather than introducing novel delimiters that would collide with existing tools.

5. **Convention over specification.** The `c-` prefix and `@author (date):` pattern are conventions layered on valid Markdown. A parser that knows nothing about mdcomments still produces reasonable output.

---

## Why Not HTML Comments With Structure?

A structured HTML comment was considered:

```markdown
<!-- @alice 2026-02-10: Is this correct? [anchor:rev1] [thread:t1] -->
```

This keeps comments hidden, but:
- Parsers strip HTML comments entirely — there's nothing to degrade *to*.
- Threading requires inventing a cross-referencing scheme inside opaque comment blocks.
- No visual signal to the reader that a comment exists at a given location.

Footnotes solve all three: they degrade to visible references, threading is natural (sequential entries in one definition), and the inline marker is a clear, clickable anchor.

---

## Summary

Every alternative either lacks structure (HTML comments, `%%`, ref-links) or locks you into a platform (HackMD, Notion, sidecar JSON). CriticMarkup comes closest but lacks threading and collides with attribute syntax.

mdcomments is the only approach that is **structured, threaded, attributed, portable, and built entirely from standard Markdown primitives**. It supports **span anchoring** via `==text==[^c-id]`, and it also supports a **markerless sidecar workflow** where `document.md` stays untouched and anchoring lives in `document.comments.md` metadata.

In sidecar mode, you can add or remove threads without changing the source prose at all. This is useful for review pipelines that treat `document.md` as immutable content while still allowing collaborative discussion.

---

## See It in Action

For working examples of how mdcomments renders across five different Markdown systems (markdown-it, Pandoc, MkDocs, Showdown, and Comrak) — both with default settings and purpose-built plugins — see the [cross-parser examples](examples/). You can also try the [interactive editor](examples/interactive-editor/) to create and reply to comments in a live browser-based editor.
