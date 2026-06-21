/**
 * PriyangshuX8 Workspace - Settings app
 * A polished settings surface wired to the Slice 1 ThemeEngine plus storage
 * tools. Controls: theme mode, accent color, animations, performance mode,
 * graphics quality, storage usage, and a "reset workspace" action.
 */

const ACCENTS = ['#5b8cff', '#8a5bff', '#2ea043', '#e5484d', '#f5a623', '#16b5c4', '#ff5fa2'];
const GFX_KEY = 'settings.graphics';

/** @param {import('../../core/kernel.js').Kernel} kernel */
export function registerSettings(kernel) {
  kernel.apps.register({
    id: 'px8-settings',
    title: 'Settings',
    icon: '⚙',
    defaultSize: { width: 560, height: 520 },
    render: () => buildSettings(kernel)
  });
}

/** @param {import('../../core/kernel.js').Kernel} kernel @returns {HTMLElement} */
function buildSettings(kernel) {
  const theme = kernel.services.get('theme');
  const root = document.createElement('div');
  root.className = 'settings';
  root.innerHTML = `
    <div class="settings__section">
      <h3 class="settings__h">Appearance</h3>
      <div class="settings__row">
        <span>Theme</span>
        <div class="settings__seg" data-role="mode">
          <button data-mode="dark">Dark</button>
          <button data-mode="light">Light</button>
        </div>
      </div>
      <div class="settings__row">
        <span>Accent color</span>
        <div class="settings__accents" data-role="accents"></div>
      </div>
    </div>

    <div class="settings__section">
      <h3 class="settings__h">Performance</h3>
      <label class="settings__toggle"><span>Animations</span><input type="checkbox" data-role="animations" /></label>
      <label class="settings__toggle"><span>Performance mode (low-end devices)</span><input type="checkbox" data-role="performance" /></label>
      <div class="settings__row">
        <span>Graphics quality</span>
        <select class="settings__select" data-role="graphics">
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>
      </div>
    </div>

    <div class="settings__section">
      <h3 class="settings__h">Storage</h3>
      <div class="settings__row"><span>Estimated usage</span><span data-role="usage">…</span></div>
      <div class="settings__row">
        <span>Reset workspace</span>
        <button class="settings__btn settings__btn--danger" data-act="reset">Reset all data</button>
      </div>
    </div>

    <div class="settings__section">
      <h3 class="settings__h">About</h3>
      <div class="settings__about">PriyangshuX8 Workspace · Kernel v${kernel.version}<br/>A browser-based virtual maker platform.</div>
    </div>
  `;

  const $ = (s) => root.querySelector(s);

  // Mode segmented control.
  function syncMode() { root.querySelectorAll('[data-role="mode"] button').forEach((b) => b.classList.toggle('active', b.dataset.mode === theme.state.mode)); }
  $('[data-role="mode"]').addEventListener('click', (e) => {
    const m = e.target.closest('[data-mode]')?.dataset.mode; if (!m) return;
    theme.update({ mode: m }); syncMode();
  });

  // Accent swatches.
  const accentsEl = $('[data-role="accents"]');
  for (const color of ACCENTS) {
    const b = document.createElement('button');
    b.className = 'settings__swatch'; b.style.background = color; b.dataset.color = color;
    b.addEventListener('click', () => { theme.update({ accent: color }); syncAccents(); });
    accentsEl.appendChild(b);
  }
  function syncAccents() { accentsEl.querySelectorAll('.settings__swatch').forEach((s) => s.classList.toggle('active', s.dataset.color.toLowerCase() === theme.state.accent.toLowerCase())); }

  // Toggles.
  const animEl = $('[data-role="animations"]'); animEl.checked = theme.state.animations;
  animEl.addEventListener('change', () => theme.update({ animations: animEl.checked }));
  const perfEl = $('[data-role="performance"]'); perfEl.checked = theme.state.performance;
  perfEl.addEventListener('change', () => theme.update({ performance: perfEl.checked }));

  // Graphics quality (persisted; read by the 3D scene via the store).
  const gfxEl = $('[data-role="graphics"]');
  kernel.store.get(GFX_KEY).then((v) => { gfxEl.value = v || 'high'; });
  gfxEl.addEventListener('change', () => { kernel.store.set(GFX_KEY, gfxEl.value); kernel.events.emit('graphics:change', { quality: gfxEl.value }); });

  // Storage usage.
  (async () => {
    const usageEl = $('[data-role="usage"]');
    try {
      if (navigator.storage && navigator.storage.estimate) {
        const { usage, quota } = await navigator.storage.estimate();
        usageEl.textContent = `${fmtBytes(usage)} of ${fmtBytes(quota)}`;
      } else {
        const keys = await kernel.store.keys();
        usageEl.textContent = `${keys.length} stored keys`;
      }
    } catch { usageEl.textContent = 'unavailable'; }
  })();

  // Reset workspace.
  $('[data-act="reset"]').addEventListener('click', async () => {
    if (!confirm('This deletes ALL workspace data (files, projects, settings) and reloads. Continue?')) return;
    try {
      const keys = await kernel.store.keys();
      for (const k of keys) await kernel.store.remove(k);
      if (window.indexedDB) { try { indexedDB.deleteDatabase('priyangshux8'); } catch {} }
      localStorage.clear();
      location.reload();
    } catch (e) { alert('Reset failed: ' + e.message); }
  });

  // React to external theme changes (e.g. start-menu toggle).
  const off = kernel.events.on('theme:change', () => { syncMode(); syncAccents(); animEl.checked = theme.state.animations; perfEl.checked = theme.state.performance; });
  root.addEventListener('px8:disconnect', off);

  syncMode(); syncAccents();
  return root;
}

function fmtBytes(n) {
  if (!n && n !== 0) return '—';
  const u = ['B', 'KB', 'MB', 'GB']; let i = 0; let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(1)} ${u[i]}`;
}
