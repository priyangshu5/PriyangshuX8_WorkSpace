/**
 * PriyangshuX8 Workspace - Plugin API
 * The stable, intentionally-scoped surface handed to each plugin's activate().
 * Plugins never touch the kernel directly; they go through this facade so the
 * host can track and cleanly reverse everything a plugin does on deactivate.
 *
 * A plugin module exports:
 *   export const manifest = { id, name, version, description, author };
 *   export function activate(api) { ... }
 *   export function deactivate() { ... }   // optional
 */

/**
 * @typedef {Object} PluginApi
 * @property {string} pluginId
 * @property {(def:object)=>void} registerApp        Register a desktop app (auto-unregistered on deactivate).
 * @property {(cmd:string, fn:Function, help?:string)=>void} registerTerminalCommand
 * @property {(def:object)=>void} registerLabComponent  Add a component to the Lab catalog.
 * @property {(type:string, handler:Function)=>()=>void} on  Subscribe to a kernel event (auto-removed).
 * @property {(type:string, payload?:any)=>void} emit
 * @property {() => object} services    Read-only access to selected services (vfs, theme, projects).
 * @property {(appId:string)=>void} launch
 * @property {(key:string)=>Promise<*>} getData       Per-plugin persisted storage (namespaced).
 * @property {(key:string, value:*)=>Promise<void>} setData
 * @property {(msg:string)=>void} log
 */

/**
 * Build a scoped API for a plugin and a "teardown" recorder so the host can
 * undo all registrations when the plugin is disabled.
 * @param {import('../core/kernel.js').Kernel} kernel
 * @param {string} pluginId
 * @returns {{ api: PluginApi, teardown: () => void }}
 */
export function createPluginApi(kernel, pluginId) {
  /** @type {Array<() => void>} */
  const cleanups = [];

  /** Per-plugin terminal commands registered through the shared registry. */
  const termRegistry = ensureTerminalRegistry(kernel);

  const api = {
    pluginId,

    registerApp(def) {
      if (!def || !def.id) throw new Error('registerApp requires an "id".');
      kernel.apps.register(def);
      cleanups.push(() => kernel.apps._apps?.delete?.(def.id));
      kernel.events.emit('apps:change', { reason: 'plugin', pluginId });
    },

    registerTerminalCommand(cmd, fn, help = '') {
      if (!cmd || typeof fn !== 'function') throw new Error('registerTerminalCommand requires a name and function.');
      termRegistry.set(cmd, { fn, help, pluginId });
      cleanups.push(() => { if (termRegistry.get(cmd)?.pluginId === pluginId) termRegistry.delete(cmd); });
    },

    registerLabComponent(def) {
      const catalog = kernel.services.get('labCatalog');
      if (!catalog) throw new Error('Lab catalog not available yet.');
      catalog.add(def);
      cleanups.push(() => catalog.remove(def.type));
    },

    on(type, handler) {
      const off = kernel.events.on(type, handler);
      cleanups.push(off);
      return off;
    },

    emit(type, payload) { kernel.events.emit(type, payload); },

    services() {
      // Expose only safe, stable services (read access).
      return {
        vfs: kernel.services.get('vfs'),
        theme: kernel.services.get('theme'),
        projects: kernel.services.get('projects')
      };
    },

    launch(appId) {
      const desktop = kernel.services.get('desktop');
      desktop?.launch?.(appId);
    },

    getData(key) { return kernel.store.get(`plugin:${pluginId}:${key}`); },
    setData(key, value) { return kernel.store.set(`plugin:${pluginId}:${key}`, value); },

    log(msg) { console.log(`[plugin:${pluginId}]`, msg); }
  };

  return { api, teardown: () => { while (cleanups.length) { try { cleanups.pop()(); } catch (e) { console.warn(e); } } } };
}

/**
 * Ensure a shared terminal-command registry exists on the kernel services so
 * both the Terminal app and plugins can contribute commands.
 * @param {import('../core/kernel.js').Kernel} kernel
 * @returns {Map<string, {fn:Function, help:string, pluginId?:string}>}
 */
export function ensureTerminalRegistry(kernel) {
  let reg = kernel.services.get('terminalCommands');
  if (!reg) { reg = new Map(); kernel.services.register('terminalCommands', reg); }
  return reg;
}
