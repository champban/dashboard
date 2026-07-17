/**
 * SimEngine — deterministic hybrid kernel (EDR-004).
 * Pure logic: no DOM, no rendering, no wall-clock. Same config + seed ⇒
 * bit-identical results at any speed on any machine.
 */

import { mulberry32, expDraw } from './prng.js';
import { createMachine, type Machine, type TickCtx } from './archetypes.js';
import { Recorder, type RecorderReport } from './recorder.js';
import {
  TICK,
  type LineConfig, type SimCommand, type SimulationSnapshot, type ProductItem,
} from './types.js';

export class SimEngine {
  readonly config: LineConfig;
  private machines: Machine[] = [];
  private byId = new Map<string, Machine>();
  private rng!: () => number;
  private recorder = new Recorder();
  private uid = 0;
  time = 0;

  constructor(config: LineConfig) {
    this.config = config;
    this.build();
  }

  private build(): void {
    this.rng = mulberry32(this.config.seed);
    this.uid = 0;
    this.time = 0;
    this.machines = this.config.machines.map(createMachine);
    this.byId = new Map(this.machines.map(m => [m.cfg.id, m]));
    this.recorder = new Recorder();
    const upstream = new Map<string, string[]>();
    for (const m of this.machines) {
      // validate topology early — a config error must fail loudly, not drift
      for (const out of m.cfg.outputs ?? []) {
        if (!this.byId.has(out)) throw new Error(`${m.cfg.id}: unknown output "${out}"`);
        upstream.set(out, [...(upstream.get(out) ?? []), m.cfg.id]);
      }
    }
    for (const m of this.machines) {
      this.recorder.register(
        m.cfg.id,
        m.cfg.archetype === 'processor',
        m.cfg.params['cycleTime'] ?? 0,
        m.cfg.params['batchSize'] ?? 1,
        upstream.get(m.cfg.id) ?? [],
      );
    }
  }

  /** Advance simulation by one fixed tick. */
  step(): void {
    const dt = TICK;
    // reverse order: downstream machines tick first so freed space
    // propagates upstream within the same tick (LineConfig contract)
    for (let i = this.machines.length - 1; i >= 0; i--) {
      const m = this.machines[i]!;
      const ctx: TickCtx = {
        time: this.time,
        dt,
        rng: this.rng,
        expDraw: mean => expDraw(this.rng, mean),
        newUid: () => ++this.uid,
        deliver: (item: ProductItem, port = 0) => {
          const outId = m.cfg.outputs?.[port];
          if (!outId) return false;
          const target = this.byId.get(outId)!;
          if (!target.canAccept()) return false;
          target.accept(item);
          this.recorder.countIn(outId);
          return true;
        },
        emitEvent: (type, detail) =>
          this.recorder.event({ t: this.time, machineId: m.cfg.id, type, detail }),
        countOut: good => this.recorder.countOut(m.cfg.id, good),
      };
      m.tick(ctx);
      this.recorder.tickState(m.cfg.id, m.state, dt);
    }
    this.recorder.advance(dt);
    this.time += dt;
  }

  /** Run `seconds` of simulated time. */
  run(seconds: number): void {
    const steps = Math.round(seconds / TICK);
    for (let i = 0; i < steps; i++) this.step();
  }

  applyCommand(cmd: SimCommand): void {
    switch (cmd.type) {
      case 'setParam': {
        const m = this.byId.get(cmd.machineId);
        if (!m) throw new Error(`unknown machine "${cmd.machineId}"`);
        m.cfg.params[cmd.key] = cmd.value;
        break;
      }
      case 'reset':
        this.build();
        break;
    }
  }

  snapshot(): SimulationSnapshot {
    return {
      time: this.time,
      done: this.isDone(),
      machines: this.machines.map(m => ({
        id: m.cfg.id,
        archetype: m.cfg.archetype,
        state: m.state,
        count: m.count(),
        positions: m.positions(),
        outCount: m.outCount,
      })),
    };
  }

  report(): RecorderReport { return this.recorder.report(); }

  /** True when every finite source is exhausted and no items remain in flight. */
  isDone(): boolean {
    return this.machines.every(m =>
      m.cfg.archetype === 'sink' || m.cfg.archetype === 'source'
        ? true
        : m.count() === 0,
    ) && this.machines
      .filter(m => m.cfg.archetype === 'source')
      .every(m => m.cfg.params['count'] !== 0 && m.count() === 0 && m.state === 'IDLE');
  }
}
