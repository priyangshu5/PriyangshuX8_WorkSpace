/**
 * PriyangshuX8 Workspace - File Manager app
 * A two-pane file browser over the VFS: a folder tree on the left and the
 * current directory contents on the right with create/rename/delete and a
 * built-in text viewer. Registers itself into the kernel app registry.
 */

/** @param {import('../../core/kernel.js').Kernel} kernel */
export function registerFileManager(kernel) {
  kernel.apps.register({
    id: 'px8-files',
    title: 'Files',
    icon: '🗂',
    defaultSize: { width: 720, height: 460 },
    render: () => buildFileManager(kernel)
  });
}

/** @param {import('../../core/kernel.js').Kernel} kernel @returns {HTMLElement} */
function buildFileManager(kernel) {
  const vfs = kernel.services.get('vfs');
  const root = document.createElement('div');
  root.className = 'fm';
  root.innerHTML = `
    <div class="fm__toolbar">
      <button class="fm__btn" data-act="up" title="Up">↑</button>
      <span class="fm__path" data-role="path">/</span>
      <span class="fm__spacer"></span>
      <button class="fm__btn" data-act="newfolder">New folder</button>
      <button class="fm__btn" data-act="newfile">New file</button>
    </div>
    <div class="fm__main">
      <aside class="fm__tree" data-role="tree"></aside>
      <section class="fm__list" data-role="list"></section>
    </div>
    <div class="fm__viewer" data-role="viewer" hidden>
      <div class="fm__viewer-bar">
        <span data-role="viewer-name"></span>
        <button class="fm__btn" data-act="closeviewer">Close</button>
      </div>
      <textarea class="fm__viewer-text" data-role="viewer-text" spellcheck="false"></textarea>
      <div class="fm__viewer-foot">
        <button class="fm__btn fm__btn--primary" data-act="savefile">Save</button>
      </div>
    </div>
  `;

  let cwd = '/home';
  let openFilePath = null;

  const $ = (sel) => root.querySelector(sel);
  const pathEl = $('[data-role="path"]');
  const treeEl = $('[data-role="tree"]');
  const listEl = $('[data-role="list"]');
  const viewer = $('[data-role="viewer"]');
  const viewerName = $('[data-role="viewer-name"]');
  const viewerText = $('[data-role="viewer-text"]');

  function renderTree() {
    treeEl.innerHTML = '';
    const make = (path, name, depth) => {
      const row = document.createElement('button');
      row.className = 'fm__tree-row' + (path === cwd ? ' fm__tree-row--active' : '');
      row.style.paddingLeft = `${8 + depth * 14}px`;
      row.innerHTML = `<span>📁</span><span class="fm__tree-name">${esc(name)}</span>`;
      row.addEventListener('click', () => { cwd = path; refresh(); });
      treeEl.appendChild(row);
      try {
        for (const e of vfs.list(path)) {
          if (e.type === 'dir') make(joinPath(path, e.name), e.name, depth + 1);
        }
      } catch {}
    };
    make('/', '/', 0);
  }

  function renderList() {
    pathEl.textContent = cwd;
    listEl.innerHTML = '';
    let entries = [];
    try { entries = vfs.list(cwd); } catch { entries = []; }
    if (!entries.length) {
      const empty = document.createElement('div');
      empty.className = 'fm__empty';
      empty.textContent = 'This folder is empty.';
      listEl.appendChild(empty);
      return;
    }
    for (const e of entries) {
      const item = document.createElement('div');
      item.className = 'fm__item';
      item.innerHTML = `
        <span class="fm__item-icon">${e.type === 'dir' ? '📁' : '📄'}</span>
        <span class="fm__item-name">${esc(e.name)}</span>
        <span class="fm__item-actions">
          <button class="fm__mini" data-act="rename" title="Rename">✎</button>
          <button class="fm__mini" data-act="delete" title="Delete">🗑</button>
        </span>
      `;
      const full = joinPath(cwd, e.name);
      const nameEl = item.querySelector('.fm__item-name');
      nameEl.addEventListener('click', () => {
        if (e.type === 'dir') { cwd = full; refresh(); }
        else openFile(full, e.name);
      });
      nameEl.addEventListener('dblclick', () => {
        if (e.type === 'file') kernel.events.emit('code:open', { path: full });
      });
      item.querySelector('[data-act="rename"]').addEventListener('click', async () => {
        const next = prompt('Rename to:', e.name);
        if (next && next !== e.name) {
          try { await vfs.move(full, joinPath(cwd, next)); refresh(); }
          catch (err) { alert(err.message); }
        }
      });
      item.querySelector('[data-act="delete"]').addEventListener('click', async () => {
        if (confirm(`Delete "${e.name}"?`)) {
          try { await vfs.remove(full); if (openFilePath === full) closeViewer(); refresh(); }
          catch (err) { alert(err.message); }
        }
      });
      listEl.appendChild(item);
    }
  }

  function openFile(path, name) {
    try {
      viewerText.value = vfs.readFile(path);
      viewerName.textContent = name;
      openFilePath = path;
      viewer.hidden = false;
    } catch (err) { alert(err.message); }
  }

  function closeViewer() { viewer.hidden = true; openFilePath = null; }

  function refresh() { renderTree(); renderList(); }

  // Toolbar / viewer actions.
  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'up') {
      if (cwd !== '/') { const parts = cwd.split('/').filter(Boolean); parts.pop(); cwd = '/' + parts.join('/'); refresh(); }
    } else if (act === 'newfolder') {
      const name = prompt('New folder name:');
      if (name) { try { await vfs.mkdir(joinPath(cwd, name)); refresh(); } catch (err) { alert(err.message); } }
    } else if (act === 'newfile') {
      const name = prompt('New file name:');
      if (name) { try { await vfs.writeFile(joinPath(cwd, name), ''); refresh(); } catch (err) { alert(err.message); } }
    } else if (act === 'closeviewer') {
      closeViewer();
    } else if (act === 'savefile' && openFilePath) {
      try { await vfs.writeFile(openFilePath, viewerText.value); } catch (err) { alert(err.message); }
    }
  });

  // Live refresh when other apps (e.g. Terminal) change the filesystem.
  const off = kernel.events.on('vfs:change', () => { renderTree(); renderList(); });
  root.addEventListener('px8:disconnect', off);

  refresh();
  return root;
}

function joinPath(dir, name) { return (dir === '/' ? '' : dir) + '/' + name; }
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
