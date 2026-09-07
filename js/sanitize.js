/*
  Minimal allow-list sanitizer for the document editor's stored HTML.
  This app never talks to a server, but content still round-trips through
  innerHTML on every render, so we strip anything that isn't plain
  formatting before it touches the DOM. Paste is separately forced to
  plain text (see pasteAsPlainText below), so the only HTML that ever
  reaches here comes from execCommand's own bold/italic/underline/list
  output - this still runs on every save/render as a defence-in-depth
  backstop, not because that path is expected to produce anything else.
*/

const ALLOWED_TAGS = new Set([
  'P', 'BR', 'B', 'STRONG', 'I', 'EM', 'U', 'UL', 'OL', 'LI',
  'H1', 'H2', 'H3', 'SPAN', 'DIV',
]);

// Nothing currently writes attributes into stored content - formatting is
// always applied to live DOM nodes (td.style.*, etc.), never serialized
// through here - so no attribute is on the allow-list. Every attribute on
// an otherwise-allowed tag is stripped, including any inline style/class
// and all event handlers, which removes the only realistic script-injection
// surface for content that round-trips through innerHTML.
function cleanNode(node) {
  // Walk children back-to-front so removing/unwrapping doesn't skip siblings.
  const children = Array.from(node.childNodes);
  for (const child of children) {
    if (child.nodeType === Node.TEXT_NODE) continue;
    if (child.nodeType !== Node.ELEMENT_NODE) {
      child.remove();
      continue;
    }
    if (!ALLOWED_TAGS.has(child.tagName)) {
      // Unwrap: keep the text content, drop the disallowed wrapper
      // (covers script, iframe, img, a, object, style, etc.)
      while (child.firstChild) node.insertBefore(child.firstChild, child);
      child.remove();
      continue;
    }
    for (const attr of Array.from(child.attributes)) {
      child.removeAttribute(attr.name);
    }
    cleanNode(child);
  }
}

function sanitizeHtml(html) {
  const wrapper = document.createElement('div');
  wrapper.innerHTML = html || '';
  cleanNode(wrapper);
  return wrapper.innerHTML;
}

// Force any paste into a contenteditable element to plain text, dropping
// the source's own formatting, fonts and colors.
function pasteAsPlainText(e) {
  e.preventDefault();
  const text = (e.clipboardData || window.clipboardData).getData('text/plain');
  document.execCommand('insertText', false, text);
}

// Shared bold/italic/underline toolbar markup used by every editor. Each
// editor wires up its own click handlers afterwards (via
// container.querySelector('[data-cmd="bold"]') etc.) since how a toggle
// applies - execCommand on a shared body vs. a per-cell/per-item flag -
// differs enough between editors that the wiring isn't worth sharing too.
function formatButtonsHtml() {
  return `
    <div class="tb-group">
      <button type="button" data-cmd="bold" title="Bold"><b>B</b></button>
      <button type="button" data-cmd="italic" title="Italic"><i>I</i></button>
      <button type="button" data-cmd="underline" title="Underline"><u>U</u></button>
    </div>
  `;
}
