/**
 * plugin-mdcomments.js — Full mdcomments plugin for markdown-it.
 *
 * Transforms footnotes with `c-` prefixed IDs into a comment sidebar UI:
 *  - Inline footnote refs become comment indicator badges
 *  - ==highlighted text== around comment refs get `.mdcomment-highlight`
 *  - Thread definitions render as sidebar cards with author avatars,
 *    timestamps, threaded replies, and status badges
 */

'use strict';

/**
 * Parse the token stream between footnote_open and footnote_close
 * to extract mdcomments metadata and comment entries.
 *
 * Token pattern per entry:
 *   paragraph_open → inline(@author (date):) → paragraph_close
 *   blockquote_open → paragraph_open → inline(body) → paragraph_close → blockquote_close
 *
 * Returns: { meta: {status, anchor}, entries: [{author, date, bodyLines}] }
 */
function parseThreadTokens(tokens, md) {
  const result = {
    meta: {},
    entries: []
  };

  let inBlockquote = false;
  let currentEntry = null;

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i];

    if (token.type === 'blockquote_open') {
      inBlockquote = true;
      continue;
    }
    if (token.type === 'blockquote_close') {
      inBlockquote = false;
      continue;
    }
    if (token.type === 'footnote_anchor') {
      continue;
    }

    // Extract text from inline tokens
    if (token.type === 'inline') {
      let text = '';
      if (token.children) {
        for (const child of token.children) {
          if (child.type === 'text') text += child.content;
          else if (child.type === 'softbreak') text += '\n';
        }
      } else if (token.content) {
        text = token.content;
      }

      if (inBlockquote && currentEntry) {
        // Body text inside blockquote (one inline token may have multiple lines)
        for (const line of text.split('\n')) {
          const trimmed = line.trim();
          if (trimmed) currentEntry.bodyLines.push(trimmed);
        }
        continue;
      }

      // Non-blockquote inline: could be metadata or @author line
      const lines = text.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;

        // Metadata: key: value (before any @author line)
        const metaMatch = trimmed.match(/^(status|anchor):\s*(.+)$/i);
        if (metaMatch && result.entries.length === 0) {
          let val = metaMatch[2].trim();
          if (val.startsWith('"') && val.endsWith('"')) val = val.slice(1, -1);
          if (val.startsWith("'") && val.endsWith("'")) val = val.slice(1, -1);
          result.meta[metaMatch[1].toLowerCase()] = val;
          continue;
        }

        // Author line: @name (YYYY-MM-DD):
        const authorMatch = trimmed.match(/^@(\w+)\s*\((\d{4}-\d{2}-\d{2})\):?$/);
        if (authorMatch) {
          currentEntry = {
            author: authorMatch[1],
            date: authorMatch[2],
            bodyLines: []
          };
          result.entries.push(currentEntry);
          continue;
        }
      }
    }
  }

  return result;
}

/**
 * Render a parsed thread as sidebar HTML.
 */
function renderThread(id, thread) {
  const status = thread.meta.status || 'open';
  const statusLabel = status.charAt(0).toUpperCase() + status.slice(1);
  const statusClass = status === 'resolved' ? 'mdcomment-status-resolved' : 'mdcomment-status-open';

  let html = `<div class="mdcomment-thread" id="thread-${id}" data-status="${status}">\n`;

  // Anchor preview
  if (thread.meta.anchor) {
    html += `  <div class="mdcomment-thread-anchor">${escapeHtml(thread.meta.anchor)}</div>\n`;
  }

  // Status badge
  html += `  <span class="mdcomment-status ${statusClass}">${statusLabel}</span>\n`;

  // Comment entries
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

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * The markdown-it plugin.
 */
function mdcommentsPlugin(md) {
  // Storage for parsed threads (populated during rendering)
  const threads = {};

  // ---------------------------------------------------------------
  // 1. Override footnote reference rendering for c- prefixed refs
  // ---------------------------------------------------------------
  const defaultFootnoteRef = md.renderer.rules.footnote_ref ||
    function(tokens, idx, options, env, self) {
      return self.renderToken(tokens, idx, options);
    };

  md.renderer.rules.footnote_ref = function(tokens, idx, options, env, self) {
    const id = tokens[idx].meta?.id;
    const label = env.footnotes?.list?.[id]?.label || '';

    if (label.startsWith('c-')) {
      const status = threads[label]?.meta?.status || 'open';
      return `<a class="mdcomment-badge" href="#thread-${label}" data-status="${status}" ` +
             `title="Comment thread: ${label}">💬</a>`;
    }
    return defaultFootnoteRef(tokens, idx, options, env, self);
  };

  // ---------------------------------------------------------------
  // 2. Override footnote block rendering to separate c- threads
  // ---------------------------------------------------------------
  const defaultFootnoteOpen = md.renderer.rules.footnote_open;
  const defaultFootnoteClose = md.renderer.rules.footnote_close;
  const defaultFootnoteBlockOpen = md.renderer.rules.footnote_block_open;
  const defaultFootnoteBlockClose = md.renderer.rules.footnote_block_close;

  // We intercept at the core level to parse footnote content.
  // markdown-it-footnote stores footnote body tokens in the main state.tokens
  // stream between footnote_open and footnote_close tokens (NOT in fn.tokens).
  md.core.ruler.push('mdcomments_parse', function(state) {
    if (!state.env.footnotes || !state.env.footnotes.list) return;

    const tokens = state.tokens;
    let i = 0;
    while (i < tokens.length) {
      if (tokens[i].type === 'footnote_open') {
        const label = tokens[i].meta?.label || '';
        if (!label.startsWith('c-')) {
          i++;
          continue;
        }

        // Mark the footnote_open token as hidden
        const startIdx = i;
        tokens[i].hidden = true;

        // Collect all tokens between footnote_open and footnote_close
        const innerTokens = [];
        i++; // skip footnote_open
        while (i < tokens.length && tokens[i].type !== 'footnote_close') {
          innerTokens.push(tokens[i]);
          tokens[i].hidden = true;
          i++;
        }
        // Mark footnote_close as hidden too
        if (i < tokens.length) {
          tokens[i].hidden = true;
        }

        const parsed = parseThreadTokens(innerTokens, md);
        threads[label] = parsed;
      }
      i++;
    }

    // Remove hidden tokens so they don't render in the footnote section
    state.tokens = tokens.filter(t => !t.hidden);
  });

  // ---------------------------------------------------------------
  // 3. Add mark_open/mark_close class augmentation for c- refs
  // ---------------------------------------------------------------
  const defaultMarkOpen = md.renderer.rules.mark_open;
  md.renderer.rules.mark_open = function(tokens, idx, options, env, self) {
    // Check if the next few tokens contain a footnote_ref with c- prefix
    let hasCommentRef = false;
    let commentLabel = '';
    for (let i = idx + 1; i < tokens.length && i < idx + 20; i++) {
      if (tokens[i].type === 'mark_close') break;
      if (tokens[i].type === 'footnote_ref') {
        const refId = tokens[i].meta?.id;
        const label = env.footnotes?.list?.[refId]?.label || '';
        if (label.startsWith('c-')) {
          hasCommentRef = true;
          commentLabel = label;
          break;
        }
      }
    }

    if (hasCommentRef) {
      const status = threads[commentLabel]?.meta?.status || 'open';
      return `<mark class="mdcomment-highlight" data-thread="${commentLabel}" data-status="${status}">`;
    }
    if (defaultMarkOpen) return defaultMarkOpen(tokens, idx, options, env, self);
    return '<mark>';
  };

  // ---------------------------------------------------------------
  // 4. Post-process: inject sidebar HTML after the content
  // ---------------------------------------------------------------
  const originalRender = md.render.bind(md);
  md.render = function(src, env) {
    // Clear threads for fresh render
    Object.keys(threads).forEach(k => delete threads[k]);

    let html = originalRender(src, env || {});

    // Build sidebar from collected threads
    const threadIds = Object.keys(threads);
    if (threadIds.length > 0) {
      let sidebar = '<div class="mdcomments-sidebar">\n';
      sidebar += '  <div class="mdcomments-sidebar-header">Comments</div>\n';

      for (const id of threadIds) {
        sidebar += renderThread(id, threads[id]);
      }
      sidebar += '</div>\n';

      // Wrap content in the page layout
      html = `<div class="mdcomments-page">\n` +
             `<div class="mdcomments-content">\n${html}\n</div>\n` +
             `${sidebar}\n</div>\n`;
    }

    return html;
  };
}

module.exports = mdcommentsPlugin;
