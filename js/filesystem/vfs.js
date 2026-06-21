/**
 * PriyangshuX8 Workspace - Virtual File System (VFS)
 * A persistent in-browser filesystem stored as a single JSON tree in the kernel
 * Store (IndexedDB + LocalStorage fallback). Provides POSIX-like path operations
 * used by the File Manager, Terminal, and future Code Studio.
 *
 * Tree node shape:
 *   { type: 'dir', children: { name: node, ... } }
 *   { type: 'file', content: string }
 */

const VFS_KEY = 'vfs.tree';

/** @returns {object} A fresh default filesystem with starter folders. */
function defaultTree() {
  return {
    type: 'dir',
    children: {
      home: {
        type: 'dir',
        children: {
          projects: { type: 'dir', children: {} },
          documents: {
            type: 'dir',
            children: {
              'welcome.txt': {
                type: 'file',
                content:
                  'Welcome to PriyangshuX8 Workspace.\n\n' +
                  'This is your virtual filesystem. Use the File Manager or the\n' +
                  'Terminal (type "help") to explore. Files persist in your browser.\n'
              }
            }
          }
        }
      },
      tmp: { type: 'dir', children: {} }
    }
  };
}

export class VFS {
  /** @param {import('../core/kernel.js').Kernel} kernel */
  constructor(kernel) {
    this.kernel = kernel;
    /** @type {object} */
    this.tree = defaultTree();
  }

  /** Load the persisted tree (or seed defaults). @returns {Promise<void>} */
  async init() {
    const saved = await this.kernel.store.get(VFS_KEY);
    if (saved && saved.type === 'dir') this.tree = saved;
    else await this._persist();
  }

  /** Persist the whole tree. @returns {Promise<void>} */
  async _persist() {
    await this.kernel.store.set(VFS_KEY, this.tree);
    this.kernel.events.emit('vfs:change', {});
  }

  /**
   * Normalize a path into an array of segments. Supports absolute paths only
   * (callers resolve relative paths against a cwd first).
   * @param {string} path
   * @returns {string[]}
   */
  static split(path) {
    const parts = [];
    for (const seg of String(path).split('/')) {
      if (seg === '' || seg === '.') continue;
      if (seg === '..') { parts.pop(); continue; }
      parts.push(seg);
    }
    return parts;
  }

  /**
   * Resolve a (possibly relative) path against a current working directory.
   * @param {string} cwd Absolute cwd, e.g. "/home".
   * @param {string} path
   * @returns {string} Absolute normalized path starting with "/".
   */
  static resolve(cwd, path) {
    const base = path.startsWith('/') ? [] : VFS.split(cwd);
    const combined = base.concat(VFS.split(path));
    return '/' + combined.join('/');
  }

  /**
   * Get the node at an absolute path.
   * @param {string} path
   * @returns {object|null}
   */
  getNode(path) {
    const parts = VFS.split(path);
    let node = this.tree;
    for (const seg of parts) {
      if (node.type !== 'dir' || !node.children[seg]) return null;
      node = node.children[seg];
    }
    return node;
  }

  /** @param {string} path @returns {boolean} */
  exists(path) { return this.getNode(path) !== null; }

  /** @param {string} path @returns {boolean} */
  isDir(path) { const n = this.getNode(path); return !!n && n.type === 'dir'; }

  /** @param {string} path @returns {boolean} */
  isFile(path) { const n = this.getNode(path); return !!n && n.type === 'file'; }

  /**
   * List directory entry names (sorted: dirs first, then files).
   * @param {string} path
   * @returns {{name:string,type:'dir'|'file'}[]}
   */
  list(path) {
    const node = this.getNode(path);
    if (!node || node.type !== 'dir') throw new Error(`Not a directory: ${path}`);
    return Object.entries(node.children)
      .map(([name, n]) => ({ name, type: n.type }))
      .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'dir' ? -1 : 1));
  }

  /** Split an absolute path into [parentPath, name]. @param {string} path */
  static parent(path) {
    const parts = VFS.split(path);
    const name = parts.pop() ?? '';
    return ['/' + parts.join('/'), name];
  }

  /** @param {string} path @returns {Promise<void>} */
  async mkdir(path) {
    const parts = VFS.split(path);
    let node = this.tree;
    for (const seg of parts) {
      if (node.type !== 'dir') throw new Error(`Not a directory in path: ${seg}`);
      if (!node.children[seg]) node.children[seg] = { type: 'dir', children: {} };
      else if (node.children[seg].type !== 'dir') throw new Error(`File exists: ${seg}`);
      node = node.children[seg];
    }
    await this._persist();
  }

  /**
   * Create or overwrite a file.
   * @param {string} path @param {string} [content] @returns {Promise<void>}
   */
  async writeFile(path, content = '') {
    const [parentPath, name] = VFS.parent(path);
    if (!name) throw new Error('Invalid file name.');
    const parent = this.getNode(parentPath);
    if (!parent || parent.type !== 'dir') throw new Error(`No such directory: ${parentPath}`);
    if (parent.children[name] && parent.children[name].type === 'dir') {
      throw new Error(`Is a directory: ${path}`);
    }
    parent.children[name] = { type: 'file', content: String(content) };
    await this._persist();
  }

  /** @param {string} path @returns {string} */
  readFile(path) {
    const node = this.getNode(path);
    if (!node) throw new Error(`No such file: ${path}`);
    if (node.type !== 'file') throw new Error(`Is a directory: ${path}`);
    return node.content;
  }

  /** Remove a file or directory (recursively). @param {string} path @returns {Promise<void>} */
  async remove(path) {
    const [parentPath, name] = VFS.parent(path);
    const parent = this.getNode(parentPath);
    if (!parent || parent.type !== 'dir' || !parent.children[name]) {
      throw new Error(`No such file or directory: ${path}`);
    }
    delete parent.children[name];
    await this._persist();
  }

  /** Rename/move an entry. @param {string} from @param {string} to @returns {Promise<void>} */
  async move(from, to) {
    const node = this.getNode(from);
    if (!node) throw new Error(`No such file or directory: ${from}`);
    const [toParentPath, toName] = VFS.parent(to);
    const toParent = this.getNode(toParentPath);
    if (!toParent || toParent.type !== 'dir') throw new Error(`No such directory: ${toParentPath}`);
    if (toParent.children[toName]) throw new Error(`Target exists: ${to}`);
    const [fromParentPath, fromName] = VFS.parent(from);
    const fromParent = this.getNode(fromParentPath);
    toParent.children[toName] = node;
    delete fromParent.children[fromName];
    await this._persist();
  }

  /** Deep clone for duplication. @param {object} node @returns {object} */
  static clone(node) { return JSON.parse(JSON.stringify(node)); }

  /** Copy an entry. @param {string} from @param {string} to @returns {Promise<void>} */
  async copy(from, to) {
    const node = this.getNode(from);
    if (!node) throw new Error(`No such file or directory: ${from}`);
    const [toParentPath, toName] = VFS.parent(to);
    const toParent = this.getNode(toParentPath);
    if (!toParent || toParent.type !== 'dir') throw new Error(`No such directory: ${toParentPath}`);
    if (toParent.children[toName]) throw new Error(`Target exists: ${to}`);
    toParent.children[toName] = VFS.clone(node);
    await this._persist();
  }
}
