(function () {
  'use strict';

  var vscode = acquireVsCodeApi();

  var state = {
    threads: {},
    anchorByThread: {},
    defaultAuthor: ''
  };

  var contentEl = document.getElementById('mdcomments-content');
  var sidebarEl = document.getElementById('mdcomments-threads');
  var titleEl = document.getElementById('mdcomments-doc-title');
  var addBtn = document.getElementById('mdcomments-add-btn');
  var contextMenuEl = null;
  var newThreadComposerEl = null;

  function closestFromTarget(target, selector) {
    return target && target.closest ? target.closest(selector) : null;
  }

  function getStatus(thread) {
    return ((thread && thread.meta && thread.meta.status) || 'open').toLowerCase();
  }

  function firstAnchorMap() {
    var map = {};
    var highlights = contentEl.querySelectorAll('.mdcomment-highlight');
    for (var i = 0; i < highlights.length; i++) {
      var h = highlights[i];
      var id = h.getAttribute('data-thread');
      if (!id || map[id]) continue;
      var text = (h.textContent || '').trim();
      if (text) map[id] = text;
    }
    return map;
  }

  function focusThread(id) {
    document.querySelectorAll('.mdcomment-thread.active, .mdcomment-highlight.active').forEach(function (el) {
      el.classList.remove('active');
    });

    var card = document.getElementById('thread-' + id);
    if (card) {
      card.classList.add('active');
      card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    contentEl.querySelectorAll('.mdcomment-highlight[data-thread="' + id + '"]').forEach(function (el) {
      el.classList.add('active');
    });
  }

  function buildThreadCard(id, thread) {
    var status = getStatus(thread);

    var card = document.createElement('div');
    card.className = 'mdcomment-thread';
    card.id = 'thread-' + id;
    card.setAttribute('data-thread', id);

    var header = document.createElement('div');
    header.className = 'mdcomment-thread-header';

    var anchorText = (thread.meta && thread.meta.anchor) || state.anchorByThread[id] || '';
    if (anchorText) {
      var anchor = document.createElement('div');
      anchor.className = 'mdcomment-thread-anchor';
      anchor.textContent = anchorText;
      header.appendChild(anchor);
    }

    var statusBadge = document.createElement('span');
    statusBadge.className = 'mdcomment-status ' + (status === 'resolved' ? 'mdcomment-status-resolved' : 'mdcomment-status-open');
    statusBadge.textContent = status === 'resolved' ? 'RESOLVED' : 'OPEN';
    header.appendChild(statusBadge);

    var idLabel = document.createElement('button');
    idLabel.className = 'mdcomment-thread-id';
    idLabel.textContent = id;
    idLabel.title = 'Reveal thread in source';
    idLabel.addEventListener('click', function (e) {
      e.stopPropagation();
      vscode.postMessage({ type: 'revealThreadSource', threadId: id });
    });
    header.appendChild(idLabel);

    card.appendChild(header);

    for (var i = 0; i < thread.entries.length; i++) {
      var entry = thread.entries[i];

      var entryDiv = document.createElement('div');
      entryDiv.className = 'mdcomment-entry';

      var meta = document.createElement('div');
      meta.className = 'mdcomment-author-line';

      var avatar = document.createElement('span');
      avatar.className = 'mdcomment-avatar';
      avatar.textContent = (entry.author || '?').charAt(0).toUpperCase();
      meta.appendChild(avatar);

      var author = document.createElement('span');
      author.className = 'mdcomment-author';
      author.textContent = '@' + entry.author;
      meta.appendChild(author);

      var date = document.createElement('span');
      date.className = 'mdcomment-date';
      date.textContent = entry.date;
      meta.appendChild(date);

      entryDiv.appendChild(meta);

      var body = document.createElement('div');
      body.className = 'mdcomment-body';
      for (var b = 0; b < entry.bodyLines.length; b++) {
        var p = document.createElement('p');
        p.textContent = entry.bodyLines[b];
        body.appendChild(p);
      }
      entryDiv.appendChild(body);
      card.appendChild(entryDiv);
    }

    var replyArea = document.createElement('div');
    replyArea.className = 'mdcomment-reply-area';

    var replyBtn = document.createElement('button');
    replyBtn.className = 'mdcomment-reply-btn';
    replyBtn.textContent = 'Reply';

    var replyEditor = document.createElement('div');
    replyEditor.className = 'mdcomment-reply-editor';

    var authorInput = document.createElement('input');
    authorInput.className = 'mdcomment-reply-author';
    authorInput.type = 'text';
    authorInput.placeholder = 'author';
    authorInput.value = state.defaultAuthor || '';
    replyEditor.appendChild(authorInput);

    var bodyInput = document.createElement('textarea');
    bodyInput.className = 'mdcomment-reply-text';
    bodyInput.placeholder = 'Write your reply...';
    replyEditor.appendChild(bodyInput);

    var actions = document.createElement('div');
    actions.className = 'mdcomment-reply-actions';

    var postBtn = document.createElement('button');
    postBtn.className = 'mdcomment-reply-post';
    postBtn.textContent = 'Post';
    postBtn.type = 'button';

    var cancelBtn = document.createElement('button');
    cancelBtn.className = 'mdcomment-reply-cancel';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.type = 'button';

    actions.appendChild(postBtn);
    actions.appendChild(cancelBtn);
    replyEditor.appendChild(actions);

    replyEditor.style.display = 'none';

    replyBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      replyEditor.style.display = replyEditor.style.display === 'none' ? 'block' : 'none';
      if (replyEditor.style.display === 'block') {
        bodyInput.focus();
      }
    });

    cancelBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      replyEditor.style.display = 'none';
      bodyInput.value = '';
    });

    postBtn.addEventListener('click', function (e) {
      e.stopPropagation();
      var replyText = (bodyInput.value || '').trim();
      if (!replyText) {
        bodyInput.focus();
        return;
      }
      var author = (authorInput.value || '').trim();
      vscode.postMessage({ type: 'replyToComment', threadId: id, author: author, replyText: replyText });
      replyEditor.style.display = 'none';
      bodyInput.value = '';
    });

    replyArea.appendChild(replyBtn);
    replyArea.appendChild(replyEditor);
    card.appendChild(replyArea);

    card.addEventListener('click', function () {
      focusThread(id);
      var inline = contentEl.querySelector('.mdcomment-highlight[data-thread="' + id + '"]') || contentEl.querySelector('.mdcomment-badge[data-thread="' + id + '"]');
      if (inline) inline.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });

    return card;
  }

  function renderThreads() {
    sidebarEl.innerHTML = '';
    var ids = Object.keys(state.threads);

    if (!ids.length) {
      var empty = document.createElement('div');
      empty.className = 'mdcomment-empty';
      empty.textContent = 'No comment threads found in this document.';
      sidebarEl.appendChild(empty);
      return;
    }

    for (var i = 0; i < ids.length; i++) {
      sidebarEl.appendChild(buildThreadCard(ids[i], state.threads[ids[i]]));
    }
  }

  function render(payload) {
    titleEl.textContent = payload.docTitle || 'Markdown';
    contentEl.innerHTML = payload.contentHtml || '';
    state.threads = payload.threads || {};
    state.defaultAuthor = payload.defaultAuthor || '';
    state.anchorByThread = firstAnchorMap();

    renderThreads();
  }

  function getPreviewSelectionPayload() {
    var selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return null;

    var range = selection.getRangeAt(0);
    if (!contentEl.contains(range.commonAncestorContainer)) return null;

    var selectedText = (selection.toString() || '').trim();
    if (!selectedText) return null;

    var beforeRange = document.createRange();
    beforeRange.selectNodeContents(contentEl);
    beforeRange.setEnd(range.startContainer, range.startOffset);

    var beforeText = beforeRange.toString();
    var afterRange = document.createRange();
    afterRange.selectNodeContents(contentEl);
    afterRange.setStart(range.endContainer, range.endOffset);
    var afterText = afterRange.toString();

    var beforeContext = beforeText.slice(Math.max(0, beforeText.length - 48));
    var afterContext = afterText.slice(0, 48);

    var occurrence = 1;
    var from = 0;
    while (from < beforeText.length) {
      var idx = beforeText.indexOf(selectedText, from);
      if (idx < 0) break;
      occurrence++;
      from = idx + Math.max(1, selectedText.length);
    }

    return {
      selectedText: selectedText,
      occurrence: occurrence,
      beforeContext: beforeContext,
      afterContext: afterContext
    };
  }

  function removeContextMenu() {
    if (contextMenuEl && contextMenuEl.parentNode) {
      contextMenuEl.parentNode.removeChild(contextMenuEl);
    }
    contextMenuEl = null;
  }

  function removeComposer() {
    if (newThreadComposerEl && newThreadComposerEl.parentNode) {
      newThreadComposerEl.parentNode.removeChild(newThreadComposerEl);
    }
    newThreadComposerEl = null;
  }

  function openNewThreadComposer(payload, x, y) {
    removeContextMenu();
    removeComposer();

    var card = document.createElement('div');
    card.className = 'mdcomment-new-thread-composer';
    card.style.left = x + 'px';
    card.style.top = y + 'px';

    var title = document.createElement('div');
    title.className = 'mdcomment-new-thread-title';
    title.textContent = 'New thread';
    card.appendChild(title);

    var anchor = document.createElement('div');
    anchor.className = 'mdcomment-new-thread-anchor';
    anchor.textContent = payload.selectedText;
    card.appendChild(anchor);

    var authorInput = document.createElement('input');
    authorInput.type = 'text';
    authorInput.className = 'mdcomment-reply-author';
    authorInput.placeholder = 'author';
    authorInput.value = state.defaultAuthor || '';
    card.appendChild(authorInput);

    var bodyInput = document.createElement('textarea');
    bodyInput.className = 'mdcomment-reply-text';
    bodyInput.placeholder = 'Write your comment...';
    card.appendChild(bodyInput);

    var actions = document.createElement('div');
    actions.className = 'mdcomment-reply-actions';

    var createBtn = document.createElement('button');
    createBtn.type = 'button';
    createBtn.className = 'mdcomment-reply-post';
    createBtn.textContent = 'Create';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'mdcomment-reply-cancel';
    cancelBtn.textContent = 'Cancel';

    createBtn.addEventListener('click', function () {
      var commentText = (bodyInput.value || '').trim();
      if (!commentText) {
        bodyInput.focus();
        return;
      }

      var author = (authorInput.value || '').trim();
      vscode.postMessage({
        type: 'createThreadFromPreviewSelection',
        selectedText: payload.selectedText,
        occurrence: payload.occurrence,
        beforeContext: payload.beforeContext,
        afterContext: payload.afterContext,
        author: author,
        commentText: commentText
      });
      removeComposer();
    });

    cancelBtn.addEventListener('click', function () {
      removeComposer();
    });

    actions.appendChild(createBtn);
    actions.appendChild(cancelBtn);
    card.appendChild(actions);

    document.body.appendChild(card);
    newThreadComposerEl = card;
    bodyInput.focus();
  }

  function showContextMenu(x, y, payload) {
    removeContextMenu();

    var menu = document.createElement('div');
    menu.className = 'mdcomment-context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    var button = document.createElement('button');
    button.type = 'button';
    button.className = 'mdcomment-context-action';
    button.textContent = 'New thread from selection';
    button.addEventListener('click', function (e) {
      e.stopPropagation();
      openNewThreadComposer(payload, x, y);
    });

    menu.appendChild(button);
    document.body.appendChild(menu);
    contextMenuEl = menu;
  }

  addBtn.addEventListener('click', function () {
    vscode.postMessage({ type: 'addComment' });
  });

  contentEl.addEventListener('click', function (e) {
    removeContextMenu();
    if (!closestFromTarget(e.target, '.mdcomment-new-thread-composer')) {
      removeComposer();
    }

    var target = e.target;
    if (!target || !target.closest) return;

    var badge = target.closest('.mdcomment-badge');
    if (badge) {
      var id = badge.getAttribute('data-thread');
      if (id) {
        e.preventDefault();
        focusThread(id);
      }
      return;
    }

    var highlight = target.closest('.mdcomment-highlight');
    if (highlight) {
      var id2 = highlight.getAttribute('data-thread');
      if (id2) {
        e.preventDefault();
        focusThread(id2);
      }
    }
  });

  contentEl.addEventListener('contextmenu', function (e) {
    removeComposer();

    var payload = getPreviewSelectionPayload();
    if (!payload) {
      removeContextMenu();
      return;
    }

    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, payload);
  });

  document.addEventListener('click', function (e) {
    var t = e && e.target ? e.target : null;
    if (closestFromTarget(t, '.mdcomment-context-menu')) return;
    if (closestFromTarget(t, '.mdcomment-new-thread-composer')) return;
    removeContextMenu();
    removeComposer();
  });

  window.addEventListener('scroll', function () {
    removeContextMenu();
  }, true);

  window.addEventListener('message', function (event) {
    var message = event.data;
    if (!message || !message.type) return;

    if (message.type === 'render') {
      render(message.payload || {});
    }
  });

  vscode.postMessage({ type: 'ready' });
})();
