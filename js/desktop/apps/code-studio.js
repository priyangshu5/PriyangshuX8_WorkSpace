/**
 * PriyangshuX8 Workspace - Code Studio app
 * A lightweight, dependency-free multi-tab code editor wired to the VFS.
 * Features: open/save files, multiple tabs, line numbers, language detection,
 * find/replace, dirty tracking, auto-save, and a status bar. Other apps can
 * open a file in the editor via the kernel event "code:open" with { path }.
 */

const LANGUAGES = [
  { ext: ['js', 'mjs', 'cjs'], name: 'JavaScript' },
  { ext: ['ts'], name: 'TypeScript' },
  { ext: ['py'], name: 'Python' },
  { ext: ['ino', 'cpp', 'cc', 'c', 'h', 'hpp'], name: 'Arduino C++' },
  { ext: ['html', 'htm'], name: 'HTML' },
  { ext: ['css'], name: 'CSS' },
  { ext: ['json'], name: 'JSON' },
  { ext: ['md', 'markdown'], name: 'Markdown' },
  { ext: ['txt', 'log', 'cfg', 'ini'], name: 'Plain Text' }
];

/** @param {string} name @returns {string} */
function detectLanguage(name) {
  const ext = (name.split('.').pop() || '').toLowerCase();
  const lang = LANGUAGES.find((l) => l.ext.includes(ext));
  return lang ? lang.name : 'Plain Text';
}

/** @param {import('../../core/kernel.js').Kernel} kernel */
export function registerCodeStudio(kernel) {
  kernel.apps.register({
    id: 'px8-code',
    title: 'Code Studio',
    icon: '⟨⟩',
    defaultSize: { width: 820, height: 540 },
    render: () => buildCodeStudio(kernel)
  });
}

/** @param {import('../../core/kernel.js').Kernel} kernel @returns {HTMLElement} */
function buildCodeStudio(kernel) {
  const vfs = kernel.services.get('vfs');
  const root = document.createElement('div');
  root.className = 'cs';
  root.innerHTML = `
    <div class="cs__toolbar">
      <button class="cs__btn" data-act="open" title="Open file">Open</button>
      <button class="cs__btn" data-act="new" title="New file">New</button>
      <button class="cs__btn cs__btn--primary" data-act="save" title="Save (Ctrl+S)">Save</button>
      <span class="cs__spacer"></span>
      <label class="cs__autosave"><input type="checkbox" data-role="autosave" checked /> Auto-save</label>
      <button class="cs__btn" data-act="find" title="Find / Replace (Ctrl+F)">Find</button>
    </div>

    <div class="cs__findbar" data-role="findbar" hidden>
      <input class="cs__find-input" data-role="find" placeholder="Find" spellcheck="false" />
      <input class="cs__find-input" data-role="replace" placeholder="Replace" spellcheck="false" />
      <button class="cs__btn" data-act="find-next">Next</button>
      <button class="cs__btn" data-act="replace-one">Replace</button>
      <button class="cs__btn" data-act="replace-all">All</button>
      <button class="cs__btn" data-act="find-close">✕</button>
    </div>

    <div class="cs__tabs" data-role="tabs"></div>

    <div class="cs__editor" data-role="editor">
      <div class="cs__placeholder" data-role="placeholder">
        Open a file to start editing.<br />Use the toolbar or double-click a file in the File Manager.
      </div>
      <div class="cs__pane" data-role="pane" hidden>
        <div class="cs__gutter" data-role="gutter"></div>
        <textarea class="cs__textarea" data-role="textarea" spellcheck="false"
                  autocapitalize="off" autocomplete="off" autocorrect="off" wrap="off"></textarea>
      </div>
    </div>

    <div class="cs__status">
      <span data-role="st-file">No file</span>
      <span class="cs__spacer"></span>
      <span data-role="st-lang"></span>
      <span data-role="st-pos">Ln 1, Col 1</span>
      <span data-role="st-dirty"></span>
    </div>
  `;

  /**
   * @typedef {Object} Tab
   * @property {string} path
   * @property {string} name
   * @property {string} content   Current (possibly unsaved) content.
   * @property {string} saved     Last-saved content.
   * @property {string} lang
   */
  /** @type {Tab[]} */
  const tabs = [];
  let activeIdx = -1;

  const $ = (s) => root.querySelector(s);
  const tabsEl = $('[data-role="tabs"]');
  const pane = $('[data-role="pane"]');
  const placeholder = $('[data-role="placeholder"]');
  const gutter = $('[data-role="gutter"]');
  const textarea = $('[data-role="textarea"]');
  const findbar = $('[data-role="findbar"]');
  const findInput = $('[data-role="find"]');
  const replaceInput = $('[data-role="replace"]');
  const autosaveEl = $('[data-role="autosave"]');
  const stFile = $('[data-role="st-file"]');
  const stLang = $('[data-role="st-lang"]');
  const stPos = $('[data-role="st-pos"]');
  const stDirty = $('[data-role="st-dirty"]');

  let autosaveTimer = null;

  function active() { return activeIdx >= 0 ? tabs[activeIdx] : null; }

  function openPath(path) {
    const existing = tabs.findIndex((t) => t.path === path);
    if (existing !== -1) { setActive(existing); return; }
    let content;
    try { content = vfs.readFile(path); } catch (e) { alert(e.message); return; }
    const name = path.split('/').pop();
    tabs.push({ path, name, content, saved: content, lang: detectLanguage(name) });
    setActive(tabs.length - 1);
  }

  function setActive(idx) {
    activeIdx = idx;
    renderTabs();
    const t = active();
    if (!t) {
      pane.hidden = true; placeholder.hidden = false;
      stFile.textContent = 'No file'; stLang.textContent = ''; stDirty.textContent = '';
      return;
    }
    pane.hidden = false; placeholder.hidden = true;
    textarea.value = t.content;
    stFile.textContent = t.path;
    stLang.textContent = t.lang;
    updateGutter();
    updateDirty();
    updateCursor();
    textarea.focus();
  }

  function closeTab(idx) {
    const t = tabs[idx];
    if (t && t.content !== t.saved && !confirm(`Discard unsaved changes to "${t.name}"?`)) return;
    tabs.splice(idx, 1);
    if (tabs.length === 0) setActive(-1);
    else setActive(Math.min(idx, tabs.length - 1));
  }

  function renderTabs() {
    tabsEl.innerHTML = '';
    tabs.forEach((t, i) => {
      const tab = document.createElement('div');
      tab.className = 'cs__tab' + (i === activeIdx ? ' cs__tab--active' : '');
      const dirty = t.content !== t.saved ? '●' : '';
      tab.innerHTML = `<span class="cs__tab-name">${esc(t.name)}</span>
        <span class="cs__tab-dirty">${dirty}</span>
        <button class="cs__tab-close" title="Close">✕</button>`;
      tab.querySelector('.cs__tab-name').addEventListener('click', () => setActive(i));
      tab.querySelector('.cs__tab-dirty').addEventListener('click', () => setActive(i));
      tab.querySelector('.cs__tab-close').addEventListener('click', (e) => { e.stopPropagation(); closeTab(i); });
      tabsEl.appendChild(tab);
    });
  }

  function updateGutter() {
    const lines = textarea.value.split('\n').length;
    let html = '';
    for (let i = 1; i <= lines; i++) html += i + '\n';
    gutter.textContent = html;
    gutter.scrollTop = textarea.scrollTop;
  }

  function updateDirty() {
    const t = active();
    if (!t) return;
    const dirty = t.content !== t.saved;
    stDirty.textContent = dirty ? 'Unsaved' : 'Saved';
    stDirty.className = dirty ? 'cs__dirty' : '';
    renderTabs();
  }

  function updateCursor() {
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    const line = before.split('\n').length;
    const col = pos - before.lastIndexOf('\n');
    stPos.textContent = `Ln ${line}, Col ${col}`;
  }

  async function save() {
    const t = active();
    if (!t) return;
    try {
      await vfs.writeFile(t.path, t.content);
      t.saved = t.content;
      updateDirty();
    } catch (e) { alert(e.message); }
  }

  function scheduleAutosave() {
    if (!autosaveEl.checked) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = setTimeout(save, 900);
  }

  // ---- Editing events ----
  textarea.addEventListener('input', () => {
    const t = active();
    if (!t) return;
    t.content = textarea.value;
    updateGutter();
    updateDirty();
    scheduleAutosave();
  });
  textarea.addEventListener('scroll', () => { gutter.scrollTop = textarea.scrollTop; });
  textarea.addEventListener('keyup', updateCursor);
  textarea.addEventListener('click', updateCursor);

  // Tab key inserts two spaces instead of moving focus.
  textarea.addEventListener('keydown', (e) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const s = textarea.selectionStart, en = textarea.selectionEnd;
      textarea.value = textarea.value.slice(0, s) + '  ' + textarea.value.slice(en);
      textarea.selectionStart = textarea.selectionEnd = s + 2;
      const t = active(); if (t) { t.content = textarea.value; updateGutter(); updateDirty(); scheduleAutosave(); }
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
      e.preventDefault(); save();
    } else if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
      e.preventDefault(); toggleFind(true);
    }
  });

  // ---- Find / Replace ----
  function toggleFind(show) {
    findbar.hidden = !show;
    if (show) { findInput.value = window.getSelection().toString() || findInput.value; findInput.focus(); findInput.select(); }
    else textarea.focus();
  }

  function findNext() {
    const needle = findInput.value;
    if (!needle) return;
    const from = textarea.selectionEnd;
    let idx = textarea.value.indexOf(needle, from);
    if (idx === -1) idx = textarea.value.indexOf(needle, 0); // wrap
    if (idx !== -1) {
      textarea.focus();
      textarea.setSelectionRange(idx, idx + needle.length);
      updateCursor();
    }
  }

  function replaceOne() {
    const needle = findInput.value;
    if (!needle) return;
    const s = textarea.selectionStart, en = textarea.selectionEnd;
    if (textarea.value.slice(s, en) === needle) {
      textarea.value = textarea.value.slice(0, s) + replaceInput.value + textarea.value.slice(en);
      textarea.selectionStart = textarea.selectionEnd = s + replaceInput.value.length;
      syncFromTextarea();
    }
    findNext();
  }

  function replaceAll() {
    const needle = findInput.value;
    if (!needle) return;
    textarea.value = textarea.value.split(needle).join(replaceInput.value);
    syncFromTextarea();
  }

  function syncFromTextarea() {
    const t = active(); if (!t) return;
    t.content = textarea.value; updateGutter(); updateDirty(); scheduleAutosave();
  }

  // ---- Toolbar / findbar actions ----
  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'open') {
      const path = prompt('Open file (absolute path, e.g. /home/documents/welcome.txt):', '/home/documents/welcome.txt');
      if (path) { if (vfs.isFile(path)) openPath(path); else alert('Not a file: ' + path); }
    } else if (act === 'new') {
      const path = prompt('New file (absolute path, e.g. /home/projects/sketch.ino):');
      if (path) {
        try { if (!vfs.exists(path)) await vfs.writeFile(path, ''); openPath(path); }
        catch (err) { alert(err.message); }
      }
    } else if (act === 'save') { save(); }
    else if (act === 'find') { toggleFind(findbar.hidden); }
    else if (act === 'find-next') findNext();
    else if (act === 'replace-one') replaceOne();
    else if (act === 'replace-all') replaceAll();
    else if (act === 'find-close') toggleFind(false);
  });

  findInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') findNext(); if (e.key === 'Escape') toggleFind(false); });
  replaceInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') replaceOne(); });

  // ---- External "open file in editor" hook (used by File Manager / future Lab) ----
  const offOpen = kernel.events.on('code:open', ({ path }) => { if (path && vfs.isFile(path)) openPath(path); });
  // If a file is deleted elsewhere, close its tab.
  const offVfs = kernel.events.on('vfs:change', () => {
    for (let i = tabs.length - 1; i >= 0; i--) {
      if (!vfs.isFile(tabs[i].path)) { tabs.splice(i, 1); if (activeIdx >= tabs.length) activeIdx = tabs.length - 1; }
    }
    if (activeIdx < 0 && tabs.length === 0) setActive(-1); else renderTabs();
  });
  root.addEventListener('px8:disconnect', () => { offOpen(); offVfs(); });

  // Open a sensible default file if it exists.
  if (vfs.isFile('/home/documents/welcome.txt')) openPath('/home/documents/welcome.txt');
  else setActive(-1);

  return root;
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
