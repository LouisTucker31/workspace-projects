/*
  Turns a document/sheet/checklist's stored content into a real .docx/.xlsx
  file the user can download, using the vendored `docx` and `xlsx-js-style`
  libraries (js/vendor/). Generation is fully client-side - nothing here
  talks to a server.
*/

function safeFilename(title, ext) {
  const base = (title || 'Untitled')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .trim()
    .replace(/\.+$/, '')
    .slice(0, 120) || 'Untitled';
  const reserved = /^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i;
  const finalBase = reserved.test(base) ? `${base}_` : base;
  return `${finalBase}.${ext}`;
}

function safeSheetName(title) {
  const base = (title || 'Sheet1').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31);
  return base || 'Sheet1';
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Walks the small, fixed, attribute-free tag set that sanitizeHtml() ever
// allows through (see js/sanitize.js) and turns it into docx.js runs/
// paragraphs. Because the tag set is so constrained, this is a simple
// recursive walk rather than a general HTML-to-docx converter.
const EXPORT_NUMBERING_REFERENCE = 'export-numbering';

function htmlNodeToRuns(node, style) {
  let runs = [];
  node.childNodes.forEach((child) => {
    if (child.nodeType === Node.TEXT_NODE) {
      if (child.textContent) runs.push(new docx.TextRun({ text: child.textContent, ...style }));
      return;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) return;
    const tag = child.tagName;
    if (tag === 'BR') {
      runs.push(new docx.TextRun({ text: '', break: 1 }));
      return;
    }
    const childStyle = { ...style };
    if (tag === 'B' || tag === 'STRONG') childStyle.bold = true;
    if (tag === 'I' || tag === 'EM') childStyle.italics = true;
    if (tag === 'U') childStyle.underline = {};
    runs = runs.concat(htmlNodeToRuns(child, childStyle));
  });
  return runs;
}

const BLOCK_TAGS = new Set(['P', 'DIV', 'UL', 'OL', 'LI', 'H1', 'H2', 'H3']);

// Chrome's own execCommand output doesn't keep a flat structure - e.g.
// insertUnorderedList wraps the list in a <div>, and a fresh line of plain
// text can sit bare at the root with no <p> at all. So this walks the whole
// tree looking for block elements at ANY depth (not just top-level
// children), and treats any run of loose text/inline nodes between blocks
// as its own paragraph, rather than assuming one fixed nesting shape.
function htmlToDocxParagraphs(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html || '';
  const paragraphs = [];
  let pendingInline = [];

  function flushPendingInline() {
    if (pendingInline.length === 0) return;
    paragraphs.push(new docx.Paragraph({ children: pendingInline }));
    pendingInline = [];
  }

  function addParagraph(el, extra) {
    const runs = htmlNodeToRuns(el, {});
    if (runs.length === 0) runs.push(new docx.TextRun({ text: '' }));
    paragraphs.push(new docx.Paragraph({ children: runs, ...extra }));
  }

  function walkBlocks(node) {
    node.childNodes.forEach((child) => {
      if (child.nodeType === Node.TEXT_NODE) {
        if (child.textContent) pendingInline.push(new docx.TextRun({ text: child.textContent }));
        return;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) return;
      const tag = child.tagName;

      if (!BLOCK_TAGS.has(tag)) {
        // Inline element (B/STRONG/I/EM/U/SPAN/BR) sitting outside any
        // block - collect its runs into the paragraph currently building.
        pendingInline = pendingInline.concat(htmlNodeToRuns(child, {}));
        return;
      }

      flushPendingInline();

      if (tag === 'H1') addParagraph(child, { heading: docx.HeadingLevel.HEADING_1 });
      else if (tag === 'H2') addParagraph(child, { heading: docx.HeadingLevel.HEADING_2 });
      else if (tag === 'H3') addParagraph(child, { heading: docx.HeadingLevel.HEADING_3 });
      else if (tag === 'UL') {
        Array.from(child.children).forEach((li) => addParagraph(li, { bullet: { level: 0 } }));
      } else if (tag === 'OL') {
        Array.from(child.children).forEach((li) => addParagraph(li, {
          numbering: { reference: EXPORT_NUMBERING_REFERENCE, level: 0 },
        }));
      } else if (tag === 'P') {
        addParagraph(child, {});
      } else {
        // DIV (or a stray LI outside a list) - not a paragraph in its own
        // right, just a grouping wrapper, so recurse into it instead of
        // treating its whole subtree as one flat run of text.
        walkBlocks(child);
      }
    });
  }

  walkBlocks(wrapper);
  flushPendingInline();

  if (paragraphs.length === 0) paragraphs.push(new docx.Paragraph({ children: [] }));
  return paragraphs;
}

function buildDocxDocument(paragraphs) {
  return new docx.Document({
    styles: {
      default: {
        document: {
          run: { font: 'Calibri', size: 22 }, // 22 half-points = 11pt, Word's own default
        },
      },
    },
    numbering: {
      config: [{
        reference: EXPORT_NUMBERING_REFERENCE,
        levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: docx.AlignmentType.START }],
      }],
    },
    sections: [{ children: paragraphs }],
  });
}

async function exportDocumentToDocx(doc) {
  const paragraphs = htmlToDocxParagraphs(doc.content.html);
  const file = buildDocxDocument(paragraphs);
  const blob = await docx.Packer.toBlob(file);
  return { blob, filename: safeFilename(doc.title, 'docx') };
}

async function exportChecklistToDocx(doc) {
  const paragraphs = [];
  (doc.content.items || []).forEach((item) => {
    // Plain ASCII, not Unicode checkbox glyphs (\u2611/\u2610) - the vendored
    // docx library corrupts multi-byte characters when writing the zip, this
    // sidesteps that bug entirely and still reads clearly in Word.
    const prefix = item.checked ? '[x] ' : '[ ] ';
    const wrapper = document.createElement('p');
    wrapper.innerHTML = item.html || item.text || '';
    const runs = [new docx.TextRun({ text: prefix }), ...htmlNodeToRuns(wrapper, {})];
    paragraphs.push(new docx.Paragraph({ children: runs }));
  });
  if (paragraphs.length === 0) paragraphs.push(new docx.Paragraph({ children: [] }));
  const file = buildDocxDocument(paragraphs);
  const blob = await docx.Packer.toBlob(file);
  return { blob, filename: safeFilename(doc.title, 'docx') };
}

async function exportSheetToXlsx(doc) {
  const rows = doc.content.rows || [];
  const colWidths = doc.content.colWidths || [];
  const ws = {};
  let maxRow = 0;
  let maxCol = 0;

  rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      if (!cell || !cell.text) return;
      const ref = XLSX.utils.encode_cell({ r, c });
      ws[ref] = {
        v: cell.text,
        t: 's',
        s: { font: { bold: !!cell.bold, italic: !!cell.italic, underline: !!cell.underline } },
      };
      maxRow = Math.max(maxRow, r);
      maxCol = Math.max(maxCol, c);
    });
  });

  maxCol = Math.max(maxCol, colWidths.length - 1, 0);
  ws['!ref'] = XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: maxRow, c: maxCol } });
  ws['!cols'] = colWidths.map((px) => ({ wch: Math.max(4, Math.round(px / 7)) }));

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, safeSheetName(doc.title));
  const arrayBuffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([arrayBuffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  return { blob, filename: safeFilename(doc.title, 'xlsx') };
}
