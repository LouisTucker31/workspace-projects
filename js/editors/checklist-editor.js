/*
  Renders a checklist editor for the document `docId`. Each line is a single
  to-do: click anywhere on the ruled list to start typing, Enter creates a
  new line below, and a tick box appears in front of every line.
  content = { items: [{ id, text, checked }] }
*/

function mountChecklistEditor(container, projectId, docId) {
  const doc = Store.getDocument(projectId, docId);
  if (!doc) {
    container.innerHTML = '<p class="pane-empty">This checklist could not be found.</p>';
    return;
  }

  container.innerHTML = `
    <div class="checklist-editor">
      <div class="editor-toolbar" role="toolbar" aria-label="Text formatting">
        ${formatButtonsHtml()}
      </div>
      <ul class="checklist-items"></ul>
      <p class="checklist-progress"></p>
    </div>
  `;

  const list = container.querySelector('.checklist-items');
  const progress = container.querySelector('.checklist-progress');
  const boldBtn = container.querySelector('[data-cmd="bold"]');
  const italicBtn = container.querySelector('[data-cmd="italic"]');
  const underlineBtn = container.querySelector('[data-cmd="underline"]');
  let activeText = null;

  function save() {
    Store.updateDocument(projectId, docId, { content: doc.content });
  }

  function updateProgress() {
    const real = doc.content.items.filter((i) => i.text.trim() !== '');
    const total = real.length;
    const done = real.filter((i) => i.checked).length;
    progress.textContent = total === 0 ? 'No items yet.' : `${done} of ${total} done`;
  }

  function newItem() {
    return { id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6), text: '', checked: false };
  }

  function focusItem(index) {
    const li = list.children[index];
    if (!li) return;
    const text = li.querySelector('.checklist-item-text');
    text.focus();
    const range = document.createRange();
    range.selectNodeContents(text);
    range.collapse(false);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  }

  function syncToolbar() {
    if (!activeText) return;
    boldBtn.classList.toggle('active', document.queryCommandState('bold'));
    italicBtn.classList.toggle('active', document.queryCommandState('italic'));
    underlineBtn.classList.toggle('active', document.queryCommandState('underline'));
  }

  // Snap each item's height up to the nearest whole ruled line, so a
  // to-do that wraps to 2+ lines still occupies exact line units and the
  // next to-do starts cleanly on the next free ruled line, instead of
  // floating mid-line.
  function alignRowHeights() {
    const lineHeight = 16 * 1.65;
    Array.from(list.children).forEach((li) => {
      const text = li.querySelector('.checklist-item-text');
      li.style.height = 'auto';
      // Measure the text itself, not the whole row - the checkbox/remove
      // button are shorter than one line and shouldn't affect the count.
      const lines = Math.max(1, Math.round(text.scrollHeight / lineHeight));
      li.style.height = `${lines * lineHeight}px`;
    });
  }

  function render() {
    if (doc.content.items.length === 0) doc.content.items.push(newItem());
    list.innerHTML = '';
    doc.content.items.forEach((item, index) => {
      const li = document.createElement('li');
      li.className = 'checklist-item';
      if (item.checked) li.classList.add('is-checked');

      const dragHandle = document.createElement('span');
      dragHandle.className = 'checklist-drag-handle';
      dragHandle.title = 'Drag to reorder';
      dragHandle.setAttribute('aria-hidden', 'true');
      dragHandle.draggable = true;
      dragHandle.innerHTML = '<svg viewBox="0 0 20 20" width="12" height="12" fill="currentColor"><circle cx="6" cy="4" r="1.6"/><circle cx="14" cy="4" r="1.6"/><circle cx="6" cy="10" r="1.6"/><circle cx="14" cy="10" r="1.6"/><circle cx="6" cy="16" r="1.6"/><circle cx="14" cy="16" r="1.6"/></svg>';

      dragHandle.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', String(index));
        li.classList.add('is-dragging');
      });
      dragHandle.addEventListener('dragend', () => {
        li.classList.remove('is-dragging');
        list.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
      });

      li.addEventListener('dragover', (e) => {
        if (!list.querySelector('.is-dragging')) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        li.classList.add('drag-over');
      });
      li.addEventListener('dragleave', () => {
        li.classList.remove('drag-over');
      });
      li.addEventListener('drop', (e) => {
        e.preventDefault();
        li.classList.remove('drag-over');
        const fromIndex = Number(e.dataTransfer.getData('text/plain'));
        const toIndex = index;
        if (Number.isNaN(fromIndex) || fromIndex === toIndex) return;
        const [moved] = doc.content.items.splice(fromIndex, 1);
        doc.content.items.splice(toIndex, 0, moved);
        render();
        save();
      });

      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = item.checked;
      checkbox.addEventListener('change', () => {
        item.checked = checkbox.checked;
        li.classList.toggle('is-checked', item.checked);
        updateProgress();
        save();
      });

      const text = document.createElement('span');
      text.className = 'checklist-item-text';
      text.contentEditable = 'true';
      text.spellcheck = true;
      text.lang = 'en-GB';
      text.innerHTML = sanitizeHtml(item.html || item.text || '');

      text.addEventListener('focus', () => { activeText = text; syncToolbar(); });
      text.addEventListener('keyup', syncToolbar);
      text.addEventListener('mouseup', syncToolbar);
      text.addEventListener('paste', (e) => {
        e.preventDefault();
        const raw = (e.clipboardData || window.clipboardData).getData('text/plain');
        document.execCommand('insertText', false, raw.replace(/[\r\n]+/g, ' '));
      });

      text.addEventListener('input', () => {
        item.html = sanitizeHtml(text.innerHTML);
        item.text = text.textContent;
        updateProgress();
        alignRowHeights();
        save();
      });

      text.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          doc.content.items.splice(index + 1, 0, newItem());
          render();
          save();
          focusItem(index + 1);
        } else if (e.key === 'Backspace' && text.textContent === '' && doc.content.items.length > 1) {
          e.preventDefault();
          doc.content.items.splice(index, 1);
          render();
          save();
          focusItem(Math.max(0, index - 1));
        }
      });

      const removeBtn = document.createElement('button');
      removeBtn.type = 'button';
      removeBtn.className = 'checklist-remove';
      removeBtn.title = 'Remove item';
      removeBtn.setAttribute('aria-label', 'Remove item');
      removeBtn.innerHTML = '<svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>';
      removeBtn.addEventListener('click', () => {
        if (doc.content.items.length <= 1) {
          doc.content.items = [newItem()];
        } else {
          doc.content.items = doc.content.items.filter((i) => i.id !== item.id);
        }
        render();
        updateProgress();
        save();
      });

      li.append(dragHandle, checkbox, text, removeBtn);
      list.appendChild(li);
    });
    updateProgress();
    // Measure after layout has actually settled (e.g. right after page load,
    // before the pane grid has resolved its final column widths) rather than
    // against a possibly-stale width, which could under-measure wrap lines.
    requestAnimationFrame(alignRowHeights);
  }

  [['bold', boldBtn], ['italic', italicBtn], ['underline', underlineBtn]].forEach(([cmd, btn]) => {
    btn.addEventListener('click', () => {
      if (!activeText) return;
      activeText.focus();
      document.execCommand(cmd, false, null);
      const index = Array.from(list.children).findIndex((li) => li.querySelector('.checklist-item-text') === activeText);
      if (index !== -1) {
        doc.content.items[index].html = sanitizeHtml(activeText.innerHTML);
        doc.content.items[index].text = activeText.textContent;
        save();
      }
      alignRowHeights();
      syncToolbar();
    });
  });

  render();

  // On a hard refresh the body font (Lora) often isn't cached yet, so text
  // first renders in a fallback font, gets measured/height-locked at that
  // width, then reflows once Lora finishes loading - leaving stale, too-short
  // row heights. Re-measure once the real font is actually ready.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(alignRowHeights);
  }

  let resizeQueued = false;
  new ResizeObserver(() => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      alignRowHeights();
    });
  }).observe(list);
}
