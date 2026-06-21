/**
 * PriyangshuX8 Workspace - Theme Engine
 * Drives CSS custom properties for dark/light mode, accent color, animations
 * toggle, and a performance mode for low-end devices. Settings persist via the
 * kernel store and broadcast over the event bus.
 */

/** @typedef {Object} ThemeState
 * @property {'dark'|'light'} mode
 * @property {string} accent          CSS color, e.g. "#5b8cff".
 * @property {boolean} animations
 * @property {boolean} performance
 */

const STORAGE_KEY = 'settings.theme';

/** @type {ThemeState} */
const DEFAULTS = {
  mode: 'dark',
  accent: '#5b8cff',
  animations: true,
  performance: false
};

export class ThemeEngine {
  /** @param {import('../core/kernel.js').Kernel} kernel */
  constructor(kernel) {
    this.kernel = kernel;
    /** @type {ThemeState} */
    this.state = { ...DEFAULTS };
  }

  /** Load persisted settings and apply them. @returns {Promise<void>} */
  async init() {
    const saved = await this.kernel.store.get(STORAGE_KEY);
    if (saved && typeof saved === 'object') this.state = { ...DEFAULTS, ...saved };

    // Auto-enable performance mode on low-core / low-memory devices, once.
    if (saved == null) {
      const cores = navigator.hardwareConcurrency || 4;
      const mem = navigator.deviceMemory || 4;
      if (cores <= 4 || mem <= 2) this.state.performance = true;
    }
    this.apply();
  }

  /** Apply the current state to the document root. */
  apply() {
    const root = document.documentElement;
    root.setAttribute('data-theme', this.state.mode);
    root.style.setProperty('--accent', this.state.accent);
    root.classList.toggle('no-animations', !this.state.animations || this.state.performance);
    root.classList.toggle('performance', this.state.performance);
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', this.state.mode === 'dark' ? '#0b1020' : '#eef1f8');
    this.kernel.events.emit('theme:change', { ...this.state });
  }

  /** @param {Partial<ThemeState>} patch */
  async update(patch) {
    this.state = { ...this.state, ...patch };
    this.apply();
    await this.kernel.store.set(STORAGE_KEY, this.state);
  }

  /** Toggle dark/light and persist. */
  async toggleMode() {
    await this.update({ mode: this.state.mode === 'dark' ? 'light' : 'dark' });
  }
}
