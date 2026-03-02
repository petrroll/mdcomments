/**
 * ext-mdcomments.js — Showdown extension for mdcomments.
 *
 * Since Showdown uses a regex-based extension API (no AST / token stream),
 * we implement mdcomments processing at the preprocessor ("lang") stage:
 *
 *  1. Parse raw markdown to extract c- footnote definitions → build thread data
 *  2. Remove c- footnote definitions from the source
 *  3. Replace ==text==[^c-id] with <mark> + badge HTML
 *  4. Replace bare [^c-id] refs with badge HTML
 *  5. Append sidebar HTML after conversion (output stage)
 */

'use strict';

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderThread(id, thread) {
  const status = thread.meta.status || 'open';
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const statusClass = status === 'resolved'
    ? 'mdcomment-status-resolved'
    : 'mdcomment-status-open';

  let html = `<div class="mdcomment-thread" id="thread-${escapeHtml(id)}" data-status="${escapeHtml(status)}">\n`;

  if (thread.meta.anchor) {
    html += `  <div class="mdcomment-thread-anchor">${escapeHtml(thread.meta.anchor)}</div>\n`;
  }

  html += `  <span class="mdcomment-status ${statusClass}">${statusLabel}</span>\n`;

  for (const entry of thread.entries) {
    const initial = entry.author.charAt(0).toUpperCase();
    const bodyHtml = entry.bodyLines
      .map(l => `<p>${escapeHtml(l)}</p>`)
      .join('');

    html += `  <div class="mdcomment-entry">\n`;
    html += `    <div class="mdcomment-author-line">\n`;
    html += `      <span class="mdcomment-avatar">${initial}</span>\n`;
    html += `      <span class="mdcomment-author">@${escapeHtml(entry.author)}</span>\n`;
    html += `      <span class="mdcomment-date">${escapeHtml(entry.date)}</span>\n`;
    html += `    </div>\n`;
    html += `    <div class="mdcomment-body">${bodyHtml}</div>\n`;
    html += `  </div>\n`;
  }

  html += `</div>\n`;
  return html;
}

/**
 * Parse a footnote definition block from markdown source.
 * Returns {meta, entries} or null.
 */
function parseFootnoteBlock(block) {
  const meta = {};
  const entries = [];
  let currentEntry = null;

  const lines = block.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    // Metadata
    const metaMatch = trimmed.match(/^(status|anchor):\s*(.+)$/i);
    if (metaMatch && entries.length === 0) {
      let val = metaMatch[2].trim();
      if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
      if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
      meta[metaMatch[1].toLowerCase()] = val;
      continue;
    }

    // Author line
    const authorMatch = trimmed.match(/^@(\w+)\s*\((\d{4}-\d{2}-\d{2})\):?$/);
    if (authorMatch) {
      currentEntry = {
        author: authorMatch[1],
        date: authorMatch[2],
        bodyLines: []
      };
      entries.push(currentEntry);
      continue;
    }

    // Blockquote prefix removal
    const bodyLine = trimmed.replace(/^>\s*/, '');
    if (currentEntry && bodyLine) {
      currentEntry.bodyLines.push(bodyLine);
    }
  }

  if (entries.length === 0) return null;
  return { meta, entries };
}

/**
 * Showdown extension factory.
 */
function mdcommentsExtension() {
  const threads = {};
  const threadOrder = [];

  return [
    // ── Stage 1: lang preprocessor — extract and remove c- footnote defs ──
    {
      type: 'lang',
      filter: function(text) {
        // Match footnote definitions: [^c-xxx]:\n    indented content...
        // The definition continues as long as lines are indented (4 spaces or tab)
        // or are blank (including blank lines between paragraphs within the def).
        // A footnote definition ends at the next non-blank, non-indented line
        // or at the next footnote definition or EOF.
        const fnDefRegex = /^\[\^(c-[^\]]+)\]:\s*\n((?:(?:    |\t).*\n?|\s*\n)*)/gm;

        text = text.replace(fnDefRegex, function(match, label, body) {
          // Dedent the body
          const dedented = body.replace(/^(?:    |\t)/gm, '');
          const parsed = parseFootnoteBlock(dedented);

          if (parsed) {
            threads[label] = parsed;
            threadOrder.push(label);
            return ''; // Remove from source
          }
          return match; // Keep non-comment footnotes
        });

        // Replace ==highlighted text==[^c-id] with <mark> + badge
        text = text.replace(
          /==((?:(?!==).)+)==\[\^(c-[^\]]+)\]/g,
          function(match, highlighted, label) {
            const thread = threads[label];
            const status = thread ? (thread.meta.status || 'open') : 'open';
            return `<mark class="mdcomment-highlight" data-thread="${escapeHtml(label)}" ` +
                   `data-status="${escapeHtml(status)}">${escapeHtml(highlighted)}</mark>` +
                   `<a class="mdcomment-badge" href="#thread-${escapeHtml(label)}" ` +
                   `data-status="${escapeHtml(status)}" title="Comment thread: ${label}">💬</a>`;
          }
        );

        // Replace bare [^c-id] refs with badge
        text = text.replace(
          /\[\^(c-[^\]]+)\]/g,
          function(match, label) {
            const thread = threads[label];
            if (!thread) return match; // Not a known comment thread
            const status = thread.meta.status || 'open';
            return `<a class="mdcomment-badge" href="#thread-${escapeHtml(label)}" ` +
                   `data-status="${escapeHtml(status)}" title="Comment thread: ${label}">💬</a>`;
          }
        );

        return text;
      }
    },
    // ── Stage 2: output postprocessor — inject sidebar ──
    {
      type: 'output',
      filter: function(html) {
        if (threadOrder.length === 0) return html;

        // Read plugin CSS
        const fs = require('fs');
        const path = require('path');
        let cssContent = '';
        try {
          cssContent = fs.readFileSync(
            path.join(__dirname, '..', 'shared', 'style-plugin.css'), 'utf-8'
          );
        } catch (e) { /* ignore */ }

        // Build sidebar
        let sidebar = '<div class="mdcomments-sidebar">\n';
        sidebar += '  <div class="mdcomments-sidebar-header">Comments</div>\n';
        for (const id of threadOrder) {
          sidebar += renderThread(id, threads[id]);
        }
        sidebar += '</div>\n';

        // Wrap in page layout
        return `<style>${cssContent}</style>\n` +
               `<div class="mdcomments-page">\n` +
               `<div class="mdcomments-content">\n` +
               html +
               `\n</div>\n` +
               sidebar +
               `</div>\n`;
      }
    }
  ];
}

module.exports = mdcommentsExtension;
