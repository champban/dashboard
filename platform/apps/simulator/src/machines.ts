/**
 * Machine definition library v0.1 (ARCHITECTURE.md §D layer 1).
 * Machines are DATA: archetype + parameter specs + transparent derived
 * formulas. Property forms are generated from these specs — no per-machine UI.
 */
import type { ArchetypeId } from '@dtp/engine';

export interface ParamSpec {
  key: string;
  label: string;
  unit: string;
  min: number;
  max: number;
  step: number;
  default: number;
  advanced?: boolean;          // progressive disclosure (Law 9)
}

export interface DerivedSpec {
  label: string;
  /** returns [formula-with-values, result-with-unit] */
  calc: (p: Record<string, number>) => [string, string];
}

export interface MachineDef {
  id: string;                  // kebab-case definition id
  code: string;                // instance prefix, e.g. FW
  name: string;
  archetype: ArchetypeId;
  emits?: string;
  params: ParamSpec[];
  derived: DerivedSpec[];
}

const ppm = (v: number) => `${v.toFixed(0)} ppm`;

export const LIBRARY: MachineDef[] = [
  {
    id: 'infeed', code: 'IN', name: 'Infeed / Depositor', archetype: 'source', emits: 'product',
    params: [
      { key: 'interval', label: 'Item interval', unit: 's', min: 0.3, max: 10, step: 0.1, default: 1.2 },
      { key: 'count', label: 'Batch count (0 = continuous)', unit: 'pcs', min: 0, max: 100000, step: 1, default: 0, advanced: true },
    ],
    derived: [{ label: 'Feed rate', calc: p => [`60 ÷ ${p.interval!.toFixed(1)} s`, ppm(60 / p.interval!)] }],
  },
  {
    id: 'belt-conveyor', code: 'CV', name: 'Belt Conveyor', archetype: 'transport',
    params: [
      { key: 'length', label: 'Length', unit: 'm', min: 0.5, max: 50, step: 0.5, default: 3 },
      { key: 'speed', label: 'Belt speed', unit: 'm/s', min: 0.05, max: 2, step: 0.05, default: 0.4 },
      { key: 'spacing', label: 'Min item spacing', unit: 'm', min: 0.05, max: 1, step: 0.05, default: 0.15, advanced: true },
    ],
    derived: [
      { label: 'Transit time', calc: p => [`${p.length!.toFixed(1)} m ÷ ${p.speed!.toFixed(2)} m/s`, `${(p.length! / p.speed!).toFixed(1)} s`] },
      { label: 'Max flow', calc: p => [`${p.speed!.toFixed(2)} ÷ ${p.spacing!.toFixed(2)} × 60`, ppm(p.speed! / p.spacing! * 60)] },
    ],
  },
  {
    id: 'tunnel-oven', code: 'TO', name: 'Tunnel Oven', archetype: 'processor', emits: 'baked',
    params: [
      { key: 'cycleTime', label: 'Baking time', unit: 's', min: 5, max: 600, step: 1, default: 12 },
      { key: 'capacity', label: 'Parallel capacity', unit: 'pcs', min: 1, max: 500, step: 1, default: 12 },
    ],
    derived: [{ label: 'Max rate', calc: p => [`${p.capacity} ÷ ${p.cycleTime!.toFixed(0)} s × 60`, ppm(p.capacity! / p.cycleTime! * 60)] }],
  },
  {
    id: 'cooling-conveyor', code: 'CS', name: 'Cooling Conveyor', archetype: 'transport',
    params: [
      { key: 'length', label: 'Length', unit: 'm', min: 1, max: 100, step: 0.5, default: 6 },
      { key: 'speed', label: 'Belt speed', unit: 'm/s', min: 0.05, max: 1, step: 0.05, default: 0.4 },
      { key: 'spacing', label: 'Min item spacing', unit: 'm', min: 0.05, max: 1, step: 0.05, default: 0.15, advanced: true },
    ],
    derived: [{ label: 'Cooling time', calc: p => [`${p.length!.toFixed(1)} ÷ ${p.speed!.toFixed(2)}`, `${(p.length! / p.speed!).toFixed(0)} s`] }],
  },
  {
    id: 'flow-wrapper', code: 'FW', name: 'Flow Wrapper', archetype: 'processor', emits: 'pack',
    params: [
      { key: 'cycleTime', label: 'Cycle time', unit: 's', min: 0.4, max: 6, step: 0.1, default: 1.5 },
      { key: 'rejectRate', label: 'Reject rate', unit: 'ratio', min: 0, max: 0.2, step: 0.01, default: 0.03, advanced: true },
      { key: 'mtbf', label: 'MTBF (0 = none)', unit: 's', min: 0, max: 10000, step: 10, default: 90, advanced: true },
      { key: 'mttr', label: 'MTTR', unit: 's', min: 1, max: 600, step: 1, default: 6, advanced: true },
    ],
    derived: [{ label: 'Max rate', calc: p => [`60 ÷ ${p.cycleTime!.toFixed(1)} s`, ppm(60 / p.cycleTime!)] }],
  },
  {
    id: 'checkweigher', code: 'CW', name: 'Checkweigher', archetype: 'processor', emits: 'checked',
    params: [
      { key: 'cycleTime', label: 'Cycle time', unit: 's', min: 0.1, max: 2, step: 0.1, default: 0.3 },
      { key: 'rejectRate', label: 'Reject rate', unit: 'ratio', min: 0, max: 0.2, step: 0.005, default: 0.01 },
    ],
    derived: [{ label: 'Max rate', calc: p => [`60 ÷ ${p.cycleTime!.toFixed(1)} s`, ppm(60 / p.cycleTime!)] }],
  },
  {
    id: 'buffer-table', code: 'BF', name: 'Buffer / Accumulation', archetype: 'buffer',
    params: [{ key: 'capacity', label: 'Capacity', unit: 'pcs', min: 1, max: 1000, step: 1, default: 30 }],
    derived: [],
  },
  {
    id: 'case-packer', code: 'CP', name: 'Case Packer', archetype: 'processor', emits: 'case',
    params: [
      { key: 'batchSize', label: 'Packs per case', unit: 'pcs', min: 1, max: 48, step: 1, default: 12 },
      { key: 'cycleTime', label: 'Cycle time', unit: 's', min: 0.5, max: 30, step: 0.5, default: 6 },
    ],
    derived: [{ label: 'Max rate (input)', calc: p => [`${p.batchSize} × 60 ÷ ${p.cycleTime!.toFixed(1)} s`, ppm(p.batchSize! * 60 / p.cycleTime!)] }],
  },
  {
    id: 'palletizing', code: 'SK', name: 'Palletizing (end of line)', archetype: 'sink',
    params: [],
    derived: [],
  },
];

export const defById = (id: string): MachineDef => {
  const d = LIBRARY.find(m => m.id === id);
  if (!d) throw new Error(`unknown definition ${id}`);
  return d;
};
