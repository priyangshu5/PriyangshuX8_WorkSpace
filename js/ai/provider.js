/**
 * PriyangshuX8 Workspace - AI Provider framework
 * Defines the provider interface, a registry, and a fully-offline rule-based
 * provider. NO network calls exist in the shipped providers. Real providers
 * (e.g. a hosted model) can be added later by registering an AIProvider, ideally
 * via the Slice 8 plugin API, keeping the core build API-free and future-ready.
 *
 * Provider contract:
 *   class MyProvider {
 *     id = 'my-id'; name = 'My Provider'; requiresKey = false;
 *     async send(messages, context) -> { text: string }   // messages: {role,content}[]
 *   }
 */

/** Registry of available AI providers, exposed as a kernel service "ai". */
export class AIRegistry {
  /** @param {import('../core/kernel.js').Kernel} kernel */
  constructor(kernel) {
    this.kernel = kernel;
    /** @type {Map<string, object>} */
    this.providers = new Map();
    this.activeId = null;
  }

  /** @param {object} provider */
  register(provider) {
    if (!provider || !provider.id || typeof provider.send !== 'function') {
      throw new Error('Invalid AI provider: needs id and send().');
    }
    this.providers.set(provider.id, provider);
    if (!this.activeId) this.activeId = provider.id;
    this.kernel.events.emit('ai:providers', {});
  }

  /** @param {string} id */
  unregister(id) {
    this.providers.delete(id);
    if (this.activeId === id) this.activeId = this.providers.keys().next().value || null;
    this.kernel.events.emit('ai:providers', {});
  }

  /** @returns {{id:string,name:string,requiresKey:boolean,ready:boolean}[]} */
  list() {
    return [...this.providers.values()].map((p) => ({
      id: p.id, name: p.name, requiresKey: !!p.requiresKey,
      ready: typeof p.isReady === 'function' ? p.isReady() : true
    }));
  }

  /** @param {string} id */
  setActive(id) { if (this.providers.has(id)) { this.activeId = id; this.kernel.events.emit('ai:providers', {}); } }

  /** @returns {object|null} */
  active() { return this.activeId ? this.providers.get(this.activeId) : null; }
}

/**
 * Fully offline, rule-based assistant. It answers questions about the workspace
 * using the live read-only context (active project, Lab circuit, open file) and
 * a knowledge base about the built-in components and apps. No network, no keys.
 */
export class OfflineAssistantProvider {
  constructor() {
    this.id = 'offline';
    this.name = 'Offline Assistant (built-in)';
    this.requiresKey = false;
  }

  /**
   * @param {{role:string,content:string}[]} messages
   * @param {object} context Provided by the context bridge.
   * @returns {Promise<{text:string}>}
   */
  async send(messages, context) {
    const q = (messages[messages.length - 1]?.content || '').toLowerCase().trim();
    return { text: this._respond(q, context) };
  }

  _respond(q, ctx) {
    if (!q) return 'Ask me about your project, circuit, components, or how to use the workspace.';

    // Greetings.
    if (/^(hi|hello|hey|yo)\b/.test(q)) return 'Hello! I can explain components, suggest wiring, summarize your project, or help with the apps. Try "summarize my circuit" or "how do I wire an LED?".';

    // Project summary.
    if (q.includes('project') && (q.includes('summar') || q.includes('what') || q.includes('active'))) {
      if (!ctx.project) return 'No active project. Open the Projects app and create one from a template (Blink, Robot Car, Sensor Dashboard).';
      return `Active project: "${ctx.project.name}" (type: ${ctx.project.type || 'project'}).\n` +
        `It has a sketch (${ctx.project.sketch}) and a circuit (${ctx.project.circuit}).`;
    }

    // Circuit summary.
    if (q.includes('circuit') || q.includes('summar')) {
      if (!ctx.circuit || !ctx.circuit.instances?.length) return 'Your Lab circuit is empty. Add components from the PX8 Lab palette, then ask me again.';
      const counts = {};
      for (const i of ctx.circuit.instances) counts[i.type] = (counts[i.type] || 0) + 1;
      const parts = Object.entries(counts).map(([t, n]) => `${n}× ${t}`).join(', ');
      return `Your circuit has ${ctx.circuit.instances.length} components (${parts}) and ${ctx.circuit.wires?.length || 0} wires. ` +
        (ctx.circuit.wires?.length ? 'Click ▶ Run in the Lab to simulate it.' : 'Turn on wiring mode in the Lab to connect pins.');
    }

    // Component knowledge.
    for (const [key, info] of Object.entries(KB)) {
      if (q.includes(key)) return info;
    }

    // Wiring help.
    if (q.includes('wire') || q.includes('connect')) {
      return 'To wire components in PX8 Lab: click "Wire: off" to enable wiring (pins turn green), click a source pin, then a destination pin. ' +
        'Typical LED: Arduino digital pin → LED anode (A), LED cathode (K) → a resistor → GND. Then ▶ Run to simulate.';
    }

    // Code help.
    if (q.includes('blink') || q.includes('led') && q.includes('code')) {
      return 'A blink sketch: in setup() call pinMode(13, OUTPUT); in loop() call digitalWrite(13, HIGH); delay(500); digitalWrite(13, LOW); delay(500);. ' +
        'Wire pin 13 to an LED in the Lab and Run.';
    }

    // App help.
    if (q.includes('how') && (q.includes('use') || q.includes('start') || q.includes('open'))) {
      return 'Open apps from the PX8 start menu (bottom-left). Code Studio edits files, PX8 Lab builds circuits, the Simulator runs them, ' +
        '3D/Physics visualizes motion, Projects manages templates + ZIP import/export, and Plugins extends the workspace.';
    }

    // Fallback: echo understanding + suggestions.
    return `I'm the offline assistant, so I answer from built-in knowledge and your current workspace.\n` +
      `I didn't find a specific answer for that. Try asking:\n` +
      `• "summarize my circuit"  • "what is my active project?"\n` +
      `• "how do I wire an LED?"  • "what is an esp32?"  • "explain the servo"`;
  }
}

/** Built-in component/topic knowledge base for the offline provider. */
const KB = {
  'arduino': 'Arduino boards (Uno/Nano/Mega) are microcontrollers programmed in C++. Double-click a board in PX8 Lab to open its sketch.ino in Code Studio, then Run to simulate.',
  'esp32': 'The ESP32 is a Wi-Fi/Bluetooth microcontroller. In the Lab it has GPIO pins (G0..) plus 3V3 and GND. Program it like Arduino (pinMode/digitalWrite).',
  'esp8266': 'The ESP8266 is a low-cost Wi-Fi microcontroller, similar to ESP32 but with fewer GPIOs.',
  'raspberry': 'Raspberry Pi (and Pico) appear in the Boards palette with GPIO pins. The Pi runs an OS; the Pico (RP2040) is a microcontroller.',
  'led': 'An LED lights when its anode (A) gets ~+3-5V relative to its cathode (K). Drive A from a digital pin (optionally via a resistor) and K to GND. PWM (analogWrite) controls brightness.',
  'resistor': 'A resistor limits current (e.g. 220Ω in series with an LED). Set its value in the properties panel.',
  'servo': 'A servo rotates to an angle (0-180°). Drive its SIG pin and call a write(angle) in code; in the Lab/3D view its arm moves to that angle.',
  'motor': 'A DC motor spins when powered; analogWrite sets speed via PWM. In the 3D/Physics view, motor power drives the robot car.',
  'buzzer': 'A buzzer sounds when its + pin is driven HIGH or via tone(pin, freq).',
  'sensor': 'Sensors (LDR, temperature, ultrasonic, potentiometer) feed analog/digital values read with analogRead()/digitalRead(). Set their simulated values in the properties panel.',
  'potentiometer': 'A potentiometer outputs a variable analog value (0-1023 on the wiper W pin). Read it with analogRead().',
  'lcd': 'The LCD 16x2 displays two lines of text; set line1/line2 in its properties.',
  'plugin': 'Plugins live in /home/plugins as .js modules exporting manifest + activate(api). Use the Plugins app to enable/disable them.'
};

/**
 * Optional, DISABLED-BY-DEFAULT "bring your own key" provider stub. It performs
 * NO network calls unless the user explicitly supplies an endpoint + key at
 * runtime. The shipped build never calls it; it exists only as architecture so
 * a real provider can be wired in later (ideally via a plugin). It is not
 * registered by default.
 */
export class BringYourOwnKeyProvider {
  constructor() {
    this.id = 'byok';
    this.name = 'Custom Provider (your API key)';
    this.requiresKey = true;
    this.endpoint = null;
    this.key = null;
  }
  /** @param {{endpoint:string, key:string}} cfg */
  configure(cfg) { this.endpoint = cfg.endpoint || null; this.key = cfg.key || null; }
  isReady() { return !!(this.endpoint && this.key); }
  /** @returns {Promise<{text:string}>} */
  async send(messages) {
    if (!this.isReady()) {
      return { text: 'Custom provider is not configured. This build ships without any API integration. ' +
        'To use your own model, register a provider via a plugin and supply an endpoint + key. The built-in Offline Assistant works with no setup.' };
    }
    // Intentionally minimal: only runs if the USER configured it. Not used by default.
    const res = await fetch(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${this.key}` },
      body: JSON.stringify({ messages })
    });
    if (!res.ok) throw new Error(`Provider error ${res.status}`);
    const data = await res.json();
    return { text: data.text || data.choices?.[0]?.message?.content || '(no response)' };
  }
}
