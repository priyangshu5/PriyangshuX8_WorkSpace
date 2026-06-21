/**
 * PriyangshuX8 Workspace - AI Context Bridge
 * Collects READ-ONLY workspace context for the assistant: the active project,
 * the current Lab circuit model, and the currently open file in Code Studio.
 * Providers receive this so they can answer grounded questions. It never
 * mutates anything and never performs network calls.
 */

export class ContextBridge {
  /** @param {import('../core/kernel.js').Kernel} kernel */
  constructor(kernel) {
    this.kernel = kernel;
    this.openFile = null;
    // Track the last file opened in Code Studio (best-effort, read-only).
    this._off = kernel.events.on('code:open', ({ path }) => { if (path) this.openFile = path; });
  }

  /** @returns {Promise<object>} A snapshot of read-only context. */
  async collect() {
    const ctx = { project: null, circuit: null, openFile: this.openFile, fileContent: null };
    const vfs = this.kernel.services.get('vfs');
    const projects = this.kernel.services.get('projects');

    // Active project metadata.
    try {
      if (projects) {
        const paths = await projects.activePaths();
        if (paths) {
          let type = 'project';
          const metaPath = `${projects.dir(paths.name)}/project.json`;
          if (vfs?.isFile(metaPath)) { try { type = JSON.parse(vfs.readFile(metaPath)).type || type; } catch {} }
          ctx.project = { name: paths.name, type, sketch: paths.sketch, circuit: paths.circuit };
        }
      }
    } catch {}

    // Live Lab circuit (prefer the running engine's model, else the active project's circuit file).
    try {
      const sim = this.kernel.services.get('sim');
      if (sim && sim.model && sim.model.instances?.length) {
        ctx.circuit = { instances: sim.model.instances, wires: sim.model.wires };
      } else if (ctx.project && vfs?.isFile(ctx.project.circuit)) {
        ctx.circuit = JSON.parse(vfs.readFile(ctx.project.circuit));
      }
    } catch {}

    // Snippet of the open file for grounding (capped).
    try {
      if (this.openFile && vfs?.isFile(this.openFile)) {
        ctx.fileContent = vfs.readFile(this.openFile).slice(0, 2000);
      }
    } catch {}

    return ctx;
  }

  dispose() { this._off?.(); }
}
