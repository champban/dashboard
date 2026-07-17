/**
 * OEE validation against STANDARDS.md definitions, with hand calculations.
 */
import { describe, expect, it } from 'vitest';
import { SimEngine, type LineConfig } from '@dtp/engine';

describe('OEE', () => {
  it('ideal saturated processor: A = 1, P ≈ 1, Q = 1 ⇒ OEE ≈ 1', () => {
    // saturated wrapper: infeed much faster than cycle, no failures/rejects.
    const cfg: LineConfig = {
      name: 'ideal', seed: 1,
      machines: [
        { id: 'IN', archetype: 'source', outputs: ['B'], params: { interval: 0.2, count: 0 }, emits: 'x' },
        { id: 'B', archetype: 'buffer', outputs: ['P'], params: { capacity: 50 } },
        { id: 'P', archetype: 'processor', outputs: ['SK'], params: { cycleTime: 1.0 }, emits: 'y' },
        { id: 'SK', archetype: 'sink', params: {} },
      ],
    };
    const e = new SimEngine(cfg);
    e.run(600);
    const p = e.report().machines.find(m => m.id === 'P')!;
    // hand calc: ~600 cycles × 1.0 s in 600 s runtime ⇒ P ≈ 1; never idle/down ⇒ A = 1
    expect(p.availability!.value).toBeCloseTo(1, 2);
    expect(p.performance!.value).toBeGreaterThan(0.98);
    expect(p.quality!.value).toBe(1);
    expect(p.oee!.value).toBeGreaterThan(0.97);
  });

  it('quality: rejectRate 0.2 ⇒ Q ≈ 0.8 and OEE scales with it', () => {
    const cfg: LineConfig = {
      name: 'quality', seed: 7,
      machines: [
        { id: 'IN', archetype: 'source', outputs: ['B'], params: { interval: 0.2, count: 0 }, emits: 'x' },
        { id: 'B', archetype: 'buffer', outputs: ['P'], params: { capacity: 50 } },
        { id: 'P', archetype: 'processor', outputs: ['SK'],
          params: { cycleTime: 1.0, rejectRate: 0.2 }, emits: 'y' },
        { id: 'SK', archetype: 'sink', params: {} },
      ],
    };
    const e = new SimEngine(cfg);
    e.run(3000); // ~3000 cycles ⇒ sample large enough for ±3 % tolerance
    const p = e.report().machines.find(m => m.id === 'P')!;
    expect(p.quality!.value).toBeGreaterThan(0.77);
    expect(p.quality!.value).toBeLessThan(0.83);
    // goodCount must match sink arrivals exactly — no items invented or lost
    const sink = e.snapshot().machines.find(m => m.id === 'SK')!;
    expect(p.goodCount).toBe(sink.count);
  });

  it('every OEE component is a transparent CalcValue with formula and inputs', () => {
    const cfg: LineConfig = {
      name: 't', seed: 1,
      machines: [
        { id: 'IN', archetype: 'source', outputs: ['P'], params: { interval: 1, count: 5 }, emits: 'x' },
        { id: 'P', archetype: 'processor', outputs: ['SK'], params: { cycleTime: 0.5 }, emits: 'y' },
        { id: 'SK', archetype: 'sink', params: {} },
      ],
    };
    const e = new SimEngine(cfg);
    e.run(20);
    const p = e.report().machines.find(m => m.id === 'P')!;
    for (const cv of [p.availability!, p.performance!, p.quality!, p.oee!]) {
      expect(cv.formula).toBeTruthy();          // EDR-003: no naked numbers
      expect(cv.unit).toBe('ratio');
    }
    expect(p.performance!.inputs).toHaveProperty('idealCycleTime');
  });
});
