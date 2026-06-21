/**
 * PriyangshuX8 Workspace - Matter.js Physics World
 * Lazily imports Matter.js (ESM, pinned) and provides a 2D rigid-body world for
 * motion projects: a chassis whose wheels are driven by DC-motor power from the
 * simulation, with collisions against boundary walls. Rendered to a 2D canvas.
 *
 * Matter.js is only fetched when `create()` is called, keeping the base app light.
 */

const MATTER_URL = 'https://cdn.jsdelivr.net/npm/matter-js@0.19.0/build/matter.min.js';

let Matter = null;

/** Lazily load Matter.js once (UMD build attaches to window.Matter). */
async function ensureMatter() {
  if (Matter) return;
  if (window.Matter) { Matter = window.Matter; return; }
  await import(/* @vite-ignore */ MATTER_URL).catch(async () => {
    // Fallback: inject as a classic script if the ESM import path is blocked.
    await new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = MATTER_URL; s.onload = resolve; s.onerror = reject; document.head.appendChild(s);
    });
  });
  Matter = window.Matter;
}

export class PhysicsWorld {
  /** @param {HTMLCanvasElement} canvas */
  constructor(canvas) {
    this.canvas = canvas;
    this.ready = false;
    this.bodies = {};
  }

  /** @returns {Promise<void>} */
  async create() {
    await ensureMatter();
    const { Engine, World, Bodies, Body, Composite } = Matter;
    this.M = Matter;
    this.engine = Engine.create();
    this.engine.gravity.y = 0; // top-down view: no gravity, motor-driven
    this.world = this.engine.world;

    const W = this.canvas.width, H = this.canvas.height;
    const wallOpts = { isStatic: true, render: {} };
    const t = 30;
    Composite.add(this.world, [
      Bodies.rectangle(W / 2, -t / 2, W, t, wallOpts),
      Bodies.rectangle(W / 2, H + t / 2, W, t, wallOpts),
      Bodies.rectangle(-t / 2, H / 2, t, H, wallOpts),
      Bodies.rectangle(W + t / 2, H / 2, t, H, wallOpts)
    ]);

    // A simple robot car chassis with two drive wheels.
    const cx = W / 2, cy = H / 2;
    this.chassis = Bodies.rectangle(cx, cy, 80, 50, { frictionAir: 0.06, restitution: 0.2 });
    Composite.add(this.world, this.chassis);

    // Scatter a few obstacles for collisions.
    this.obstacles = [];
    for (let i = 0; i < 4; i++) {
      const ob = Bodies.circle(80 + i * 90, 70, 18, { isStatic: true });
      this.obstacles.push(ob); Composite.add(this.world, ob);
    }

    this.ctx = this.canvas.getContext('2d');
    this.ready = true;
  }

  /**
   * Apply drive based on left/right motor power (-1..1 each) to steer the chassis.
   * @param {number} leftPower @param {number} rightPower
   */
  drive(leftPower, rightPower) {
    if (!this.ready) return;
    const { Body } = this.M;
    const forward = (leftPower + rightPower) / 2;
    const turn = (rightPower - leftPower);
    const angle = this.chassis.angle;
    const fx = Math.cos(angle) * forward * 0.0009;
    const fy = Math.sin(angle) * forward * 0.0009;
    Body.applyForce(this.chassis, this.chassis.position, { x: fx, y: fy });
    Body.setAngularVelocity(this.chassis, turn * 0.05);
  }

  /** Step the physics and draw. @param {number} dt */
  step(dt) {
    if (!this.ready) return;
    this.M.Engine.update(this.engine, Math.min(dt, 33));
    this._draw();
  }

  _draw() {
    const ctx = this.ctx, W = this.canvas.width, H = this.canvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(11,16,32,1)'; ctx.fillRect(0, 0, W, H);

    // Obstacles.
    ctx.fillStyle = '#3a4a78';
    for (const ob of this.obstacles) { ctx.beginPath(); ctx.arc(ob.position.x, ob.position.y, ob.circleRadius, 0, Math.PI * 2); ctx.fill(); }

    // Chassis.
    ctx.save();
    ctx.translate(this.chassis.position.x, this.chassis.position.y);
    ctx.rotate(this.chassis.angle);
    ctx.fillStyle = '#5b8cff'; ctx.fillRect(-40, -25, 80, 50);
    ctx.fillStyle = '#1b2342'; ctx.fillRect(-40, -30, 16, 12); ctx.fillRect(24, -30, 16, 12);
    ctx.fillRect(-40, 18, 16, 12); ctx.fillRect(24, 18, 16, 12);
    ctx.fillStyle = '#6fe0a8'; ctx.fillRect(28, -6, 14, 12); // headlight/front marker
    ctx.restore();
  }

  reset() {
    if (!this.ready) return;
    const { Body } = this.M;
    Body.setPosition(this.chassis, { x: this.canvas.width / 2, y: this.canvas.height / 2 });
    Body.setAngle(this.chassis, 0);
    Body.setVelocity(this.chassis, { x: 0, y: 0 });
    Body.setAngularVelocity(this.chassis, 0);
  }

  dispose() {
    this.ready = false;
    if (this.M) this.M.Composite.clear(this.world, false);
  }
}
