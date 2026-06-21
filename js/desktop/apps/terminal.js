/**
 * PriyangshuX8 Workspace - Terminal app
 * A lightweight, dependency-free Linux-like shell over the VFS. Supports command
 * history (Up/Down), tab completion of paths, and a set of built-in commands.
 * Registers itself into the kernel app registry.
 */

/** @param {import('../../core/kernel.js').Kernel} kernel */
import { ensureTerminalRegistry } from '../../plugins/plugin-api.js';
export function registerTerminal(kernel) {
  kernel.apps.register({
    id: 'px8-terminal',
    title: 'Terminal',
    icon: '⌨',
    defaultSize: { width: 660, height: 420 },
    render: () => buildTerminal(kernel)
  });
}

/** @param {import('../../core/kernel.js').Kernel} kernel @returns {HTMLElement} */
function buildTerminal(kernel) {
  const vfs = kernel.services.get('vfs');
  const root = document.createElement('div');
  root.className = 'term';
  root.innerHTML = `
    <div class="term__out" data-role="out" tabindex="0"></div>
    <div class="term__inputline">
      <span class="term__prompt" data-role="prompt"></span>
      <input class="term__input" data-role="input" spellcheck="false"
             autocapitalize="off" autocomplete="off" autocorrect="off" />
    </div>
  `;

  const out = root.querySelector('[data-role="out"]');
  const input = root.querySelector('[data-role="input"]');
  const promptEl = root.querySelector('[data-role="prompt"]');

  let cwd = '/home';
  const history = [];
  let histIdx = -1;

  const resolve = (p) => normalize(VFS_resolve(cwd, p));
  function VFS_resolve(base, p) {
    const segs = (p.startsWith('/') ? [] : base.split('/').filter(Boolean)).concat(p.split('/'));
    const stack = [];
    for (const s of segs) {
      if (s === '' || s === '.') continue;
      if (s === '..') stack.pop();
      else stack.push(s);
    }
    return '/' + stack.join('/');
  }
  function normalize(p) { return p === '' ? '/' : p; }

  function updatePrompt() { promptEl.textContent = `px8:${cwd} $`; }

  function print(text, cls) {
    const line = document.createElement('div');
    line.className = 'term__line' + (cls ? ` ${cls}` : '');
    line.textContent = text;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  function printRaw(html) {
    const line = document.createElement('div');
    line.className = 'term__line';
    line.innerHTML = html;
    out.appendChild(line);
    out.scrollTop = out.scrollHeight;
  }

  const commands = {
    help: () => print(
      'Available commands:\n' +
      '  help              Show this help\n' +
      '  ls [path]         List directory\n' +
      '  cd [path]         Change directory\n' +
      '  pwd               Print working directory\n' +
      '  cat <file>        Show file contents\n' +
      '  mkdir <dir>       Create directory\n' +
      '  touch <file>      Create empty file\n' +
      '  echo <text>       Print text\n' +
      '  echo <t> > <file> Write text to file\n' +
      '  rm <path>         Remove file or directory\n' +
      '  mv <from> <to>    Move/rename\n' +
      '  cp <from> <to>    Copy\n' +
      '  clear             Clear the screen\n' +
      '  date              Show current date/time\n' +
      '  whoami            Show current user'
    ) || (() => { const reg = ensureTerminalRegistry(kernel); const extra = [...reg.entries()];
      if (extra.length) print('Plugin commands:\n' + extra.map(([n, m]) => '  ' + n + (m.help ? '  - ' + m.help : '')).join('\n')); })(),
    ls: (args) => {
      const path = args[0] ? resolve(args[0]) : cwd;
      if (!vfs.exists(path)) return print(`ls: ${path}: No such file or directory`, 'term__err');
      if (vfs.isFile(path)) return print(path.split('/').pop());
      const entries = vfs.list(path);
      if (!entries.length) return;
      printRaw(entries.map((e) =>
        e.type === 'dir'
          ? `<span class="term__dir">${esc(e.name)}/</span>`
          : `<span>${esc(e.name)}</span>`
      ).join('   '));
    },
    cd: (args) => {
      const target = args[0] ? resolve(args[0]) : '/home';
      if (!vfs.exists(target)) return print(`cd: ${target}: No such file or directory`, 'term__err');
      if (!vfs.isDir(target)) return print(`cd: ${target}: Not a directory`, 'term__err');
      cwd = target; updatePrompt();
    },
    pwd: () => print(cwd),
    cat: (args) => {
      if (!args[0]) return print('cat: missing operand', 'term__err');
      const path = resolve(args[0]);
      try { print(vfs.readFile(path)); } catch (e) { print(`cat: ${e.message}`, 'term__err'); }
    },
    mkdir: async (args) => {
      if (!args[0]) return print('mkdir: missing operand', 'term__err');
      try { await vfs.mkdir(resolve(args[0])); } catch (e) { print(`mkdir: ${e.message}`, 'term__err'); }
    },
    touch: async (args) => {
      if (!args[0]) return print('touch: missing operand', 'term__err');
      const path = resolve(args[0]);
      if (vfs.exists(path)) return;
      try { await vfs.writeFile(path, ''); } catch (e) { print(`touch: ${e.message}`, 'term__err'); }
    },
    rm: async (args) => {
      if (!args[0]) return print('rm: missing operand', 'term__err');
      try { await vfs.remove(resolve(args[0])); } catch (e) { print(`rm: ${e.message}`, 'term__err'); }
    },
    mv: async (args) => {
      if (args.length < 2) return print('mv: usage: mv <from> <to>', 'term__err');
      try { await vfs.move(resolve(args[0]), resolve(args[1])); } catch (e) { print(`mv: ${e.message}`, 'term__err'); }
    },
    cp: async (args) => {
      if (args.length < 2) return print('cp: usage: cp <from> <to>', 'term__err');
      try { await vfs.copy(resolve(args[0]), resolve(args[1])); } catch (e) { print(`cp: ${e.message}`, 'term__err'); }
    },
    echo: async (args, raw) => {
      // Support: echo text > file
      const redirect = raw.indexOf('>');
      if (redirect !== -1) {
        const text = raw.slice(0, redirect).trim();
        const file = raw.slice(redirect + 1).trim();
        if (!file) return print('echo: missing redirect target', 'term__err');
        try { await vfs.writeFile(resolve(file), unquote(text)); } catch (e) { print(`echo: ${e.message}`, 'term__err'); }
      } else {
        print(unquote(raw));
      }
    },
    clear: () => { out.innerHTML = ''; },
    date: () => print(new Date().toString()),
    whoami: () => print('priyangshu')
  };

  async function run(commandLine) {
    const trimmed = commandLine.trim();
    printRaw(`<span class="term__prompt">px8:${esc(cwd)} $</span> ${esc(trimmed)}`);
    if (!trimmed) return;
    history.unshift(trimmed);
    histIdx = -1;

    const [name, ...rest] = trimmed.split(/\s+/);
    const raw = trimmed.slice(name.length).trim();
    const cmd = commands[name];
    if (cmd) {
      try { await cmd(rest, raw); } catch (e) { print(`${name}: ${e.message}`, 'term__err'); }
      return;
    }
    const reg = ensureTerminalRegistry(kernel);
    const ext = reg.get(name);
    if (ext) {
      try { await ext.fn(rest, raw, (t) => print(t)); } catch (e) { print(`${name}: ${e.message}`, 'term__err'); }
      return;
    }
    print(`${name}: command not found (try "help")`, 'term__err');
  }

  // Tab completion for the last path token in the current directory.
  function complete() {
    const value = input.value;
    const tokens = value.split(/\s+/);
    const last = tokens[tokens.length - 1] || '';
    const slash = last.lastIndexOf('/');
    const dirPart = slash === -1 ? cwd : resolve(last.slice(0, slash + 1));
    const prefix = slash === -1 ? last : last.slice(slash + 1);
    if (!vfs.isDir(dirPart)) return;
    const matches = vfs.list(dirPart).filter((e) => e.name.startsWith(prefix));
    if (matches.length === 1) {
      const completed = matches[0].name + (matches[0].type === 'dir' ? '/' : '');
      const base = slash === -1 ? '' : last.slice(0, slash + 1);
      tokens[tokens.length - 1] = base + completed;
      input.value = tokens.join(' ');
    } else if (matches.length > 1) {
      print(matches.map((m) => m.name + (m.type === 'dir' ? '/' : '')).join('   '));
    }
  }

  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      const v = input.value; input.value = '';
      await run(v);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (histIdx < history.length - 1) { histIdx++; input.value = history[histIdx]; }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (histIdx > 0) { histIdx--; input.value = history[histIdx]; }
      else { histIdx = -1; input.value = ''; }
    } else if (e.key === 'Tab') {
      e.preventDefault(); complete();
    } else if (e.ctrlKey && (e.key === 'l' || e.key === 'L')) {
      e.preventDefault(); out.innerHTML = '';
    }
  });

  // Focus the input when clicking anywhere in the terminal.
  root.addEventListener('pointerup', () => { if (!getSelection().toString()) input.focus(); });

  // Live-refresh nothing visual, but keep cwd valid if a folder is deleted elsewhere.
  const off = kernel.events.on('vfs:change', () => { if (!vfs.isDir(cwd)) { cwd = '/'; updatePrompt(); } });
  root.addEventListener('px8:disconnect', off);

  updatePrompt();
  print('PriyangshuX8 Terminal. Type "help" to get started.');
  setTimeout(() => input.focus(), 50);
  return root;
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) return s.slice(1, -1);
  return s;
}
function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
