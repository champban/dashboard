/**
 * The seven machine archetypes (EDR-002). Real machines are data: a
 * MachineConfig picking an archetype + parameters. Engine code knows only
 * these seven behaviors.
 *
 * Push-with-backpressure model: each tick a machine may offer items
 * downstream via ctx.deliver(); downstream accepts only if canAccept().
 */

import type { MachineConfig, MachineState, ProductItem } from './types.js';

export interface TickCtx {
  time: number;
  dt: number;
  rng: () => number;
  expDraw: (mean: number) => number;
  newUid: () => number;
  /** try to hand an item to this machine's output port `port` (default 0);
   *  returns true if the downstream machine accepted it. */
  deliver: (item: ProductItem, port?: number) => boolean;
  emitEvent: (type: 'DOWN' | 'REPAIRED' | 'REJECT' | 'DONE' | 'SOURCE_DONE', detail?: string) => void;
  countOut: (good: boolean) => void;
}

export abstract class Machine {
  state: MachineState = 'IDLE';
  outCount = 0;

  constructor(readonly cfg: MachineConfig) {}

  param(key: string, fallback?: number): number {
    const v = this.cfg.params[key];
    if (v === undefined) {
      if (fallback === undefined) throw new Error(`${this.cfg.id}: missing param "${key}"`);
      return fallback;
    }
    return v;
  }

  abstract tick(ctx: TickCtx): void;
  abstract canAccept(): boolean;
  abstract accept(item: ProductItem): void;
  /** number of items currently inside/on the machine */
  abstract count(): number;
  /** transport only: normalized item offsets for rendering */
  positions(): number[] | undefined { return undefined; }
  reset(): void { this.state = 'IDLE'; this.outCount = 0; }
}

// -------------------------------------------------------------------- source

/** params: interval (s between items), count (0 = infinite). emits: type id. */
export class Source extends Machine {
  private nextAt = 0;
  private produced = 0;
  private pending: ProductItem | null = null;

  override tick(ctx: TickCtx): void {
    const count = this.param('count', 0);
    if (!this.pending && (count === 0 || this.produced < count) && ctx.time >= this.nextAt) {
      this.pending = { uid: ctx.newUid(), typeId: this.cfg.emits ?? 'item', createdAt: ctx.time };
      this.produced++;
      this.nextAt = ctx.time + this.param('interval');
      if (count !== 0 && this.produced === count) ctx.emitEvent('SOURCE_DONE');
    }
    if (this.pending) {
      if (ctx.deliver(this.pending)) { this.pending = null; this.outCount++; this.state = 'RUNNING'; }
      else this.state = 'BLOCKED';
    } else {
      this.state = (count !== 0 && this.produced >= count) ? 'IDLE' : 'RUNNING';
    }
  }
  override canAccept(): boolean { return false; }
  override accept(): void { throw new Error('source has no input'); }
  override count(): number { return this.pending ? 1 : 0; }
  override reset(): void { super.reset(); this.nextAt = 0; this.produced = 0; this.pending = null; }
}

// ----------------------------------------------------------------- transport

/** params: length (m), speed (m/s), spacing (m, min headway). Accumulating belt. */
export class Transport extends Machine {
  /** item offsets in metres from infeed, ascending = closer to discharge; [0] is front. */
  private items: { x: number; item: ProductItem }[] = [];

  override tick(ctx: TickCtx): void {
    const length = this.param('length');
    const speed = this.param('speed');
    const spacing = this.param('spacing', 0.15);

    // front item discharges when it reaches the end
    const front = this.items[0];
    let blocked = false;
    if (front && front.x >= length) {
      if (ctx.deliver(front.item)) { this.items.shift(); this.outCount++; }
      else blocked = true;
    }
    // move, bounded by the item ahead (accumulation)
    for (let i = 0; i < this.items.length; i++) {
      const it = this.items[i]!;
      const ahead = i === 0 ? null : this.items[i - 1]!;
      const limit = ahead ? ahead.x - spacing : length;
      it.x = Math.min(it.x + speed * ctx.dt, Math.max(limit, it.x));
    }
    this.state = this.items.length === 0 ? 'STARVED' : blocked ? 'BLOCKED' : 'RUNNING';
  }
  override canAccept(): boolean {
    const last = this.items[this.items.length - 1];
    return !last || last.x >= this.param('spacing', 0.15);
  }
  override accept(item: ProductItem): void { this.items.push({ x: 0, item }); }
  override count(): number { return this.items.length; }
  override positions(): number[] {
    const length = this.param('length');
    return this.items.map(i => i.x / length);
  }
  override reset(): void { super.reset(); this.items = []; }
}

// ----------------------------------------------------------------- processor

/**
 * params: cycleTime (s), capacity (parallel slots, default 1),
 *   batchSize (consume N inputs → 1 output containing them, default 1),
 *   rejectRate (0..1, default 0), mtbf (s, 0 = no failures), mttr (s).
 * emits: output type id when transforming (e.g. "wrapped-pack").
 */
export class Processor extends Machine {
  /**
   * A finished item HOLDS its slot until it can discharge downstream —
   * a machine whose outfeed is blocked physically stops; it never acts as
   * an infinite buffer.
   */
  private slots: { items: ProductItem[]; remaining: number; out: ProductItem | null }[] = [];
  private inbox: ProductItem[] = [];
  private downFor = 0;
  private nextFailIn = -1; // running-time until next failure; -1 = not drawn yet

  override tick(ctx: TickCtx): void {
    const capacity = this.param('capacity', 1);
    const batch = this.param('batchSize', 1);
    const mtbf = this.param('mtbf', 0);

    if (this.state === 'DOWN') {
      this.downFor -= ctx.dt;
      if (this.downFor <= 0) { this.state = 'IDLE'; ctx.emitEvent('REPAIRED'); }
      else return;
    }

    // start new cycles from inbox into free slots
    while (this.slots.length < capacity && this.inbox.length >= batch) {
      this.slots.push({
        items: this.inbox.splice(0, batch),
        remaining: this.param('cycleTime'),
        out: null,
      });
    }

    const cycling = this.slots.some(s => s.remaining > 0);
    if (cycling && mtbf > 0) {
      if (this.nextFailIn < 0) this.nextFailIn = ctx.expDraw(mtbf);
      this.nextFailIn -= ctx.dt;
      if (this.nextFailIn <= 0) {
        this.state = 'DOWN';
        this.downFor = ctx.expDraw(this.param('mttr', 60));
        this.nextFailIn = -1;
        ctx.emitEvent('DOWN', `repair ~${this.downFor.toFixed(1)}s`);
        return;
      }
    }

    // advance cycles; on completion resolve quality exactly once
    for (const slot of this.slots) {
      if (slot.remaining <= 0) continue;
      slot.remaining -= ctx.dt;
      if (slot.remaining <= 0) {
        const rejectRate = this.param('rejectRate', 0);
        const rejected = rejectRate > 0 && ctx.rng() < rejectRate;
        ctx.countOut(!rejected);
        if (rejected) {
          ctx.emitEvent('REJECT');
          slot.out = null;               // discarded — slot frees below
        } else {
          slot.out = this.cfg.emits
            ? { uid: ctx.newUid(), typeId: this.cfg.emits, createdAt: ctx.time, contents: slot.items }
            : slot.items[0]!;
          ctx.emitEvent('DONE');
        }
        slot.items = [];
      }
    }

    // discharge finished slots (rejected ones free immediately)
    let stuck = false;
    this.slots = this.slots.filter(slot => {
      if (slot.remaining > 0) return true;         // still cycling
      if (slot.out === null) return false;         // rejected → slot free
      if (ctx.deliver(slot.out)) { this.outCount++; return false; }
      stuck = true;
      return true;                                 // blocked → keep holding
    });

    this.state =
      this.slots.some(s => s.remaining > 0) ? 'RUNNING'
      : stuck ? 'BLOCKED'
      : this.inbox.length >= batch ? 'RUNNING'
      : 'STARVED';
  }
  override canAccept(): boolean {
    // gather at most one batch ahead; a blocked/full machine refuses input
    return this.state !== 'DOWN' &&
      this.inbox.length < this.param('batchSize', 1) &&
      (this.slots.length < this.param('capacity', 1) ||
       this.inbox.length + 1 <= this.param('batchSize', 1));
  }
  override accept(item: ProductItem): void { this.inbox.push(item); }
  override count(): number {
    return this.inbox.length +
      this.slots.reduce((n, s) => n + s.items.length + (s.out ? 1 : 0), 0);
  }
  override reset(): void {
    super.reset();
    this.slots = []; this.inbox = []; this.downFor = 0; this.nextFailIn = -1;
  }
}

// -------------------------------------------------------------------- buffer

/** params: capacity (items). FIFO accumulation buffer. */
export class Buffer extends Machine {
  private queue: ProductItem[] = [];

  override tick(ctx: TickCtx): void {
    let blocked = false;
    while (this.queue.length) {
      if (ctx.deliver(this.queue[0]!)) { this.queue.shift(); this.outCount++; }
      else { blocked = true; break; }
    }
    this.state = this.queue.length === 0 ? 'STARVED' : blocked ? 'BLOCKED' : 'RUNNING';
  }
  override canAccept(): boolean { return this.queue.length < this.param('capacity'); }
  override accept(item: ProductItem): void { this.queue.push(item); }
  override count(): number { return this.queue.length; }
  override reset(): void { super.reset(); this.queue = []; }
}

// ------------------------------------------------------------------ splitter

/** Round-robin distribution to N outputs, skipping full branches. */
export class Splitter extends Machine {
  private held: ProductItem | null = null;
  private next = 0;

  override tick(ctx: TickCtx): void {
    if (!this.held) { this.state = 'STARVED'; return; }
    const n = this.cfg.outputs?.length ?? 1;
    for (let i = 0; i < n; i++) {
      const port = (this.next + i) % n;
      if (ctx.deliver(this.held, port)) {
        this.held = null; this.outCount++;
        this.next = (port + 1) % n;
        this.state = 'RUNNING';
        return;
      }
    }
    this.state = 'BLOCKED';
  }
  override canAccept(): boolean { return this.held === null; }
  override accept(item: ProductItem): void { this.held = item; }
  override count(): number { return this.held ? 1 : 0; }
  override reset(): void { super.reset(); this.held = null; this.next = 0; }
}

// -------------------------------------------------------------------- merger

/** Many upstreams push in; FIFO out to one output. params: capacity (default 2). */
export class Merger extends Machine {
  private queue: ProductItem[] = [];

  override tick(ctx: TickCtx): void {
    let blocked = false;
    while (this.queue.length) {
      if (ctx.deliver(this.queue[0]!)) { this.queue.shift(); this.outCount++; }
      else { blocked = true; break; }
    }
    this.state = this.queue.length === 0 ? 'STARVED' : blocked ? 'BLOCKED' : 'RUNNING';
  }
  override canAccept(): boolean { return this.queue.length < this.param('capacity', 2); }
  override accept(item: ProductItem): void { this.queue.push(item); }
  override count(): number { return this.queue.length; }
  override reset(): void { super.reset(); this.queue = []; }
}

// ---------------------------------------------------------------------- sink

/** Terminal counter. Always accepts. */
export class Sink extends Machine {
  received: ProductItem[] = [];

  override tick(): void { this.state = 'RUNNING'; }
  override canAccept(): boolean { return true; }
  override accept(item: ProductItem): void { this.received.push(item); this.outCount++; }
  override count(): number { return this.received.length; }
  override reset(): void { super.reset(); this.received = []; }
}

// ------------------------------------------------------------------ registry

export function createMachine(cfg: MachineConfig): Machine {
  switch (cfg.archetype) {
    case 'source': return new Source(cfg);
    case 'transport': return new Transport(cfg);
    case 'processor': return new Processor(cfg);
    case 'buffer': return new Buffer(cfg);
    case 'splitter': return new Splitter(cfg);
    case 'merger': return new Merger(cfg);
    case 'sink': return new Sink(cfg);
  }
}
