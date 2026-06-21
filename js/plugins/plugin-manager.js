/**
 * PriyangshuX8 Workspace - Plugin Manager (service)
 * Discovers plugins stored in the VFS under /home/plugins/*.js, plus any
 * bundled plugins registered in code. Activates/deactivates them through the
 * scoped Plugin API, persists enabled state, and installs new plugins from VFS
 * files. Plugins run via dynamic import of a Blob URL built from their source
 * (VFS only - no remote code execution).
 */
import { createPluginApi } from './plugin-api.js';

const PLUGIN_DIR = '/home/plugins';
const ENABLED_KEY = 'plugins.enabled';

export class PluginManager {
  /** @param {import('../core/kernel.js').Kernel} kernel */
  constructor(kernel) {
    this.kernel = kernel;
    this.vfs = kernel.services.get('vfs');
    /** @type {Map<string, {manifest:object, source:string, path:string|null, bundled:boolean, active:boolean, teardown?:Function}>} */
    this.plugins = new Map();
    /** @type {Set<string>} */
    this.enabled = new Set();
  }

  /** Discover, load metadata, and activate enabled plugins. @returns {Promise<void>} */
  async init() {
    if (!this.vfs.isDir(PLUGIN_DIR)) await this.vfs.mkdir(PLUGIN_DIR);
    const saved = await this.kernel.store.get(ENABLED_KEY);
    this.enabled = new Set(Array.isArray(saved) ? saved : []);

    // Install the bundled sample plugin into the VFS on first run.
    await this._seedSamplePlugin();

    await this.scan();

    // Activate everything marked enabled.
    for (const id of [...this.enabled]) {
      if (this.plugins.has(id)) { try { await this.activate(id); } catch (e) { console.warn('[plugins] activate failed', id, e); } }
    }
  }

  /** Scan the VFS plugin directory and (re)load plugin metadata. @returns {Promise<void>} */
  async scan() {
    const files = this.vfs.isDir(PLUGIN_DIR) ? this.vfs.list(PLUGIN_DIR).filter((e) => e.type === 'file' && e.name.endsWith('.js')) : [];
    for (const f of files) {
      const path = `${PLUGIN_DIR}/${f.name}`;
      const source = this.vfs.readFile(path);
      try {
        const mod = await this._importSource(source);
        const manifest = mod.manifest || { id: f.name.replace(/\.js$/, ''), name: f.name, version: '1.0.0' };
        if (!this.plugins.has(manifest.id) || !this.plugins.get(manifest.id).active) {
          this.plugins.set(manifest.id, {
            manifest, source, path, bundled: false,
            active: this.plugins.get(manifest.id)?.active || false,
            teardown: this.plugins.get(manifest.id)?.teardown,
            _module: mod
          });
        }
      } catch (e) {
        this.plugins.set(f.name, { manifest: { id: f.name, name: f.name, version: '?' }, source, path, bundled: false, active: false, error: e.message });
      }
    }
    this.kernel.events.emit('plugins:change', {});
  }

  /** Import plugin source as an ES module via a Blob URL. @param {string} source */
  async _importSource(source) {
    const blob = new Blob([source], { type: 'text/javascript' });
    const url = URL.createObjectURL(blob);
    try { return await import(/* @vite-ignore */ url); }
    finally { setTimeout(() => URL.revokeObjectURL(url), 5000); }
  }

  /** @returns {{id:string, manifest:object, active:boolean, error?:string}[]} */
  list() {
    return [...this.plugins.entries()].map(([id, p]) => ({ id, manifest: p.manifest, active: p.active, error: p.error }));
  }

  /** @param {string} id @returns {Promise<void>} */
  async activate(id) {
    const p = this.plugins.get(id);
    if (!p || p.active) return;
    const mod = p._module || (p._module = await this._importSource(p.source));
    if (typeof mod.activate !== 'function') throw new Error(`Plugin "${id}" has no activate() export.`);
    const { api, teardown } = createPluginApi(this.kernel, id);
    p._deactivate = typeof mod.deactivate === 'function' ? mod.deactivate : null;
    mod.activate(api);
    p.teardown = teardown;
    p.active = true;
    p.error = undefined;
    this.enabled.add(id);
    await this._persist();
    this.kernel.events.emit('plugins:change', {});
  }

  /** @param {string} id @returns {Promise<void>} */
  async deactivate(id) {
    const p = this.plugins.get(id);
    if (!p || !p.active) return;
    try { p._deactivate?.(); } catch (e) { console.warn('[plugins] deactivate hook error', e); }
    try { p.teardown?.(); } catch (e) { console.warn('[plugins] teardown error', e); }
    p.active = false;
    this.enabled.delete(id);
    await this._persist();
    this.kernel.events.emit('plugins:change', {});
  }

  /** @param {string} id @returns {Promise<void>} */
  async toggle(id) { const p = this.plugins.get(id); if (p?.active) await this.deactivate(id); else await this.activate(id); }

  /**
   * Install a plugin by saving its source into the VFS plugin directory.
   * @param {string} fileName @param {string} source @returns {Promise<void>}
   */
  async install(fileName, source) {
    const safe = fileName.endsWith('.js') ? fileName : `${fileName}.js`;
    await this.vfs.writeFile(`${PLUGIN_DIR}/${safe}`, source);
    await this.scan();
  }

  /** @param {string} id @returns {Promise<void>} */
  async uninstall(id) {
    const p = this.plugins.get(id);
    if (!p) return;
    if (p.active) await this.deactivate(id);
    if (p.path && this.vfs.isFile(p.path)) await this.vfs.remove(p.path);
    this.plugins.delete(id);
    await this._persist();
    this.kernel.events.emit('plugins:change', {});
  }

  async _persist() { await this.kernel.store.set(ENABLED_KEY, [...this.enabled]); }

  /** Write the bundled sample plugin into the VFS on first run. */
  async _seedSamplePlugin() {
    const path = `${PLUGIN_DIR}/sample-stopwatch.js`;
    if (this.vfs.isFile(path)) return;
    await this.vfs.writeFile(path, SAMPLE_PLUGIN_SOURCE);
  }
}

/**
 * Bundled sample plugin source. Demonstrates the full pipeline: it registers a
 * "Stopwatch" desktop app AND a custom terminal command ("uptime"), and stores
 * its best lap time via the plugin data API.
 */
const SAMPLE_PLUGIN_SOURCE = `
export const manifest = {
  id: 'sample-stopwatch',
  name: 'Stopwatch',
  version: '1.0.0',
  description: 'A demo plugin: a stopwatch app plus an "uptime" terminal command.',
  author: 'PriyangshuX8'
};

let started = Date.now();

export function activate(api) {
  api.log('activating');

  api.registerApp({
    id: 'plugin-stopwatch',
    title: 'Stopwatch',
    icon: '⏱',
    defaultSize: { width: 320, height: 220 },
    render() {
      const el = document.createElement('div');
      el.style.cssText = 'display:flex;flex-direction:column;gap:12px;align-items:center;justify-content:center;height:100%;';
      const time = document.createElement('div');
      time.style.cssText = 'font-size:40px;font-weight:800;font-variant-numeric:tabular-nums;';
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:8px;';
      const mk = (label) => { const b = document.createElement('button'); b.textContent = label;
        b.style.cssText='padding:8px 16px;border-radius:9px;border:1px solid var(--stroke);background:var(--glass);color:var(--text);'; return b; };
      const startBtn = mk('Start'), stopBtn = mk('Stop'), resetBtn = mk('Reset');
      row.append(startBtn, stopBtn, resetBtn);
      el.append(time, row);

      let running = false, elapsed = 0, t0 = 0, raf = 0;
      const fmt = (ms) => { const s = ms/1000; return s.toFixed(2) + 's'; };
      const tick = () => { time.textContent = fmt(elapsed + (running ? Date.now()-t0 : 0)); raf = requestAnimationFrame(tick); };
      startBtn.onclick = () => { if (!running){ running = true; t0 = Date.now(); } };
      stopBtn.onclick = async () => { if (running){ running=false; elapsed += Date.now()-t0;
        const best = (await api.getData('best')) || Infinity; if (elapsed < best) await api.setData('best', elapsed); } };
      resetBtn.onclick = () => { running=false; elapsed=0; };
      tick();
      el.addEventListener('px8:disconnect', () => cancelAnimationFrame(raf));
      return el;
    }
  });

  api.registerTerminalCommand('uptime', (args, raw, print) => {
    const ms = Date.now() - started;
    print('Plugin uptime: ' + (ms/1000).toFixed(1) + 's');
  }, 'Show how long the Stopwatch plugin has been active');
}

export function deactivate() { /* host auto-reverts registrations */ }
`;
