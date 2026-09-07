document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const projectId = params.get('project');
  const project = projectId ? Store.getProject(projectId) : null;

  const titleEl = document.getElementById('project-title');
  const panesEl = document.getElementById('panes');
  const layoutButtons = document.querySelectorAll('.layout-btn');

  if (!project) {
    document.querySelector('main').innerHTML = '<p class="pane-empty">This project could not be found. <a href="../index.html">Back to dashboard</a></p>';
    return;
  }

  if (project.layout > 3) {
    project.layout = 3;
    project.paneAssignments = project.paneAssignments.slice(0, 3);
    Store.updateLayout(project.id, project.layout, project.paneAssignments);
  }

  // Themed rename dialog, used both for the project title above and for
  // renaming a document within a pane - so every rename in the app goes
  // through the same .app-dialog component instead of the browser's own
  // window.prompt().
  function openRenameDialog(heading, currentValue, onSave) {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog';
    dialog.innerHTML = `
      <form method="dialog">
        <h3>${heading}</h3>
        <label>Name
          <input type="text" class="rename-input" maxlength="100" required />
        </label>
        <div class="dialog-actions">
          <button type="button" class="cancel">Cancel</button>
          <button type="submit" class="confirm">Save</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);

    const input = dialog.querySelector('.rename-input');
    input.value = currentValue;

    dialog.querySelector('.cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    dialog.querySelector('form').addEventListener('submit', () => {
      const name = input.value.trim();
      if (name) onSave(name);
    });

    dialog.showModal();
    input.select();
  }

  titleEl.textContent = project.name;
  titleEl.addEventListener('click', () => {
    openRenameDialog('Rename project', project.name, (name) => {
      Store.renameProject(project.id, name);
      titleEl.textContent = name;
    });
  });

  function typeColor(type) {
    if (type === 'document') return 'var(--type-document)';
    if (type === 'sheet') return 'var(--type-sheet)';
    return 'var(--type-checklist)';
  }

  function docOptionLabel(doc) {
    return `• ${doc.title}`;
  }

  function styleOption(opt, doc) {
    opt.style.color = typeColor(doc.type);
  }

  function mountEditorForDoc(container, doc) {
    if (doc.type === 'document') mountDocEditor(container, project.id, doc.id);
    else if (doc.type === 'sheet') mountSheetEditor(container, project.id, doc.id);
    else mountChecklistEditor(container, project.id, doc.id);
  }

  function setLayout(count) {
    const current = project.paneAssignments.slice(0, 3);
    while (current.length < 3) current.push(null);
    project.layout = count;
    project.paneAssignments = current;
    Store.updateLayout(project.id, count, current);
    layoutButtons.forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.count) === count));
    renderPanes();
  }

  function assignPane(index, docId) {
    project.paneAssignments[index] = docId;
    Store.updateLayout(project.id, project.layout, project.paneAssignments);
  }

  function openNewDocumentDialog(onCreate, fixedType) {
    const dialog = document.createElement('dialog');
    dialog.className = 'app-dialog';
    dialog.innerHTML = `
      <form method="dialog">
        <h3>New document</h3>
        <label>Title
          <input type="text" class="new-doc-title" maxlength="100" required />
        </label>
        <label class="new-doc-type-row">Type
          <select class="new-doc-type">
            <option value="document">Document</option>
            <option value="sheet">Spreadsheet</option>
            <option value="checklist">Checklist</option>
          </select>
        </label>
        <div class="dialog-actions">
          <button type="button" class="cancel">Cancel</button>
          <button type="submit" class="confirm">Create</button>
        </div>
      </form>
    `;
    document.body.appendChild(dialog);

    const typeSelect = dialog.querySelector('.new-doc-type');
    if (fixedType) {
      typeSelect.value = fixedType;
      dialog.querySelector('.new-doc-type-row').hidden = true;
    }

    dialog.querySelector('.cancel').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => dialog.remove());
    dialog.querySelector('form').addEventListener('submit', () => {
      const title = dialog.querySelector('.new-doc-title').value.trim() || 'Untitled';
      const type = typeSelect.value;
      let content;
      if (type === 'document') {
        content = { html: '<p>Start writing.</p>' };
      } else if (type === 'sheet') {
        const rows = 1;
        const cols = 6;
        const grid = [];
        for (let r = 0; r < rows; r += 1) {
          grid.push(new Array(cols).fill(null).map(() => ({ text: '', bold: false, italic: false, underline: false })));
        }
        content = { rows: grid, colWidths: new Array(cols).fill(120) };
      } else {
        content = { items: [] };
      }
      const doc = Store.createDocument(project.id, type, title, content);
      onCreate(doc);
    });

    dialog.showModal();
  }

  function renderPanes() {
    panesEl.className = `panes panes--${project.layout}`;
    panesEl.innerHTML = '';
    const paneCount = project.layout;
    const allRebuildSelects = [];

    for (let i = 0; i < paneCount; i += 1) {
      const pane = document.createElement('section');
      pane.className = 'pane';
      pane.innerHTML = `
        <div class="pane-header">
          <select class="pane-select"></select>
          <div class="pane-header-actions"></div>
        </div>
        <div class="pane-body"></div>
      `;

      const select = pane.querySelector('.pane-select');
      const actions = pane.querySelector('.pane-header-actions');
      const body = pane.querySelector('.pane-body');

      function rebuildSelect() {
        select.innerHTML = '<option value="">Choose a document...</option>';
        project.documents.forEach((doc) => {
          const opt = document.createElement('option');
          opt.value = doc.id;
          opt.textContent = docOptionLabel(doc);
          styleOption(opt, doc);
          select.appendChild(opt);
        });
        const newOpt = document.createElement('option');
        newOpt.value = '__new__';
        newOpt.textContent = '+ New document';
        select.appendChild(newOpt);
        select.value = project.paneAssignments[i] || '';
      }

      function rebuildActions(doc) {
        actions.innerHTML = '';
        if (!doc) return;
        const renameBtn = document.createElement('button');
        renameBtn.type = 'button';
        renameBtn.className = 'pane-action';
        renameBtn.textContent = 'Rename';
        renameBtn.addEventListener('click', () => {
          openRenameDialog('Rename document', doc.title, (name) => {
            Store.updateDocument(project.id, doc.id, { title: name });
            doc.title = name;
            rebuildSelect();
            document.querySelectorAll('.pane-select').forEach((s) => {
              if (s !== select) {
                const opt = Array.from(s.options).find((o) => o.value === doc.id);
                if (opt) { opt.textContent = docOptionLabel(doc); styleOption(opt, doc); }
              }
            });
          });
        });
        actions.appendChild(renameBtn);
        const deleteBtn = document.createElement('button');
        deleteBtn.type = 'button';
        deleteBtn.className = 'pane-action pane-action-danger';
        deleteBtn.textContent = 'Delete document';
        deleteBtn.addEventListener('click', () => {
          if (window.confirm(`Delete "${doc.title}"? This can't be undone.`)) {
            Store.deleteDocument(project.id, doc.id);
            const fresh = Store.getProject(project.id);
            project.documents = fresh.documents;
            project.paneAssignments = fresh.paneAssignments;
            renderPanes();
          }
        });
        actions.appendChild(deleteBtn);
      }

      function loadPane(docId) {
        if (!docId) {
          body.innerHTML = '<p class="pane-empty">Choose a document above, or add a new one.</p>';
          rebuildActions(null);
          return;
        }
        const doc = project.documents.find((d) => d.id === docId);
        if (!doc) {
          body.innerHTML = '<p class="pane-empty">This document could not be found.</p>';
          rebuildActions(null);
          return;
        }
        mountEditorForDoc(body, doc);
        rebuildActions(doc);
      }

      allRebuildSelects.push(rebuildSelect);
      rebuildSelect();
      loadPane(project.paneAssignments[i]);

      select.addEventListener('change', () => {
        if (select.value === '__new__') {
          openNewDocumentDialog((doc) => {
            project.documents.push(doc);
            assignPane(i, doc.id);
            loadPane(doc.id);
            allRebuildSelects.forEach((rebuild) => rebuild());
          });
          select.value = project.paneAssignments[i] || '';
          return;
        }
        assignPane(i, select.value || null);
        loadPane(select.value || null);
      });

      panesEl.appendChild(pane);
    }
  }

  layoutButtons.forEach((btn) => {
    btn.addEventListener('click', () => setLayout(Number(btn.dataset.count)));
  });

  layoutButtons.forEach((btn) => btn.classList.toggle('active', Number(btn.dataset.count) === project.layout));
  renderPanes();
});
