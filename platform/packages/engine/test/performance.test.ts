/**
 * Performance measurement (AWP-003 Part A). Not a micro-benchmark — a budget
 * guard: a realistic line must simulate far faster than real time, or the
 * platform's "large simulations stay responsive" principle is broken.
 */
import { describe, expect, it } from 'vitest';
import { SimEngine, type LineConfig, type MachineConfig } from '@dtp/engine';

/** 10 parallel branches × (source→belt→processor→belt→processor→sink) = 60 machines */
function bigLine(): LineConfig {
  const machines: MachineConfig[] = [];
  for (let b = 0; b < 10; b++) {
    machines.push(
      { id: `IN-${b}`, archetype: 'source', outputs: [`CVA-${b}`],
        params: { interval: 0.5, count: 0 }, emits: 'item' },
      { id: `CVA-${b}`, archetype: 'transport', outputs: [`P1-${b}`],
        params: { length: 5, speed: 0.5, spacing: 0.15 } },
      { id: `P1-${b}`, archetype: 'processor', outputs: [`CVB-${b}`],
        params: { cycleTime: 0.6 }, emits: 'stage1' },
      { id: `CVB-${b}`, archetype: 'transport', outputs: [`P2-${b}`],
        params: { length: 5, speed: 0.5, spacing: 0.15 } },
      { id: `P2-${b}`, archetype: 'processor', outputs: [`SK-${b}`],
        params: { cycleTime: 0.7 }, emits: 'stage2' },
      { id: `SK-${b}`, archetype: 'sink', params: {} },
    );
  }
  return { name: 'big', seed: 5, machines };
}

describe('performance', () => {
  it('60 machines, 1 h of simulated time, well under real time', () => {
    const e = new SimEngine(bigLine());
    const t0 = performance.now();
    e.run(3600);                         // 360 000 ticks
    const wallMs = performance.now() - t0;
    const speedFactor = 3600_000 / wallMs;

    // evidence for the report:
    console.log(`kernel perf: 60 machines, 1h sim in ${wallMs.toFixed(0)} ms ` +
      `(${speedFactor.toFixed(0)}× real time)`);

    // budget: at least 50× real time in CI-grade hardware; typically ≫
    expect(speedFactor).toBeGreaterThan(50);
    // sanity: the line actually produced (~10 branches × 3600/0.7 ≈ 51 000 items)
    const produced = e.snapshot().machines
      .filter(m => m.archetype === 'sink')
      .reduce((n, m) => n + m.count, 0);
    expect(produced).toBeGreaterThan(45000);
  });
});
