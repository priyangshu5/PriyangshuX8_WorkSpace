/**
 * PriyangshuX8 Workspace - Lab Component Catalog
 * Pure-data definitions for every component the Lab can place. Each definition
 * describes the visual footprint, the named pins (with local coordinates and
 * polarity), default editable properties, and a draw routine using Canvas 2D.
 * Keeping this declarative lets the Simulation Engine (Slice 5) read the same
 * model without coupling to rendering.
 */

/**
 * @typedef {Object} Pin
 * @property {string} id        Unique pin id within the component, e.g. "D13".
 * @property {number} x         Local x offset from component origin (unrotated).
 * @property {number} y         Local y offset.
 * @property {string} [kind]    "power" | "gnd" | "gpio" | "io" | "analog".
 */

/**
 * @typedef {Object} ComponentDef
 * @property {string} type      Catalog key, e.g. "led".
 * @property {string} label     Display name.
 * @property {string} group     Palette group.
 * @property {string} icon      Short text/emoji for the palette.
 * @property {number} w         Width in px (unrotated).
 * @property {number} h         Height in px (unrotated).
 * @property {Pin[]} pins
 * @property {Object} props     Default editable properties.
 * @property {(ctx:CanvasRenderingContext2D, inst:object, def:ComponentDef)=>void} draw
 */

/** Helper: rounded rectangle path. */
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Helper: draw a labeled board body. */
function board(ctx, def, color, label) {
  roundRect(ctx, 0, 0, def.w, def.h, 8);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.font = '600 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(label, def.w / 2, 14);
}

/** Build a row of evenly spaced pins along the bottom edge. */
function pinRow(count, prefix, y, startX, gap, kind) {
  const pins = [];
  for (let i = 0; i < count; i++) pins.push({ id: `${prefix}${i}`, x: startX + i * gap, y, kind });
  return pins;
}

/** @type {Record<string, ComponentDef>} */
export const CATALOG = {
  'arduino-uno': {
    type: 'arduino-uno', label: 'Arduino Uno', group: 'Boards', icon: '🟦',
    w: 220, h: 150,
    pins: [
      ...pinRow(14, 'D', 6, 24, 13, 'gpio'),
      ...pinRow(6, 'A', 144, 24, 13, 'analog'),
      { id: '5V', x: 196, y: 144, kind: 'power' },
      { id: 'GND', x: 110, y: 144, kind: 'gnd' }
    ],
    props: { mcu: 'ATmega328P', sketch: '/home/projects/sketch.ino' },
    draw(ctx, inst, def) {
      board(ctx, def, '#1b6fb3', 'ARDUINO UNO');
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      ctx.font = '9px system-ui'; ctx.textAlign = 'left';
      ctx.fillText('Digital', 22, 30);
      ctx.fillText('Analog', 22, 134);
    }
  },
  'arduino-nano': {
    type: 'arduino-nano', label: 'Arduino Nano', group: 'Boards', icon: '🟦',
    w: 130, h: 90,
    pins: [...pinRow(14, 'D', 6, 12, 8, 'gpio'), { id: '5V', x: 118, y: 84, kind: 'power' }, { id: 'GND', x: 12, y: 84, kind: 'gnd' }],
    props: { mcu: 'ATmega328P', sketch: '/home/projects/sketch.ino' },
    draw(ctx, inst, def) { board(ctx, def, '#155e96', 'NANO'); }
  },
  'arduino-mega': {
    type: 'arduino-mega', label: 'Arduino Mega', group: 'Boards', icon: '🟦',
    w: 280, h: 160,
    pins: [...pinRow(20, 'D', 6, 16, 13, 'gpio'), { id: '5V', x: 260, y: 154, kind: 'power' }, { id: 'GND', x: 140, y: 154, kind: 'gnd' }],
    props: { mcu: 'ATmega2560', sketch: '/home/projects/sketch.ino' },
    draw(ctx, inst, def) { board(ctx, def, '#0f4f80', 'ARDUINO MEGA'); }
  },
  'esp32': {
    type: 'esp32', label: 'ESP32', group: 'Boards', icon: '📶',
    w: 160, h: 120,
    pins: [...pinRow(16, 'G', 6, 14, 9, 'gpio'), { id: '3V3', x: 150, y: 114, kind: 'power' }, { id: 'GND', x: 10, y: 114, kind: 'gnd' }],
    props: { mcu: 'ESP32-WROOM', wifi: true, sketch: '/home/projects/esp32.ino' },
    draw(ctx, inst, def) { board(ctx, def, '#222', 'ESP32'); }
  },
  'esp8266': {
    type: 'esp8266', label: 'ESP8266', group: 'Boards', icon: '📶',
    w: 140, h: 100,
    pins: [...pinRow(10, 'G', 6, 14, 12, 'gpio'), { id: '3V3', x: 130, y: 94, kind: 'power' }, { id: 'GND', x: 10, y: 94, kind: 'gnd' }],
    props: { mcu: 'ESP8266', wifi: true },
    draw(ctx, inst, def) { board(ctx, def, '#2b2b2b', 'ESP8266'); }
  },
  'raspberry-pi': {
    type: 'raspberry-pi', label: 'Raspberry Pi', group: 'Boards', icon: '🍓',
    w: 240, h: 150,
    pins: [...pinRow(20, 'GPIO', 6, 16, 11, 'gpio'), { id: '3V3', x: 220, y: 144, kind: 'power' }, { id: 'GND', x: 120, y: 144, kind: 'gnd' }],
    props: { model: 'Pi 4', os: 'Raspberry Pi OS' },
    draw(ctx, inst, def) { board(ctx, def, '#0a6e3f', 'RASPBERRY PI'); }
  },
  'raspberry-pi-pico': {
    type: 'raspberry-pi-pico', label: 'Pi Pico', group: 'Boards', icon: '🍓',
    w: 130, h: 95,
    pins: [...pinRow(13, 'GP', 6, 12, 9, 'gpio'), { id: '3V3', x: 118, y: 89, kind: 'power' }, { id: 'GND', x: 12, y: 89, kind: 'gnd' }],
    props: { mcu: 'RP2040' },
    draw(ctx, inst, def) { board(ctx, def, '#11633d', 'PICO'); }
  },
  'breadboard': {
    type: 'breadboard', label: 'Breadboard', group: 'Prototyping', icon: '🔲',
    w: 300, h: 120, pins: [],
    props: {},
    draw(ctx, inst, def) {
      roundRect(ctx, 0, 0, def.w, def.h, 6);
      ctx.fillStyle = '#e9e6dc'; ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,0.2)'; ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,0.18)';
      for (let y = 16; y < def.h - 8; y += 12)
        for (let x = 12; x < def.w - 8; x += 12) { ctx.beginPath(); ctx.arc(x, y, 1.4, 0, Math.PI * 2); ctx.fill(); }
    }
  },
  'led': {
    type: 'led', label: 'LED', group: 'Output', icon: '💡',
    w: 44, h: 44,
    pins: [{ id: 'A', x: 12, y: 42, kind: 'io' }, { id: 'K', x: 32, y: 42, kind: 'gnd' }],
    props: { color: '#ff5252', on: false },
    draw(ctx, inst, def) {
      const lit = inst.state?.on ?? inst.props.on;
      ctx.beginPath(); ctx.arc(def.w / 2, 18, 13, 0, Math.PI * 2);
      ctx.fillStyle = inst.props.color || '#ff5252';
      ctx.globalAlpha = lit ? 1 : 0.4; ctx.fill(); ctx.globalAlpha = 1;
      if (lit) { ctx.shadowColor = inst.props.color; ctx.shadowBlur = 18; ctx.fill(); ctx.shadowBlur = 0; }
      ctx.strokeStyle = 'rgba(0,0,0,0.4)'; ctx.stroke();
    }
  },
  'resistor': {
    type: 'resistor', label: 'Resistor', group: 'Passive', icon: '〰',
    w: 60, h: 22,
    pins: [{ id: '1', x: 2, y: 11, kind: 'io' }, { id: '2', x: 58, y: 11, kind: 'io' }],
    props: { ohms: 220 },
    draw(ctx, inst, def) {
      ctx.strokeStyle = '#caa46a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(2, 11); ctx.lineTo(58, 11); ctx.stroke();
      roundRect(ctx, 14, 4, 32, 14, 4); ctx.fillStyle = '#d8b886'; ctx.fill();
      ctx.fillStyle = '#333'; ctx.font = '8px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${inst.props.ohms}Ω`, 30, 11);
    }
  },
  'capacitor': {
    type: 'capacitor', label: 'Capacitor', group: 'Passive', icon: '⊥',
    w: 40, h: 40,
    pins: [{ id: '+', x: 12, y: 38, kind: 'io' }, { id: '-', x: 28, y: 38, kind: 'io' }],
    props: { uf: 10 },
    draw(ctx, inst, def) {
      ctx.fillStyle = '#3a3a8a'; roundRect(ctx, 10, 4, 20, 28, 5); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '8px system-ui'; ctx.textAlign = 'center'; ctx.fillText(`${inst.props.uf}µF`, 20, 18);
    }
  },
  'button': {
    type: 'button', label: 'Push Button', group: 'Input', icon: '🔘',
    w: 46, h: 46,
    pins: [{ id: '1', x: 4, y: 42, kind: 'io' }, { id: '2', x: 42, y: 42, kind: 'io' }],
    props: { pressed: false },
    draw(ctx, inst, def) {
      roundRect(ctx, 6, 6, 34, 30, 6); ctx.fillStyle = '#444'; ctx.fill();
      const pressed = inst.state?.pressed ?? inst.props.pressed;
      ctx.beginPath(); ctx.arc(23, 21, 9, 0, Math.PI * 2);
      ctx.fillStyle = pressed ? '#6fe0a8' : '#bbb'; ctx.fill();
    }
  },
  'switch': {
    type: 'switch', label: 'Switch', group: 'Input', icon: '🎚',
    w: 50, h: 30,
    pins: [{ id: '1', x: 4, y: 26, kind: 'io' }, { id: '2', x: 46, y: 26, kind: 'io' }],
    props: { closed: false },
    draw(ctx, inst, def) {
      roundRect(ctx, 4, 6, 42, 14, 7); ctx.fillStyle = '#555'; ctx.fill();
      const closed = inst.state?.closed ?? inst.props.closed;
      ctx.beginPath(); ctx.arc(closed ? 36 : 14, 13, 7, 0, Math.PI * 2);
      ctx.fillStyle = closed ? '#6fe0a8' : '#ccc'; ctx.fill();
    }
  },
  'relay': {
    type: 'relay', label: 'Relay', group: 'Output', icon: '🔌',
    w: 70, h: 50,
    pins: [{ id: 'IN', x: 4, y: 46, kind: 'io' }, { id: 'GND', x: 22, y: 46, kind: 'gnd' }, { id: 'VCC', x: 40, y: 46, kind: 'power' }],
    props: { active: false },
    draw(ctx, inst, def) { board(ctx, def, '#1e5fa8', 'RELAY'); }
  },
  'dc-motor': {
    type: 'dc-motor', label: 'DC Motor', group: 'Motion', icon: '⚙',
    w: 60, h: 60,
    pins: [{ id: '+', x: 10, y: 58, kind: 'io' }, { id: '-', x: 50, y: 58, kind: 'io' }],
    props: { rpm: 0, speed: 200 },
    draw(ctx, inst, def) {
      ctx.beginPath(); ctx.arc(30, 28, 22, 0, Math.PI * 2); ctx.fillStyle = '#888'; ctx.fill();
      ctx.strokeStyle = '#333'; ctx.stroke();
      const a = (inst.state?.angle || 0);
      ctx.save(); ctx.translate(30, 28); ctx.rotate(a);
      ctx.strokeStyle = '#222'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(-18, 0); ctx.lineTo(18, 0); ctx.stroke(); ctx.restore();
    }
  },
  'servo': {
    type: 'servo', label: 'Servo Motor', group: 'Motion', icon: '🦾',
    w: 64, h: 50,
    pins: [{ id: 'SIG', x: 6, y: 46, kind: 'io' }, { id: 'VCC', x: 30, y: 46, kind: 'power' }, { id: 'GND', x: 54, y: 46, kind: 'gnd' }],
    props: { angle: 90 },
    draw(ctx, inst, def) {
      board(ctx, def, '#2a7', 'SERVO');
      const a = ((inst.state?.angle ?? inst.props.angle) - 90) * Math.PI / 180;
      ctx.save(); ctx.translate(32, 30); ctx.rotate(a);
      ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -16); ctx.stroke(); ctx.restore();
    }
  },
  'stepper': {
    type: 'stepper', label: 'Stepper Motor', group: 'Motion', icon: '⚙',
    w: 64, h: 64,
    pins: pinRow(4, 'C', 60, 10, 14, 'io'),
    props: { steps: 200 },
    draw(ctx, inst, def) { ctx.beginPath(); ctx.arc(32, 28, 24, 0, Math.PI * 2); ctx.fillStyle = '#777'; ctx.fill(); ctx.stroke(); }
  },
  'buzzer': {
    type: 'buzzer', label: 'Buzzer', group: 'Output', icon: '🔊',
    w: 46, h: 46,
    pins: [{ id: '+', x: 12, y: 42, kind: 'io' }, { id: '-', x: 32, y: 42, kind: 'gnd' }],
    props: { freq: 1000, on: false },
    draw(ctx, inst, def) {
      ctx.beginPath(); ctx.arc(23, 20, 16, 0, Math.PI * 2); ctx.fillStyle = '#222'; ctx.fill();
      ctx.fillStyle = '#666'; ctx.beginPath(); ctx.arc(23, 20, 4, 0, Math.PI * 2); ctx.fill();
    }
  },
  'potentiometer': {
    type: 'potentiometer', label: 'Potentiometer', group: 'Input', icon: '🎛',
    w: 50, h: 50,
    pins: [{ id: '1', x: 6, y: 46, kind: 'io' }, { id: 'W', x: 24, y: 46, kind: 'analog' }, { id: '3', x: 42, y: 46, kind: 'io' }],
    props: { value: 512 },
    draw(ctx, inst, def) {
      ctx.beginPath(); ctx.arc(25, 22, 16, 0, Math.PI * 2); ctx.fillStyle = '#3b6'; ctx.fill();
      const a = (inst.props.value / 1023) * Math.PI * 1.5 - Math.PI * 1.25;
      ctx.save(); ctx.translate(25, 22); ctx.rotate(a); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, -14); ctx.stroke(); ctx.restore();
    }
  },
  'ldr': {
    type: 'ldr', label: 'Light Sensor (LDR)', group: 'Sensors', icon: '🌞',
    w: 44, h: 44,
    pins: [{ id: '1', x: 8, y: 40, kind: 'analog' }, { id: '2', x: 36, y: 40, kind: 'gnd' }],
    props: { lux: 300 },
    draw(ctx, inst, def) { ctx.beginPath(); ctx.arc(22, 18, 14, 0, Math.PI * 2); ctx.fillStyle = '#caa'; ctx.fill(); ctx.stroke(); }
  },
  'temp-sensor': {
    type: 'temp-sensor', label: 'Temp Sensor', group: 'Sensors', icon: '🌡',
    w: 44, h: 50,
    pins: [{ id: 'VCC', x: 8, y: 46, kind: 'power' }, { id: 'OUT', x: 22, y: 46, kind: 'analog' }, { id: 'GND', x: 36, y: 46, kind: 'gnd' }],
    props: { celsius: 25 },
    draw(ctx, inst, def) { board(ctx, def, '#a33', 'TMP'); }
  },
  'ultrasonic': {
    type: 'ultrasonic', label: 'Ultrasonic (HC-SR04)', group: 'Sensors', icon: '📡',
    w: 90, h: 50,
    pins: [{ id: 'VCC', x: 8, y: 46, kind: 'power' }, { id: 'TRIG', x: 30, y: 46, kind: 'io' }, { id: 'ECHO', x: 56, y: 46, kind: 'io' }, { id: 'GND', x: 82, y: 46, kind: 'gnd' }],
    props: { distance: 100 },
    draw(ctx, inst, def) {
      board(ctx, def, '#1b3a6b', 'HC-SR04');
      ctx.beginPath(); ctx.arc(30, 30, 9, 0, Math.PI * 2); ctx.arc(62, 30, 9, 0, Math.PI * 2);
      ctx.fillStyle = '#c0c0c0'; ctx.fill();
    }
  },
  'lcd1602': {
    type: 'lcd1602', label: 'LCD 16x2', group: 'Output', icon: '🖥',
    w: 160, h: 70,
    pins: [{ id: 'SDA', x: 20, y: 64, kind: 'io' }, { id: 'SCL', x: 50, y: 64, kind: 'io' }, { id: 'VCC', x: 110, y: 64, kind: 'power' }, { id: 'GND', x: 140, y: 64, kind: 'gnd' }],
    props: { line1: 'PriyangshuX8', line2: 'Workspace' },
    draw(ctx, inst, def) {
      roundRect(ctx, 0, 0, def.w, def.h, 6); ctx.fillStyle = '#0a4'; ctx.fill();
      roundRect(ctx, 8, 8, def.w - 16, 38, 4); ctx.fillStyle = '#9fe6b0'; ctx.fill();
      ctx.fillStyle = '#063'; ctx.font = '11px ui-monospace, monospace'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
      ctx.fillText(String(inst.state?.line1 ?? inst.props.line1).slice(0, 16), 12, 12);
      ctx.fillText(String(inst.state?.line2 ?? inst.props.line2).slice(0, 16), 12, 28);
    }
  },
  'bluetooth': {
    type: 'bluetooth', label: 'Bluetooth (HC-05)', group: 'Modules', icon: '🔷',
    w: 80, h: 46,
    pins: [{ id: 'RX', x: 10, y: 42, kind: 'io' }, { id: 'TX', x: 30, y: 42, kind: 'io' }, { id: 'VCC', x: 50, y: 42, kind: 'power' }, { id: 'GND', x: 70, y: 42, kind: 'gnd' }],
    props: { name: 'HC-05' },
    draw(ctx, inst, def) { board(ctx, def, '#1457c8', 'HC-05'); }
  },
  'battery': {
    type: 'battery', label: 'Battery', group: 'Power', icon: '🔋',
    w: 60, h: 40,
    pins: [{ id: '+', x: 56, y: 20, kind: 'power' }, { id: '-', x: 4, y: 20, kind: 'gnd' }],
    props: { volts: 9 },
    draw(ctx, inst, def) {
      roundRect(ctx, 6, 6, 48, 28, 4); ctx.fillStyle = '#2c2c2c'; ctx.fill();
      ctx.fillStyle = '#6fe0a8'; ctx.font = '600 12px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(`${inst.props.volts}V`, 30, 20);
    }
  }
};

/** @returns {ComponentDef[]} */
export function listCatalog() { return Object.values(CATALOG); }

/** @param {string} type @returns {ComponentDef|null} */
export function getDef(type) { return CATALOG[type] || null; }

/** Group the catalog by its "group" field for the palette. @returns {Record<string, ComponentDef[]>} */
export function groupedCatalog() {
  const groups = {};
  for (const def of listCatalog()) (groups[def.group] ||= []).push(def);
  return groups;
}
