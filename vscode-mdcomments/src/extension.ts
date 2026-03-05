import * as vscode from 'vscode';
import * as crypto from 'crypto';
import MarkdownIt from 'markdown-it';

type ThreadEntry = { author: string; date: string; bodyLines: string[] };
type ThreadData = { meta: Record<string, string>; entries: ThreadEntry[] };
type ThreadMap = Record<string, ThreadData>;

const md = new MarkdownIt({ html: false, linkify: true, typographer: true });
const PH = '\u00abMDCMT\u00bb';

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function esc(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function nextCommentId(text: string): string {
  const re = /\[\^(c-[^\]]+)\]/g;
  let max = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const num = parseInt(m[1].replace('c-', ''), 10);
    if (!isNaN(num) && num > max) max = num;
  }
  return `c-${max + 1}`;
}

function findOccurrenceOffsets(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const offsets: number[] = [];
  let from = 0;
  while (from < haystack.length) {
    const idx = haystack.indexOf(needle, from);
    if (idx < 0) break;
    offsets.push(idx);
    from = idx + Math.max(1, needle.length);
  }
  return offsets;
}

function suffixOverlapLen(source: string, targetSuffix: string): number {
  const maxLen = Math.min(source.length, targetSuffix.length);
  for (let len = maxLen; len > 0; len--) {
    if (source.slice(source.length - len) === targetSuffix.slice(targetSuffix.length - len)) {
      return len;
    }
  }
  return 0;
}

function prefixOverlapLen(source: string, targetPrefix: string): number {
  const maxLen = Math.min(source.length, targetPrefix.length);
  for (let len = maxLen; len > 0; len--) {
    if (source.slice(0, len) === targetPrefix.slice(0, len)) {
      return len;
    }
  }
  return 0;
}

function pickBestOffsetByContext(
  fullText: string,
  offsets: number[],
  anchorLen: number,
  beforeContext?: string,
  afterContext?: string
): number | undefined {
  if (!offsets.length) return undefined;

  const before = beforeContext || '';
  const after = afterContext || '';
  if (!before && !after) return undefined;

  let bestOffset: number | undefined;
  let bestScore = -1;

  for (const off of offsets) {
    const left = fullText.slice(Math.max(0, off - before.length), off);
    const right = fullText.slice(off + anchorLen, off + anchorLen + after.length);
    const score = suffixOverlapLen(left, before) + prefixOverlapLen(right, after);
    if (score > bestScore) {
      bestScore = score;
      bestOffset = off;
    }
  }

  return bestOffset;
}

function threadStatus(threads: ThreadMap, id: string): string {
  return (threads[id]?.meta?.status || 'open').toLowerCase();
}

/** Formats a single comment/reply entry block (indented, ready to embed in a footnote). */
function buildCommentEntry(author: string, commentText: string): string {
  const date = todayISO();
  const bodyLines = commentText.split('\n').map((line) => `    > ${line}`).join('\n');
  return `    @${author} (${date}):\n${bodyLines}`;
}

function buildThreadBlock(threadId: string, author: string, commentText: string): string {
  return `\n[^${threadId}]:\n${buildCommentEntry(author, commentText)}\n`;
}

function buildReplyBlock(author: string, commentText: string): string {
  return `\n${buildCommentEntry(author, commentText)}\n`;
}

function renderThreadBlock(threadId: string, thread: ThreadData): string {
  const lines: string[] = [`[^${threadId}]:`];

  const meta = thread.meta || {};
  const knownMetaKeys = ['status', 'anchor', 'anchor_occurrence'];
  const metaKeys: string[] = [];
  for (const key of knownMetaKeys) {
    if (typeof meta[key] === 'string' && meta[key].trim()) {
      metaKeys.push(key);
    }
  }
  for (const key of Object.keys(meta).sort()) {
    if (!knownMetaKeys.includes(key) && typeof meta[key] === 'string' && meta[key].trim()) {
      metaKeys.push(key);
    }
  }

  for (const key of metaKeys) {
    lines.push(`    ${key}: ${meta[key]}`);
  }
  if (metaKeys.length > 0 && thread.entries.length > 0) {
    lines.push('');
  }

  for (let i = 0; i < thread.entries.length; i++) {
    const entry = thread.entries[i];
    lines.push(`    @${entry.author} (${entry.date}):`);
    const bodyLines = entry.bodyLines.length ? entry.bodyLines : [''];
    for (const bodyLine of bodyLines) {
      lines.push(`    > ${bodyLine}`);
    }
    if (i < thread.entries.length - 1) {
      lines.push('');
    }
  }

  return lines.join('\n');
}

type AnchorEditPlan =
  | { kind: 'insertMarker'; offset: number }
  | { kind: 'replaceSelection'; startOffset: number; endOffset: number; replacement: string };

function planAnchorEdit(fullText: string, startOffset: number, endOffset: number, anchorText: string, threadId: string): AnchorEditPlan {
  const beforeSel = fullText.substring(Math.max(0, startOffset - 2), startOffset);
  const afterSel = fullText.substring(endOffset, Math.min(fullText.length, endOffset + 2));
  const alreadyHighlighted = beforeSel === '==' && afterSel === '==';

  if (alreadyHighlighted) {
    return { kind: 'insertMarker', offset: endOffset + 2 };
  }

  return {
    kind: 'replaceSelection',
    startOffset,
    endOffset,
    replacement: `==${anchorText}==[^${threadId}]`
  };
}

function getUnifiedCommentPlacement(cfg: vscode.WorkspaceConfiguration): 'sidebar' | 'nearAnchor' {
  const unified = cfg.get<'sidebar' | 'nearAnchor'>('commentPlacement');
  if (unified === 'sidebar' || unified === 'nearAnchor') {
    return unified;
  }

  // Backward-compatible fallback for older extension settings.
  const previewLegacy = cfg.get<'sidebar' | 'nearAnchor'>('previewCommentPlacement');
  const editorLegacy = cfg.get<'off' | 'nearAnchor'>('editorCommentPlacement');
  if (previewLegacy === 'nearAnchor' || editorLegacy === 'nearAnchor') {
    return 'nearAnchor';
  }

  return 'sidebar';
}

function isBlankLine(line: string): boolean {
  return /^\s*$/.test(line);
}

function isThreadContinuationLine(line: string): boolean {
  return isBlankLine(line) || /^(\s{4}|\t)/.test(line);
}

function findThreadBlock(text: string, threadId: string): { start: number; end: number } | null {
  const lines = text.split('\n');
  const header = `[^${threadId}]:`;
  let startLine = -1;

  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trimStart().startsWith(header)) {
      startLine = i;
      break;
    }
  }
  if (startLine < 0) return null;

  let endLine = startLine + 1;
  while (endLine < lines.length && isThreadContinuationLine(lines[endLine])) {
    endLine++;
  }
  while (endLine > startLine + 1 && lines[endLine - 1].trim() === '') {
    endLine--;
  }

  const start = lines.slice(0, startLine).join('\n').length + (startLine > 0 ? 1 : 0);
  const end = lines.slice(0, endLine).join('\n').length + (endLine > 0 ? 1 : 0);
  return { start, end };
}

function getTargetMarkdownEditor(): vscode.TextEditor | undefined {
  const active = vscode.window.activeTextEditor;
  if (active && active.document.languageId === 'markdown') return active;
  return vscode.window.visibleTextEditors.find((editor) => editor.document.languageId === 'markdown');
}

async function resolveMarkdownEditor(targetUri?: vscode.Uri): Promise<vscode.TextEditor | undefined> {
  if (!targetUri) return getTargetMarkdownEditor();

  const visible = vscode.window.visibleTextEditors.find(
    (editor) => editor.document.uri.toString() === targetUri.toString()
  );
  if (visible) return visible;

  try {
    const doc = await vscode.workspace.openTextDocument(targetUri);
    return await vscode.window.showTextDocument(doc, {
      preview: false,
      preserveFocus: true,
      viewColumn: vscode.ViewColumn.One
    });
  } catch {
    return undefined;
  }
}

async function getAuthor(): Promise<string | undefined> {
  const cfg = vscode.workspace.getConfiguration('mdcomments');
  const defaultAuthor = cfg.get<string>('defaultAuthor');
  if (defaultAuthor) return defaultAuthor;

  return vscode.window.showInputBox({
    prompt: 'Author name for this comment',
    placeHolder: 'e.g. alice',
    validateInput: (value) => (/^\w[\w.\-]*$/.test(value) ? null : 'Use alphanumeric, dash, underscore, or dot')
  });
}

function parseThreadsFromSource(src: string): { threads: ThreadMap; strippedSource: string } {
  const threads: ThreadMap = {};
  const lines = src.split('\n');
  const removeLines = new Set<number>();

  let inFence = false;
  let fenceMarker = '';
  let i = 0;

  while (i < lines.length) {
    const fenceMatch = lines[i].match(/^\s*(```+|~~~+)(.*)?$/);
    if (fenceMatch) {
      const marker = fenceMatch[1];
      const trailingContent = (fenceMatch[2] || '').trim();
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (
        fenceMarker[0] === marker[0] &&
        marker.length >= fenceMarker.length &&
        !trailingContent
      ) {
        inFence = false;
        fenceMarker = '';
      }
      i++;
      continue;
    }

    const headerMatch = !inFence ? lines[i].match(/^\[\^(c-[^\]]+)\]:\s*(.*)$/) : null;
    if (!headerMatch) {
      i++;
      continue;
    }

    const id = headerMatch[1];
    const startLine = i;
    removeLines.add(i);
    i++;

    while (i < lines.length && isThreadContinuationLine(lines[i])) {
      removeLines.add(i);
      i++;
    }

    const bodyLines = lines.slice(startLine + 1, i);
    const thread: ThreadData = { meta: {}, entries: [] };
    let currentEntry: ThreadEntry | null = null;

    for (const line of bodyLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      const metaMatch = trimmed.match(/^(status|anchor|anchor_occurrence):\s*(.+)$/i);
      if (metaMatch && thread.entries.length === 0) {
        let value = metaMatch[2].trim();
        if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
          value = value.slice(1, -1);
        }
        thread.meta[metaMatch[1].toLowerCase()] = value;
        continue;
      }

      const authorMatch = trimmed.match(/^@(.+?)\s+\((\d{4}-\d{2}-\d{2})\):?\s*$/);
      if (authorMatch) {
        currentEntry = { author: authorMatch[1], date: authorMatch[2], bodyLines: [] };
        thread.entries.push(currentEntry);
        continue;
      }

      if (currentEntry) {
        currentEntry.bodyLines.push(trimmed.replace(/^>\s?/, ''));
      }
    }

    threads[id] = thread;
  }

  const strippedSource = lines.filter((_, idx) => !removeLines.has(idx)).join('\n');
  return { threads, strippedSource };
}

function summarizeThreadForEditor(id: string, thread: ThreadData): string {
  const status = (thread.meta?.status || 'open').toLowerCase() === 'resolved' ? 'RESOLVED' : 'OPEN';
  const last = thread.entries[thread.entries.length - 1];
  const author = last?.author ? ` @${last.author}` : '';
  const body = (last?.bodyLines.find((line) => line.trim().length > 0) || '').replace(/\s+/g, ' ').trim();
  const clipped = body ? body.slice(0, 72) + (body.length > 72 ? '...' : '') : '(no text)';
  return `  |  ${status}${author}: ${clipped} [${id}]`;
}

function threadHoverMarkdown(id: string, thread: ThreadData): vscode.MarkdownString {
  const status = (thread.meta?.status || 'open').toLowerCase() === 'resolved' ? 'resolved' : 'open';
  const lines: string[] = [];
  lines.push(`**Thread ${id}** (${status})`);

  for (const entry of thread.entries) {
    lines.push('');
    lines.push(`- @${entry.author} (${entry.date})`);
    for (const bodyLine of entry.bodyLines) {
      lines.push(`  ${bodyLine}`);
    }
  }

  return new vscode.MarkdownString(lines.join('\n'));
}

class EditorCommentDecorations implements vscode.Disposable {
  private readonly decorationType: vscode.TextEditorDecorationType;
  private readonly disposables: vscode.Disposable[] = [];

  constructor() {
    this.decorationType = vscode.window.createTextEditorDecorationType({
      after: {
        margin: '0 0 0 2rem',
        fontStyle: 'italic',
        color: new vscode.ThemeColor('editorCodeLens.foreground')
      },
      rangeBehavior: vscode.DecorationRangeBehavior.ClosedClosed
    });

    this.disposables.push(
      vscode.window.onDidChangeVisibleTextEditors(() => this.refreshVisibleEditors()),
      vscode.workspace.onDidChangeTextDocument((event) => this.refreshDocumentEditors(event.document.uri)),
      vscode.workspace.onDidOpenTextDocument((doc) => this.refreshDocumentEditors(doc.uri)),
      vscode.workspace.onDidCloseTextDocument((doc) => this.refreshDocumentEditors(doc.uri)),
      vscode.workspace.onDidChangeConfiguration((event) => {
        if (
          event.affectsConfiguration('mdcomments.commentPlacement') ||
          event.affectsConfiguration('mdcomments.previewCommentPlacement') ||
          event.affectsConfiguration('mdcomments.editorCommentPlacement')
        ) {
          this.refreshVisibleEditors();
        }
      })
    );

    this.refreshVisibleEditors();
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.decorationType.dispose();
  }

  private refreshVisibleEditors(): void {
    for (const editor of vscode.window.visibleTextEditors) {
      this.refreshEditor(editor);
    }
  }

  private refreshDocumentEditors(docUri: vscode.Uri): void {
    for (const editor of vscode.window.visibleTextEditors) {
      if (editor.document.uri.toString() === docUri.toString()) {
        this.refreshEditor(editor);
      }
    }
  }

  private refreshEditor(editor: vscode.TextEditor): void {
    if (editor.document.languageId !== 'markdown') {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const cfg = vscode.workspace.getConfiguration('mdcomments');
    const placement = getUnifiedCommentPlacement(cfg);
    if (placement !== 'nearAnchor') {
      editor.setDecorations(this.decorationType, []);
      return;
    }

    const text = editor.document.getText();
    const { threads } = parseThreadsFromSource(text);
    const markerRe = /\[\^(c-[^\]]+)\]/g;
    const seen = new Set<string>();
    const decorations: vscode.DecorationOptions[] = [];

    let m: RegExpExecArray | null;
    while ((m = markerRe.exec(text)) !== null) {
      const threadId = m[1];
      const markerEnd = m.index + m[0].length;

      // Ignore footnote-definition headers like "[^c-1]:".
      if (text[markerEnd] === ':') {
        continue;
      }
      if (seen.has(threadId)) {
        continue;
      }
      seen.add(threadId);

      const thread = threads[threadId];
      if (!thread) {
        continue;
      }

      const anchorPos = editor.document.positionAt(markerEnd);
      const lineEnd = editor.document.lineAt(anchorPos.line).range.end;

      decorations.push({
        range: new vscode.Range(lineEnd, lineEnd),
        renderOptions: {
          after: {
            contentText: summarizeThreadForEditor(threadId, thread)
          }
        },
        hoverMessage: threadHoverMarkdown(threadId, thread)
      });
    }

    editor.setDecorations(this.decorationType, decorations);
  }
}

function renderDocumentForWebview(source: string): { contentHtml: string; threads: ThreadMap } {
  const { threads, strippedSource } = parseThreadsFromSource(source);
  let cleaned = strippedSource;
  const knownThreadIds = new Set(Object.keys(threads));

  cleaned = cleaned.replace(
    /==([^`\n]*?)==\[\^(c-[\w.\-]+)\]/g,
    (_m: string, text: string, id: string) => {
      if (!knownThreadIds.has(id)) {
        return _m;
      }
      return `${PH}HL:${id}:${text}${PH}END`;
    }
  );

  cleaned = cleaned.replace(
    /\[\^(c-[\w.\-]+)\]/g,
    (_m: string, id: string) => {
      if (!knownThreadIds.has(id)) {
        return _m;
      }
      return `${PH}PT:${id}${PH}END`;
    }
  );

  cleaned = cleaned.replace(/\n\s*(?:---|\*\*\*|___)\s*\n*$/, '\n');

  let html = md.render(cleaned);

  html = html.replace(
    /\u00abMDCMT\u00bbHL:(c-[\w.\-]+):([\s\S]*?)\u00abMDCMT\u00bbEND/g,
    (_m: string, id: string, text: string) => {
      const status = threadStatus(threads, id);
      return `<mark class="mdcomment-highlight" data-thread="${esc(id)}" data-status="${esc(status)}">${esc(text)}</mark>` +
        `<button class="mdcomment-badge" data-thread="${esc(id)}" data-status="${esc(status)}" title="${esc(id)}" type="button">💬</button>`;
    }
  );

  html = html.replace(
    /\u00abMDCMT\u00bbPT:(c-[\w.\-]+)\u00abMDCMT\u00bbEND/g,
    (_m: string, id: string) => {
      const status = threadStatus(threads, id);
      return `<button class="mdcomment-badge" data-thread="${esc(id)}" data-status="${esc(status)}" title="${esc(id)}" type="button">💬</button>`;
    }
  );

  return { contentHtml: html, threads };
}

async function addComment(targetUri?: vscode.Uri): Promise<boolean> {
  const editor = await resolveMarkdownEditor(targetUri);
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showWarningMessage('Open a Markdown file first.');
    return false;
  }

  return addCommentInEditor(editor);
}

async function addCommentInEditor(editor: vscode.TextEditor): Promise<boolean> {
  const selection = editor.selection;
  if (selection.isEmpty) {
    vscode.window.showInformationMessage('Select text in the editor to anchor a comment.');
    return false;
  }

  const author = await getAuthor();
  if (!author) return false;

  const commentText = await vscode.window.showInputBox({
    prompt: 'Comment text',
    placeHolder: 'Write your comment…'
  });
  if (!commentText || !commentText.trim()) return false;

  const doc = editor.document;
  const fullText = doc.getText();
  const id = nextCommentId(fullText);
  const selectedText = doc.getText(selection);

  const threadBlock = buildThreadBlock(id, author, commentText);
  const startOffset = doc.offsetAt(selection.start);
  const endOffset = doc.offsetAt(selection.end);
  const anchorEdit = planAnchorEdit(fullText, startOffset, endOffset, selectedText, id);

  const ok = await editor.edit((editBuilder) => {
    if (anchorEdit.kind === 'insertMarker') {
      editBuilder.insert(doc.positionAt(anchorEdit.offset), `[^${id}]`);
    } else {
      editBuilder.replace(
        new vscode.Range(doc.positionAt(anchorEdit.startOffset), doc.positionAt(anchorEdit.endOffset)),
        anchorEdit.replacement
      );
    }

    const endPos = doc.lineAt(doc.lineCount - 1).range.end;
    editBuilder.insert(endPos, '\n' + threadBlock);
  });

  if (ok) {
    await doc.save();
  }

  return ok;
}

async function addCommentFromPreviewSelection(
  targetUri: vscode.Uri,
  selectedText: string,
  occurrence: number,
  author: string,
  commentText: string,
  beforeContext?: string,
  afterContext?: string
): Promise<boolean> {
  const anchor = selectedText.trim();
  if (!anchor) {
    vscode.window.showInformationMessage('Select text in the preview to anchor a comment.');
    return false;
  }

  if (!commentText.trim()) {
    vscode.window.showInformationMessage('Comment text cannot be empty.');
    return false;
  }

  const safeAuthor = author.trim() || vscode.workspace.getConfiguration('mdcomments').get<string>('defaultAuthor') || 'author';

  const doc = await vscode.workspace.openTextDocument(targetUri);
  if (doc.languageId !== 'markdown') {
    vscode.window.showWarningMessage('Open a Markdown file first.');
    return false;
  }

  const fullText = doc.getText();
  const offsets = findOccurrenceOffsets(fullText, anchor);
  if (!offsets.length) {
    vscode.window.showWarningMessage('Could not map preview selection to source text. Try a shorter plain-text selection.');
    return false;
  }

  const bestOffset = pickBestOffsetByContext(fullText, offsets, anchor.length, beforeContext, afterContext);
  const fallbackIndex = occurrence > 0 && occurrence <= offsets.length ? occurrence - 1 : 0;
  const targetOffset = typeof bestOffset === 'number' ? bestOffset : offsets[fallbackIndex];

  const id = nextCommentId(fullText);
  const threadBlock = buildThreadBlock(id, safeAuthor, commentText);
  const anchorEdit = planAnchorEdit(fullText, targetOffset, targetOffset + anchor.length, anchor, id);

  const edit = new vscode.WorkspaceEdit();
  if (anchorEdit.kind === 'insertMarker') {
    edit.insert(doc.uri, doc.positionAt(anchorEdit.offset), `[^${id}]`);
  } else {
    edit.replace(
      doc.uri,
      new vscode.Range(doc.positionAt(anchorEdit.startOffset), doc.positionAt(anchorEdit.endOffset)),
      anchorEdit.replacement
    );
  }

  const endPos = doc.lineAt(doc.lineCount - 1).range.end;
  edit.insert(doc.uri, endPos, '\n' + threadBlock);

  const ok = await vscode.workspace.applyEdit(edit);
  if (ok) {
    await doc.save();
  }
  return ok;
}

async function replyToComment(threadIdArg?: string, targetUri?: vscode.Uri): Promise<boolean> {
  const editor = await resolveMarkdownEditor(targetUri);
  if (!editor || editor.document.languageId !== 'markdown') {
    vscode.window.showWarningMessage('Open a Markdown file first.');
    return false;
  }

  const doc = editor.document;
  const fullText = doc.getText();

  const re = /\[\^(c-[^\]]+)\]:/g;
  const threadIds: string[] = [];
  const seenThreadIds = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullText)) !== null) {
    if (!seenThreadIds.has(m[1])) {
      seenThreadIds.add(m[1]);
      threadIds.push(m[1]);
    }
  }

  if (threadIds.length === 0) {
    vscode.window.showInformationMessage('No comment threads found in this document.');
    return false;
  }

  let preselected: string | undefined = threadIdArg && threadIds.includes(threadIdArg) ? threadIdArg : undefined;

  // Respect explicit thread id from preview click; only infer from cursor when not provided.
  if (!preselected) {
    const cursorOffset = doc.offsetAt(editor.selection.active);
    for (const id of threadIds) {
      const block = findThreadBlock(fullText, id);
      if (block && cursorOffset >= block.start && cursorOffset <= block.end) {
        preselected = id;
        break;
      }
    }

    if (!preselected) {
      const line = doc.lineAt(editor.selection.active.line).text;
      const markerRe = /\[\^(c-[^\]]+)\]/g;
      let lm: RegExpExecArray | null;
      while ((lm = markerRe.exec(line)) !== null) {
        preselected = lm[1];
        break;
      }
    }
  }

  let threadId = preselected;
  if (!threadId) {
    const picked = await vscode.window.showQuickPick(
      threadIds.map((id) => ({ label: id, picked: id === preselected })),
      { placeHolder: 'Select a comment thread to reply to' }
    );
    if (!picked) return false;
    threadId = picked.label;
  }

  const author = await getAuthor();
  if (!author) return false;

  const replyText = await vscode.window.showInputBox({
    prompt: `Reply to thread ${threadId}`,
    placeHolder: 'Write your reply…'
  });
  if (!replyText || !replyText.trim()) return false;

  return appendReplyToThread(doc.uri, threadId, author, replyText);
}

async function appendReplyToThread(
  docUri: vscode.Uri,
  threadId: string,
  author: string,
  replyText: string
): Promise<boolean> {
  const doc = await vscode.workspace.openTextDocument(docUri);
  const fullText = doc.getText();

  const replyBlock = buildReplyBlock(author, replyText);

  const block = findThreadBlock(fullText, threadId);
  if (!block) {
    vscode.window.showErrorMessage(`Thread ${threadId} not found.`);
    return false;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.insert(doc.uri, doc.positionAt(block.end), replyBlock);
  const ok = await vscode.workspace.applyEdit(edit);
  if (ok) {
    await doc.save();
  }
  return ok;
}

async function replaceThreadBlock(docUri: vscode.Uri, threadId: string, nextThread: ThreadData): Promise<boolean> {
  const doc = await vscode.workspace.openTextDocument(docUri);
  const fullText = doc.getText();
  const block = findThreadBlock(fullText, threadId);
  if (!block) {
    vscode.window.showErrorMessage(`Thread ${threadId} not found.`);
    return false;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.replace(
    doc.uri,
    new vscode.Range(doc.positionAt(block.start), doc.positionAt(block.end)),
    renderThreadBlock(threadId, nextThread)
  );

  const ok = await vscode.workspace.applyEdit(edit);
  if (ok) {
    await doc.save();
  }
  return ok;
}

async function setThreadStatus(docUri: vscode.Uri, threadId: string, status: 'open' | 'resolved'): Promise<boolean> {
  const doc = await vscode.workspace.openTextDocument(docUri);
  const parsed = parseThreadsFromSource(doc.getText());
  const thread = parsed.threads[threadId];
  if (!thread) {
    vscode.window.showErrorMessage(`Thread ${threadId} not found.`);
    return false;
  }

  thread.meta = thread.meta || {};
  thread.meta.status = status;
  return replaceThreadBlock(docUri, threadId, thread);
}

async function editThreadEntry(
  docUri: vscode.Uri,
  threadId: string,
  entryIndex: number,
  author: string,
  commentText: string
): Promise<boolean> {
  const cleanAuthor = author.trim();
  const cleanText = commentText.trim();

  if (!cleanAuthor) {
    vscode.window.showWarningMessage('Author cannot be empty.');
    return false;
  }
  if (!cleanText) {
    vscode.window.showWarningMessage('Comment text cannot be empty.');
    return false;
  }

  const doc = await vscode.workspace.openTextDocument(docUri);
  const parsed = parseThreadsFromSource(doc.getText());
  const thread = parsed.threads[threadId];
  if (!thread) {
    vscode.window.showErrorMessage(`Thread ${threadId} not found.`);
    return false;
  }
  if (!Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= thread.entries.length) {
    vscode.window.showErrorMessage(`Comment entry ${entryIndex} not found in ${threadId}.`);
    return false;
  }

  const existing = thread.entries[entryIndex];
  thread.entries[entryIndex] = {
    author: cleanAuthor,
    date: existing.date,
    bodyLines: cleanText.split('\n')
  };

  return replaceThreadBlock(docUri, threadId, thread);
}

async function removeThread(docUri: vscode.Uri, threadId: string): Promise<boolean> {
  const doc = await vscode.workspace.openTextDocument(docUri);
  const fullText = doc.getText();
  const block = findThreadBlock(fullText, threadId);
  if (!block) {
    vscode.window.showErrorMessage(`Thread ${threadId} not found.`);
    return false;
  }

  const escapedId = threadId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rangeMarkerRe = new RegExp(`==([\\s\\S]*?)==\\[\\^${escapedId}\\]`, 'g');
  const markerRe = new RegExp(`\\[\\^${escapedId}\\]`, 'g');

  // Remove the full thread definition block first, then remove any references
  // to this thread in the remaining document text.
  const beforeBlock = fullText.slice(0, block.start);
  const afterBlock = fullText.slice(block.end);
  const cleanedBefore = beforeBlock.replace(rangeMarkerRe, '$1').replace(markerRe, '');
  const cleanedAfter = afterBlock.replace(rangeMarkerRe, '$1').replace(markerRe, '');
  const nextText = cleanedBefore + cleanedAfter;

  const rewrite = new vscode.WorkspaceEdit();
  rewrite.replace(
    doc.uri,
    new vscode.Range(doc.positionAt(0), doc.positionAt(fullText.length)),
    nextText
  );

  const ok = await vscode.workspace.applyEdit(rewrite);
  if (ok) {
    await doc.save();
  }
  return ok;
}

async function removeThreadEntry(docUri: vscode.Uri, threadId: string, entryIndex: number): Promise<boolean> {
  const doc = await vscode.workspace.openTextDocument(docUri);
  const parsed = parseThreadsFromSource(doc.getText());
  const thread = parsed.threads[threadId];
  if (!thread) {
    vscode.window.showErrorMessage(`Thread ${threadId} not found.`);
    return false;
  }
  if (!Number.isInteger(entryIndex) || entryIndex < 0 || entryIndex >= thread.entries.length) {
    vscode.window.showErrorMessage(`Comment entry ${entryIndex} not found in ${threadId}.`);
    return false;
  }

  if (thread.entries.length === 1) {
    return removeThread(docUri, threadId);
  }

  thread.entries.splice(entryIndex, 1);
  return replaceThreadBlock(docUri, threadId, thread);
}

class MdcommentsPreviewController {
  private static current: MdcommentsPreviewController | undefined;

  static async open(context: vscode.ExtensionContext): Promise<void> {
    const editor = getTargetMarkdownEditor();
    if (!editor || editor.document.languageId !== 'markdown') {
      vscode.window.showWarningMessage('Open a Markdown file first.');
      return;
    }

    if (MdcommentsPreviewController.current) {
      if (MdcommentsPreviewController.current.docUri.toString() === editor.document.uri.toString()) {
        MdcommentsPreviewController.current.panel.reveal(vscode.ViewColumn.Beside);
        await MdcommentsPreviewController.current.refresh();
        return;
      }
      MdcommentsPreviewController.current.dispose();
    }

    MdcommentsPreviewController.current = new MdcommentsPreviewController(context, editor.document.uri);
    await MdcommentsPreviewController.current.refresh();
  }

  private readonly panel: vscode.WebviewPanel;
  private readonly docUri: vscode.Uri;
  private readonly disposables: vscode.Disposable[] = [];
  private disposed = false;

  private constructor(private readonly context: vscode.ExtensionContext, docUri: vscode.Uri) {
    this.docUri = docUri;

    this.panel = vscode.window.createWebviewPanel(
      'mdcommentsInteractivePreview',
      `mdcomments: ${vscode.workspace.asRelativePath(docUri, false)}`,
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')]
      }
    );

    this.panel.webview.html = this.getHtml();

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        if (!message || typeof message.type !== 'string') return;

        switch (message.type) {
          case 'ready':
            await this.refresh();
            return;
          case 'addComment':
            await addComment(this.docUri);
            await this.refresh();
            return;
          case 'replyToComment':
            if (typeof message.replyText === 'string' && message.replyText.trim()) {
              const cfg = vscode.workspace.getConfiguration('mdcomments');
              const defaultAuthor = cfg.get<string>('defaultAuthor') || 'author';
              const author = typeof message.author === 'string' && message.author.trim()
                ? message.author.trim()
                : defaultAuthor;
              await appendReplyToThread(this.docUri, String(message.threadId || ''), author, message.replyText.trim());
            } else {
              await replyToComment(message.threadId, this.docUri);
            }
            await this.refresh();
            return;
          case 'createThreadFromPreviewSelection': {
            const selectedText = typeof message.selectedText === 'string' ? message.selectedText : '';
            const occurrence = Number.isInteger(message.occurrence) ? Number(message.occurrence) : 1;
            const author = typeof message.author === 'string' ? message.author : '';
            const commentText = typeof message.commentText === 'string' ? message.commentText : '';
            const beforeContext = typeof message.beforeContext === 'string' ? message.beforeContext : '';
            const afterContext = typeof message.afterContext === 'string' ? message.afterContext : '';
            await addCommentFromPreviewSelection(this.docUri, selectedText, occurrence, author, commentText, beforeContext, afterContext);
            await this.refresh();
            return;
          }
          case 'revealThreadSource': {
            const threadId = String(message.threadId || '');
            if (threadId) await this.revealThreadInSource(threadId);
            return;
          }
          case 'setThreadStatus': {
            const threadId = String(message.threadId || '');
            const status = String(message.status || '').toLowerCase() === 'resolved' ? 'resolved' : 'open';
            if (threadId) {
              await setThreadStatus(this.docUri, threadId, status);
              await this.refresh();
            }
            return;
          }
          case 'removeThread': {
            const threadId = String(message.threadId || '');
            if (threadId) {
              await removeThread(this.docUri, threadId);
              await this.refresh();
            }
            return;
          }
          case 'editCommentEntry': {
            const threadId = String(message.threadId || '');
            const entryIndex = Number.isInteger(message.entryIndex) ? Number(message.entryIndex) : -1;
            const author = typeof message.author === 'string' ? message.author : '';
            const commentText = typeof message.commentText === 'string' ? message.commentText : '';
            if (threadId && entryIndex >= 0) {
              await editThreadEntry(this.docUri, threadId, entryIndex, author, commentText);
              await this.refresh();
            }
            return;
          }
          case 'removeCommentEntry': {
            const threadId = String(message.threadId || '');
            const entryIndex = Number.isInteger(message.entryIndex) ? Number(message.entryIndex) : -1;
            if (threadId && entryIndex >= 0) {
              await removeThreadEntry(this.docUri, threadId, entryIndex);
              await this.refresh();
            }
            return;
          }
          default:
            return;
        }
      },
      null,
      this.disposables
    );

    vscode.workspace.onDidChangeTextDocument(
      async (event) => {
        if (event.document.uri.toString() === this.docUri.toString()) {
          await this.refresh();
        }
      },
      null,
      this.disposables
    );

    vscode.workspace.onDidChangeConfiguration(
      async (event) => {
        if (
          event.affectsConfiguration('mdcomments.defaultAuthor') ||
          event.affectsConfiguration('mdcomments.commentPlacement') ||
          event.affectsConfiguration('mdcomments.previewCommentPlacement') ||
          event.affectsConfiguration('mdcomments.editorCommentPlacement')
        ) {
          await this.refresh();
        }
      },
      null,
      this.disposables
    );

    this.panel.onDidDispose(() => this.dispose(true), null, this.disposables);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'preview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'preview.css'));
    const nonce = crypto.randomBytes(16).toString('hex');

    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} https: data:;" />
  <link rel="stylesheet" href="${styleUri}" />
  <title>mdcomments interactive preview</title>
</head>
<body>
  <div class="mdcomments-page" id="mdcomments-page">
    <div id="mdcomments-topbar" class="mdcomments-topbar">
      <div id="mdcomments-doc-title-top" class="mdcomments-doc-title"></div>
      <button id="mdcomments-add-btn-top" class="mdcomment-add-btn" type="button">+ New</button>
    </div>
    <div id="mdcomments-content-wrap" class="mdcomments-content-wrap">
      <main id="mdcomments-content" class="mdcomments-content"></main>
      <div id="mdcomments-inline-threads" class="mdcomment-inline-layer"></div>
    </div>
    <aside id="mdcomments-sidebar" class="mdcomments-sidebar">
      <div class="mdcomments-sidebar-header">
        <div>
          <div>💬 Comments</div>
          <div id="mdcomments-doc-title" class="mdcomments-doc-title"></div>
        </div>
        <button id="mdcomments-add-btn" class="mdcomment-add-btn" type="button">+ New</button>
      </div>
      <div id="mdcomments-threads" class="mdcomment-thread-list"></div>
    </aside>
  </div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }

  private async revealThreadInSource(threadId: string): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(this.docUri);
    const editor = await vscode.window.showTextDocument(doc, { preview: false, preserveFocus: true });
    const block = findThreadBlock(doc.getText(), threadId);
    if (!block) return;

    const start = doc.positionAt(block.start);
    const end = doc.positionAt(block.end);
    editor.selection = new vscode.Selection(start, end);
    editor.revealRange(new vscode.Range(start, end), vscode.TextEditorRevealType.InCenter);
  }

  async refresh(): Promise<void> {
    const doc = await vscode.workspace.openTextDocument(this.docUri);
    const rendered = renderDocumentForWebview(doc.getText());
    const cfg = vscode.workspace.getConfiguration('mdcomments');
    const layoutMode = getUnifiedCommentPlacement(cfg);

    await this.panel.webview.postMessage({
      type: 'render',
      payload: {
        docTitle: vscode.workspace.asRelativePath(this.docUri, false),
        contentHtml: rendered.contentHtml,
        threads: rendered.threads,
        defaultAuthor: cfg.get<string>('defaultAuthor') || '',
        layoutMode
      }
    });
  }

  dispose(fromPanel = false): void {
    if (this.disposed) return;
    this.disposed = true;

    while (this.disposables.length) {
      const item = this.disposables.pop();
      item?.dispose();
    }

    if (MdcommentsPreviewController.current === this) {
      MdcommentsPreviewController.current = undefined;
    }

    if (!fromPanel) {
      this.panel.dispose();
    }
  }
}

export function activate(context: vscode.ExtensionContext): void {
  const editorDecorations = new EditorCommentDecorations();

  context.subscriptions.push(
    editorDecorations,
    vscode.commands.registerCommand('mdcomments.openInteractivePreview', async () => {
      await MdcommentsPreviewController.open(context);
    }),
    vscode.commands.registerCommand('mdcomments.addComment', async (arg?: unknown) => {
      const targetUri = arg instanceof vscode.Uri ? arg : undefined;
      await addComment(targetUri);
    }),
    vscode.commands.registerCommand('mdcomments.replyToComment', async (arg1?: unknown, arg2?: unknown) => {
      let threadId: string | undefined;
      let targetUri: vscode.Uri | undefined;

      if (typeof arg1 === 'string') {
        threadId = arg1;
      } else if (arg1 instanceof vscode.Uri) {
        targetUri = arg1;
      }

      if (arg2 instanceof vscode.Uri) {
        targetUri = arg2;
      }

      await replyToComment(threadId, targetUri);
    })
  );
}

export function deactivate(): void {}
