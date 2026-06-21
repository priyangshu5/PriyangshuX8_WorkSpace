/**
 * PriyangshuX8 Workspace - AI Assistant app
 * A chat-style panel with a message list, input, provider selector, and history
 * persisted to the VFS. It uses the active AIProvider (default: the fully
 * offline rule-based assistant) and grounds responses with read-only workspace
 * context from the ContextBridge. No network in the shipped path.
 */
import { ContextBridge } from '../../ai/context-bridge.js';

const HISTORY_FILE = '/home/documents/assistant-history.json';

/** @param {import('../../core/kernel.js').Kernel} kernel */
export function registerAssistant(kernel) {
  kernel.apps.register({
    id: 'px8-assistant',
    title: 'AI Assistant',
    icon: '🤖',
    defaultSize: { width: 560, height: 560 },
    render: () => buildAssistant(kernel)
  });
}

/** @param {import('../../core/kernel.js').Kernel} kernel @returns {HTMLElement} */
function buildAssistant(kernel) {
  const ai = kernel.services.get('ai');
  const vfs = kernel.services.get('vfs');
  const bridge = new ContextBridge(kernel);

  const root = document.createElement('div');
  root.className = 'ai';
  root.innerHTML = `
    <div class="ai__bar">
      <select class="ai__provider" data-role="provider" title="AI provider"></select>
      <span class="ai__spacer"></span>
      <span class="ai__badge" data-role="mode">offline</span>
      <button class="ai__btn" data-act="clear" title="Clear conversation">Clear</button>
    </div>
    <div class="ai__messages" data-role="messages"></div>
    <div class="ai__composer">
      <textarea class="ai__input" data-role="input" rows="1" placeholder="Ask about your project, circuit, or components…" spellcheck="false"></textarea>
      <button class="ai__send" data-act="send" title="Send (Enter)">Send</button>
    </div>
  `;

  const providerSel = root.querySelector('[data-role="provider"]');
  const messagesEl = root.querySelector('[data-role="messages"]');
  const input = root.querySelector('[data-role="input"]');
  const modeBadge = root.querySelector('[data-role="mode"]');

  /** @type {{role:'user'|'assistant'|'system', content:string}[]} */
  let messages = [];

  function loadHistory() {
    if (vfs.isFile(HISTORY_FILE)) { try { messages = JSON.parse(vfs.readFile(HISTORY_FILE)) || []; } catch { messages = []; } }
    if (!messages.length) messages.push({ role: 'assistant', content: 'Hi! I am your offline workspace assistant. Ask me to "summarize my circuit", "what is my active project?", or "how do I wire an LED?".' });
    renderMessages();
  }

  async function saveHistory() { try { await vfs.writeFile(HISTORY_FILE, JSON.stringify(messages.slice(-100), null, 2)); } catch {} }

  function renderProviders() {
    providerSel.innerHTML = '';
    for (const p of ai.list()) {
      const opt = document.createElement('option');
      opt.value = p.id; opt.textContent = p.name + (p.requiresKey && !p.ready ? ' (needs setup)' : '');
      if (p.id === ai.activeId) opt.selected = true;
      providerSel.appendChild(opt);
    }
    const active = ai.active();
    modeBadge.textContent = active?.requiresKey ? 'custom' : 'offline';
    modeBadge.classList.toggle('ai__badge--custom', !!active?.requiresKey);
  }

  function renderMessages() {
    messagesEl.innerHTML = '';
    for (const m of messages) {
      if (m.role === 'system') continue;
      const row = document.createElement('div');
      row.className = `ai__msg ai__msg--${m.role}`;
      row.innerHTML = `<div class="ai__bubble">${formatContent(m.content)}</div>`;
      messagesEl.appendChild(row);
    }
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function addMessage(role, content) { messages.push({ role, content }); renderMessages(); }

  async function send() {
    const text = input.value.trim();
    if (!text) return;
    input.value = ''; autosize();
    addMessage('user', text);

    const provider = ai.active();
    if (!provider) { addMessage('assistant', 'No AI provider available.'); return; }

    // Typing indicator.
    const typing = document.createElement('div');
    typing.className = 'ai__msg ai__msg--assistant';
    typing.innerHTML = '<div class="ai__bubble ai__bubble--typing">…</div>';
    messagesEl.appendChild(typing); messagesEl.scrollTop = messagesEl.scrollHeight;

    try {
      const context = await bridge.collect();
      const result = await provider.send(messages.filter((m) => m.role !== 'system'), context);
      typing.remove();
      addMessage('assistant', result.text || '(no response)');
    } catch (e) {
      typing.remove();
      addMessage('assistant', 'Error: ' + e.message);
    }
    await saveHistory();
  }

  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(120, input.scrollHeight) + 'px'; }

  // Events.
  root.addEventListener('click', async (e) => {
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'send') send();
    else if (act === 'clear') { messages = []; loadHistory(); await saveHistory(); }
  });
  input.addEventListener('input', autosize);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } });
  providerSel.addEventListener('change', () => { ai.setActive(providerSel.value); renderProviders(); });

  const offProviders = kernel.events.on('ai:providers', renderProviders);
  root.addEventListener('px8:disconnect', () => { offProviders(); bridge.dispose(); });

  renderProviders();
  loadHistory();
  setTimeout(() => input.focus(), 60);
  return root;
}

/** Escape + render newlines and simple bullet lines. @param {string} s */
function formatContent(s) {
  const esc = String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  return esc.replace(/\n/g, '<br/>');
}
