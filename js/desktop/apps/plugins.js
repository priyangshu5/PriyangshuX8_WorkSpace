/**
 * PriyangshuX8 Workspace - Plugin Manager app
 * Lists discovered plugins, toggles them on/off, installs a plugin from a VFS
 * file path, rescans the plugin directory, and uninstalls plugins. All state is
 * persisted by the PluginManager service.
 */

/** @param {import('../../core/kernel.js').Kernel} kernel */
export function registerPlugins(kernel) {
  kernel.apps.register({
    id: 'px8-plugins',
    title: 'Plugins',
    icon: '🧩',
    defaultSize: { width: 600, height: 460 },
    render: () => buildPlugins(kernel)
  });
}

/** @param {import('../../core/kernel.js').Kernel} kernel @returns {HTMLElement} */
function buildPlugins(kernel) {
  const pm = kernel.services.get('plugins');
  const root = document.createElement('div');
  root.className = 'plg';
  root.innerHTML = `
    <div class="plg__toolbar">
      <button class="plg__btn" data-act="rescan">Rescan</button>
      <span class="plg__spacer"></span>
      <input class="plg__input" data-role="path" placeholder="Install from VFS path (e.g. /home/myplugin.js)" />
      <button class="plg__btn plg__btn--primary" data-act="install">Install</button>
    </div>
    <div class="plg__hint">Plugins live in <code>/home/plugins</code>. Create a .js file there (or anywhere and install it) exporting <code>manifest</code> and <code>activate(api)</code>.</div>
    <div class="plg__list" data-role="list"></div>
    <div class="plg__status" data-role="status"></div>
  `;

  const listEl = root.querySelector('[data-role="list"]');
  const statusEl = root.querySelector('[data-role="status"]');
  const pathEl = root.querySelector('[data-role="path"]');
  const vfs = kernel.services.get('vfs');

  function flash(msg, err) { statusEl.textContent = msg; statusEl.className = 'plg__status' + (err ? ' plg__status--err' : ''); }

  function render() {
    const items = pm.list();
    listEl.innerHTML = '';
    if (!items.length) { listEl.innerHTML = '<div class="plg__empty">No plugins found. Install one to get started.</div>'; return; }
    for (const { id, manifest, active, error } of items) {
      const card = document.createElement('div');
      card.className = 'plg__card' + (active ? ' plg__card--active' : '');
      card.innerHTML = `
        <div class="plg__card-main">
          <div class="plg__card-name">${esc(manifest.name || id)} <span class="plg__ver">v${esc(manifest.version || '?')}</span></div>
          <div class="plg__card-desc">${esc(manifest.description || '')}</div>
          ${error ? `<div class="plg__card-err">Error: ${esc(error)}</div>` : ''}
          ${manifest.author ? `<div class="plg__card-author">by ${esc(manifest.author)}</div>` : ''}
        </div>
        <div class="plg__card-actions">
          <label class="plg__switch"><input type="checkbox" data-act="toggle" data-id="${esc(id)}" ${active ? 'checked' : ''} ${error ? 'disabled' : ''}/><span class="plg__slider"></span></label>
          <button class="plg__mini plg__mini--danger" data-act="uninstall" data-id="${esc(id)}">Uninstall</button>
        </div>`;
      listEl.appendChild(card);
    }
  }

  root.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.dataset.act, id = btn.dataset.id;
    try {
      if (act === 'rescan') { await pm.scan(); flash('Rescanned plugin directory.'); }
      else if (act === 'install') {
        const path = pathEl.value.trim();
        if (!path) return flash('Enter a VFS path to a .js plugin file.', true);
        if (!vfs.isFile(path)) return flash('No such file: ' + path, true);
        const source = vfs.readFile(path);
        const name = path.split('/').pop();
        await pm.install(name, source);
        pathEl.value = ''; flash('Installed ' + name + '. Toggle it on to activate.');
      } else if (act === 'uninstall') {
        if (confirm('Uninstall this plugin? Its file will be removed.')) { await pm.uninstall(id); flash('Uninstalled.'); }
      }
    } catch (err) { flash(err.message, true); }
  });

  root.addEventListener('change', async (e) => {
    const cb = e.target.closest('[data-act="toggle"]');
    if (!cb) return;
    try { await pm.toggle(cb.dataset.id); flash(cb.checked ? 'Activated.' : 'Deactivated.'); }
    catch (err) { flash(err.message, true); cb.checked = !cb.checked; }
  });

  const off = kernel.events.on('plugins:change', render);
  root.addEventListener('px8:disconnect', off);

  render();
  return root;
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
