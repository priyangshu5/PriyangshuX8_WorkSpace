/**
 * PriyangshuX8 Workspace - Desktop Environment
 * Builds the desktop surface, taskbar (running windows + clock + start button),
 * start menu (lists registered apps), right-click context menus, and multiple
 * virtual desktops with switching. Registers the built-in "About" demo app.
 */
import { WindowManager } from '../windows/window-manager.js';
import { VFS } from '../filesystem/vfs.js';
import { registerFileManager } from './apps/file-manager.js';
import { registerTerminal } from './apps/terminal.js';
import { registerCodeStudio } from './apps/code-studio.js';
import { registerLab } from './apps/lab.js';
import { registerStudio3D } from './apps/studio3d.js';
import { ProjectManager } from '../projects/project-manager.js';
import { registerProjects } from './apps/projects.js';
import { registerSettings } from './apps/settings.js';
import { PluginManager } from '../plugins/plugin-manager.js';
import { registerPlugins } from './apps/plugins.js';
import { AIRegistry, OfflineAssistantProvider } from '../ai/provider.js';
import { registerAssistant } from './apps/assistant.js';


const NUM_DESKTOPS = 4;

export class Desktop {
  /** @param {import('../core/kernel.js').Kernel} kernel @param {HTMLElement} root */
  constructor(kernel, root) {
    this.kernel = kernel;
    this.root = root;
    this.currentDesktop = 0;
    this.startOpen = false;
  }

  async init() {
    this.root.innerHTML = `
      <div class="wallpaper" data-role="desktop-surface"></div>
      <div class="window-layer" data-role="window-layer"></div>

      <div class="start-menu" data-role="start-menu" hidden>
        <div class="start-menu__head">PriyangshuX8</div>
        <div class="start-menu__apps" data-role="start-apps"></div>
        <div class="start-menu__foot">
          <button class="chip" data-act="theme">Toggle theme</button>
          <button class="chip" data-act="perf">Performance mode</button>
        </div>
      </div>

      <div class="context-menu" data-role="context-menu" hidden></div>

      <footer class="taskbar">
        <button class="taskbar__start" data-act="start" aria-label="Start menu">PX8</button>
        <div class="taskbar__desktops" data-role="desktops"></div>
        <div class="taskbar__windows" data-role="task-windows"></div>
        <div class="taskbar__clock" data-role="clock">--:--</div>
      </footer>
    `;

    this.layer = this.root.querySelector('[data-role="window-layer"]');
    this.wm = new WindowManager(this.kernel, this.layer);
    this.kernel.services.register('windows', this.wm);

    // Initialize the virtual filesystem before apps that depend on it.
    const vfs = new VFS(this.kernel);
    await vfs.init();
    this.kernel.services.register('vfs', vfs);

    // Project manager service (depends on VFS).
    const projects = new ProjectManager(this.kernel);
    await projects.init();
    this.kernel.services.register('projects', projects);

    this._registerBuiltinApps();
    registerFileManager(this.kernel);
    registerTerminal(this.kernel);
    registerCodeStudio(this.kernel);
    registerLab(this.kernel);
    registerStudio3D(this.kernel);
    registerProjects(this.kernel);
    registerSettings(this.kernel);
    registerPlugins(this.kernel);
    registerAssistant(this.kernel);

    // AI framework: registry + built-in offline provider (no network, no keys).
    const ai = new AIRegistry(this.kernel);
    ai.register(new OfflineAssistantProvider());
    this.kernel.services.register('ai', ai);

    // Plugin system: initialize after core apps so plugins can register safely.
    const plugins = new PluginManager(this.kernel);
    this.kernel.services.register('plugins', plugins);
    await plugins.init();
    // Refresh the start menu when plugins add/remove apps.
    this.kernel.events.on('apps:change', () => this._buildStartApps());
    this.kernel.events.on('plugins:change', () => this._buildStartApps());

    // When a file is opened for editing, ensure Code Studio is running, then
    // route the request to it via the kernel event bus.
    this.kernel.events.on('code:open', () => {
      const running = this.wm.windows.some((w) => w.title === 'Code Studio');
      if (!running) this.launch('px8-code');
    });
    this._buildDesktops();
    this._buildStartApps();
    this._wireEvents();
    this._startClock();
    this.kernel.events.on('windows:change', () => this._renderTaskWindows());
    this.switchDesktop(0);

    // Open the welcome window on first run for a complete end-to-end demo.
    this.launch('px8-about');
  }

  _registerBuiltinApps() {
    const kernel = this.kernel;
    this.kernel.apps.register({
      id: 'px8-about',
      title: 'Welcome',
      icon: '★',
      defaultSize: { width: 560, height: 420 },
      render() {
        const el = document.createElement('div');
        el.className = 'about';
        el.innerHTML = `
          <h1 class="about__h1">PriyangshuX8 Workspace</h1>
          <p class="about__p">A browser-based virtual maker platform. This is <strong>Slice 1</strong>:
          the desktop shell, window manager, theming, and offline PWA foundation.</p>
          <ul class="about__list">
            <li>Drag this window by its title bar.</li>
            <li>Resize from the bottom-right corner.</li>
            <li>Use the taskbar and Start menu (PX8 button).</li>
            <li>Switch virtual desktops from the taskbar.</li>
            <li>Works offline once loaded (installable PWA).</li>
          </ul>
          <p class="about__hint">Keyboard: <kbd>Ctrl</kbd>+<kbd>\`</kbd> Start &middot;
          <kbd>Alt</kbd>+<kbd>Tab</kbd> cycle &middot; <kbd>Ctrl</kbd>+<kbd>W</kbd> close.</p>
          <p class="about__ver">Kernel v${kernel.version}</p>
        `;
        return el;
      }
    });
  }

  _buildDesktops() {
    const host = this.root.querySelector('[data-role="desktops"]');
    host.innerHTML = '';
    for (let i = 0; i < NUM_DESKTOPS; i++) {
      const b = document.createElement('button');
      b.className = 'desk-dot';
      b.dataset.desktop = String(i);
      b.title = `Desktop ${i + 1}`;
      b.textContent = String(i + 1);
      b.addEventListener('click', () => this.switchDesktop(i));
      host.appendChild(b);
    }
  }

  _buildStartApps() {
    const host = this.root.querySelector('[data-role="start-apps"]');
    host.innerHTML = '';
    for (const app of this.kernel.apps.list()) {
      const b = document.createElement('button');
      b.className = 'start-app';
      b.innerHTML = `<span class="start-app__icon">${app.icon || '▢'}</span><span>${app.title}</span>`;
      b.addEventListener('click', () => { this.launch(app.id); this.toggleStart(false); });
      host.appendChild(b);
    }
  }

  /** @param {string} appId */
  launch(appId) {
    const app = this.kernel.apps.get(appId);
    if (!app) return;
    const win = this.wm.open({
      title: app.title,
      icon: app.icon,
      content: document.createElement('div'),
      width: app.defaultSize?.width,
      height: app.defaultSize?.height,
      desktop: this.currentDesktop
    });
    const body = win.el.querySelector('.win__body');
    body.innerHTML = '';
    body.appendChild(app.render({ kernel: this.kernel, windowId: win.id }));
  }

  _wireEvents() {
    // Start button + start menu actions.
    this.root.querySelector('[data-act="start"]').addEventListener('click', () => this.toggleStart());
    this.root.querySelector('[data-role="start-menu"]').addEventListener('click', (e) => {
      const act = e.target.closest('[data-act]')?.dataset.act;
      const theme = this.kernel.services.get('theme');
      if (act === 'theme') theme.toggleMode();
      else if (act === 'perf') theme.update({ performance: !theme.state.performance });
    });

    // Close start menu / context menu when clicking elsewhere.
    document.addEventListener('pointerdown', (e) => {
      if (!e.target.closest('[data-role="start-menu"]') && !e.target.closest('[data-act="start"]')) {
        this.toggleStart(false);
      }
      if (!e.target.closest('[data-role="context-menu"]')) this._hideContextMenu();
    });

    // Right-click context menu on the desktop surface.
    this.root.querySelector('[data-role="desktop-surface"]').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      this._showContextMenu(e.clientX, e.clientY, [
        { label: 'Open Welcome', run: () => this.launch('px8-about') },
        { label: 'Toggle theme', run: () => this.kernel.services.get('theme').toggleMode() },
        { label: `Next desktop`, run: () => this.switchDesktop((this.currentDesktop + 1) % NUM_DESKTOPS) }
      ]);
    });

    // Keyboard shortcuts.
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey && e.key === '`') { e.preventDefault(); this.toggleStart(); }
      else if (e.altKey && e.key === 'Tab') { e.preventDefault(); this.wm.cycle(); }
      else if (e.ctrlKey && (e.key === 'w' || e.key === 'W')) {
        if (this.wm.active) { e.preventDefault(); this.wm.active.close(); }
      }
    });
  }

  /** @param {boolean} [force] */
  toggleStart(force) {
    this.startOpen = force ?? !this.startOpen;
    this.root.querySelector('[data-role="start-menu"]').hidden = !this.startOpen;
  }

  /** @param {number} index */
  switchDesktop(index) {
    this.currentDesktop = index;
    this.wm.showDesktop(index);
    this.root.querySelectorAll('.desk-dot').forEach((d) =>
      d.classList.toggle('desk-dot--active', Number(d.dataset.desktop) === index));
    this._renderTaskWindows();
  }

  _renderTaskWindows() {
    const host = this.root.querySelector('[data-role="task-windows"]');
    host.innerHTML = '';
    for (const w of this.wm.windows) {
      if (w.desktop !== this.currentDesktop) continue;
      const b = document.createElement('button');
      b.className = 'task-win' + (w === this.wm.active && !w.minimized ? ' task-win--active' : '');
      b.innerHTML = `<span>${w.icon}</span><span class="task-win__t">${w.title}</span>`;
      b.addEventListener('click', () => (w.minimized || this.wm.active !== w) ? this.wm.focus(w) : w.minimize());
      host.appendChild(b);
    }
  }

  _showContextMenu(x, y, items) {
    const menu = this.root.querySelector('[data-role="context-menu"]');
    menu.innerHTML = '';
    for (const it of items) {
      const b = document.createElement('button');
      b.className = 'context-menu__item';
      b.textContent = it.label;
      b.addEventListener('click', () => { it.run(); this._hideContextMenu(); });
      menu.appendChild(b);
    }
    menu.hidden = false;
    const mw = menu.offsetWidth, mh = menu.offsetHeight;
    menu.style.left = `${Math.min(x, window.innerWidth - mw - 8)}px`;
    menu.style.top = `${Math.min(y, window.innerHeight - mh - 8)}px`;
  }

  _hideContextMenu() {
    this.root.querySelector('[data-role="context-menu"]').hidden = true;
  }

  _startClock() {
    const el = this.root.querySelector('[data-role="clock"]');
    const tick = () => {
      const d = new Date();
      el.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    };
    tick();
    setInterval(tick, 15000);
  }
}
