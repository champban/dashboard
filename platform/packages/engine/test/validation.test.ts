/**
 * Engineering validation — every assertion here is checked against a hand
 * calculation written in the comment above it. If one of these fails, the
 * kernel's math is wrong, full stop.
 */
import { describe, expect, it } from 'vitest';
import { SimEngine, TICK, type LineConfig } from '@dtp/engine';

/** source → conveyor → wrapper → sink, the AWP-001 PoC line, now on the real kernel */
function cookieLine(overrides?: Partial<Record<string, number>>): LineConfig {
  return {
    name: 'cookie-line',
    seed: 42,
    machines: [
      { id: 'IN-01', archetype: 'source', outputs: ['CV-01'],
        params: { interval: overrides?.interval ?? 1.0, count: overrides?.count ?? 10 },
        emits: 'cookie' },
      { id: 'CV-01', archetype: 'transport', outputs: ['FW-01'],
        params: { length: 4.0, speed: overrides?.speed ?? 0.5, spacing: 0.15 } },
      { id: 'FW-01', archetype: 'processor', outputs: ['SK-01'],
        params: { cycleTime: overrides?.cycleTime ?? 0.5 }, emits: 'pack' },
      { id: 'SK-01', archetype: 'sink', params: {} },
    ],
  };
}

describe('transport physics', () => {
  it('an item traverses the conveyor in exactly length/speed seconds (±1 tick)', () => {
    // hand calc: 4.0 m ÷ 0.5 m/s = 8.0 s to reach discharge;
    // + wrapper cycle 0.5 s ⇒ first pack in the sink at t ≈ 8.5 s
    const e = new SimEngine(cookieLine({ count: 1 }));
    let arrived = -1;
    for (let t = 0; t < 12; t += TICK) {
      e.step();
      const sink = e.snapshot().machines.find(m => m.id === 'SK-01')!;
      if (sink.count === 1) { arrived = e.time; break; }
    }
    expect(arrived).toBeGreaterThan(0);
    expect(arrived).toBeCloseTo(8.5, 1);
  });
});

describe('throughput and bottleneck', () => {
  it('wrapper-limited line: throughput equals wrapper rate, queue accumulates', () => {
    // hand calc: infeed 1 item/s = 60 ppm; wrapper cycle 1.5 s ⇒ max 40 ppm.
    // Wrapper is the constraint ⇒ steady-state output rate = 1/1.5 items/s.
    // In 120 s with infinite supply: ≈ (120 − startup) / 1.5 completed items.
    const e = new SimEngine(cookieLine({ count: 0, cycleTime: 1.5 }));
    e.run(120);
    const sink = e.snapshot().machines.find(m => m.id === 'SK-01')!;
    // startup ≈ 8 s transport + first cycle; (120 − 8) / 1.5 ≈ 74.6 ⇒ 74±1
    expect(sink.count).toBeGreaterThanOrEqual(73);
    expect(sink.count).toBeLessThanOrEqual(75);
    // belt must be accumulating: more items on the conveyor than free-flow would hold
    const belt = e.snapshot().machines.find(m => m.id === 'CV-01')!;
    expect(belt.count).toBeGreaterThan(8); // free-flow holds 4m/(0.5m/s·1s) = 8 in transit
    expect(e.report().bottleneck).toBe('FW-01');
  });

  it('batch processor consumes N inputs per output (case packer 6:1)', () => {
    // hand calc: 12 cookies, batchSize 6 ⇒ exactly 2 cases; each case holds 6.
    const cfg = cookieLine({ count: 12 });
    cfg.machines[2] = {
      id: 'CP-01', archetype: 'processor', outputs: ['SK-01'],
      params: { cycleTime: 0.5, batchSize: 6 }, emits: 'case',
    };
    cfg.machines[1]!.outputs = ['CP-01'];
    const e = new SimEngine(cfg);
    e.run(60);
    const sink = e.snapshot().machines.find(m => m.id === 'SK-01')!;
    expect(sink.count).toBe(2);
  });
});

describe('batch completion', () => {
  it('a finite batch fully drains the line and the engine reports done', () => {
    const e = new SimEngine(cookieLine());
    e.run(30); // hand calc: last cookie spawns t=9, arrives ≈17, wrapped ≈17.5
    const snap = e.snapshot();
    expect(snap.machines.find(m => m.id === 'SK-01')!.count).toBe(10);
    expect(snap.done).toBe(true);
  });
});
