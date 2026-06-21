/**
 * PriyangshuX8 Workspace - Three.js 3D Scene
 * Lazily imports Three.js (ESM, pinned) and renders a premium 3D scene with
 * orbit controls, soft shadows, and 3D proxies for circuit components. The
 * scene is synced every frame to the live simulation state (LED glow, motor /
 * propeller spin, servo arm angle) so it mirrors the running circuit.
 *
 * Three.js is only fetched when this module's `create()` is first called, so it
 * never weighs down the base app on low-end devices.
 */

const THREE_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';
const ORBIT_URL = 'https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js';

let THREE = null;
let OrbitControls = null;

/** Lazily load Three.js + OrbitControls once. @returns {Promise<void>} */
async function ensureThree() {
  if (THREE) return;
  THREE = await import(/* @vite-ignore */ THREE_URL);
  ({ OrbitControls } = await import(/* @vite-ignore */ ORBIT_URL));
}

/** Map a component type to a height for stacking on the 3D board. */
const TYPE_HEIGHT = { led: 0.6, 'dc-motor': 0.9, servo: 0.7, buzzer: 0.5, default: 0.4 };

export class ThreeScene {
  /** @param {HTMLElement} container @param {object} options */
  constructor(container, { performance = false } = {}) {
    this.container = container;
    this.performance = performance;
    this.ready = false;
    this._raf = 0;
    /** @type {Map<string, any>} type-specific meshes keyed by instance id */
    this.meshes = new Map();
    this._spin = new Map();
  }

  /** Initialize the renderer, camera, lights and ground. @returns {Promise<void>} */
  async create() {
    await ensureThree();
    const w = this.container.clientWidth || 600;
    const h = this.container.clientHeight || 400;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b1020);

    this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 1000);
    this.camera.position.set(8, 8, 12);

    this.renderer = new THREE.WebGLRenderer({ antialias: !this.performance, alpha: false });
    this.renderer.setPixelRatio(this.performance ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(w, h);
    this.renderer.shadowMap.enabled = !this.performance;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.maxPolarAngle = Math.PI * 0.49;

    // Lights.
    const ambient = new THREE.AmbientLight(0xffffff, 0.5);
    this.scene.add(ambient);
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(10, 16, 8);
    key.castShadow = !this.performance;
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.near = 1; key.shadow.camera.far = 60;
    key.shadow.camera.left = -20; key.shadow.camera.right = 20;
    key.shadow.camera.top = 20; key.shadow.camera.bottom = -20;
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x5b8cff, 0.4);
    rim.position.set(-8, 6, -10);
    this.scene.add(rim);

    // Ground.
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(30, 48),
      new THREE.MeshStandardMaterial({ color: 0x141c33, roughness: 0.95, metalness: 0.0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = !this.performance;
    this.scene.add(ground);

    const grid = new THREE.GridHelper(60, 60, 0x2a3a66, 0x1a2342);
    grid.position.y = 0.01;
    this.scene.add(grid);

    window.addEventListener('resize', this._onResize);
    this.ready = true;
  }

  _onResize = () => {
    if (!this.ready) return;
    const w = this.container.clientWidth, h = this.container.clientHeight;
    if (!w || !h) return;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  /**
   * Rebuild 3D proxies for the given circuit instances.
   * @param {object[]} instances
   */
  build(instances) {
    for (const m of this.meshes.values()) this.scene.remove(m);
    this.meshes.clear(); this._spin.clear();

    let i = 0;
    for (const inst of instances) {
      const group = new THREE.Group();
      const px = (i % 6) * 3 - 7.5, pz = Math.floor(i / 6) * 3 - 4;
      group.position.set(px, 0, pz);
      const mesh = this._meshFor(inst);
      if (!mesh) { i++; continue; }
      group.add(mesh);
      group.userData = { inst, mesh };
      this.scene.add(group);
      this.meshes.set(inst.id, group);
      i++;
    }
  }

  /** Build a type-appropriate mesh. @param {object} inst */
  _meshFor(inst) {
    const std = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.1, ...opts });
    let mesh;
    switch (inst.type) {
      case 'led': {
        mesh = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 24), std(inst.props.color || 0xff5252, { emissive: 0x000000 }));
        mesh.position.y = 0.7;
        break;
      }
      case 'dc-motor': case 'stepper': {
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 1.2, 24), std(0x888888, { metalness: 0.6, roughness: 0.4 }));
        body.position.y = 0.7;
        const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 1.6, 12), std(0x333333));
        shaft.rotation.z = Math.PI / 2; shaft.position.set(0, 0.7, 0);
        const blade = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.08, 0.3), std(0x222222));
        blade.position.set(0, 0.7, 0);
        const g = new THREE.Group(); g.add(body, shaft, blade);
        g.userData.spinner = blade;
        mesh = g;
        break;
      }
      case 'servo': {
        const body = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1, 0.7), std(0x22aa77));
        body.position.y = 0.5;
        const arm = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.06, 1.2), std(0xffffff));
        arm.position.set(0, 1.05, 0);
        const g = new THREE.Group(); g.add(body, arm); g.userData.arm = arm;
        mesh = g;
        break;
      }
      case 'buzzer': {
        mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.5, 20), std(0x222222));
        mesh.position.y = 0.4;
        break;
      }
      case 'battery': {
        mesh = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.8, 0.6), std(0x2c2c2c));
        mesh.position.y = 0.5;
        break;
      }
      default: {
        if (inst.type.includes('arduino') || inst.type.includes('esp') || inst.type.includes('raspberry') || inst.type === 'breadboard') {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.25, 1.8),
            std(inst.type === 'breadboard' ? 0xe9e6dc : 0x1b6fb3));
          mesh.position.y = 0.13;
        } else {
          mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.5, 0.8), std(0x556080));
          mesh.position.y = 0.25;
        }
      }
    }
    mesh.traverse?.((o) => { if (o.isMesh) { o.castShadow = !this.performance; o.receiveShadow = !this.performance; } });
    if (mesh.isMesh) { mesh.castShadow = !this.performance; mesh.receiveShadow = !this.performance; }
    return mesh;
  }

  /** Sync mesh appearance/motion to live sim state. @param {number} dt */
  syncFrame(dt) {
    for (const group of this.meshes.values()) {
      const { inst, mesh } = group.userData;
      const st = inst.state || {};
      if (inst.type === 'led') {
        const lit = !!st.on;
        const mat = mesh.material;
        const col = new THREE.Color(inst.props.color || 0xff5252);
        mat.emissive = col;
        mat.emissiveIntensity = lit ? (st.brightness ?? 1) * 1.4 : 0.0;
        mat.needsUpdate = true;
      } else if ((inst.type === 'dc-motor' || inst.type === 'stepper') && mesh.userData.spinner) {
        const power = st.power || 0;
        mesh.userData.spinner.rotation.x += power * 12 * (dt / 1000) * 60 / 60;
      } else if (inst.type === 'servo' && mesh.userData.arm) {
        const angle = (st.angle ?? inst.props.angle ?? 90);
        mesh.userData.arm.rotation.y = (angle - 90) * Math.PI / 180;
      }
    }
  }

  /** Render one frame. @param {number} dt */
  render(dt) {
    if (!this.ready) return;
    this.controls.update();
    this.syncFrame(dt);
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    this.ready = false;
    cancelAnimationFrame(this._raf);
    window.removeEventListener('resize', this._onResize);
    this.renderer?.dispose?.();
    if (this.renderer?.domElement?.parentNode) this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    this.meshes.clear();
  }
}
