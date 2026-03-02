#!/usr/bin/env python3
"""
add-pdf-comments.py — Post-process a PDF to add comment annotations.

Reads an mdcomments-flavoured Markdown file, extracts c- prefixed footnote
threads, then adds them as PDF annotations (sticky notes + text highlights)
to an existing PDF generated from the same source.

Usage:
    python3 add-pdf-comments.py INPUT_MD INPUT_PDF OUTPUT_PDF

Dependencies:
    pip install pymupdf
"""

import re
import sys
import fitz  # PyMuPDF


# ── Markdown thread parser ──────────────────────────────────────────

_AUTHOR_RE = re.compile(r"^@(\w+)\s*\((\d{4}-\d{2}-\d{2})\):?\s*$")
_META_RE = re.compile(r"^(status|anchor):\s*(.+)$", re.IGNORECASE)
_REF_RE = re.compile(r"\[\^(c-[^\]]+)\]")
_DEF_RE = re.compile(r"^\[\^(c-[^\]]+)\]:\s*$")
_HIGHLIGHT_RE = re.compile(r"==(.*?)==")


def parse_threads(md_text: str):
    """Return {thread_id: {meta, entries}} parsed from c- footnote defs."""
    threads = {}
    thread_order = []
    lines = md_text.split("\n")
    i = 0
    while i < len(lines):
        m = _DEF_RE.match(lines[i].strip())
        if not m:
            i += 1
            continue
        thread_id = m.group(1)
        i += 1
        meta = {}
        entries = []
        current_entry = None
        # Read indented block
        while i < len(lines):
            raw = lines[i]
            # Footnote def blocks are indented by 4 spaces (or 1 tab)
            if raw.strip() == "":
                i += 1
                continue
            if not raw.startswith("    ") and not raw.startswith("\t"):
                break
            trimmed = raw.strip()
            # Metadata
            mm = _META_RE.match(trimmed)
            if mm and not entries:
                val = mm.group(2).strip().strip("\"'")
                meta[mm.group(1).lower()] = val
                i += 1
                continue
            # Author line
            am = _AUTHOR_RE.match(trimmed)
            if am:
                current_entry = {
                    "author": am.group(1),
                    "date": am.group(2),
                    "body_lines": [],
                }
                entries.append(current_entry)
                i += 1
                continue
            # Body line
            if current_entry is not None:
                body = re.sub(r"^>\s*", "", trimmed)
                if body:
                    current_entry["body_lines"].append(body)
            i += 1

        if entries:
            threads[thread_id] = {"meta": meta, "entries": entries}
            thread_order.append(thread_id)

    return threads, thread_order


def find_inline_refs(md_text: str):
    """Return list of (thread_id, nearby_plain_text) in document order.

    nearby_plain_text is the line text surrounding the reference (stripped
    of markdown), used to locate the annotation position in the PDF.
    """
    refs = []
    for line in md_text.split("\n"):
        for m in _REF_RE.finditer(line):
            tid = m.group(1)
            # Strip markdown formatting from the line to get searchable text
            plain = re.sub(r"\[\^[^\]]+\]", "", line)
            plain = re.sub(r"==(.*?)==", r"\1", plain)
            plain = re.sub(r"[*_`#>]", "", plain).strip()
            refs.append((tid, plain))
    return refs


def _thread_to_text(thread):
    """Format a thread as readable annotation text."""
    parts = []
    status = thread["meta"].get("status", "open")
    parts.append(f"[{status.upper()}]")
    for entry in thread["entries"]:
        body = " ".join(entry["body_lines"])
        parts.append(f"@{entry['author']} ({entry['date']}): {body}")
    return "\n".join(parts)


# ── Colour palette for annotation authors ───────────────────────────

_AUTHOR_COLOURS = [
    (1.0, 0.93, 0.6),    # pale yellow
    (0.6, 0.88, 1.0),    # pale blue
    (0.72, 1.0, 0.68),   # pale green
    (1.0, 0.78, 0.62),   # pale orange
    (0.88, 0.74, 1.0),   # pale purple
    (1.0, 0.72, 0.77),   # pale pink
]
_author_idx: dict[str, int] = {}


def _colour_for_author(author: str):
    if author not in _author_idx:
        _author_idx[author] = len(_author_idx) % len(_AUTHOR_COLOURS)
    return _AUTHOR_COLOURS[_author_idx[author]]


# ── PDF annotation injection ────────────────────────────────────────

def add_annotations(pdf_path: str, output_path: str, threads, thread_order,
                    inline_refs, md_text: str):
    doc = fitz.open(pdf_path)

    # Build a map: thread_id → anchor text (either explicit or from ==highlight==)
    anchor_map: dict[str, str | None] = {}
    for tid, thread in threads.items():
        anchor_map[tid] = thread["meta"].get("anchor")

    # Also try to find highlighted text from the markdown near the ref
    for line in md_text.split("\n"):
        for ref_m in _REF_RE.finditer(line):
            tid = ref_m.group(1)
            if tid in anchor_map and anchor_map[tid]:
                continue
            # Look for ==highlight== immediately preceding the reference
            before = line[:ref_m.start()]
            hl = list(_HIGHLIGHT_RE.finditer(before))
            if hl:
                anchor_map[tid] = hl[-1].group(1)

    # For each thread, try to find the anchor/context in the PDF and annotate
    used_positions: dict[int, list[float]] = {}  # page_num → list of y positions used

    for tid in thread_order:
        if tid not in threads:
            continue
        thread = threads[tid]
        anchor = anchor_map.get(tid)
        note_text = _thread_to_text(thread)
        first_author = thread["entries"][0]["author"] if thread["entries"] else "unknown"
        colour = _colour_for_author(first_author)

        placed = False

        # Strategy 1: search for anchor text and add highlight + sticky note
        if anchor:
            for page in doc:
                instances = page.search_for(anchor)
                if instances:
                    # Highlight all instances of the anchor text
                    for inst in instances:
                        highlight = page.add_highlight_annot(inst)
                        highlight.set_colors(stroke=colour)
                        highlight.set_info(
                            title=f"@{first_author}",
                            content=note_text,
                        )
                        highlight.set_opacity(0.5)
                        highlight.update()

                    # Add a sticky note in the margin next to the first instance
                    rect = instances[0]
                    note_point = fitz.Point(
                        page.rect.width - 30,
                        rect.y0
                    )
                    note = page.add_text_annot(
                        note_point,
                        note_text,
                        icon="Comment",
                    )
                    note.set_info(title=f"@{first_author}")
                    note.set_colors(stroke=colour)
                    note.update()
                    placed = True
                    break

        # Strategy 2: search for nearby context text
        if not placed:
            for ref_tid, context in inline_refs:
                if ref_tid != tid or not context:
                    continue
                # Search for fragments of the context line
                words = context.split()
                # Try progressively shorter phrases
                for length in range(min(6, len(words)), 1, -1):
                    for start in range(len(words) - length + 1):
                        phrase = " ".join(words[start:start + length])
                        if len(phrase) < 8:
                            continue
                        for page in doc:
                            instances = page.search_for(phrase)
                            if instances:
                                rect = instances[0]
                                note_point = fitz.Point(
                                    page.rect.width - 30,
                                    rect.y0,
                                )
                                note = page.add_text_annot(
                                    note_point,
                                    note_text,
                                    icon="Comment",
                                )
                                note.set_info(title=f"@{first_author}")
                                note.set_colors(stroke=colour)
                                note.update()
                                placed = True
                                break
                        if placed:
                            break
                    if placed:
                        break
                if placed:
                    break

        # Strategy 3: fallback — place on first page in the margin
        if not placed:
            page = doc[0]
            y = 72  # default
            if 0 in used_positions:
                y = max(used_positions[0]) + 28
            note_point = fitz.Point(page.rect.width - 30, y)
            note = page.add_text_annot(
                note_point,
                note_text,
                icon="Comment",
            )
            note.set_info(title=f"@{first_author}")
            note.set_colors(stroke=colour)
            note.update()
            placed = True

        # Track y-positions used per page (for fallback stacking)
        if placed:
            for page in doc:
                for annot in page.annots() or []:
                    pn = page.number
                    used_positions.setdefault(pn, []).append(annot.rect.y0)

    doc.save(output_path)
    doc.close()


# ── Main ─────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) != 4:
        print(f"Usage: {sys.argv[0]} INPUT_MD INPUT_PDF OUTPUT_PDF",
              file=sys.stderr)
        sys.exit(1)

    md_path, pdf_in, pdf_out = sys.argv[1], sys.argv[2], sys.argv[3]

    with open(md_path) as f:
        md_text = f.read()

    threads, thread_order = parse_threads(md_text)
    inline_refs = find_inline_refs(md_text)

    if not threads:
        print("  (no c- comment threads found — copying PDF unchanged)")
        import shutil
        shutil.copy2(pdf_in, pdf_out)
        return

    add_annotations(pdf_in, pdf_out, threads, thread_order, inline_refs,
                    md_text)
    print(f"  Added {len(threads)} comment thread(s) as PDF annotations")


if __name__ == "__main__":
    main()
