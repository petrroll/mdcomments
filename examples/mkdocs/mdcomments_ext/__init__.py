"""
mdcomments_ext — Python-Markdown extension for mdcomments.

Transforms c- prefixed footnotes into a comment sidebar UI with:
  - Author avatars, names, and timestamps
  - Threaded reply display
  - Status badges (open / resolved)
  - Highlight detection on <mark> elements linked to comment refs
  - Injected sidebar HTML and CSS

Works with Python-Markdown's built-in `footnotes` extension and
`pymdownx.mark` for ==highlight== syntax.

Usage in mkdocs.yml:
    markdown_extensions:
      - footnotes
      - pymdownx.mark
      - mdcomments_ext
"""

from markdown import Extension
from markdown.treeprocessors import Treeprocessor
from markdown.postprocessors import Postprocessor
import xml.etree.ElementTree as etree
import re
import os


def _escape(text):
    """Escape HTML special characters."""
    return (text
            .replace("&", "&amp;")
            .replace("<", "&lt;")
            .replace(">", "&gt;")
            .replace('"', "&quot;"))


def _parse_footnote_content(li_element):
    """
    Parse a footnote <li> element to extract mdcomments metadata and entries.

    Returns None if this doesn't look like an mdcomment,
    otherwise returns {meta: {status, anchor}, entries: [{author, date, body_lines}]}.
    """
    # Collect all text content
    text_parts = []
    for elem in li_element.iter():
        if elem.text:
            text_parts.append(elem.text)
        if elem.tail:
            text_parts.append(elem.tail)
    full_text = "\n".join(text_parts)

    # Must contain @author (date): pattern to be an mdcomment
    if not re.search(r"@\w+\s*\(\d{4}-\d{2}-\d{2}\)", full_text):
        return None

    meta = {}
    entries = []
    current_entry = None

    for line in full_text.split("\n"):
        trimmed = line.strip()
        if not trimmed:
            continue

        # Metadata lines (before any @author entry)
        meta_match = re.match(r"^(status|anchor):\s*(.+)$", trimmed, re.IGNORECASE)
        if meta_match and not entries:
            val = meta_match.group(2).strip()
            # Strip quotes
            if val.startswith('"') and val.endswith('"'):
                val = val[1:-1]
            elif val.startswith("'") and val.endswith("'"):
                val = val[1:-1]
            meta[meta_match.group(1).lower()] = val
            continue

        # Author line
        author_match = re.match(r"^@(\w+)\s*\((\d{4}-\d{2}-\d{2})\):?$", trimmed)
        if author_match:
            current_entry = {
                "author": author_match.group(1),
                "date": author_match.group(2),
                "body_lines": [],
            }
            entries.append(current_entry)
            continue

        # Body text — skip Python-Markdown stash placeholders (STX zzNNNqq ETX)
        if current_entry is not None:
            if not re.fullmatch(r"\x02?zz\d+qq\x03?", trimmed):
                current_entry["body_lines"].append(trimmed)

    if not entries:
        return None

    return {"meta": meta, "entries": entries}


def _render_thread_html(thread_id, thread):
    """Render a parsed thread as sidebar card HTML."""
    status = thread["meta"].get("status", "open")
    status_label = status.capitalize()
    status_class = (
        "mdcomment-status-resolved" if status == "resolved"
        else "mdcomment-status-open"
    )

    parts = []
    parts.append(
        f'<div class="mdcomment-thread" id="thread-{_escape(thread_id)}" '
        f'data-status="{_escape(status)}">'
    )

    if thread["meta"].get("anchor"):
        parts.append(
            f'  <div class="mdcomment-thread-anchor">'
            f'{_escape(thread["meta"]["anchor"])}</div>'
        )

    parts.append(
        f'  <span class="mdcomment-status {status_class}">{status_label}</span>'
    )

    for entry in thread["entries"]:
        initial = entry["author"][0].upper()
        body_html = "".join(
            f"<p>{_escape(line)}</p>" for line in entry["body_lines"]
        )
        parts.append('  <div class="mdcomment-entry">')
        parts.append('    <div class="mdcomment-author-line">')
        parts.append(f'      <span class="mdcomment-avatar">{initial}</span>')
        parts.append(
            f'      <span class="mdcomment-author">@{_escape(entry["author"])}</span>'
        )
        parts.append(
            f'      <span class="mdcomment-date">{_escape(entry["date"])}</span>'
        )
        parts.append("    </div>")
        parts.append(f'    <div class="mdcomment-body">{body_html}</div>')
        parts.append("  </div>")

    parts.append("</div>")
    return "\n".join(parts)


class MdcommentsTreeprocessor(Treeprocessor):
    """Walk the element tree and transform c- footnotes into sidebar threads."""

    def run(self, root):
        self.threads = {}
        self.thread_order = []

        # Find footnote div/section
        footnote_div = None
        for div in root.iter("div"):
            if div.get("class") and "footnote" in div.get("class", ""):
                footnote_div = div
                break

        if footnote_div is None:
            return

        # Find the <ol> inside
        ol = footnote_div.find(".//ol")
        if ol is None:
            return

        items_to_remove = []

        for li in list(ol):
            if li.tag != "li":
                continue
            li_id = li.get("id", "")

            # Python-Markdown footnotes use id="fn:label"
            match = re.match(r"^fn:(c-.+)$", li_id)
            if not match:
                continue

            thread_id = match.group(1)
            thread = _parse_footnote_content(li)
            if thread is None:
                continue

            self.threads[thread_id] = thread
            self.thread_order.append(thread_id)
            items_to_remove.append(li)

        # Remove comment footnotes from the regular footnote list
        for li in items_to_remove:
            ol.remove(li)

        # If no regular footnotes remain, remove the entire footnote div
        if len(list(ol)) == 0:
            parent = None
            for p in root.iter():
                if footnote_div in list(p):
                    parent = p
                    break
            if parent is not None:
                parent.remove(footnote_div)

        # Transform inline footnote refs: <sup id="fnref:c-xxx">
        for sup in root.iter("sup"):
            sup_id = sup.get("id", "")
            match = re.match(r"^fnref:(c-.+)$", sup_id)
            if not match:
                # Also check for fnref2:, fnref3: etc. (multiple refs)
                match = re.match(r"^fnref\d*:(c-.+)$", sup_id)
            if not match:
                continue

            thread_id = match.group(1)
            if thread_id not in self.threads:
                continue

            status = self.threads[thread_id]["meta"].get("status", "open")

            # Replace sup content with badge
            sup.clear()
            sup.tag = "a"
            sup.set("class", "mdcomment-badge")
            sup.set("href", f"#thread-{thread_id}")
            sup.set("data-status", status)
            sup.set("title", f"Comment thread: {thread_id}")
            sup.text = "💬"

        # Mark <mark> elements associated with comment badges.
        # We only tag a <mark> when its immediate next sibling is
        # an mdcomment badge (<a class="mdcomment-badge" ...>💬</a>).
        for mark in root.iter("mark"):
            parent = None
            mark_index = -1
            for p in root.iter():
                children = list(p)
                for i, child in enumerate(children):
                    if child is mark:
                        parent = p
                        mark_index = i
                        break
                if parent:
                    break

            if parent is None or mark_index < 0:
                continue

            siblings = list(parent)
            if mark_index + 1 >= len(siblings):
                continue

            next_sibling = siblings[mark_index + 1]
            if next_sibling.tag != "a":
                continue

            classes = (next_sibling.get("class") or "").split()
            if "mdcomment-badge" not in classes:
                continue

            existing = (mark.get("class") or "").split()
            if "mdcomment-highlight" not in existing:
                existing.append("mdcomment-highlight")
                mark.set("class", " ".join(existing))


class MdcommentsPostprocessor(Postprocessor):
    """Inject sidebar HTML and CSS after the content."""

    def __init__(self, md, treeprocessor):
        super().__init__(md)
        self.treeprocessor = treeprocessor

    def run(self, text):
        threads = getattr(self.treeprocessor, "threads", {})
        thread_order = getattr(self.treeprocessor, "thread_order", [])

        if not thread_order:
            return text

        # Read plugin CSS
        # __file__ → mdcomments_ext/ → mkdocs/ → examples/
        css_path = os.path.join(
            os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))),
            "shared", "style-plugin.css"
        )
        css_content = ""
        if os.path.exists(css_path):
            with open(css_path) as f:
                css_content = f.read()

        # Build sidebar
        sidebar_parts = [
            '<div class="mdcomments-sidebar">',
            '  <div class="mdcomments-sidebar-header">Comments</div>',
        ]
        for tid in thread_order:
            sidebar_parts.append(_render_thread_html(tid, threads[tid]))
        sidebar_parts.append("</div>")

        sidebar_html = "\n".join(sidebar_parts)

        # Wrap in page layout
        wrapped = (
            f"<style>{css_content}</style>\n"
            f'<div class="mdcomments-page">\n'
            f'<div class="mdcomments-content">\n'
            f"{text}\n"
            f"</div>\n"
            f"{sidebar_html}\n"
            f"</div>"
        )

        return wrapped


class MdcommentsExtension(Extension):
    """Python-Markdown extension entry point."""

    def extendMarkdown(self, md):
        tp = MdcommentsTreeprocessor(md)
        md.treeprocessors.register(tp, "mdcomments_tree", 5)

        pp = MdcommentsPostprocessor(md, tp)
        md.postprocessors.register(pp, "mdcomments_post", 5)


def makeExtension(**kwargs):
    return MdcommentsExtension(**kwargs)
