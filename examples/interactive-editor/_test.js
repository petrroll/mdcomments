const fs = require('fs');
const html = fs.readFileSync('index.html', 'utf8');

// Extract the SAMPLE_MD
const sampleMatch = html.match(/const SAMPLE_MD = `([\s\S]*?)`;/);
const md = sampleMatch[1];

// Extract and run extractFootnoteBlocks
function extractFootnoteBlocks(md) {
  const blocks = [];
  const lines = md.split('\n');
  let i = 0;
  while (i < lines.length) {
    const headerMatch = lines[i].match(/^\[\^(c-[^\]]+)\]:\s*(.*)$/);
    if (headerMatch) {
      const id = headerMatch[1];
      const startLine = i;
      i++;
      while (i < lines.length && (lines[i] === '' || /^\s{4}|\t/.test(lines[i]))) {
        i++;
      }
      let endLine = i;
      while (endLine > startLine + 1 && lines[endLine - 1] === '') endLine--;
      const bodyLines = lines.slice(startLine + 1, endLine);
      blocks.push({ id, body: bodyLines.join('\n'), startLine, endLine: i });
    } else {
      i++;
    }
  }
  return blocks;
}

function parseCommentThreads(md) {
  const threads = new Map();
  const blocks = extractFootnoteBlocks(md);
  for (const block of blocks) {
    const thread = { id: block.id, anchor: null, status: 'open', entries: [] };
    const anchorMatch = block.body.match(/^\s*anchor:\s*"([^"]+)"/m);
    if (anchorMatch) thread.anchor = anchorMatch[1];
    const statusMatch = block.body.match(/^\s*status:\s*(\S+)/m);
    if (statusMatch) thread.status = statusMatch[1];
    const bodyLines = block.body.split('\n');
    let currentEntry = null;
    for (const line of bodyLines) {
      const authorMatch = line.match(/^\s*@(\S+)\s+\(([^)]+)\):\s*$/);
      if (authorMatch) {
        if (currentEntry) thread.entries.push(currentEntry);
        currentEntry = { author: authorMatch[1], date: authorMatch[2], text: '' };
      } else if (currentEntry) {
        const stripped = line.replace(/^\s{4}>\s?/, '').replace(/^\s{4}/, '');
        currentEntry.text += (currentEntry.text ? '\n' : '') + stripped;
      }
    }
    if (currentEntry) thread.entries.push(currentEntry);
    for (const e of thread.entries) e.text = e.text.trim();
    threads.set(block.id, thread);
  }
  return threads;
}

function stripFootnoteBlocks(md) {
  const lines = md.split('\n');
  const blocks = extractFootnoteBlocks(md);
  const remove = new Set();
  for (const b of blocks) {
    for (let i = b.startLine; i < b.endLine; i++) remove.add(i);
  }
  return lines.filter((_, i) => !remove.has(i)).join('\n');
}

const threads = parseCommentThreads(md);
console.log('=== THREADS FOUND:', threads.size);
for (const [id, t] of threads) {
  console.log(' ', id, '| anchor:', t.anchor, '| status:', t.status, '| entries:', t.entries.length);
  for (const e of t.entries) {
    console.log('    @' + e.author, '(' + e.date + '):', e.text.substring(0, 60));
  }
}

const stripped = stripFootnoteBlocks(md);
const hasLeftover = stripped.match(/@\w+\s+\(\d{4}/);
console.log('\n=== STRIPPED has leftover footnote text?', !!hasLeftover);
console.log('=== Stripped length:', stripped.split('\n').length, 'vs original:', md.split('\n').length);
