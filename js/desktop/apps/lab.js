/**
 * PriyangshuX8 Workspace - PX8 Lab app
 * A Canvas-2D electronics workbench. Place components from a palette, move /
 * rotate / duplicate / delete them, wire pin-to-pin, edit per-component
 * properties, and pan / zoom the canvas. The circuit model (components + wires)
 * is the same data the Simulation Engine (Slice 5) will animate. Projects save
 * to the VFS as a .px8lab JSON file.
 */
import { getDef, groupedCatalog } from '../../lab/components.js';
import { SimulationEngine } from '../../simulator/engine.js';

let INST_SEQ = 0;
const LAB_FILE = '/home/projects/untitled.px8lab';

/** @param {import('../../core/kernel.js').Kernel} kernel */
export function registerLab(kernel) {
  kernel.apps.register({
    id: 'px8-lab',
    title: 'PX8 Lab',
    icon: '🔧',
    defaultSize: { width: 900, height: 600 },
    render: () => buildLab(kernel)
  });
}

/** @param {import('../../core/kernel.js').Kernel} kernel @returns {HTMLElement} */
function buildLab(kernel) {
  const vfs = kernel.services.get('vfs');
  const root = document.createElement('div');
  root.className = 'lab';
  root.innerHTML = `
    <aside class="lab__palette" data-role="palette"></aside>
    <div class="lab__center">
      <div class="lab__toolbar">
        <button class="lab__btn" data-act="save" title="Save project">Save</button>
        <button class="lab__btn" data-act="load" title="Load project">Load</button>
        <span class="lab__spacer"></span>
        <button class="lab__btn" data-act="wire" data-role="wire-btn" title="Toggle wiring mode">Wire: off</button>
        <button class="lab__btn" data-act="rotate" title="Rotate selected (R)">Rotate</button>
        <button class="lab__btn" data-act="duplicate" title="Duplicate selected (D)">Duplicate</button>
        <button class="lab__btn lab__btn--danger" data-act="delete" title="Delete selected (Del)">Delete</button>
        <span class="lab__spacer"></span>
        <button class="lab__btn" data-act="zoomout">−</button>
        <span class="lab__zoom" data-role="zoom">100%</span>
        <button class="lab__btn" data-act="zoomin">+</button>
        <button class="lab__btn" data-act="fit">Reset</button>
        <span class="lab__sim">
          <button class="lab__btn lab__btn--run" data-act="sim-start" title="Run simulation">▶ Run</button>
          <button class="lab__btn lab__btn--stop" data-act="sim-stop" title="Stop simulation">■ Stop</button>
          <button class="lab__btn" data-act="sim-reset" title="Reset simulation">⟲</button>
          <span class="lab__sim-state" data-role="sim-state">idle</span>
          <button class="lab__btn" data-act="serial" title="Serial Monitor">Serial</button>
        </span>
      </div>
      <div class="lab__canvas-wrap" data-role="wrap">
        <canvas class="lab__canvas" data-role="canvas"></canvas>
      </div>
    </div>
    <aside class="lab__props" data-role="props">
      <div class="lab__props-empty">Select a component to edit its properties.</div>
    </aside>
  `;

  const canvas = root.querySelector('[data-role="canvas"]');
  const wrap = root.querySelector('[data-role="wrap"]');
  const ctx = canvas.getContext('2d');
  const paletteEl = root.querySelector('[data-role="palette"]');
  const propsEl = root.querySelector('[data-role="props"]');
  const zoomEl = root.querySelector('[data-role="zoom"]');
  const wireBtn = root.querySelector('[data-role="wire-btn"]');

  /**
   * @typedef {Object} Instance
   * @property {string} id @property {string} type
   * @property {number} x @property {number} y @property {number} rot (radians)
   * @property {Object} props @property {Object} [state]
   */
  /** @type {Instance[]} */
  let instances = [];
  /** @type {{from:{inst:string,pin:string}, to:{inst:string,pin:string}}[]} */
  let wires = [];
  /** @type {Instance|null} */
  let selected = null;

  const view = { x: 40, y: 40, scale: 1 };
  let wiringMode = false;
  let pendingPin = null; // { inst, pin }

  // ---------- Geometry ----------
  function worldFromScreen(sx, sy) {
    const r = canvas.getBoundingClientRect();
    return { x: (sx - r.left - view.x) / view.scale, y: (sy - r.top - view.y) / view.scale };
  }

  /** Absolute world position of a pin, accounting for rotation. */
  function pinWorld(inst, pin) {
    const def = getDef(inst.type);
    const cx = def.w / 2, cy = def.h / 2;
    const dx = pin.x - cx, dy = pin.y - cy;
    const cos = Math.cos(inst.rot), sin = Math.sin(inst.rot);
    return { x: inst.x + cx + dx * cos - dy * sin, y: inst.y + cy + dx * sin + dy * cos };
  }

  function hitInstance(wx, wy) {
    for (let i = instances.length - 1; i >= 0; i--) {
      const inst = instances[i], def = getDef(inst.type);
      const cx = inst.x + def.w / 2, cy = inst.y + def.h / 2;
      const dx = wx - cx, dy = wy - cy;
      const cos = Math.cos(-inst.rot), sin = Math.sin(-inst.rot);
      const lx = dx * cos - dy * sin + def.w / 2, ly = dx * sin + dy * cos + def.h / 2;
      if (lx >= 0 && lx <= def.w && ly >= 0 && ly <= def.h) return inst;
    }
    return null;
  }

  function hitPin(wx, wy) {
    for (const inst of instances) {
      const def = getDef(inst.type);
      for (const pin of def.pins) {
        const p = pinWorld(inst, pin);
        if (Math.hypot(p.x - wx, p.y - wy) <= 7) return { inst, pin };
      }
    }
    return null;
  }

  // ---------- Rendering ----------
  function resize() {
    const r = wrap.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = r.width * dpr; canvas.height = r.height * dpr;
    canvas.style.width = r.width + 'px'; canvas.style.height = r.height + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    draw();
  }

  function draw() {
    const w = canvas.width / (window.devicePixelRatio || 1);
    const h = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, w, h);

    // Grid.
    ctx.save();
    ctx.translate(view.x % (20 * view.scale), view.y % (20 * view.scale));
    ctx.strokeStyle = 'rgba(128,128,128,0.15)'; ctx.lineWidth = 1;
    const step = 20 * view.scale;
    for (let x = 0; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, -step); ctx.lineTo(x, h); ctx.stroke(); }
    for (let y = 0; y < h; y += step) { ctx.beginPath(); ctx.moveTo(-step, y); ctx.lineTo(w, y); ctx.stroke(); }
    ctx.restore();

    ctx.save();
    ctx.translate(view.x, view.y); ctx.scale(view.scale, view.scale);

    // Wires (under components).
    ctx.lineWidth = 2.5; ctx.strokeStyle = '#5b8cff';
    for (const wire of wires) {
      const a = resolvePin(wire.from), b = resolvePin(wire.to);
      if (!a || !b) continue;
      ctx.beginPath(); ctx.moveTo(a.x, a.y);
      const midX = (a.x + b.x) / 2;
      ctx.bezierCurveTo(midX, a.y, midX, b.y, b.x, b.y);
      ctx.stroke();
    }

    // Pending wire preview.
    if (wiringMode && pendingPin) {
      const a = resolvePin(pendingPin);
      if (a && lastMouse) { ctx.setLineDash([5, 4]); ctx.strokeStyle = '#6fe0a8';
        ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(lastMouse.x, lastMouse.y); ctx.stroke(); ctx.setLineDash([]); }
    }

    // Components.
    for (const inst of instances) {
      const def = getDef(inst.type);
      ctx.save();
      ctx.translate(inst.x + def.w / 2, inst.y + def.h / 2);
      ctx.rotate(inst.rot);
      ctx.translate(-def.w / 2, -def.h / 2);
      if (inst === selected) {
        ctx.save(); ctx.strokeStyle = '#6fe0a8'; ctx.lineWidth = 2; ctx.setLineDash([4, 3]);
        ctx.strokeRect(-4, -4, def.w + 8, def.h + 8); ctx.restore();
      }
      def.draw(ctx, inst, def);
      // Pins.
      for (const pin of def.pins) {
        ctx.beginPath(); ctx.arc(pin.x, pin.y, 3, 0, Math.PI * 2);
        ctx.fillStyle = wiringMode ? '#6fe0a8' : 'rgba(120,120,120,0.7)'; ctx.fill();
      }
      ctx.restore();
    }
    ctx.restore();
  }

  function resolvePin(ref) {
    const inst = instances.find((i) => i.id === ref.inst);
    if (!inst) return null;
    const def = getDef(inst.type);
    const pin = def.pins.find((p) => p.id === ref.pin);
    if (!pin) return null;
    return pinWorld(inst, pin);
  }

  // ---------- Interaction ----------
  let dragInst = null, dragOff = null, panning = false, panStart = null;
  let lastMouse = null;

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    const w = worldFromScreen(e.clientX, e.clientY);
    if (wiringMode) {
      const ph = hitPin(w.x, w.y);
      if (ph) {
        if (!pendingPin) pendingPin = { inst: ph.inst.id, pin: ph.pin.id };
        else {
          if (pendingPin.inst !== ph.inst.id || pendingPin.pin !== ph.pin.id) {
            wires.push({ from: pendingPin, to: { inst: ph.inst.id, pin: ph.pin.id } });
          }
          pendingPin = null;
        }
        draw(); return;
      }
      pendingPin = null; draw(); return;
    }
    const hit = hitInstance(w.x, w.y);
    if (hit) {
      select(hit); dragInst = hit; dragOff = { x: w.x - hit.x, y: w.y - hit.y };
    } else {
      select(null); panning = true; panStart = { x: e.clientX - view.x, y: e.clientY - view.y };
    }
    draw();
  });

  canvas.addEventListener('pointermove', (e) => {
    lastMouse = worldFromScreen(e.clientX, e.clientY);
    if (dragInst) {
      dragInst.x = Math.round((lastMouse.x - dragOff.x) / 5) * 5;
      dragInst.y = Math.round((lastMouse.y - dragOff.y) / 5) * 5;
      draw();
    } else if (panning) {
      view.x = e.clientX - panStart.x; view.y = e.clientY - panStart.y; draw();
    } else if (wiringMode && pendingPin) { draw(); }
  });

  const endPointer = (e) => { dragInst = null; panning = false; try { canvas.releasePointerCapture(e.pointerId); } catch {} };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);

  // Double-click a board to open its sketch in Code Studio.
  canvas.addEventListener('dblclick', (e) => {
    const w = worldFromScreen(e.clientX, e.clientY);
    const hit = hitInstance(w.x, w.y);
    if (hit && hit.props.sketch) {
      if (!vfs.exists(hit.props.sketch)) vfs.writeFile(hit.props.sketch, defaultSketch(hit.type));
      kernel.events.emit('code:open', { path: hit.props.sketch });
    }
  });

  // Zoom with wheel.
  wrap.addEventListener('wheel', (e) => {
    e.preventDefault();
    const before = worldFromScreen(e.clientX, e.clientY);
    view.scale = Math.min(3, Math.max(0.4, view.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
    const after = worldFromScreen(e.clientX, e.clientY);
    view.x += (after.x - before.x) * view.scale; view.y += (after.y - before.y) * view.scale;
    zoomEl.textContent = Math.round(view.scale * 100) + '%';
    draw();
  }, { passive: false });

  // ---------- Selection / properties ----------
  function select(inst) { selected = inst; renderProps(); draw(); }

  function renderProps() {
    if (!selected) { propsEl.innerHTML = '<div class="lab__props-empty">Select a component to edit its properties.</div>'; return; }
    const def = getDef(selected.type);
    let html = `<div class="lab__props-title">${esc(def.label)}</div>`;
    html += `<label class="lab__field"><span>Rotation</span><input type="range" min="0" max="360" step="15" value="${Math.round(selected.rot * 180 / Math.PI)}" data-prop="__rot"></label>`;
    for (const [key, val] of Object.entries(selected.props)) {
      const id = `p_${key}`;
      if (typeof val === 'boolean') {
        html += `<label class="lab__field"><span>${esc(key)}</span><input type="checkbox" data-prop="${key}" ${val ? 'checked' : ''}></label>`;
      } else if (typeof val === 'number') {
        html += `<label class="lab__field"><span>${esc(key)}</span><input type="number" data-prop="${key}" value="${val}"></label>`;
      } else {
        html += `<label class="lab__field"><span>${esc(key)}</span><input type="text" data-prop="${key}" value="${esc(String(val))}"></label>`;
      }
    }
    html += `<div class="lab__props-id">id: ${selected.id}</div>`;
    propsEl.innerHTML = html;
    propsEl.querySelectorAll('[data-prop]').forEach((el) => {
      el.addEventListener('input', () => {
        const key = el.dataset.prop;
        if (key === '__rot') { selected.rot = Number(el.value) * Math.PI / 180; draw(); return; }
        if (el.type === 'checkbox') selected.props[key] = el.checked;
        else if (el.type === 'number') selected.props[key] = Number(el.value);
        else selected.props[key] = el.value;
        draw();
      });
    });
  }

  // ---------- Palette ----------
  function renderPalette() {
    const groups = groupedCatalog();
    let html = '<div class="lab__palette-title">Components</div>';
    for (const [group, defs] of Object.entries(groups)) {
      html += `<div class="lab__group">${esc(group)}</div>`;
      for (const def of defs) {
        html += `<button class="lab__pal-item" data-type="${def.type}"><span>${def.icon}</span><span>${esc(def.label)}</span></button>`;
      }
    }
    paletteEl.innerHTML = html;
    paletteEl.querySelectorAll('[data-type]').forEach((b) => {
      b.addEventListener('click', () => addComponent(b.dataset.type));
    });
  }

  function addComponent(type) {
    const def = getDef(type);
    if (!def) return;
    const center = worldFromScreen(canvas.getBoundingClientRect().left + canvas.clientWidth / 2,
      canvas.getBoundingClientRect().top + canvas.clientHeight / 2);
    const inst = {
      id: `c${++INST_SEQ}`, type, x: Math.round(center.x - def.w / 2), y: Math.round(center.y - def.h / 2),
      rot: 0, props: JSON.parse(JSON.stringify(def.props))
    };
    instances.push(inst); select(inst);
  }

  // ---------- Toolbar ----------
  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (!act) return;
    if (act === 'save') await saveProject();
    else if (act === 'load') await loadProject();
    else if (act === 'wire') { wiringMode = !wiringMode; pendingPin = null; wireBtn.textContent = `Wire: ${wiringMode ? 'on' : 'off'}`; wireBtn.classList.toggle('lab__btn--active', wiringMode); draw(); }
    else if (act === 'rotate' && selected) { selected.rot = (selected.rot + Math.PI / 2) % (Math.PI * 2); renderProps(); draw(); }
    else if (act === 'duplicate' && selected) {
      const copy = JSON.parse(JSON.stringify(selected)); copy.id = `c${++INST_SEQ}`; copy.x += 20; copy.y += 20;
      instances.push(copy); select(copy);
    } else if (act === 'delete' && selected) { removeSelected(); }
    else if (act === 'zoomin') { view.scale = Math.min(3, view.scale * 1.15); zoomEl.textContent = Math.round(view.scale * 100) + '%'; draw(); }
    else if (act === 'zoomout') { view.scale = Math.max(0.4, view.scale * 0.87); zoomEl.textContent = Math.round(view.scale * 100) + '%'; draw(); }
    else if (act === 'fit') { view.x = 40; view.y = 40; view.scale = 1; zoomEl.textContent = '100%'; draw(); }
    else if (act === 'sim-start') startSim();
    else if (act === 'sim-stop') sim.stop();
    else if (act === 'sim-reset') sim.reset();
    else if (act === 'serial') { ensureSerial(); serialPanel.hidden = false; }
  });

  function removeSelected() {
    wires = wires.filter((w) => w.from.inst !== selected.id && w.to.inst !== selected.id);
    instances = instances.filter((i) => i !== selected);
    select(null);
  }

  // Keyboard shortcuts (scoped to when this app has focus).
  root.setAttribute('tabindex', '0');
  root.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;
    if (e.key === 'Delete' && selected) { e.preventDefault(); removeSelected(); }
    else if ((e.key === 'r' || e.key === 'R') && selected) { selected.rot = (selected.rot + Math.PI / 2) % (Math.PI * 2); renderProps(); draw(); }
    else if ((e.key === 'd' || e.key === 'D') && selected) {
      const copy = JSON.parse(JSON.stringify(selected)); copy.id = `c${++INST_SEQ}`; copy.x += 20; copy.y += 20; instances.push(copy); select(copy);
    }
  });

  // ---------- Persistence ----------
  async function saveProject() {
    const data = { version: 1, instances, wires, seq: INST_SEQ };
    try { await vfs.writeFile(LAB_FILE, JSON.stringify(data, null, 2)); flash('Saved to ' + LAB_FILE); }
    catch (err) { alert(err.message); }
  }

  async function loadProject() {
    if (!vfs.isFile(LAB_FILE)) { flash('No saved project yet.'); return; }
    try {
      const data = JSON.parse(vfs.readFile(LAB_FILE));
      instances = data.instances || []; wires = data.wires || []; INST_SEQ = data.seq || instances.length;
      select(null); draw(); flash('Loaded project.');
    } catch (err) { alert('Failed to load: ' + err.message); }
  }

  function flash(msg) {
    const el = document.createElement('div'); el.className = 'lab__flash'; el.textContent = msg;
    root.appendChild(el); setTimeout(() => el.remove(), 1600);
  }

  // ---------- Simulation ----------
  const sim = new SimulationEngine(kernel);
  kernel.services.register('sim', sim); // share with the 3D/Physics Studio
  const stateEl = root.querySelector('[data-role="sim-state"]');
  let serialPanel = null;

  function startSim() {
    sim.build({ instances, wires });
    const errs = sim.errors();
    if (errs.length) appendSerial('Compile notes:\n' + errs.join('\n') + '\n', true);
    sim.start();
  }

  function ensureSerial() {
    if (serialPanel) { serialPanel.hidden = false; return; }
    serialPanel = document.createElement('div');
    serialPanel.className = 'serial';
    serialPanel.innerHTML = `
      <div class="serial__bar">
        <span class="serial__title">Serial Monitor</span>
        <span class="serial__spacer"></span>
        <button class="serial__btn" data-s="clear">Clear</button>
        <button class="serial__btn" data-s="close">Close</button>
      </div>
      <div class="serial__out" data-role="serial-out"></div>`;
    wrap.appendChild(serialPanel);
    serialPanel.addEventListener('click', (e) => {
      const s = e.target.closest('[data-s]')?.dataset.s;
      if (s === 'clear') serialPanel.querySelector('[data-role="serial-out"]').textContent = '';
      else if (s === 'close') serialPanel.hidden = true;
    });
  }

  function appendSerial(text, isErr) {
    ensureSerial();
    const out = serialPanel.querySelector('[data-role="serial-out"]');
    const span = document.createElement('span');
    if (isErr) span.className = 'serial__err';
    span.textContent = text;
    out.appendChild(span);
    out.scrollTop = out.scrollHeight;
  }

  const offFrame = kernel.events.on('sim:frame', () => draw());
  const offSerial = kernel.events.on('sim:serial', ({ text }) => appendSerial(text, false));
  const offState = kernel.events.on('sim:state', ({ running }) => {
    stateEl.textContent = running ? 'running' : 'stopped';
    stateEl.classList.toggle('lab__sim-state--on', running);
  });

  // ---------- Lifecycle ----------
  renderPalette();
  // Resize when the window resizes (observe the wrap element).
  const ro = new ResizeObserver(() => resize());
  ro.observe(wrap);
  root.addEventListener('px8:disconnect', () => { ro.disconnect(); sim.stop(); offFrame(); offSerial(); offState(); offProject(); });
  // Initial sizing after the element is in the DOM.
  requestAnimationFrame(resize);

  // Auto-load any existing project.
  setTimeout(() => { if (vfs.isFile(LAB_FILE)) loadProject(); }, 60);

  return root;
}

/** @param {string} type @returns {string} */
function defaultSketch(type) {
  if (type === 'esp32' || type === 'esp8266') {
    return '// ESP32/ESP8266 sketch\nvoid setup() {\n  pinMode(2, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(2, HIGH);\n  delay(500);\n  digitalWrite(2, LOW);\n  delay(500);\n}\n';
  }
  return '// Arduino sketch\nvoid setup() {\n  pinMode(13, OUTPUT);\n}\n\nvoid loop() {\n  digitalWrite(13, HIGH);\n  delay(500);\n  digitalWrite(13, LOW);\n  delay(500);\n}\n';
}

function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
