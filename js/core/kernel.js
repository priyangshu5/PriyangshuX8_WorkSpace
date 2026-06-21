/**
 * PriyangshuX8 Workspace - Microkernel
 * Provides an event bus (pub/sub), a service registry, and a simple app
 * registry. Future slices register apps and services here. A single shared
 * `kernel` instance is exported and used across the whole workspace.
 */
import { Store } from '../storage/store.js';

class EventBus {
  constructor() {
    /** @type {Map<string, Set<Function>>} */
    this._listeners = new Map();
  }
  /** @param {string} type @param {Function} handler @returns {() => void} unsubscribe */
  on(type, handler) {
    if (!this._listeners.has(type)) this._listeners.set(type, new Set());
    this._listeners.get(type).add(handler);
    return () => this.off(type, handler);
  }
  /** @param {string} type @param {Function} handler */
  off(type, handler) {
    const set = this._listeners.get(type);
    if (set) set.delete(handler);
  }
  /** @param {string} type @param {*} [payload] */
  emit(type, payload) {
    const set = this._listeners.get(type);
    if (set) for (const h of [...set]) {
      try { h(payload); } catch (e) { console.error(`[PX8] handler error for "${type}":`, e); }
    }
  }
}

class ServiceRegistry {
  constructor() {
    /** @type {Map<string, *>} */
    this._services = new Map();
  }
  /** @param {string} name @param {*} instance */
  register(name, instance) {
    this._services.set(name, instance);
    return instance;
  }
  /** @param {string} name @returns {*} */
  get(name) { return this._services.get(name) ?? null; }
  /** @param {string} name @returns {boolean} */
  has(name) { return this._services.has(name); }
}

/**
 * @typedef {Object} AppDefinition
 * @property {string} id              Unique app id, e.g. "px8-about".
 * @property {string} title           Display name in the start menu / taskbar.
 * @property {string} [icon]          Short text/emoji icon.
 * @property {(ctx: AppLaunchContext) => HTMLElement} render  Returns the window body element.
 * @property {{width?:number, height?:number}} [defaultSize]
 */

/**
 * @typedef {Object} AppLaunchContext
 * @property {Kernel} kernel
 * @property {string} windowId
 */

class AppRegistry {
  constructor() {
    /** @type {Map<string, AppDefinition>} */
    this._apps = new Map();
  }
  /** @param {AppDefinition} def */
  register(def) {
    if (!def || !def.id || typeof def.render !== 'function') {
      throw new Error('[PX8] Invalid app definition.');
    }
    this._apps.set(def.id, def);
  }
  /** @param {string} id @returns {AppDefinition|null} */
  get(id) { return this._apps.get(id) ?? null; }
  /** @returns {AppDefinition[]} */
  list() { return [...this._apps.values()]; }
}

export class Kernel {
  constructor() {
    this.events = new EventBus();
    this.services = new ServiceRegistry();
    this.apps = new AppRegistry();
    this.store = new Store({ dbName: 'priyangshux8', storeName: 'kv' });
    this.version = '1.0.0';
    this._booted = false;
  }

  /** Boot the kernel once. Safe to call multiple times. @returns {Promise<void>} */
  async boot() {
    if (this._booted) return;
    this._booted = true;
    this.events.emit('kernel:boot', { version: this.version });
  }
}

/** Shared singleton kernel used across the entire workspace. */
export const kernel = new Kernel();
