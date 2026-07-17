/**
 * Determinism (EDR-004): same config + seed ⇒ bit-identical results,
 * including under random failures and rejects. Different seed ⇒ different
 * stochastic history.
 */
import { describe, expect, it } from 'vitest';
import { SimEngine, type LineConfig } from '@dtp/engine';

function stochasticLine(seed: number): LineConfig {
  return {
    name: 'stochastic',
    seed,
    machines: [
      { id: 'IN-01', archetype: 'source', outputs: ['CV-01'],
        params: { interval: 0.8, count: 0 }, emits: 'cookie' },
      { id: 'CV-01', archetype: 'transport', outputs: ['FW-01'],
        params: { length: 3.0, speed: 0.5, spacing: 0.15 } },
      { id: 'FW-01', archetype: 'processor', outputs: ['SK-01'],
        params: { cycleTime: 1.0, mtbf: 60, mttr: 5, rejectRate: 0.05 }, emits: 'pack' },
      { id: 'SK-01', archetype: 'sink', params: {} },
    ],
  };
}

function fingerprint(e: SimEngine): string {
  return JSON.stringify({ snap: e.snapshot(), report: e.report() });
}

describe('determinism', () => {
  it('same seed ⇒ bit-identical snapshot, report, and event log', () => {
    const a = new SimEngine(stochasticLine(1234));
    const b = new SimEngine(stochasticLine(1234));
    a.run(300);
    b.run(300);
    expect(fingerprint(a)).toBe(fingerprint(b));
  });

  it('different seed ⇒ different stochastic history', () => {
    const a = new SimEngine(stochasticLine(1234));
    const b = new SimEngine(stochasticLine(9999));
    a.run(300);
    b.run(300);
    expect(fingerprint(a)).not.toBe(fingerprint(b));
  });

  it('reset reproduces the original run exactly', () => {
    const e = new SimEngine(stochasticLine(777));
    e.run(120);
    const first = fingerprint(e);
    e.applyCommand({ type: 'reset' });
    e.run(120);
    expect(fingerprint(e)).toBe(first);
  });
});
