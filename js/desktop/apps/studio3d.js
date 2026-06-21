/**
 * PriyangshuX8 Workspace - 3D / Physics Studio app
 * A dual-mode viewer that visualizes the live circuit simulation in real 3D
 * (Three.js) and runs a 2D rigid-body physics demo (Matter.js) for motion
 * projects. Both heavy libraries load lazily only when their view is shown.
 *
 * It reads the shared SimulationEngine model so it stays in sync with the Lab.
 */

/** @param {import('../../core/kernel.js').Kernel} kernel */
export function registerStudio3D(kernel) {
  kernel.apps.register({
    id: 'px8-studio3d',
    title: '3D / Physics',
    icon: '🧊',
    defaultSize: { width: 820, height: 560 },
    render: () => buildStudio(kernel)
  });
}

/** @param {import('../../core/kernel.js').Kernel} kernel @returns {HTMLElement} */
function buildStudio(kernel) {
  const root = document.createElement('div');
  root.className = 'studio';
  root.innerHTML = `
    <div class="studio__toolbar">
      <div class="studio__tabs">
        <button class="studio__tab studio__tab--active" data-view="3d">3D View</button>
        <button class="studio__tab" data-view="physics">Physics</button>
      </div>
      <span class="studio__spacer"></span>
      <span class="studio__hint" data-role="hint">Drag to orbit · scroll to zoom</span>
      <button class="studio__btn" data-act="rebuild">Sync circuit</button>
    </div>
    <div class="studio__stage" data-role="stage">
      <div class="studio__loading" data-role="loading">Loading 3D engine…</div>
      <div class="studio__three" data-role="three" hidden></div>
      <canvas class="studio__physics" data-role="physics" width="760" height="460" hidden></canvas>
    </div>
    <div class="studio__status" data-role="status">Idle</div>
  `;

  const stage = root.querySelector('[data-role="stage"]');
  const threeHost = root.querySelector('[data-role="three"]');
  const physCanvas = root.querySelector('[data-role="physics"]');
  const loading = root.querySelector('[data-role="loading"]');
  const statusEl = root.querySelector('[data-role="status"]');
  const hintEl = root.querySelector('[data-role="hint"]');

  const theme = kernel.services.get('theme');
  const perf = !!theme?.state?.performance;

  let view = '3d';
  let scene = null;      // ThreeScene
  let physics = null;    // PhysicsWorld
  let raf = 0;
  let last = performance.now();

  /** Read the shared engine's model, or fall back to an empty model. */
  function currentModel() {
    const engine = kernel.services.get('sim');
    if (engine && engine.model) return engine.model;
    return { instances: [], wires: [] };
  }

  async function show3D() {
    view = '3d';
    physCanvas.hidden = true;
    hintEl.textContent = 'Drag to orbit · scroll to zoom';
    if (!scene) {
      loading.hidden = false; loading.textContent = 'Loading 3D engine…';
      try {
        const { ThreeScene } = await import('../../graphics/three-scene.js');
        scene = new ThreeScene(threeHost, { performance: perf });
        await scene.create();
        scene.build(currentModel().instances);
      } catch (e) {
        loading.textContent = 'Failed to load 3D engine. Check your connection (first run needs internet).';
        statusEl.textContent = 'Error: ' + e.message;
        return;
      }
    }
    loading.hidden = true; threeHost.hidden = false;
    statusEl.textContent = '3D view active';
    startLoop();
  }

  async function showPhysics() {
    view = 'physics';
    threeHost.hidden = true;
    hintEl.textContent = 'Robot car driven by DC-motor power';
    if (!physics) {
      loading.hidden = false; loading.textContent = 'Loading physics engine…';
      try {
        const { PhysicsWorld } = await import('../../physics/physics-world.js');
        // Size canvas to the stage.
        physCanvas.width = stage.clientWidth || 760;
        physCanvas.height = (stage.clientHeight || 460);
        physics = new PhysicsWorld(physCanvas);
        await physics.create();
      } catch (e) {
        loading.textContent = 'Failed to load physics engine. Check your connection (first run needs internet).';
        statusEl.textContent = 'Error: ' + e.message;
        return;
      }
    }
    loading.hidden = true; physCanvas.hidden = false;
    statusEl.textContent = 'Physics view active';
    startLoop();
  }

  function motorPowers() {
    // Average power across DC motors; first half = left, second half = right.
    const model = currentModel();
    const motors = model.instances.filter((i) => i.type === 'dc-motor');
    if (!motors.length) return { left: 0, right: 0 };
    const mid = Math.ceil(motors.length / 2);
    const avg = (arr) => arr.length ? arr.reduce((s, m) => s + (m.state?.power || 0), 0) / arr.length : 0;
    return { left: avg(motors.slice(0, mid)), right: avg(motors.slice(mid)) || avg(motors.slice(0, mid)) };
  }

  function startLoop() {
    cancelAnimationFrame(raf);
    last = performance.now();
    const loop = (t) => {
      const dt = Math.min(50, t - last); last = t;
      if (view === '3d' && scene) scene.render(dt);
      else if (view === 'physics' && physics) {
        const { left, right } = motorPowers();
        physics.drive(left || 0.4, right || 0.4); // gentle default drive if no motors
        physics.step(dt);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
  }

  // Tabs + toolbar.
  root.addEventListener('click', (e) => {
    const tabBtn = e.target.closest('[data-view]');
    if (tabBtn) {
      root.querySelectorAll('.studio__tab').forEach((b) => b.classList.toggle('studio__tab--active', b === tabBtn));
      if (tabBtn.dataset.view === '3d') show3D(); else showPhysics();
      return;
    }
    const act = e.target.closest('[data-act]')?.dataset.act;
    if (act === 'rebuild') {
      if (view === '3d' && scene) { scene.build(currentModel().instances); statusEl.textContent = 'Circuit synced to 3D'; }
      else if (view === 'physics' && physics) { physics.reset(); statusEl.textContent = 'Physics reset'; }
    }
  });

  // Cleanup on window close.
  root.addEventListener('px8:disconnect', () => {
    cancelAnimationFrame(raf);
    scene?.dispose();
    physics?.dispose();
  });

  // Start in 3D after the element is mounted and sized.
  requestAnimationFrame(() => show3D());

  return root;
}
