/**
 * PriyangshuX8 Workspace - Simulation Engine
 * Drives the Lab circuit model at ~60 FPS. For each board instance it runs a
 * SketchRuntime (Arduino subset). Board pin writes propagate through wires to
 * connected components, updating their runtime `state` so the Lab renderer
 * animates them: LEDs light, buzzers signal, servos sweep, DC motors spin, the
 * LCD shows text, sensors feed analog values, battery voltage flows.
 *
 * The engine is decoupled from rendering: it mutates `instance.state` and emits
 * "sim:frame" so the Lab redraws. The Serial Monitor listens to "sim:serial".
 */
import { getDef } from '../lab/components.js';
import { SketchRuntime } from './interpreter.js';

const BOARD_TYPES = new Set(['arduino-uno', 'arduino-nano', 'arduino-mega', 'esp32', 'esp8266', 'raspberry-pi', 'raspberry-pi-pico']);

export class SimulationEngine {
  /** @param {import('../core/kernel.js').Kernel} kernel */
  constructor(kernel) {
    this.kernel = kernel;
    this.running = false;
    this._raf = 0;
    this._last = 0;
    /** @type {Array<{inst:object, runtime:SketchRuntime, pins:Map<string,number>}>} */
    this.boards = [];
    this.model = null; // { instances, wires }
  }

  /**
   * Build the runtime from a circuit model.
   * @param {{instances:object[], wires:object[]}} model
   */
  build(model) {
    this.model = model;
    this.boards = [];
    const vfs = this.kernel.services.get('vfs');

    for (const inst of model.instances) {
      inst.state = inst.state || {};
      if (!BOARD_TYPES.has(inst.type)) continue;
      let source = '';
      const sketchPath = inst.props.sketch;
      if (sketchPath && vfs.isFile(sketchPath)) { try { source = vfs.readFile(sketchPath); } catch {} }
      const pins = new Map();
      const board = { inst, pins, runtime: null };
      board.runtime = new SketchRuntime(source, this._makeHooks(board));
      this.boards.push(board);
    }
  }

  /** Build I/O hooks bound to a specific board. */
  _makeHooks(board) {
    return {
      digitalWrite: (pin, val) => { board.pins.set(this._pinKey(pin), val ? 1 : 0); this._propagate(board, pin, val ? 5 : 0); },
      digitalRead: (pin) => this._readInput(board, pin),
      analogWrite: (pin, val) => { const v = Math.max(0, Math.min(255, val)); board.pins.set(this._pinKey(pin), v); this._propagate(board, pin, (v / 255) * 5, v); },
      analogRead: (pin) => this._readAnalog(board, pin),
      servoWrite: (pin, angle) => this._driveServos(board, pin, Math.max(0, Math.min(180, angle))),
      tone: (pin, freq) => this._driveBuzzers(board, pin, true, freq),
      noTone: (pin) => this._driveBuzzers(board, pin, false, 0),
      serial: (text) => this.kernel.events.emit('sim:serial', { boardId: board.inst.id, text })
    };
  }

  _pinKey(pin) { return String(pin); }

  /** Map an Arduino pin number to a board pin id (best-effort by index). */
  _pinId(board, pin) {
    const def = getDef(board.inst.type);
    const gpio = def.pins.filter((p) => p.kind === 'gpio' || p.kind === 'io');
    // Direct id match (e.g. ESP "G2"), else digital index "D<pin>".
    const direct = def.pins.find((p) => p.id === `D${pin}` || p.id === `G${pin}` || p.id === `GP${pin}` || p.id === `GPIO${pin}`);
    if (direct) return direct.id;
    return gpio[pin] ? gpio[pin].id : `D${pin}`;
  }

  /** Find components whose pins are wired (directly or via one hop) to a board pin. */
  _connectedTo(board, pinId) {
    const out = [];
    for (const w of this.model.wires) {
      const a = w.from, b = w.to;
      if (a.inst === board.inst.id && a.pin === pinId) out.push(b);
      else if (b.inst === board.inst.id && b.pin === pinId) out.push(a);
    }
    return out;
  }

  /** Propagate a voltage from a board output pin to connected components. */
  _propagate(board, pin, volts, pwm) {
    const pinId = this._pinId(board, pin);
    const targets = this._connectedTo(board, pinId);
    for (const ref of targets) {
      const inst = this.model.instances.find((i) => i.id === ref.inst);
      if (!inst) continue;
      inst.state = inst.state || {};
      switch (inst.type) {
        case 'led':
          inst.state.on = volts > 1.5;
          inst.state.brightness = pwm !== undefined ? pwm / 255 : (volts > 1.5 ? 1 : 0);
          break;
        case 'buzzer': inst.state.on = volts > 1.5; break;
        case 'relay': inst.state.active = volts > 1.5; break;
        case 'dc-motor': inst.state.power = volts / 5; break;
        case 'lcd1602': inst.state.line1 = inst.props.line1; inst.state.line2 = inst.props.line2; break;
        default: break;
      }
    }
  }

  /** Drive any servos connected to a signal pin. */
  _driveServos(board, pin, angle) {
    const pinId = this._pinId(board, pin);
    for (const ref of this._connectedTo(board, pinId)) {
      const inst = this.model.instances.find((i) => i.id === ref.inst);
      if (inst && inst.type === 'servo') { inst.state = inst.state || {}; inst.state.angle = angle; }
    }
  }

  _driveBuzzers(board, pin, on, freq) {
    const pinId = this._pinId(board, pin);
    for (const ref of this._connectedTo(board, pinId)) {
      const inst = this.model.instances.find((i) => i.id === ref.inst);
      if (inst && inst.type === 'buzzer') { inst.state = inst.state || {}; inst.state.on = on; inst.state.freq = freq; }
    }
  }

  /** Read a digital input from a connected button/switch (active-high). */
  _readInput(board, pin) {
    const pinId = this._pinId(board, pin);
    for (const ref of this._connectedTo(board, pinId)) {
      const inst = this.model.instances.find((i) => i.id === ref.inst);
      if (!inst) continue;
      if (inst.type === 'button') return (inst.state?.pressed ?? inst.props.pressed) ? 1 : 0;
      if (inst.type === 'switch') return (inst.state?.closed ?? inst.props.closed) ? 1 : 0;
    }
    return 0;
  }

  /** Read an analog input (0-1023) from a connected sensor/pot. */
  _readAnalog(board, pin) {
    const pinId = this._pinId(board, pin);
    for (const ref of this._connectedTo(board, pinId)) {
      const inst = this.model.instances.find((i) => i.id === ref.inst);
      if (!inst) continue;
      if (inst.type === 'potentiometer') return inst.props.value | 0;
      if (inst.type === 'ldr') return Math.min(1023, (inst.props.lux | 0));
      if (inst.type === 'temp-sensor') return Math.min(1023, Math.round((inst.props.celsius / 100) * 1023));
      if (inst.type === 'ultrasonic') return Math.min(1023, inst.props.distance | 0);
    }
    return 0;
  }

  start() {
    if (this.running || !this.model) return;
    this.running = true;
    for (const b of this.boards) b.runtime.start();
    this._last = performance.now();
    const loop = (t) => {
      if (!this.running) return;
      let dt = t - this._last; this._last = t;
      if (dt > 50) dt = 50; // clamp after tab switch
      for (const b of this.boards) b.runtime.tick(dt);
      this._animate(dt);
      this.kernel.events.emit('sim:frame', {});
      this._raf = requestAnimationFrame(loop);
    };
    this._raf = requestAnimationFrame(loop);
    this.kernel.events.emit('sim:state', { running: true });
  }

  /** Continuous animations independent of code (motor spin, etc.). */
  _animate(dt) {
    for (const inst of this.model.instances) {
      if (inst.type === 'dc-motor') {
        const power = inst.state?.power || 0;
        inst.state = inst.state || {};
        inst.state.angle = (inst.state.angle || 0) + power * (inst.props.speed || 200) * (dt / 1000) * 0.05;
        inst.state.rpm = Math.round(power * (inst.props.speed || 200));
      }
    }
  }

  stop() {
    this.running = false;
    cancelAnimationFrame(this._raf);
    this.kernel.events.emit('sim:state', { running: false });
  }

  reset() {
    this.stop();
    for (const inst of (this.model?.instances || [])) inst.state = {};
    this.build(this.model);
    this.kernel.events.emit('sim:frame', {});
    this.kernel.events.emit('sim:serial', { boardId: null, text: '--- reset ---\n' });
  }

  /** @returns {string[]} interpreter errors, if any. */
  errors() { return this.boards.filter((b) => b.runtime.error).map((b) => `${b.inst.type}: ${b.runtime.error}`); }
}

