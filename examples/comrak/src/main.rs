//! mdcomments-comrak — Comrak (Rust GFM parser) example for mdcomments.
//!
//! Two modes:
//!   --default   Render with footnotes extension only (graceful degradation)
//!   --plugin    Walk AST to transform c- footnotes into comment sidebar UI
//!
//! Usage:
//!   cargo run -- --default --input ../input.md
//!   cargo run -- --plugin  --input ../input.md

use comrak::nodes::{AstNode, NodeValue};
use comrak::{format_html, parse_document, Arena, Options};
use std::collections::BTreeMap;
use std::fs;
use std::path::PathBuf;

// ── Data structures ─────────────────────────────────────────────────

struct CommentEntry {
    author: String,
    date: String,
    body_lines: Vec<String>,
}

struct CommentThread {
    meta_status: Option<String>,
    meta_anchor: Option<String>,
    entries: Vec<CommentEntry>,
}

// ── HTML helpers ────────────────────────────────────────────────────

fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

fn render_thread_html(id: &str, thread: &CommentThread) -> String {
    let status = thread.meta_status.as_deref().unwrap_or("open");
    let status_label = {
        let mut c = status.chars();
        match c.next() {
            None => String::new(),
            Some(f) => f.to_uppercase().to_string() + c.as_str(),
        }
    };
    let status_class = if status == "resolved" {
        "mdcomment-status-resolved"
    } else {
        "mdcomment-status-open"
    };

    let mut html = format!(
        "<div class=\"mdcomment-thread\" id=\"thread-{}\" data-status=\"{}\">\n",
        escape_html(id),
        escape_html(status)
    );

    if let Some(anchor) = &thread.meta_anchor {
        html.push_str(&format!(
            "  <div class=\"mdcomment-thread-anchor\">{}</div>\n",
            escape_html(anchor)
        ));
    }

    html.push_str(&format!(
        "  <span class=\"mdcomment-status {}\">{}</span>\n",
        status_class, status_label
    ));

    for entry in &thread.entries {
        let initial = entry
            .author
            .chars()
            .next()
            .unwrap_or('?')
            .to_uppercase()
            .to_string();
        let body_html: String = entry
            .body_lines
            .iter()
            .map(|l| format!("<p>{}</p>", escape_html(l)))
            .collect();

        html.push_str("  <div class=\"mdcomment-entry\">\n");
        html.push_str("    <div class=\"mdcomment-author-line\">\n");
        html.push_str(&format!(
            "      <span class=\"mdcomment-avatar\">{}</span>\n",
            initial
        ));
        html.push_str(&format!(
            "      <span class=\"mdcomment-author\">@{}</span>\n",
            escape_html(&entry.author)
        ));
        html.push_str(&format!(
            "      <span class=\"mdcomment-date\">{}</span>\n",
            escape_html(&entry.date)
        ));
        html.push_str("    </div>\n");
        html.push_str(&format!(
            "    <div class=\"mdcomment-body\">{}</div>\n",
            body_html
        ));
        html.push_str("  </div>\n");
    }

    html.push_str("</div>\n");
    html
}

// ── AST text extraction ─────────────────────────────────────────────

fn collect_text<'a>(node: &'a AstNode<'a>) -> String {
    let mut text = String::new();
    for child in node.descendants() {
        let data = child.data.borrow();
        match &data.value {
            NodeValue::Text(t) => text.push_str(t),
            NodeValue::SoftBreak | NodeValue::LineBreak => text.push('\n'),
            NodeValue::Code(c) => text.push_str(&c.literal),
            // Insert newline separators between block-level elements so that
            // line-based parsing in parse_thread_from_text works correctly.
            NodeValue::Paragraph | NodeValue::BlockQuote => {
                if !text.is_empty() && !text.ends_with('\n') {
                    text.push('\n');
                }
            }
            _ => {}
        }
    }
    text
}

// ── Parse footnote content ──────────────────────────────────────────

fn parse_thread_from_text(text: &str) -> Option<CommentThread> {
    let mut meta_status = None;
    let mut meta_anchor = None;
    let mut entries: Vec<CommentEntry> = Vec::new();
    let mut current_idx: Option<usize> = None;

    // Check if this contains @author patterns
    let author_re =
        regex_lite::Regex::new(r"@(\w+)\s*\((\d{4}-\d{2}-\d{2})\):?").unwrap();
    if !author_re.is_match(text) {
        return None;
    }

    for line in text.lines() {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        // Metadata lines (before any @author entry)
        if entries.is_empty() {
            if let Some((key, value)) = trimmed.split_once(':') {
                let key = key.trim();
                let value = value.trim();

                if key.eq_ignore_ascii_case("status") {
                    meta_status = Some(value.to_string());
                    continue;
                }

                if key.eq_ignore_ascii_case("anchor") {
                    let val = value
                        .strip_prefix('"')
                        .and_then(|v| v.strip_suffix('"'))
                        .or_else(|| {
                            value
                                .strip_prefix('\'')
                                .and_then(|v| v.strip_suffix('\''))
                        })
                        .unwrap_or(value);
                    meta_anchor = Some(val.to_string());
                    continue;
                }
            }
        }

        // Author line
        if let Some(caps) = author_re.captures(trimmed) {
            entries.push(CommentEntry {
                author: caps[1].to_string(),
                date: caps[2].to_string(),
                body_lines: Vec::new(),
            });
            current_idx = Some(entries.len() - 1);
            continue;
        }

        // Body text (strip blockquote prefix)
        if let Some(idx) = current_idx {
            let body_line = trimmed.strip_prefix("> ").unwrap_or(trimmed);
            if !body_line.is_empty() {
                entries[idx].body_lines.push(body_line.to_string());
            }
        }
    }

    if entries.is_empty() {
        return None;
    }

    Some(CommentThread {
        meta_status,
        meta_anchor,
        entries,
    })
}

// ── Main ────────────────────────────────────────────────────────────

fn main() {
    let args: Vec<String> = std::env::args().collect();
    let mode = args
        .iter()
        .find(|a| a.starts_with("--"))
        .map(|s| s.as_str())
        .unwrap_or("--default");

    let input_path = args
        .iter()
        .position(|a| a == "--input")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("../input.md"));

    let input = fs::read_to_string(&input_path).expect("Failed to read input file");

    let template_path = args
        .iter()
        .position(|a| a == "--template")
        .and_then(|i| args.get(i + 1))
        .map(PathBuf::from)
        .unwrap_or_else(|| PathBuf::from("../shared/template.html"));

    let template = fs::read_to_string(&template_path).expect("Failed to read template");

    let mut options = Options::default();
    options.extension.footnotes = true;
    options.extension.strikethrough = true;
    options.render.unsafe_ = true;

    match mode {
        "--default" => build_default(&input, &template, &options),
        "--plugin" => build_plugin(&input, &template, &options),
        _ => {
            eprintln!("Usage: mdcomments-comrak --default|--plugin [--input FILE]");
            std::process::exit(1);
        }
    }
}

fn build_default(input: &str, template: &str, options: &Options) {
    let css_path = PathBuf::from("../shared/style-default.css");
    let css = fs::read_to_string(&css_path).unwrap_or_default();

    let arena = Arena::new();
    let root = parse_document(&arena, input, options);

    let mut body = Vec::new();
    format_html(root, options, &mut body).unwrap();
    let body_str = String::from_utf8(body).unwrap();

    let html = template
        .replace("{{TITLE}}", "mdcomments — Comrak (default)")
        .replace("{{CSS}}", &format!("<style>{}</style>", css))
        .replace("{{BODY}}", &body_str);

    fs::write("output-default.html", html).unwrap();
    println!("✓ comrak default → output-default.html");
}

fn build_plugin(input: &str, template: &str, options: &Options) {
    let css_path = PathBuf::from("../shared/style-plugin.css");
    let css = fs::read_to_string(&css_path).unwrap_or_default();

    let arena = Arena::new();
    let root = parse_document(&arena, input, options);

    // ── Pass 1: Collect c- footnote definitions ──
    let mut threads: BTreeMap<String, CommentThread> = BTreeMap::new();
    let mut thread_order: Vec<String> = Vec::new();

    // Collect footnote definition node pointers and their names
    let fn_defs: Vec<(&AstNode, String)> = root
        .descendants()
        .filter_map(|node| {
            let data = node.data.borrow();
            if let NodeValue::FootnoteDefinition(ref defn) = data.value {
                if defn.name.starts_with("c-") {
                    return Some((node, defn.name.clone()));
                }
            }
            None
        })
        .collect();

    for (node, name) in &fn_defs {
        let text = collect_text(node);
        if let Some(thread) = parse_thread_from_text(&text) {
            thread_order.push(name.clone());
            threads.insert(name.clone(), thread);
        }
    }

    // ── Pass 2: Replace FootnoteReference nodes with c- prefix → badge HTML ──
    let fn_refs: Vec<(&AstNode, String)> = root
        .descendants()
        .filter_map(|node| {
            let data = node.data.borrow();
            if let NodeValue::FootnoteReference(ref fref) = data.value {
                if fref.name.starts_with("c-") {
                    return Some((node, fref.name.clone()));
                }
            }
            None
        })
        .collect();

    for (node, name) in &fn_refs {
        let status = threads
            .get(name)
            .and_then(|t| t.meta_status.as_deref())
            .unwrap_or("open");

        let badge_html = format!(
            "<a class=\"mdcomment-badge\" href=\"#thread-{}\" \
             data-status=\"{}\" title=\"Comment thread: {}\">💬</a>",
            escape_html(name),
            escape_html(status),
            escape_html(name)
        );

        let mut data = node.data.borrow_mut();
        data.value = NodeValue::HtmlInline(badge_html);
    }

    // ── Pass 3: Handle ==text== in Text nodes ──
    let mark_nodes: Vec<(&AstNode, String)> = root
        .descendants()
        .filter_map(|node| {
            let data = node.data.borrow();
            if let NodeValue::Text(ref t) = data.value {
                if t.contains("==") {
                    return Some((node, t.clone()));
                }
            }
            None
        })
        .collect();

    let mark_re = regex_lite::Regex::new(r"==(.+?)==").unwrap();
    for (node, text_content) in &mark_nodes {
        if mark_re.is_match(text_content) {
            let replaced =
                mark_re.replace_all(text_content, |caps: &regex_lite::Captures| {
                    format!(
                        "<mark class=\"mdcomment-highlight\">{}</mark>",
                        escape_html(&caps[1])
                    )
                });

            let mut data = node.data.borrow_mut();
            data.value = NodeValue::HtmlInline(replaced.into_owned());
        }
    }

    // ── Pass 4: Remove c- FootnoteDefinition nodes ──
    // Collect first, then detach (can't modify tree during iteration)
    let nodes_to_remove: Vec<&AstNode> = root
        .descendants()
        .filter(|node| {
            let data = node.data.borrow();
            if let NodeValue::FootnoteDefinition(ref defn) = data.value {
                thread_order.contains(&defn.name)
            } else {
                false
            }
        })
        .collect();

    for node in nodes_to_remove {
        node.detach();
    }

    // ── Render HTML ──
    let mut body = Vec::new();
    format_html(root, options, &mut body).unwrap();
    let mut body_str = String::from_utf8(body).unwrap();

    // ── Build sidebar ──
    if !thread_order.is_empty() {
        let mut sidebar = String::from("<div class=\"mdcomments-sidebar\">\n");
        sidebar.push_str("  <div class=\"mdcomments-sidebar-header\">Comments</div>\n");
        for id in &thread_order {
            if let Some(thread) = threads.get(id) {
                sidebar.push_str(&render_thread_html(id, thread));
            }
        }
        sidebar.push_str("</div>\n");

        body_str = format!(
            "<div class=\"mdcomments-page\">\n<div class=\"mdcomments-content\">\n{}\n</div>\n{}\n</div>\n",
            body_str, sidebar
        );
    }

    let html = template
        .replace("{{TITLE}}", "mdcomments — Comrak (plugin)")
        .replace("{{CSS}}", &format!("<style>{}</style>", css))
        .replace("{{BODY}}", &body_str);

    fs::write("output-plugin.html", html).unwrap();
    println!("✓ comrak plugin → output-plugin.html");
}
