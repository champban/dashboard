/**
 * @dtp/calc — transparent engineering calculations (EDR-003) and unit
 * conversions (STANDARDS.md §Units). Zero dependencies. SI internally;
 * conversion happens only at the display edge.
 */

export type Unit =
  | 's' | 'min' | 'h'
  | 'm' | 'mm'
  | 'm/s' | 'm/min'
  | 'kg' | 'g'
  | 'items/s' | 'ppm'          // ppm = pieces per minute (display only)
  | '%' | 'ratio' | 'piece' | 'rad' | 'deg' | '°C';

/** A derived value that can always show its work. */
export interface CalcValue {
  value: number;
  unit: Unit;
  /** Human-readable formula, e.g. "bakingTime = length / speed" */
  formula?: string;
  /** Named inputs that produced the value, for audit/display. */
  inputs?: Record<string, { value: number; unit: Unit }>;
}

/** Build a CalcValue; the standard way any module returns a derived number. */
export function calc(
  value: number,
  unit: Unit,
  formula?: string,
  inputs?: CalcValue['inputs'],
): CalcValue {
  return { value, unit, formula, inputs };
}

// ---------------------------------------------------------------- conversion

const TO_SI: Partial<Record<Unit, { si: Unit; factor: number }>> = {
  min: { si: 's', factor: 60 },
  h: { si: 's', factor: 3600 },
  mm: { si: 'm', factor: 1e-3 },
  'm/min': { si: 'm/s', factor: 1 / 60 },
  g: { si: 'kg', factor: 1e-3 },
  ppm: { si: 'items/s', factor: 1 / 60 },
  deg: { si: 'rad', factor: Math.PI / 180 },
  '%': { si: 'ratio', factor: 1e-2 },
};

/** Convert a value in `unit` to its SI base unit. Identity for SI units. */
export function toSI(value: number, unit: Unit): { value: number; unit: Unit } {
  const rule = TO_SI[unit];
  return rule ? { value: value * rule.factor, unit: rule.si } : { value, unit };
}

/** Convert an SI value to a display unit. Throws on dimension mismatch. */
export function fromSI(value: number, si: Unit, display: Unit): number {
  if (si === display) return value;
  const rule = TO_SI[display];
  if (!rule || rule.si !== si) {
    throw new Error(`cannot display ${si} as ${display}`);
  }
  return value / rule.factor;
}

/** Render a CalcValue for humans, e.g. "480 ppm (capacity = rows × speed / pitch)". */
export function formatCalc(cv: CalcValue, digits = 2): string {
  const v = `${round(cv.value, digits)} ${cv.unit}`;
  return cv.formula ? `${v}  (${cv.formula})` : v;
}

export function round(v: number, digits = 2): number {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
}
