/*
  Renders a spreadsheet-style editor for the document `docId`. Cells are
  simple contenteditable <td>s (text plus bold/italic/underline); text never
  wraps. A column stays at its default/stored width until it has content,
  then widens to fit its widest one-line cell. Enough rows are added on
  mount to fill the pane's height (minus one row) so there's no scroll with
  an empty sheet.
*/

function mountSheetEditor(container, projectId, docId) {
  const doc = Store.getDocument(projectId, docId);
  if (!doc) {
    container.innerHTML = '<p class="pane-empty">This spreadsheet could not be found.</p>';
    return;
  }

  container.innerHTML = `
    <div class="sheet-editor">
      <div class="editor-toolbar" role="toolbar" aria-label="Cell formatting">
        ${formatButtonsHtml()}
        <div class="tb-group tb-push-right">
          <button type="button" class="add-row" title="Add row">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="2.5" y="3" width="15" height="7" rx="1"/><path d="M6 16h8M10 13.2v5.6"/></svg>
          </button>
          <button type="button" class="add-col" title="Add column">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="3" y="2.5" width="7" height="15" rx="1"/><path d="M16 6v8M13.2 10h5.6"/></svg>
          </button>
          <button type="button" class="del-row" title="Delete row">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="2.5" y="6.5" width="15" height="7" rx="1"/><path d="M6.5 10h7"/></svg>
          </button>
          <button type="button" class="del-col" title="Delete column">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"><rect x="6.5" y="2.5" width="7" height="15" rx="1"/><path d="M10 6.5v7"/></svg>
          </button>
          <button type="button" class="download-btn" title="Download as Excel file">
            <svg viewBox="0 0 20 20" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M10 3v10M6 9.5 10 13.5 14 9.5"/><path d="M4 16h12"/></svg>
          </button>
        </div>
      </div>
      <div class="sheet-scroll">
        <table class="sheet-grid"></table>
      </div>
    </div>
  `;

  const scroll = container.querySelector('.sheet-scroll');
  const table = container.querySelector('.sheet-grid');
  let activeCell = { row: 0, col: 0 };

  const DEFAULT_COL_WIDTH = 120;
  const ROW_HEIGHT = 16 * 1.65;
  const CELL_H_PADDING = 16; // matches --space-2 (8px) on each side

  function save() {
    Store.updateDocument(projectId, docId, { content: doc.content });
  }

  function cellData(r, c) {
    if (!doc.content.rows[r]) doc.content.rows[r] = [];
    if (!doc.content.rows[r][c]) doc.content.rows[r][c] = { text: '', bold: false, italic: false, underline: false };
    return doc.content.rows[r][c];
  }

  function focusCell(r, c) {
    const tr = table.rows[r];
    if (!tr) return;
    const td = tr.cells[c];
    if (!td) return;
    td.querySelector('.cell-text').focus();
  }

  // Add enough blank rows to fill the pane's visible height, minus one row,
  // so a fresh sheet has no scrollbar. Never removes rows.
  function fillRowsToPane() {
    const availHeight = scroll.clientHeight;
    if (!availHeight) return false;
    const colCount = doc.content.colWidths.length;
    const targetRows = Math.max(0, Math.floor(availHeight / ROW_HEIGHT) - 1);
    let changed = false;
    while (doc.content.rows.length < targetRows) {
      doc.content.rows.push(new Array(colCount).fill(null));
      changed = true;
    }
    return changed;
  }

  const measureCanvas = document.createElement('canvas');
  const measureCtx = measureCanvas.getContext('2d');
  function measureTextWidth(text, bold) {
    measureCtx.font = `${bold ? '700' : '400'} 16px Lora, Georgia, serif`;
    return measureCtx.measureText(text).width;
  }

  // A column stays at its stored/default width until it has content, then
  // widens to fit its widest one-line cell - independent of other columns.
  // Any columns still empty afterwards share the pane's leftover width
  // evenly between them, so a fresh sheet fills the pane instead of sitting
  // at a small fixed width; a column already sized to real content is left
  // exactly as computed.
  function computeColumnWidths() {
    const colCount = doc.content.colWidths.length;
    const widths = doc.content.colWidths.slice();
    const emptyCols = [];
    for (let c = 0; c < colCount; c += 1) {
      let widest = 0;
      let hasContent = false;
      for (let r = 0; r < doc.content.rows.length; r += 1) {
        const cell = doc.content.rows[r][c];
        if (cell && cell.text) {
          hasContent = true;
          widest = Math.max(widest, measureTextWidth(cell.text, cell.bold) + CELL_H_PADDING);
        }
      }
      if (hasContent) {
        widths[c] = Math.max(doc.content.colWidths[c], Math.ceil(widest));
      } else {
        emptyCols.push(c);
      }
    }

    const availWidth = scroll.clientWidth - 2;
    const totalWidth = widths.reduce((sum, w) => sum + w, 0);
    const gap = availWidth - totalWidth;
    if (availWidth && gap > 0 && emptyCols.length > 0) {
      const share = Math.floor(gap / emptyCols.length);
      emptyCols.forEach((c) => { widths[c] += share; });
    }
    return widths;
  }

  // Fast path used after a keystroke: only touches the <colgroup> widths so
  // a column can widen live as you type, without rebuilding every cell
  // (which would drop focus and reset the caret position mid-word).
  function updateColumnWidths() {
    const colWidths = computeColumnWidths();
    const cols = table.querySelectorAll('colgroup col');
    colWidths.forEach((w, i) => {
      if (cols[i]) cols[i].style.width = `${w}px`;
    });
  }

  function render() {
    fillRowsToPane();
    table.innerHTML = '';
    const colCount = doc.content.colWidths.length;
    const colWidths = computeColumnWidths();

    const colgroup = document.createElement('colgroup');
    colWidths.forEach((w) => {
      const col = document.createElement('col');
      col.style.width = `${w}px`;
      colgroup.appendChild(col);
    });
    table.appendChild(colgroup);

    doc.content.rows.forEach((rowData, r) => {
      const tr = document.createElement('tr');
      for (let c = 0; c < colCount; c += 1) {
        const cell = cellData(r, c);
        const td = document.createElement('td');
        td.style.fontWeight = cell.bold ? '700' : '400';
        td.style.fontStyle = cell.italic ? 'italic' : 'normal';
        td.style.textDecoration = cell.underline ? 'underline' : 'none';

        const cellText = document.createElement('div');
        cellText.className = 'cell-text';
        cellText.contentEditable = 'true';
        cellText.spellcheck = true;
        cellText.lang = 'en-GB';
        cellText.textContent = cell.text;
        const setActive = () => {
          activeCell = { row: r, col: c };
          syncToolbarToCell();
        };
        cellText.addEventListener('mousedown', setActive);
        cellText.addEventListener('focus', setActive);
        cellText.addEventListener('paste', (e) => {
          e.preventDefault();
          const raw = (e.clipboardData || window.clipboardData).getData('text/plain');
          document.execCommand('insertText', false, raw.replace(/[\r\n]+/g, ' '));
        });
        cellText.addEventListener('input', () => {
          cell.text = cellText.textContent;
          updateColumnWidths();
          save();
        });
        cellText.addEventListener('keydown', (e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            focusCell(r + 1, c);
          }
        });
        td.appendChild(cellText);
        tr.appendChild(td);
      }
      table.appendChild(tr);
    });
  }

  const boldBtn = container.querySelector('[data-cmd="bold"]');
  const italicBtn = container.querySelector('[data-cmd="italic"]');
  const underlineBtn = container.querySelector('[data-cmd="underline"]');

  function syncToolbarToCell() {
    const cell = cellData(activeCell.row, activeCell.col);
    boldBtn.classList.toggle('active', !!cell.bold);
    italicBtn.classList.toggle('active', !!cell.italic);
    underlineBtn.classList.toggle('active', !!cell.underline);
  }

  boldBtn.addEventListener('click', () => {
    const cell = cellData(activeCell.row, activeCell.col);
    cell.bold = !cell.bold;
    render();
    save();
  });
  italicBtn.addEventListener('click', () => {
    const cell = cellData(activeCell.row, activeCell.col);
    cell.italic = !cell.italic;
    render();
    save();
  });
  underlineBtn.addEventListener('click', () => {
    const cell = cellData(activeCell.row, activeCell.col);
    cell.underline = !cell.underline;
    render();
    save();
  });

  container.querySelector('.add-row').addEventListener('click', () => {
    doc.content.rows.push(new Array(doc.content.colWidths.length).fill(null));
    render();
    save();
  });
  container.querySelector('.add-col').addEventListener('click', () => {
    doc.content.colWidths.push(DEFAULT_COL_WIDTH);
    doc.content.rows.forEach((row) => row.push(null));
    render();
    save();
  });
  container.querySelector('.del-row').addEventListener('click', () => {
    if (doc.content.rows.length <= 1) return;
    doc.content.rows.splice(activeCell.row, 1);
    activeCell.row = Math.max(0, activeCell.row - 1);
    render();
    save();
  });
  container.querySelector('.del-col').addEventListener('click', () => {
    if (doc.content.colWidths.length <= 1) return;
    doc.content.colWidths.splice(activeCell.col, 1);
    doc.content.rows.forEach((row) => row.splice(activeCell.col, 1));
    activeCell.col = Math.max(0, activeCell.col - 1);
    render();
    save();
  });
  container.querySelector('.download-btn').addEventListener('click', async () => {
    const { blob, filename } = await exportSheetToXlsx(doc);
    triggerDownload(blob, filename);
  });

  render();
  syncToolbarToCell();

  let resizeQueued = false;
  new ResizeObserver(() => {
    if (resizeQueued) return;
    resizeQueued = true;
    requestAnimationFrame(() => {
      resizeQueued = false;
      render();
    });
  }).observe(scroll);
}
