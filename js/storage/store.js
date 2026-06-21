/**
 * PriyangshuX8 Workspace - Storage Layer
 * A clean async key/value API backed by IndexedDB, with an automatic
 * LocalStorage fallback. Used for settings now and the virtual filesystem later.
 */

/** @typedef {Object} StoreOptions @property {string} dbName @property {string} storeName */

class IndexedDbBackend {
  /** @param {StoreOptions} opts */
  constructor({ dbName, storeName }) {
    this.dbName = dbName;
    this.storeName = storeName;
    /** @type {IDBDatabase|null} */
    this._db = null;
  }

  /** @returns {Promise<IDBDatabase>} */
  _open() {
    if (this._db) return Promise.resolve(this._db);
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.dbName, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName);
        }
      };
      req.onsuccess = () => {
        this._db = req.result;
        resolve(this._db);
      };
      req.onerror = () => reject(req.error);
    });
  }

  /** @param {IDBTransactionMode} mode @returns {Promise<IDBObjectStore>} */
  async _tx(mode) {
    const db = await this._open();
    return db.transaction(this.storeName, mode).objectStore(this.storeName);
  }

  async get(key) {
    const os = await this._tx('readonly');
    return new Promise((resolve, reject) => {
      const r = os.get(key);
      r.onsuccess = () => resolve(r.result === undefined ? null : r.result);
      r.onerror = () => reject(r.error);
    });
  }

  async set(key, value) {
    const os = await this._tx('readwrite');
    return new Promise((resolve, reject) => {
      const r = os.put(value, key);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  }

  async remove(key) {
    const os = await this._tx('readwrite');
    return new Promise((resolve, reject) => {
      const r = os.delete(key);
      r.onsuccess = () => resolve(true);
      r.onerror = () => reject(r.error);
    });
  }

  async keys() {
    const os = await this._tx('readonly');
    return new Promise((resolve, reject) => {
      const r = os.getAllKeys();
      r.onsuccess = () => resolve(Array.from(r.result));
      r.onerror = () => reject(r.error);
    });
  }
}

class LocalStorageBackend {
  /** @param {StoreOptions} opts */
  constructor({ dbName, storeName }) {
    this.prefix = `${dbName}:${storeName}:`;
  }
  async get(key) {
    const raw = localStorage.getItem(this.prefix + key);
    return raw === null ? null : JSON.parse(raw);
  }
  async set(key, value) {
    localStorage.setItem(this.prefix + key, JSON.stringify(value));
    return true;
  }
  async remove(key) {
    localStorage.removeItem(this.prefix + key);
    return true;
  }
  async keys() {
    const out = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(this.prefix)) out.push(k.slice(this.prefix.length));
    }
    return out;
  }
}

/**
 * Async key/value store. Chooses IndexedDB when available, otherwise LocalStorage.
 */
export class Store {
  /** @param {StoreOptions} [opts] */
  constructor(opts = { dbName: 'priyangshux8', storeName: 'kv' }) {
    const supportsIdb = typeof indexedDB !== 'undefined';
    /** @type {IndexedDbBackend|LocalStorageBackend} */
    this._backend = supportsIdb ? new IndexedDbBackend(opts) : new LocalStorageBackend(opts);
  }

  /** @param {string} key @returns {Promise<*>} */
  get(key) { return this._backend.get(key); }
  /** @param {string} key @param {*} value @returns {Promise<boolean>} */
  set(key, value) { return this._backend.set(key, value); }
  /** @param {string} key @returns {Promise<boolean>} */
  remove(key) { return this._backend.remove(key); }
  /** @returns {Promise<string[]>} */
  keys() { return this._backend.keys(); }
}
