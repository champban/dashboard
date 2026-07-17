/**
 * Demo-002 worker host — proves EDR-001 physically: the kernel runs in a
 * Worker; the page only ever sees snapshots and reports.
 */
import { SimEngine, TICK, type LineConfig, type SimCommand } from '@dtp/engine';

let engine: SimEngine | null = null;
let running = false;
let speed = 1;

const SNAPSHOT_MS = 33;   // ~30 Hz to the page
const REPORT_EVERY = 15;  // report ~2 Hz

let frame = 0;

setInterval(() => {
  if (!engine) return;
  if (running) {
    const simSeconds = (SNAPSHOT_MS / 1000) * speed;
    const steps = Math.round(simSeconds / TICK);
    for (let i = 0; i < steps; i++) engine.step();
  }
  postMessage({ type: 'snapshot', snapshot: engine.snapshot() });
  if (frame++ % REPORT_EVERY === 0) {
    postMessage({ type: 'report', report: engine.report() });
  }
}, SNAPSHOT_MS);

onmessage = (e: MessageEvent) => {
  const msg = e.data as
    | { type: 'init'; config: LineConfig }
    | { type: 'start' } | { type: 'pause' }
    | { type: 'setSpeed'; speed: number }
    | { type: 'command'; command: SimCommand };
  switch (msg.type) {
    case 'init': engine = new SimEngine(msg.config); break;
    case 'start': running = true; break;
    case 'pause': running = false; break;
    case 'setSpeed': speed = msg.speed; break;
    case 'command': engine?.applyCommand(msg.command); break;
  }
};
