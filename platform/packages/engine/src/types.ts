/** Core types of the simulation kernel. Pure data — JSON-serializable. */

export const MACHINE_STATES = [
  'OFF', 'IDLE', 'SETUP', 'RUNNING', 'STARVED', 'BLOCKED', 'DOWN',
] as const;
export type MachineState = (typeof MACHINE_STATES)[number];

export type ArchetypeId =
  | 'source' | 'transport' | 'processor' | 'buffer'
  | 'splitter' | 'merger' | 'sink';

/**
 * One machine instance in a line configuration (ARCHITECTURE.md §D, layer 2).
 * `params` keys are archetype-specific; all values in SI units.
 */
export interface MachineConfig {
  id: string;                       // instance id per naming standard, e.g. "FW-01"
  archetype: ArchetypeId;
  name?: string;
  /** Downstream machine ids. Splitter: many. Sink: none. Others: one. */
  outputs?: string[];
  params: Record<string, number>;
  /** Product type id emitted by source / processor transform. */
  emits?: string;
}

/**
 * A complete simulatable line. v0.1 constraint: `machines` must be listed
 * upstream → downstream (the engine ticks in reverse order so freed space
 * propagates within one tick).
 */
export interface LineConfig {
  name: string;
  seed: number;
  machines: MachineConfig[];
}

/** A discrete product item (ARCHITECTURE.md §E). */
export interface ProductItem {
  uid: number;
  typeId: string;
  createdAt: number;                // sim time, s
  contents?: ProductItem[];         // containment tree (pack ⊃ cookie, …)
}

export interface SimEvent {
  t: number;                        // sim time, s
  machineId: string;
  type: 'DOWN' | 'REPAIRED' | 'REJECT' | 'DONE' | 'SOURCE_DONE';
  detail?: string;
}

/** Immutable render-facing state. The UI never sees anything else. */
export interface SimulationSnapshot {
  time: number;
  done: boolean;
  machines: {
    id: string;
    archetype: ArchetypeId;
    state: MachineState;
    /** items currently inside/on the machine */
    count: number;
    /** transport only: item offsets 0..1 along the element */
    positions?: number[];
    outCount: number;
  }[];
}

export type SimCommand =
  | { type: 'setParam'; machineId: string; key: string; value: number }
  | { type: 'reset' };

export const TICK = 0.01; // s — fixed timestep (STANDARDS.md §Time)
