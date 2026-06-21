/**
 * PriyangshuX8 Workspace - Window Manager
 * Creates draggable, resizable, focusable windows with minimize / maximize /
 * restore / close and z-index stacking. Supports both mouse (pointer) and touch
 * via Pointer Events. Windows belong to virtual desktops, managed by Desktop.
 */

let WINDOW_SEQ = 0;

/**
 * @typedef {Object} WindowOptions
 * @property {string} title
 * @property {HTMLElement} content
 * @property {string} [icon]
 * @property {number} [width]
 * @property {number} [height]
 * @property {number} [desktop]   Virtual desktop index this window belongs to.
 */

export class Px8Window {
  /**
   * @param {import('../core/kernel.js').Kernel} kernel
   * @param {WindowManager} manager
   * @param {WindowOptions} opts
   */
  constructor(kernel, manager, opts) {
    this.kernel = kernel;
    this.manager = manager;
    this.id = `win-${++WINDOW_SEQ}`;
    this.title = opts.title || 'Untitled';
    this.icon = opts.icon || '▢';
    this.desktop = opts.desktop ?? 0;
    this.minimized = false;
    this.maximized = false;
    this._restoreRect = null;

    this.el = this._build(opts);
    this._wireControls();
    this._wireDrag();
    this._wireResize();
  }

  /** @param {WindowOptions} opts @returns {HTMLElement} */
  _build(opts) {
    const w = Math.min(opts.width || 520, window.innerWidth - 20);
    const h = Math.min(opts.height || 360, window.innerHeight - 80);
    const left = Math.max(10, Math.round((window.innerWidth - w) / 2) + ((WINDOW_SEQ % 5) * 18));
    const top = Math.max(10, Math.round((window.innerHeight - h) / 3) + ((WINDOW_SEQ % 5) * 18));

    const el = document.createElement('section');
    el.className = 'win';
    el.dataset.id = this.id;
    el.style.width = `${w}px`;
    el.style.height = `${h}px`;
    el.style.transform = `translate(${left}px, ${top}px)`;
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-label', this.title);

    el.innerHTML = `
      <header class="win__bar" data-role="drag">
        <span class="win__icon">${this.icon}</span>
        <span class="win__title">${this._escape(this.title)}</span>
        <div class="win__controls">
          <button class="win__btn" data-act="min" title="Minimize" aria-label="Minimize">–</button>
          <button class="win__btn" data-act="max" title="Maximize" aria-label="Maximize">▢</button>
          <button class="win__btn win__btn--close" data-act="close" title="Close" aria-label="Close">×</button>
        </div>
      </header>
      <div class="win__body"></div>
      <div class="win__resize" data-role="resize" aria-hidden="true"></div>
    `;
    el.querySelector('.win__body').appendChild(opts.content);
    el.addEventListener('pointerdown', () => this.focus(), true);
    return el;
  }

  _wireControls() {
    this.el.querySelector('.win__controls').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      const act = btn.dataset.act;
      if (act === 'min') this.minimize();
      else if (act === 'max') this.toggleMaximize();
      else if (act === 'close') this.close();
    });
  }

  _wireDrag() {
    const handle = this.el.querySelector('[data-role="drag"]');
    let startX = 0, startY = 0, baseX = 0, baseY = 0, dragging = false;

    const parseXY = () => {
      const m = /translate\((-?\d+(?:\.\d+)?)px,\s*(-?\d+(?:\.\d+)?)px\)/.exec(this.el.style.transform);
      return m ? { x: parseFloat(m[1]), y: parseFloat(m[2]) } : { x: 0, y: 0 };
    };

    handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('button') || this.maximized) return;
      dragging = true;
      handle.setPointerCapture(e.pointerId);
      startX = e.clientX; startY = e.clientY;
      const xy = parseXY(); baseX = xy.x; baseY = xy.y;
      this.focus();
    });
    handle.addEventListener('pointermove', (e) => {
      if (!dragging) return;
      const nx = Math.max(0, Math.min(window.innerWidth - 60, baseX + (e.clientX - startX)));
      const ny = Math.max(0, Math.min(window.innerHeight - 48, baseY + (e.clientY - startY)));
      this.el.style.transform = `translate(${nx}px, ${ny}px)`;
    });
    const end = (e) => { dragging = false; try { handle.releasePointerCapture(e.pointerId); } catch {} };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  _wireResize() {
    const grip = this.el.querySelector('[data-role="resize"]');
    let sx = 0, sy = 0, sw = 0, sh = 0, resizing = false;
    grip.addEventListener('pointerdown', (e) => {
      if (this.maximized) return;
      resizing = true;
      grip.setPointerCapture(e.pointerId);
      sx = e.clientX; sy = e.clientY;
      sw = this.el.offsetWidth; sh = this.el.offsetHeight;
      e.stopPropagation();
      this.focus();
    });
    grip.addEventListener('pointermove', (e) => {
      if (!resizing) return;
      this.el.style.width = `${Math.max(280, sw + (e.clientX - sx))}px`;
      this.el.style.height = `${Math.max(180, sh + (e.clientY - sy))}px`;
    });
    const end = (e) => { resizing = false; try { grip.releasePointerCapture(e.pointerId); } catch {} };
    grip.addEventListener('pointerup', end);
    grip.addEventListener('pointercancel', end);
  }

  focus() { this.manager.focus(this); }

  minimize() {
    this.minimized = true;
    this.el.classList.add('win--minimized');
    this.manager.notifyChange();
  }

  restore() {
    this.minimized = false;
    this.el.classList.remove('win--minimized');
    this.focus();
    this.manager.notifyChange();
  }

  toggleMaximize() {
    if (this.maximized) {
      this.maximized = false;
      this.el.classList.remove('win--maximized');
      if (this._restoreRect) {
        this.el.style.width = this._restoreRect.w;
        this.el.style.height = this._restoreRect.h;
        this.el.style.transform = this._restoreRect.t;
      }
    } else {
      this._restoreRect = { w: this.el.style.width, h: this.el.style.height, t: this.el.style.transform };
      this.maximized = true;
      this.el.classList.add('win--maximized');
    }
    this.focus();
  }

  close() {
    this.el.classList.add('win--closing');
    const done = () => { this.el.remove(); this.manager._remove(this); };
    this.el.addEventListener('animationend', done, { once: true });
    // Fallback if animations are disabled.
    setTimeout(done, 220);
  }

  /** @param {string} s @returns {string} */
  _escape(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
}

export class WindowManager {
  /** @param {import('../core/kernel.js').Kernel} kernel @param {HTMLElement} layer */
  constructor(kernel, layer) {
    this.kernel = kernel;
    this.layer = layer;
    /** @type {Px8Window[]} */
    this.windows = [];
    this._z = 10;
    /** @type {Px8Window|null} */
    this.active = null;
  }

  /** @param {WindowOptions} opts @returns {Px8Window} */
  open(opts) {
    const win = new Px8Window(this.kernel, this, opts);
    this.windows.push(win);
    this.layer.appendChild(win.el);
    this.focus(win);
    this.notifyChange();
    this.kernel.events.emit('window:open', { id: win.id, title: win.title });
    return win;
  }

  /** @param {Px8Window} win */
  focus(win) {
    if (win.minimized) win.restore();
    this.active = win;
    win.el.style.zIndex = String(++this._z);
    this.windows.forEach((w) => w.el.classList.toggle('win--active', w === win));
    this.notifyChange();
  }

  /** @param {Px8Window} win */
  _remove(win) {
    this.windows = this.windows.filter((w) => w !== win);
    if (this.active === win) this.active = this.windows[this.windows.length - 1] || null;
    if (this.active) this.focus(this.active);
    this.notifyChange();
    this.kernel.events.emit('window:close', { id: win.id });
  }

  /** Show only windows belonging to the given virtual desktop. @param {number} index */
  showDesktop(index) {
    this.windows.forEach((w) => { w.el.style.display = w.desktop === index ? '' : 'none'; });
    this.notifyChange();
  }

  /** Cycle focus to the next visible, non-minimized window (Alt+Tab style). */
  cycle() {
    const visible = this.windows.filter((w) => w.el.style.display !== 'none');
    if (!visible.length) return;
    const idx = visible.indexOf(this.active);
    const next = visible[(idx + 1) % visible.length];
    this.focus(next);
  }

  notifyChange() { this.kernel.events.emit('windows:change', { count: this.windows.length }); }
}
