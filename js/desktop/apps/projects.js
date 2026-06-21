/**
 * PriyangshuX8 Workspace - Projects app
 * Create projects from templates, open them (loads the sketch into Code Studio
 * and the circuit into the Lab via the shared VFS + events), rename, delete, set
 * the active project, and import/export as ZIP.
 */
import { ProjectManager, TEMPLATES } from '../../projects/project-manager.js';

/** @param {import('../../core/kernel.js').Kernel} kernel */
export function registerProjects(kernel) {
  kernel.apps.register({
    id: 'px8-projects',
    title: 'Projects',
    icon: '📁',
    defaultSize: { width: 640, height: 480 },
    render: () => buildProjects(kernel)
  });
}

/** @param {import('../../core/kernel.js').Kernel} kernel @returns {HTMLElement} */
function buildProjects(kernel) {
  const pm = kernel.services.get('projects');
  const root = document.createElement('div');
  root.className = 'pjx';
  root.innerHTML = `
    <div class="pjx__toolbar">
      <select class="pjx__select" data-role="template"></select>
      <input class="pjx__input" data-role="newname" placeholder="New project name" />
      <button class="pjx__btn pjx__btn--primary" data-act="create">Create</button>
      <span class="pjx__spacer"></span>
      <button class="pjx__btn" data-act="import">Import ZIP</button>
      <input type="file" accept=".zip" data-role="file" hidden />
    </div>
    <div class="pjx__list" data-role="list"></div>
    <div class="pjx__status" data-role="status"></div>
  `;

  const templateSel = root.querySelector('[data-role="template"]');
  const newName = root.querySelector('[data-role="newname"]');
  const listEl = root.querySelector('[data-role="list"]');
  const statusEl = root.querySelector('[data-role="status"]');
  const fileInput = root.querySelector('[data-role="file"]');

  for (const [key, tpl] of Object.entries(TEMPLATES)) {
    const opt = document.createElement('option'); opt.value = key; opt.textContent = tpl.label; templateSel.appendChild(opt);
  }

  function flash(msg, isErr) { statusEl.textContent = msg; statusEl.className = 'pjx__status' + (isErr ? ' pjx__status--err' : ''); }

  async function refresh() {
    const active = await pm.getActive();
    const items = pm.list();
    listEl.innerHTML = '';
    if (!items.length) { listEl.innerHTML = '<div class="pjx__empty">No projects yet. Create one above.</div>'; return; }
    for (const { name, meta } of items) {
      const card = document.createElement('div');
      card.className = 'pjx__card' + (name === active ? ' pjx__card--active' : '');
      const created = meta.created ? new Date(meta.created).toLocaleDateString() : '';
      card.innerHTML = `
        <div class="pjx__card-main">
          <div class="pjx__card-name">${esc(name)} ${name === active ? '<span class="pjx__badge">active</span>' : ''}</div>
          <div class="pjx__card-meta">${esc(meta.type || 'project')}${created ? ' · ' + created : ''}</div>
        </div>
        <div class="pjx__card-actions">
          <button class="pjx__mini pjx__mini--primary" data-act="open" data-name="${esc(name)}">Open</button>
          <button class="pjx__mini" data-act="active" data-name="${esc(name)}">Set active</button>
          <button class="pjx__mini" data-act="export" data-name="${esc(name)}">Export</button>
          <button class="pjx__mini" data-act="rename" data-name="${esc(name)}">Rename</button>
          <button class="pjx__mini pjx__mini--danger" data-act="delete" data-name="${esc(name)}">Delete</button>
        </div>`;
      listEl.appendChild(card);
    }
  }

  async function openProject(name) {
    const dir = pm.dir(name);
    const sketch = `${dir}/sketch.ino`, circuit = `${dir}/circuit.px8lab`;
    await pm.setActive(name);
    // Tell the Lab to load this circuit, and Code Studio to open the sketch.
    kernel.events.emit('project:open', { name, sketch, circuit });
    if (kernel.services.get('vfs').isFile(sketch)) kernel.events.emit('code:open', { path: sketch });
    flash(`Opened "${name}". Circuit sent to PX8 Lab, sketch to Code Studio.`);
    refresh();
  }

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act, name = btn.dataset.name;
    try {
      if (act === 'create') {
        const created = await pm.create(newName.value || 'Untitled', templateSel.value);
        newName.value = ''; flash(`Created "${created}".`); refresh();
      } else if (act === 'open') { await openProject(name); }
      else if (act === 'active') { await pm.setActive(name); flash(`"${name}" is now active.`); refresh(); }
      else if (act === 'export') { flash(`Exporting "${name}"…`); await pm.exportZip(name); flash(`Exported "${name}.zip".`); }
      else if (act === 'rename') {
        const to = prompt('Rename project to:', name);
        if (to && to !== name) { await pm.rename(name, to); flash(`Renamed to "${ProjectManager.slug(to)}".`); refresh(); }
      } else if (act === 'delete') {
        if (confirm(`Delete project "${name}"? This removes its files.`)) { await pm.remove(name); flash(`Deleted "${name}".`); refresh(); }
      } else if (act === 'import') { fileInput.click(); }
    } catch (err) { flash(err.message, true); }
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files[0]; fileInput.value = '';
    if (!file) return;
    try { flash('Importing…'); const name = await pm.importZip(file); flash(`Imported "${name}".`); refresh(); }
    catch (err) { flash(err.message, true); }
  });

  const off = kernel.events.on('vfs:change', () => refresh());
  root.addEventListener('px8:disconnect', off);

  refresh();
  return root;
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
