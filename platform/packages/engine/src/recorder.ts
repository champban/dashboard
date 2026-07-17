/**
 * Recorder — the analytics source of truth. Accumulates time-in-state,
 * counts, and events; computes OEE per STANDARDS.md. Dashboards never
 * compute engineering numbers themselves (EDR-003: results are CalcValues).
 */

import { calc, type CalcValue } from '@dtp/calc';
import type { MachineState, SimEvent } from './types.js';
import { MACHINE_STATES } from './types.js';

const MAX_EVENTS = 5000;

export interface MachineReport {
  id: string;
  timeInState: Record<MachineState, number>;
  countIn: number;
  countOut: number;
  goodCount: number;
  totalCount: number;
  utilization: CalcValue;
  availability?: CalcValue;
  performance?: CalcValue;
  quality?: CalcValue;
  oee?: CalcValue;
}

export interface RecorderReport {
  elapsed: number;
  machines: MachineReport[];
  /**
   * Bottleneck (v0.1 heuristic): the processor whose immediate upstream
   * machines accumulate the most BLOCKED time — the machine the line is
   * "waiting behind". Falls back to highest utilization when nothing
   * blocks (source-limited lines).
   */
  bottleneck?: string;
  events: SimEvent[];
}

interface Track {
  timeInState: Record<MachineState, number>;
  countIn: number;
  countOut: number;
  good: number;
  total: number;
  isProcessor: boolean;
  idealCycle: number;
  batchSize: number;
  upstreamIds: string[];
}

function emptyStates(): Record<MachineState, number> {
  return Object.fromEntries(MACHINE_STATES.map(s => [s, 0])) as Record<MachineState, number>;
}

export class Recorder {
  private tracks = new Map<string, Track>();
  events: SimEvent[] = [];
  elapsed = 0;

  register(
    id: string, isProcessor: boolean, idealCycle: number, batchSize: number,
    upstreamIds: string[] = [],
  ): void {
    this.tracks.set(id, {
      timeInState: emptyStates(),
      countIn: 0, countOut: 0, good: 0, total: 0,
      isProcessor, idealCycle, batchSize, upstreamIds,
    });
  }

  tickState(id: string, state: MachineState, dt: number): void {
    this.tracks.get(id)!.timeInState[state] += dt;
  }
  advance(dt: number): void { this.elapsed += dt; }
  countIn(id: string): void { this.tracks.get(id)!.countIn++; }
  countOut(id: string, good: boolean): void {
    const t = this.tracks.get(id)!;
    t.total++;
    if (good) t.good++;
  }
  transferred(id: string): void { this.tracks.get(id)!.countOut++; }
  event(e: SimEvent): void {
    if (this.events.length < MAX_EVENTS) this.events.push(e);
  }

  report(): RecorderReport {
    const machines: MachineReport[] = [];
    for (const [id, t] of this.tracks) {
      const planned = this.elapsed - t.timeInState.OFF;
      const runTime = planned - t.timeInState.DOWN - t.timeInState.SETUP - t.timeInState.IDLE;
      const busy = t.timeInState.RUNNING;

      const rep: MachineReport = {
        id,
        timeInState: t.timeInState,
        countIn: t.countIn,
        countOut: t.countOut,
        goodCount: t.good,
        totalCount: t.total,
        utilization: calc(
          planned > 0 ? busy / planned : 0, 'ratio',
          'utilization = timeRunning / plannedTime',
          { timeRunning: { value: busy, unit: 's' }, plannedTime: { value: planned, unit: 's' } },
        ),
      };

      if (t.isProcessor && planned > 0) {
        const availability = runTime / planned;
        const perfRaw = runTime > 0 ? (t.idealCycle * (t.total / 1)) / runTime : 0;
        const performance = Math.min(perfRaw, 1);
        const quality = t.total > 0 ? t.good / t.total : 1;
        rep.availability = calc(availability, 'ratio',
          'A = (plannedTime − down − setup − idle) / plannedTime');
        rep.performance = calc(performance, 'ratio',
          'P = idealCycleTime × cycles / runTime' + (perfRaw > 1 ? ' [capped at 1]' : ''),
          {
            idealCycleTime: { value: t.idealCycle, unit: 's' },
            cycles: { value: t.total, unit: 'piece' },
            runTime: { value: runTime, unit: 's' },
          });
        rep.quality = calc(quality, 'ratio', 'Q = goodCount / totalCount', {
          goodCount: { value: t.good, unit: 'piece' },
          totalCount: { value: t.total, unit: 'piece' },
        });
        rep.oee = calc(availability * performance * quality, 'ratio', 'OEE = A × P × Q');
      }
      machines.push(rep);
    }

    // bottleneck: processor with the most upstream BLOCKED time; ties and
    // block-free (source-limited) lines fall back to utilization
    let bottleneck: string | undefined;
    let best = [-1, -1];
    for (const m of machines) {
      const t = this.tracks.get(m.id)!;
      if (!t.isProcessor) continue;
      const upstreamBlocked = t.upstreamIds.reduce(
        (s, up) => s + (this.tracks.get(up)?.timeInState.BLOCKED ?? 0), 0);
      const score = [upstreamBlocked, m.utilization.value];
      if (score[0]! > best[0]! || (score[0] === best[0] && score[1]! > best[1]!)) {
        best = score;
        bottleneck = m.id;
      }
    }
    return { elapsed: this.elapsed, machines, bottleneck, events: this.events };
  }

  reset(): void {
    for (const t of this.tracks.values()) {
      Object.assign(t, {
        timeInState: emptyStates(), countIn: 0, countOut: 0, good: 0, total: 0,
      });
    }
    this.events = [];
    this.elapsed = 0;
  }
}
