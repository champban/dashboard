/**
 * Simulator worker host — the real @dtp/engine kernel plus the WOW-02
 * "measured suggestions" service: candidate improvements are not guessed,
 * they are SIMULATED headlessly (deterministic, seed-pinned) and reported
 * with measured deltas.
 */
import { SimEngine, TICK, type LineConfig, type SimCommand } from '@dtp/engine';

let engine: SimEngine | null = null;
let config: LineConfig | null = null;
let running = false;
let speed = 4;

const SNAPSHOT_MS = 33;
let frame = 0;

setInterval(() => {
  if (!engine) return;
  if (running) {
    const steps = Math.round((SNAPSHOT_MS / 1000) * speed / TICK);
    for (let i = 0; i < steps; i++) engine.step();
  }
  postMessage({ type: 'snapshot', snapshot: engine.snapshot() });
  if (frame++ % 15 === 0) postMessage({ type: 'report', report: engine.report() });
}, SNAPSHOT_MS);

/** deep-clone the live config (params may have been changed by setParam) */
const cloneConfig = (): LineConfig => JSON.parse(JSON.stringify(config));

interface Candidate { label: string; changes: { machineId: string; key: string; value: number }[] }

function lineKpis(e: SimEngine) {
  const rep = e.report();
  const snap = e.snapshot();
  const sink = snap.machines.find(m => m.archetype === 'sink');
  const bottleneck = rep.bottleneck;
  const bm = rep.machines.find(m => m.id === bottleneck);
  return {
    throughputPpm: rep.elapsed > 0 && sink ? (sink.count / rep.elapsed) * 60 : 0,
    oee: bm?.oee?.value ?? 0,
    bottleneck,
  };
}

function runWhatIf(candidates: Candidate[], horizon: number) {
  const results = [];
  // baseline with CURRENT parameters, same seed, fresh run — apples to apples
  const base = new SimEngine(cloneConfig());
  base.run(horizon);
  const baseline = lineKpis(base);

  for (const c of candidates) {
    const cfg = cloneConfig();
    for (const ch of c.changes) {
      const m = cfg.machines.find(x => x.id === ch.machineId);
      if (m) m.params[ch.key] = ch.value;
    }
    const e = new SimEngine(cfg);
    e.run(horizon);
    const k = lineKpis(e);
    results.push({
      label: c.label,
      changes: c.changes,
      throughputPpm: k.throughputPpm,
      dTput: k.throughputPpm - baseline.throughputPpm,
      oee: k.oee,
      dOee: k.oee - baseline.oee,
      bottleneck: k.bottleneck,
    });
  }
  return { baseline, horizon, results };
}

onmessage = (e: MessageEvent) => {
  const msg = e.data as
    | { type: 'load'; config: LineConfig }
    | { type: 'start' } | { type: 'pause' }
    | { type: 'setSpeed'; speed: number }
    | { type: 'sprint'; seconds: number }              // MAX: headless fast-forward
    | { type: 'command'; command: SimCommand }
    | { type: 'whatif'; candidates: Candidate[]; horizon: number };

  switch (msg.type) {
    case 'load':
      config = msg.config;
      engine = new SimEngine(JSON.parse(JSON.stringify(config)));
      postMessage({ type: 'loaded' });
      break;
    case 'start': running = true; break;
    case 'pause': running = false; break;
    case 'setSpeed': speed = msg.speed; break;
    case 'sprint':
      if (engine) {
        engine.run(msg.seconds);
        postMessage({ type: 'snapshot', snapshot: engine.snapshot() });
        postMessage({ type: 'report', report: engine.report() });
      }
      break;
    case 'command':
      if (!engine || !config) break;
      engine.applyCommand(msg.command);
      if (msg.command.type === 'setParam') {   // keep authoritative config in sync
        const m = config.machines.find(x => x.id === msg.command.machineId);
        if (m) m.params[msg.command.key] = msg.command.value;
      }
      break;
    case 'whatif': {
      const out = runWhatIf(msg.candidates, msg.horizon);
      postMessage({ type: 'whatif', ...out });
      break;
    }
  }
};
