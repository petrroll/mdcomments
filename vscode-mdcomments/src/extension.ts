import * as vscode from 'vscode';
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

function threadStatus(threads: ThreadMap, id: string): string {
  return (threads[id]?.meta?.status || 'open').toLowerCase();
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
  while (endLine < lines.length && (lines[endLine] === '' || /^(\s{4}|\t)/.test(lines[endLine]))) {
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
    const fenceMatch = lines[i].match(/^\s*(```+|~~~+)/);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (!inFence) {
        inFence = true;
        fenceMarker = marker;
      } else if (fenceMarker === marker) {
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

    while (i < lines.length && (lines[i] === '' || /^(\s{4}|\t)/.test(lines[i]))) {
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

      const authorMatch = trimmed.match(/^@(\S+)\s+\((\d{4}-\d{2}-\d{2})\):?\s*$/);
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

function renderDocumentForWebview(source: string): { contentHtml: string; threads: ThreadMap } {
  const { threads, strippedSource } = parseThreadsFromSource(source);
  let cleaned = strippedSource;

  cleaned = cleaned.replace(
    /==([\s\S]*?)==\[\^(c-[^\]]+)\]/g,
    (_m: string, text: string, id: string) => `${PH}HL:${id}:${text}${PH}END`
  );

  cleaned = cleaned.replace(
    /\[\^(c-[^\]]+)\]/g,
    (_m: string, id: string) => `${PH}PT:${id}${PH}END`
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
  if (!commentText) return false;

  const doc = editor.document;
  const fullText = doc.getText();
  const id = nextCommentId(fullText);
  const selectedText = doc.getText(selection);
  const date = todayISO();
  const bodyLines = commentText.split('\n').map((line) => `    > ${line}`).join('\n');

  let threadBlock = `\n[^${id}]:\n`;
  const beforeSel = fullText.substring(Math.max(0, doc.offsetAt(selection.start) - 2), doc.offsetAt(selection.start));
  const afterSel = fullText.substring(doc.offsetAt(selection.end), Math.min(fullText.length, doc.offsetAt(selection.end) + 2));
  const alreadyHighlighted = beforeSel === '==' && afterSel === '==';

  threadBlock += `    @${author} (${date}):\n${bodyLines}\n`;

  return editor.edit((editBuilder) => {
    if (alreadyHighlighted) {
      const afterHighlight = new vscode.Position(selection.end.line, selection.end.character + 2);
      editBuilder.insert(afterHighlight, `[^${id}]`);
    } else {
      editBuilder.replace(selection, `==${selectedText}==[^${id}]`);
    }

    const endPos = doc.lineAt(doc.lineCount - 1).range.end;
    editBuilder.insert(endPos, '\n' + threadBlock);
  });
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
  let m: RegExpExecArray | null;
  while ((m = re.exec(fullText)) !== null) {
    if (!threadIds.includes(m[1])) threadIds.push(m[1]);
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

    const line = doc.lineAt(editor.selection.active.line).text;
    const markerRe = /\[\^(c-[^\]]+)\]/g;
    let lm: RegExpExecArray | null;
    while ((lm = markerRe.exec(line)) !== null) {
      preselected = lm[1];
      break;
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
  if (!replyText) return false;

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

  const date = todayISO();
  const bodyLines = replyText.split('\n').map((line) => `    > ${line}`).join('\n');
  const replyBlock = `\n    @${author} (${date}):\n${bodyLines}`;

  const block = findThreadBlock(fullText, threadId);
  if (!block) {
    vscode.window.showErrorMessage(`Thread ${threadId} not found.`);
    return false;
  }

  const edit = new vscode.WorkspaceEdit();
  edit.insert(doc.uri, doc.positionAt(block.end), replyBlock + '\n');
  const ok = await vscode.workspace.applyEdit(edit);
  if (ok) {
    await doc.save();
  }
  return ok;
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
          case 'revealThreadSource': {
            const threadId = String(message.threadId || '');
            if (threadId) await this.revealThreadInSource(threadId);
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

    this.panel.onDidDispose(() => this.dispose(true), null, this.disposables);
  }

  private getHtml(): string {
    const webview = this.panel.webview;
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'preview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'webview', 'preview.css'));
    const nonce = Math.random().toString(36).slice(2);

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
  <div class="mdcomments-page">
    <main id="mdcomments-content" class="mdcomments-content"></main>
    <aside class="mdcomments-sidebar">
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

    await this.panel.webview.postMessage({
      type: 'render',
      payload: {
        docTitle: vscode.workspace.asRelativePath(this.docUri, false),
        contentHtml: rendered.contentHtml,
        threads: rendered.threads
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
  context.subscriptions.push(
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
