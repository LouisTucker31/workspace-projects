/*
  Renders a Word-style editor into `container` for the document `docId`
  inside `projectId`. Handles formatting and autosave.
*/

function mountDocEditor(container, projectId, docId) {
  const doc = Store.getDocument(projectId, docId);
  if (!doc) {
    container.innerHTML = '<p class="pane-empty">This document could not be found.</p>';
    return;
  }

  container.innerHTML = `
    <div class="doc-editor">
      <div class="editor-toolbar" role="toolbar" aria-label="Text formatting">
        ${formatButtonsHtml()}
        <div class="tb-group">
          <button type="button" data-cmd="insertUnorderedList" title="Bullet list">&bull;</button>
          <button type="button" data-cmd="insertOrderedList" title="Numbered list">1.</button>
        </div>
        <div class="tb-group tb-push-right">
          <button type="button" class="download-btn" title="Download as Word document">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10M6 9.5 10 13.5 14 9.5"/><path d="M4 16h12"/></svg>
          </button>
        </div>
      </div>
      <div class="doc-body" contenteditable="true" spellcheck="true" lang="en-GB"></div>
    </div>
  `;

  const body = container.querySelector('.doc-body');
  body.innerHTML = sanitizeHtml(doc.content.html);
  body.addEventListener('paste', pasteAsPlainText);

  const boldBtn = container.querySelector('[data-cmd="bold"]');
  const italicBtn = container.querySelector('[data-cmd="italic"]');
  const underlineBtn = container.querySelector('[data-cmd="underline"]');

  function syncToolbar() {
    boldBtn.classList.toggle('active', document.queryCommandState('bold'));
    italicBtn.classList.toggle('active', document.queryCommandState('italic'));
    underlineBtn.classList.toggle('active', document.queryCommandState('underline'));
  }

  body.addEventListener('focus', syncToolbar);
  body.addEventListener('keyup', syncToolbar);
  body.addEventListener('mouseup', syncToolbar);

  let saveTimer = null;
  function scheduleSave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      const clean = sanitizeHtml(body.innerHTML);
      Store.updateDocument(projectId, docId, { content: { html: clean } });
    }, 400);
  }

  body.addEventListener('input', () => {
    scheduleSave();
  });

  // Formatting commands. execCommand is deprecated but remains the
  // simplest cross-browser way to drive a contenteditable toolbar without
  // pulling in a rich-text framework for what is a handful of basic styles.
  container.querySelectorAll('[data-cmd]').forEach((btn) => {
    btn.addEventListener('click', () => {
      body.focus();
      document.execCommand(btn.dataset.cmd, false, null);
      syncToolbar();
      scheduleSave();
    });
  });

  container.querySelector('.download-btn').addEventListener('click', async () => {
    // Read the live DOM, not doc.content.html, so an unsaved keystroke
    // (still waiting on the debounced autosave) is included in the export.
    const { blob, filename } = await exportDocumentToDocx({
      title: doc.title,
      content: { html: sanitizeHtml(body.innerHTML) },
    });
    triggerDownload(blob, filename);
  });
}
