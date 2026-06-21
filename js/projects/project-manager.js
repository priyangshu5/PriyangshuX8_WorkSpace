/**
 * PriyangshuX8 Workspace - Project Manager
 * A project is a folder under /home/projects/<name>/ containing:
 *   - project.json   metadata (name, created, type)
 *   - sketch.ino     the board code
 *   - circuit.px8lab the Lab circuit model
 * This module creates projects from templates, lists/opens/renames/deletes
 * them, tracks the active project, and imports/exports projects as ZIP files
 * using JSZip (lazily loaded from a pinned CDN, like Three.js in Slice 6).
 */

const JSZIP_URL = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
const ROOT = '/home/projects';
const ACTIVE_KEY = 'projects.active';

let JSZipCtor = null;

/** Lazily load JSZip once (UMD build attaches to window.JSZip). */
async function ensureJSZip() {
  if (JSZipCtor) return JSZipCtor;
  if (window.JSZip) { JSZipCtor = window.JSZip; return JSZipCtor; }
  await new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = JSZIP_URL; s.onload = resolve; s.onerror = () => reject(new Error('Failed to load JSZip (needs internet on first use).'));
    document.head.appendChild(s);
  });
  JSZipCtor = window.JSZip;
  return JSZipCtor;
}

/** @returns {Record<string, {label:string, sketch:string, circuit:object}>} */
export const TEMPLATES = {
  empty: {
    label: 'Empty Project',
    sketch: '// New PriyangshuX8 sketch\nvoid setup() {\n}\n\nvoid loop() {\n}\n',
    circuit: { version: 1, instances: [], wires: [], seq: 0 }
  },
  blink: {
    label: 'Blink (Arduino + LED)',
    sketch:
      '// Blink: toggles the LED on pin 13.\n' +
      'void setup() {\n  pinMode(13, OUTPUT);\n  Serial.begin(9600);\n}\n\n' +
      'void loop() {\n  digitalWrite(13, HIGH);\n  Serial.println("on");\n  delay(500);\n' +
      '  digitalWrite(13, LOW);\n  Serial.println("off");\n  delay(500);\n}\n',
    circuit: {
      version: 1, seq: 2, wires: [{ from: { inst: 'c1', pin: 'D13' }, to: { inst: 'c2', pin: 'A' } }],
      instances: [
        { id: 'c1', type: 'arduino-uno', x: 60, y: 80, rot: 0, props: { mcu: 'ATmega328P', sketch: '' } },
        { id: 'c2', type: 'led', x: 360, y: 120, rot: 0, props: { color: '#ff5252', on: false } }
      ]
    }
  },
  'robot-car': {
    label: 'Robot Car (2 motors)',
    sketch:
      '// Robot car: drive two motors forward.\n' +
      'void setup() {\n  pinMode(5, OUTPUT);\n  pinMode(6, OUTPUT);\n}\n\n' +
      'void loop() {\n  analogWrite(5, 200);\n  analogWrite(6, 200);\n  delay(1000);\n}\n',
    circuit: {
      version: 1, seq: 3, wires: [
        { from: { inst: 'c1', pin: 'D5' }, to: { inst: 'c2', pin: '+' } },
        { from: { inst: 'c1', pin: 'D6' }, to: { inst: 'c3', pin: '+' } }
      ],
      instances: [
        { id: 'c1', type: 'arduino-uno', x: 60, y: 80, rot: 0, props: { mcu: 'ATmega328P', sketch: '' } },
        { id: 'c2', type: 'dc-motor', x: 360, y: 60, rot: 0, props: { rpm: 0, speed: 200 } },
        { id: 'c3', type: 'dc-motor', x: 360, y: 180, rot: 0, props: { rpm: 0, speed: 200 } }
      ]
    }
  },
  'sensor-dashboard': {
    label: 'Sensor Dashboard',
    sketch:
      '// Read a potentiometer and mirror it to an LED brightness.\n' +
      'void setup() {\n  pinMode(9, OUTPUT);\n  Serial.begin(9600);\n}\n\n' +
      'void loop() {\n  int v = analogRead(0);\n  int b = map(v, 0, 1023, 0, 255);\n' +
      '  analogWrite(9, b);\n  Serial.println(v);\n  delay(100);\n}\n',
    circuit: {
      version: 1, seq: 3, wires: [
        { from: { inst: 'c1', pin: 'A0' }, to: { inst: 'c2', pin: 'W' } },
        { from: { inst: 'c1', pin: 'D9' }, to: { inst: 'c3', pin: 'A' } }
      ],
      instances: [
        { id: 'c1', type: 'arduino-uno', x: 60, y: 80, rot: 0, props: { mcu: 'ATmega328P', sketch: '' } },
        { id: 'c2', type: 'potentiometer', x: 360, y: 60, rot: 0, props: { value: 512 } },
        { id: 'c3', type: 'led', x: 360, y: 200, rot: 0, props: { color: '#52a8ff', on: false } }
      ]
    }
  }
};

export class ProjectManager {
  /** @param {import('../core/kernel.js').Kernel} kernel */
  constructor(kernel) {
    this.kernel = kernel;
    this.vfs = kernel.services.get('vfs');
  }

  /** Ensure the projects root exists. @returns {Promise<void>} */
  async init() {
    if (!this.vfs.isDir(ROOT)) await this.vfs.mkdir(ROOT);
  }

  /** @returns {{name:string, meta:object}[]} */
  list() {
    if (!this.vfs.isDir(ROOT)) return [];
    return this.vfs.list(ROOT)
      .filter((e) => e.type === 'dir')
      .map((e) => {
        let meta = { name: e.name, type: 'unknown', created: null };
        const metaPath = `${ROOT}/${e.name}/project.json`;
        if (this.vfs.isFile(metaPath)) { try { meta = JSON.parse(this.vfs.readFile(metaPath)); } catch {} }
        return { name: e.name, meta };
      });
  }

  /** @param {string} name @returns {string} */
  dir(name) { return `${ROOT}/${name}`; }

  /** Sanitize a name into a safe folder name. @param {string} name */
  static slug(name) { return String(name).trim().replace(/[^A-Za-z0-9 _-]/g, '').replace(/\s+/g, '-') || 'project'; }

  /**
   * Create a project from a template.
   * @param {string} rawName @param {string} templateKey @returns {Promise<string>} folder name
   */
  async create(rawName, templateKey) {
    const name = ProjectManager.slug(rawName);
    const dir = this.dir(name);
    if (this.vfs.isDir(dir)) throw new Error(`Project "${name}" already exists.`);
    const tpl = TEMPLATES[templateKey] || TEMPLATES.empty;

    await this.vfs.mkdir(dir);
    const sketchPath = `${dir}/sketch.ino`;
    await this.vfs.writeFile(sketchPath, tpl.sketch);

    // Point the board's "sketch" prop at this project's sketch file.
    const circuit = JSON.parse(JSON.stringify(tpl.circuit));
    for (const inst of circuit.instances) {
      if (inst.props && 'sketch' in inst.props) inst.props.sketch = sketchPath;
    }
    await this.vfs.writeFile(`${dir}/circuit.px8lab`, JSON.stringify(circuit, null, 2));
    await this.vfs.writeFile(`${dir}/project.json`, JSON.stringify(
      { name, type: templateKey, created: new Date().toISOString() }, null, 2));

    await this.setActive(name);
    return name;
  }

  /** @param {string} name @returns {Promise<void>} */
  async remove(name) {
    await this.vfs.remove(this.dir(name));
    if (await this.getActive() === name) await this.kernel.store.remove(ACTIVE_KEY);
  }

  /** @param {string} from @param {string} to @returns {Promise<void>} */
  async rename(from, to) {
    const toName = ProjectManager.slug(to);
    await this.vfs.move(this.dir(from), this.dir(toName));
    // Update metadata + sketch path references.
    const metaPath = `${this.dir(toName)}/project.json`;
    if (this.vfs.isFile(metaPath)) {
      try { const m = JSON.parse(this.vfs.readFile(metaPath)); m.name = toName; await this.vfs.writeFile(metaPath, JSON.stringify(m, null, 2)); } catch {}
    }
    if (await this.getActive() === from) await this.setActive(toName);
  }

  /** @param {string} name @returns {Promise<void>} */
  async setActive(name) { await this.kernel.store.set(ACTIVE_KEY, name); this.kernel.events.emit('project:active', { name }); }
  /** @returns {Promise<string|null>} */
  async getActive() { return this.kernel.store.get(ACTIVE_KEY); }

  /** Paths for the active project's sketch/circuit, or null. */
  async activePaths() {
    const name = await this.getActive();
    if (!name || !this.vfs.isDir(this.dir(name))) return null;
    return { name, sketch: `${this.dir(name)}/sketch.ino`, circuit: `${this.dir(name)}/circuit.px8lab` };
  }

  /**
   * Export a project to a ZIP and trigger a browser download.
   * @param {string} name @returns {Promise<void>}
   */
  async exportZip(name) {
    const JSZip = await ensureJSZip();
    const zip = new JSZip();
    const dir = this.dir(name);
    const addDir = (path, folder) => {
      for (const e of this.vfs.list(path)) {
        const full = `${path}/${e.name}`;
        if (e.type === 'dir') addDir(full, folder.folder(e.name));
        else folder.file(e.name, this.vfs.readFile(full));
      }
    };
    const rootFolder = zip.folder(name);
    addDir(dir, rootFolder);
    const blob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `${name}.zip`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }

  /**
   * Import a project from a ZIP File/Blob into /home/projects/.
   * @param {File} file @returns {Promise<string>} imported project name
   */
  async importZip(file) {
    const JSZip = await ensureJSZip();
    const zip = await JSZip.loadAsync(file);
    // Determine a root name: use the common top-level folder or the file name.
    let base = file.name.replace(/\.zip$/i, '');
    const tops = new Set();
    zip.forEach((relPath) => { const top = relPath.split('/')[0]; if (top) tops.add(top); });
    if (tops.size === 1) base = [...tops][0];
    let name = ProjectManager.slug(base);
    while (this.vfs.isDir(this.dir(name))) name = name + '-copy';

    const dir = this.dir(name);
    await this.vfs.mkdir(dir);

    const entries = [];
    zip.forEach((relPath, entry) => entries.push({ relPath, entry }));
    for (const { relPath, entry } of entries) {
      if (entry.dir) continue;
      // Strip the (possibly single) top-level folder so files land directly in the project dir.
      let rel = relPath;
      if (tops.size === 1) rel = relPath.split('/').slice(1).join('/');
      if (!rel) continue;
      const targetPath = `${dir}/${rel}`;
      const parentParts = targetPath.split('/').slice(0, -1);
      // Ensure parent folders exist.
      let acc = '';
      for (const seg of parentParts) { acc += '/' + seg; if (seg && !this.vfs.isDir(acc) && acc !== '') { if (!this.vfs.exists(acc)) await this.vfs.mkdir(acc); } }
      const content = await entry.async('string');
      await this.vfs.writeFile(targetPath, content);
    }

    // Fix sketch path references in the circuit to point at the new location.
    const circuitPath = `${dir}/circuit.px8lab`;
    if (this.vfs.isFile(circuitPath)) {
      try {
        const c = JSON.parse(this.vfs.readFile(circuitPath));
        for (const inst of c.instances || []) {
          if (inst.props && 'sketch' in inst.props) inst.props.sketch = `${dir}/sketch.ino`;
        }
        await this.vfs.writeFile(circuitPath, JSON.stringify(c, null, 2));
      } catch {}
    }
    return name;
  }
}
