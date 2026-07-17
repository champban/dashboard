/**
 * Demo-002 page — renders kernel snapshots. Owns zero simulation logic;
 * if this file were deleted the simulation results would be identical.
 */
import type {
  LineConfig, SimulationSnapshot, MachineState,
} from '@dtp/engine';
import type { RecorderReport } from '@dtp/engine';

declare const __WORKER_SOURCE__: string;

// ------------------------------------------------------------- line config

const LINE: LineConfig = {
  name: 'Cookie Line A',
  seed: 2026,
  machines: [
    { id: 'IN-01', archetype: 'source', outputs: ['CV-01'],
      params: { interval: 1.2, count: 0 }, emits: 'cookie', name: 'Infeed' },
    { id: 'CV-01', archetype: 'transport', outputs: ['TO-01'],
      params: { length: 3, speed: 0.4, spacing: 0.15 }, name: 'Belt 1' },
    { id: 'TO-01', archetype: 'processor', outputs: ['CV-02'],
      params: { cycleTime: 12, capacity: 12 }, emits: 'baked-cookie', name: 'Tunnel Oven' },
    { id: 'CV-02', archetype: 'transport', outputs: ['FW-01'],
      params: { length: 2, speed: 0.4, spacing: 0.15 }, name: 'Belt 2' },
    { id: 'FW-01', archetype: 'processor', outputs: ['SK-01'],
      params: { cycleTime: 1.5, mtbf: 90, mttr: 6, rejectRate: 0.03 },
      emits: 'pack', name: 'Flow Wrapper' },
    { id: 'SK-01', archetype: 'sink', params: {}, name: 'Palletizing' },
  ],
};

// ------------------------------------------------------------------ worker

const worker = new Worker(
  URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: 'text/javascript' })),
);
worker.postMessage({ type: 'init', config: LINE });

// ------------------------------------------------------------------- state

let lastSnapshot: SimulationSnapshot | null = null;
let lastReport: RecorderReport | null = null;
let running = false;

worker.onmessage = (e: MessageEvent) => {
  if (e.data.type === 'snapshot') {
    lastSnapshot = e.data.snapshot;
    document.getElementById('clock')!.textContent = `t = ${lastSnapshot!.time.toFixed(1)} s`;
  }
  if (e.data.type === 'report') { lastReport = e.data.report; renderReport(); }
};

// ------------------------------------------------------------------ canvas

const canvas = document.getElementById('view') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;

const STATE_COLOR: Record<MachineState, string> = {
  OFF: '#52514e', IDLE: '#52514e', SETUP: '#c98500', RUNNING: '#199e70',
  STARVED: '#898781', BLOCKED: '#c98500', DOWN: '#d03b3b',
};

interface Slot { x: number; w: number }
const SLOTS: Record<string, Slot> = {
  'IN-01': { x: 20, w: 60 }, 'CV-01': { x: 90, w: 180 },
  'TO-01': { x: 280, w: 130 }, 'CV-02': { x: 420, w: 130 },
  'FW-01': { x: 560, w: 100 }, 'SK-01': { x: 670, w: 90 },
};
const Y = 90, H = 56;

function draw(): void {
  requestAnimationFrame(draw); // schedule FIRST so an early return can't kill the loop
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (!lastSnapshot) return;
  ctx.font = '11px system-ui';
  ctx.textAlign = 'center';

  for (const m of lastSnapshot.machines) {
    const slot = SLOTS[m.id]!;
    const isBelt = m.archetype === 'transport';
    const y = isBelt ? Y + 12 : Y;
    const h = isBelt ? H - 24 : H;

    ctx.fillStyle = isBelt ? '#2c2c2a' : '#211f1e';
    ctx.strokeStyle = STATE_COLOR[m.state];
    ctx.lineWidth = 2;
    ctx.fillRect(slot.x, y, slot.w, h);
    ctx.strokeRect(slot.x, y, slot.w, h);

    ctx.fillStyle = '#c3c2b7';
    ctx.fillText(`${m.id}`, slot.x + slot.w / 2, Y - 22);
    ctx.fillStyle = '#898781';
    ctx.fillText(`${m.state}${m.count ? ` · ${m.count}` : ''}`, slot.x + slot.w / 2, Y + H + 18);

    if (isBelt && m.positions) {
      for (const p of m.positions) {
        ctx.beginPath();
        ctx.arc(slot.x + p * slot.w, Y + H / 2, 6, 0, Math.PI * 2);
        ctx.fillStyle = '#c98500';
        ctx.fill();
      }
    }
    if (m.archetype === 'processor') {
      ctx.fillStyle = '#c3c2b7';
      ctx.fillText(`in: ${m.count}`, slot.x + slot.w / 2, Y + 24);
      ctx.fillText(`out: ${m.outCount}`, slot.x + slot.w / 2, Y + 40);
    }
    if (m.archetype === 'sink') {
      ctx.fillStyle = '#0ca30c';
      ctx.font = 'bold 20px system-ui';
      ctx.fillText(String(m.count), slot.x + slot.w / 2, Y + 34);
      ctx.font = '11px system-ui';
    }
  }
}
requestAnimationFrame(draw);

// ------------------------------------------------------------------ report

const fmt = (v: number, d = 1) => (v * 100).toFixed(d) + '%';

function renderReport(): void {
  if (!lastReport || !lastSnapshot) return;
  const fw = lastReport.machines.find(m => m.id === 'FW-01');
  const sink = lastSnapshot.machines.find(m => m.id === 'SK-01')!;
  const el = (id: string) => document.getElementById(id)!;

  if (fw?.oee) {
    el('kOee').textContent = fmt(fw.oee.value);
    el('kA').textContent = fmt(fw.availability!.value);
    el('kP').textContent = fmt(fw.performance!.value);
    el('kQ').textContent = fmt(fw.quality!.value);
    el('calc').innerHTML =
      `<b>Transparent calculations — ${fw.id}</b><br>` +
      [fw.availability!, fw.performance!, fw.quality!, fw.oee]
        .map(cv => `${cv.formula} = <b>${fmt(cv.value)}</b>`).join('<br>');
  }
  const tput = lastReport.elapsed > 0 ? (sink.count / lastReport.elapsed) * 60 : 0;
  el('kTput').textContent = `${tput.toFixed(1)} ppm`;
  el('kBottleneck').textContent = lastReport.bottleneck ?? '—';

  const feed = lastReport.events.slice(-6).reverse()
    .map(e => `<div class="ev ${e.type === 'DOWN' ? 'bad' : ''}">t=${e.t.toFixed(1)}s · ${e.machineId} · ${e.type}${e.detail ? ' · ' + e.detail : ''}</div>`)
    .join('');
  el('events').innerHTML = feed || '<div class="ev">no events yet</div>';
}

// ---------------------------------------------------------------- controls

const $ = (id: string) => document.getElementById(id)!;

$('btnRun').onclick = () => {
  running = !running;
  worker.postMessage({ type: running ? 'start' : 'pause' });
  $('btnRun').textContent = running ? '⏸ Pause' : '▶ Run';
};
$('btnReset').onclick = () => worker.postMessage({ type: 'command', command: { type: 'reset' } });
($('speed') as HTMLSelectElement).onchange = e =>
  worker.postMessage({ type: 'setSpeed', speed: Number((e.target as HTMLSelectElement).value) });

function bindParam(inputId: string, valueId: string, machineId: string, key: string, unit: string): void {
  const input = $(inputId) as HTMLInputElement;
  const show = () => { $(valueId).textContent = `${input.value} ${unit}`; };
  input.oninput = () => {
    show();
    worker.postMessage({
      type: 'command',
      command: { type: 'setParam', machineId, key, value: Number(input.value) },
    });
  };
  show();
}
bindParam('pInterval', 'vInterval', 'IN-01', 'interval', 's');
bindParam('pCycle', 'vCycle', 'FW-01', 'cycleTime', 's');
bindParam('pBelt', 'vBelt', 'CV-01', 'speed', 'm/s');
