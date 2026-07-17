/**
 * DTP Simulator v0.1 — the product shell (AWP-004).
 * React per TDR T4; real kernel in a Worker (EDR-001); machines are data
 * (EDR-002); every number explains itself (EDR-003 / Law 2).
 * v0.1 scope decision: linear line builder (flow lines); free 2D placement
 * and splitter/merger routing arrive with the 3D work (AWP-005).
 */
import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import type { LineConfig, RecorderReport, SimulationSnapshot, MachineState } from '@dtp/engine';
import { LIBRARY, defById, type MachineDef } from './machines.js';
import { buildStory, type StoryLine } from './story.js';
import { buildReportHtml, downloadDoc, downloadHtml, downloadJson } from './report.js';

declare const __WORKER_SOURCE__: string;

// ---------------------------------------------------------------- state types
interface Item { uid: string; defId: string; params: Record<string, number> }
type Mode = 'design' | 'simulate' | 'analyze';

const SEED = 2026;
const STATE_COLOR: Record<MachineState, string> = {
  OFF: '#52514e', IDLE: '#52514e', SETUP: '#c98500', RUNNING: '#199e70',
  STARVED: '#898781', BLOCKED: '#c98500', DOWN: '#d03b3b',
};
const SPEEDS = [0.25, 1, 4, 16, 64, 256];

// default template — never an empty canvas (Constitution)
const TEMPLATE: Item[] = [
  { uid: 'IN-01', defId: 'infeed', params: {} },
  { uid: 'CV-01', defId: 'belt-conveyor', params: {} },
  { uid: 'TO-01', defId: 'tunnel-oven', params: {} },
  { uid: 'CV-02', defId: 'belt-conveyor', params: { length: 2 } },
  { uid: 'FW-01', defId: 'flow-wrapper', params: {} },
  { uid: 'SK-01', defId: 'palletizing', params: {} },
].map(i => ({ ...i, params: withDefaults(i.defId, i.params) }));

function withDefaults(defId: string, overrides: Record<string, number>): Record<string, number> {
  const out: Record<string, number> = {};
  for (const p of defById(defId).params) out[p.key] = overrides[p.key] ?? p.default;
  return out;
}

function toConfig(line: Item[]): LineConfig {
  return {
    name: 'Cookie Line A', seed: SEED,
    machines: line.map((it, i) => {
      const def = defById(it.defId);
      return {
        id: it.uid, archetype: def.archetype, emits: def.emits,
        outputs: i < line.length - 1 ? [line[i + 1]!.uid] : [],
        params: { ...it.params },
      };
    }),
  };
}

function validate(line: Item[]): string[] {
  const errs: string[] = [];
  if (!line.length) return ['Line is empty — add machines from the library.'];
  if (defById(line[0]!.defId).archetype !== 'source') errs.push('Line must start with an Infeed (source).');
  if (defById(line[line.length - 1]!.defId).archetype !== 'sink') errs.push('Line must end with Palletizing (sink).');
  for (const it of line.slice(1, -1)) {
    const a = defById(it.defId).archetype;
    if (a === 'source' || a === 'sink') errs.push(`${it.uid}: ${a} must be at the line ${a === 'source' ? 'start' : 'end'}.`);
  }
  return errs;
}

// ------------------------------------------------------------------- worker
function makeWorker(): Worker {
  return new Worker(URL.createObjectURL(new Blob([__WORKER_SOURCE__], { type: 'text/javascript' })));
}

// ---------------------------------------------------------------------- app
function App() {
  const [line, setLine] = useState<Item[]>(TEMPLATE);
  const [mode, setMode] = useState<Mode>('simulate');
  const [selId, setSelId] = useState<string | null>('FW-01');
  const [running, setRunning] = useState(false);
  const [speed, setSpeed] = useState(4);
  const [snap, setSnap] = useState<SimulationSnapshot | null>(null);
  const [rep, setRep] = useState<RecorderReport | null>(null);
  const [drill, setDrill] = useState(false);
  const [advice, setAdvice] = useState<any | null>(null);
  const [advBusy, setAdvBusy] = useState(false);
  const [applied, setApplied] = useState<string[]>([]);
  const [palOpen, setPalOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [showAdvanced, setShowAdvanced] = useState(false);

  const worker = useRef<Worker | null>(null);
  const undoStack = useRef<Item[][]>([]);
  const errs = useMemo(() => validate(line), [line]);

  const say = useCallback((s: string) => { setToast(s); setTimeout(() => setToast(''), 3200); }, []);

  // worker lifecycle
  useEffect(() => {
    const w = makeWorker();
    worker.current = w;
    w.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'snapshot') setSnap(e.data.snapshot);
      if (e.data.type === 'report') setRep(e.data.report);
      if (e.data.type === 'whatif') setAdvice(e.data);
    };
    w.postMessage({ type: 'load', config: toConfig(TEMPLATE) });
    w.postMessage({ type: 'setSpeed', speed: 4 });
    w.postMessage({ type: 'start' });          // first-run: already running
    setRunning(true);
    return () => w.terminate();
  }, []);

  // ---- mutations (all undoable, Law 6)
  const mutate = useCallback((next: Item[], structural: boolean) => {
    undoStack.current.push(JSON.parse(JSON.stringify(line)));
    if (undoStack.current.length > 50) undoStack.current.shift();
    setLine(next);
    if (structural) {
      worker.current?.postMessage({ type: 'load', config: toConfig(next) });
      setAdvice(null); setApplied([]);
    }
  }, [line]);

  const undo = useCallback(() => {
    const prev = undoStack.current.pop();
    if (!prev) { say('Nothing to undo'); return; }
    setLine(prev);
    worker.current?.postMessage({ type: 'load', config: toConfig(prev) });
    say('Undone');
  }, [say]);

  const setParam = useCallback((uid: string, key: string, value: number) => {
    mutate(line.map(it => it.uid === uid ? { ...it, params: { ...it.params, [key]: value } } : it), false);
    worker.current?.postMessage({ type: 'command', command: { type: 'setParam', machineId: uid, key, value } });
  }, [line, mutate]);

  const addMachine = useCallback((def: MachineDef) => {
    const n = line.filter(i => i.defId === def.id).length + 1;
    const uid = `${def.code}-${String(n).padStart(2, '0')}`;
    const item: Item = { uid, defId: def.id, params: withDefaults(def.id, {}) };
    // insert before sink if present, else append
    const at = line.length && defById(line[line.length - 1]!.defId).archetype === 'sink' ? line.length - 1 : line.length;
    const next = [...line.slice(0, at), item, ...line.slice(at)];
    mutate(next, true); setSelId(uid); say(`${uid} added`);
  }, [line, mutate, say]);

  const removeSel = useCallback(() => {
    if (!selId) return;
    mutate(line.filter(i => i.uid !== selId), true); setSelId(null);
  }, [line, selId, mutate]);

  const moveSel = useCallback((d: number) => {
    if (!selId) return;
    const i = line.findIndex(x => x.uid === selId);
    const j = i + d;
    if (i < 0 || j < 0 || j >= line.length) return;
    const next = [...line]; [next[i], next[j]] = [next[j]!, next[i]!];
    mutate(next, true);
  }, [line, selId, mutate]);

  // ---- transport
  const toggleRun = useCallback(() => {
    if (errs.length) { say('Fix validation flags first'); return; }
    setRunning(r => { worker.current?.postMessage({ type: r ? 'pause' : 'start' }); return !r; });
  }, [errs, say]);
  const pickSpeed = useCallback((s: number) => { setSpeed(s); worker.current?.postMessage({ type: 'setSpeed', speed: s }); }, []);
  const sprint = useCallback(() => { worker.current?.postMessage({ type: 'sprint', seconds: 3600 }); say('Sprinted 1 h of production (headless)'); }, [say]);
  const resetSim = useCallback(() => { worker.current?.postMessage({ type: 'load', config: toConfig(line) }); setAdvice(null); }, [line]);

  // ---- WOW-02 advisor (two-phase: measure baseline at horizon FIRST, so
  // candidates target the steady-state constraint, not an early-run guess)
  const pendingPhase = useRef<'baseline' | 'candidates' | null>(null);

  const candidatesFor = useCallback((botId: string) => {
    const bot = line.find(i => i.uid === botId);
    if (!bot) return [];
    const def = defById(bot.defId);
    const cands: { label: string; changes: { machineId: string; key: string; value: number }[] }[] = [];
    const ct = bot.params['cycleTime'];
    const ctSpec = def.params.find(p => p.key === 'cycleTime');
    if (ct && ctSpec) {
      for (const f of [0.9, 0.8]) {
        const v = Math.max(ctSpec.min, Math.round(ct * f * 10) / 10);
        if (v < ct) cands.push({ label: `${bot.uid}: cycle time ${ct.toFixed(1)} → ${v.toFixed(1)} s`, changes: [{ machineId: bot.uid, key: 'cycleTime', value: v }] });
      }
    }
    if (def.params.find(p => p.key === 'capacity')) {
      cands.push({ label: `${bot.uid}: parallel capacity ${bot.params['capacity']} → ${bot.params['capacity']! + 1}`, changes: [{ machineId: bot.uid, key: 'capacity', value: bot.params['capacity']! + 1 }] });
    }
    if (bot.params['mtbf'] && bot.params['mtbf']! > 0) {
      cands.push({ label: `${bot.uid}: halve micro-stops (MTBF ${bot.params['mtbf']} → ${bot.params['mtbf']! * 2} s)`, changes: [{ machineId: bot.uid, key: 'mtbf', value: bot.params['mtbf']! * 2 }] });
    }
    return cands;
  }, [line]);

  const suggest = useCallback(() => {
    if (errs.length) { say('Fix validation flags first'); return; }
    setAdvBusy(true);
    pendingPhase.current = 'baseline';
    worker.current?.postMessage({ type: 'whatif', candidates: [], horizon: 600 });
  }, [errs, say]);

  // phase handler: baseline result → build candidates from ITS bottleneck
  useEffect(() => {
    if (!advice) return;
    if (pendingPhase.current === 'baseline') {
      pendingPhase.current = 'candidates';
      const botId = advice.baseline?.bottleneck;
      const cands = botId ? candidatesFor(botId) : [];
      if (!cands.length) {
        pendingPhase.current = null; setAdvBusy(false);
        say(botId ? `No parameterized improvements available for ${botId}` : 'No constraint found at steady state');
        return;
      }
      worker.current?.postMessage({ type: 'whatif', candidates: cands, horizon: 600 });
    } else if (pendingPhase.current === 'candidates') {
      pendingPhase.current = null;   // final results are already in `advice`
      setAdvBusy(false);
    }
  }, [advice, candidatesFor, say]);

  const applySuggestion = useCallback((r: any) => {
    for (const ch of r.changes) setParam(ch.machineId, ch.key, ch.value);
    setApplied(a => [...a, r.label]);
    say(`Applied: ${r.label} (Ctrl+Z to undo)`);
  }, [setParam, say]);

  // ---- WOW-03 report / share
  const currentStory = useMemo<StoryLine[]>(
    () => (rep && snap) ? buildStory(toConfig(line), rep, snap) : [],
    [rep, snap, line]);

  const openReport = useCallback(() => {
    if (!rep || !snap) return;
    const html = buildReportHtml(toConfig(line), rep, snap, currentStory, applied);
    const w = window.open('', '_blank');
    if (w) { w.document.write(html); w.document.close(); }
  }, [rep, snap, line, currentStory, applied]);

  const exportDoc = useCallback(() => {
    if (!rep || !snap) return;
    downloadDoc(buildReportHtml(toConfig(line), rep, snap, currentStory, applied), 'engineering-report');
  }, [rep, snap, line, currentStory, applied]);

  const share = useCallback(() => {
    downloadJson({ ...toConfig(line), schemaVersion: 1 }, 'cookie-line-a.project');
    navigator.clipboard?.writeText(`dtp.app/r/cookie-line-a#seed${SEED}`).catch(() => {});
    say('Project file downloaded · replay link copied (seed-pinned)');
  }, [line, say]);

  // ---- palette + hotkeys
  const commands = useMemo(() => [
    { t: 'Mode: Design', k: 'D', f: () => setMode('design') },
    { t: 'Mode: Simulate', k: 'S', f: () => setMode('simulate') },
    { t: 'Mode: Analyze', k: 'A', f: () => setMode('analyze') },
    { t: 'Run / Pause', k: 'Space', f: toggleRun },
    { t: 'Sprint 1 hour (MAX, headless)', k: 'M', f: sprint },
    { t: 'Suggest improvements (measured)', k: 'I', f: () => { setMode('analyze'); suggest(); } },
    { t: 'Open engineering report', k: 'R', f: openReport },
    { t: 'Export report as Word (.doc)', k: '', f: exportDoc },
    { t: 'Share project + replay link', k: '', f: share },
    { t: 'Reset simulation (same seed = same run)', k: '', f: resetSim },
    { t: 'Undo', k: 'Ctrl+Z', f: undo },
    { t: 'Explain OEE (CalcDrill)', k: '', f: () => setDrill(d => !d) },
    { t: 'Toggle advanced parameters', k: '', f: () => setShowAdvanced(s => !s) },
  ], [toggleRun, sprint, suggest, openReport, exportDoc, share, resetSim, undo]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { setPalOpen(true); e.preventDefault(); return; }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { undo(); e.preventDefault(); return; }
      if (e.key === ' ') { toggleRun(); e.preventDefault(); }
      const m: Record<string, Mode> = { d: 'design', s: 'simulate', a: 'analyze' };
      if (m[e.key.toLowerCase()]) setMode(m[e.key.toLowerCase()]!);
      if (e.key.toLowerCase() === 'i') { setMode('analyze'); suggest(); }
      if (e.key.toLowerCase() === 'r') openReport();
      if (e.key.toLowerCase() === 'm') sprint();
      if (e.key === ']') pickSpeed(SPEEDS[Math.min(SPEEDS.length - 1, SPEEDS.indexOf(speed) + 1)]!);
      if (e.key === '[') pickSpeed(SPEEDS[Math.max(0, SPEEDS.indexOf(speed) - 1)]!);
    };
    addEventListener('keydown', h);
    return () => removeEventListener('keydown', h);
  }, [toggleRun, undo, suggest, openReport, sprint, pickSpeed, speed]);

  // ---- derived KPIs
  const kpi = useMemo(() => {
    if (!rep || !snap) return null;
    const sink = snap.machines.find(m => m.archetype === 'sink');
    const bm = rep.machines.find(m => m.id === rep.bottleneck);
    return {
      tput: sink && rep.elapsed > 0 ? (sink.count / rep.elapsed) * 60 : 0,
      bot: rep.bottleneck, oee: bm?.oee, A: bm?.availability, P: bm?.performance, Q: bm?.quality,
    };
  }, [rep, snap]);

  const sel = line.find(i => i.uid === selId) ?? null;

  return <div className={`app mode-${mode}`}>
    <header>
      <span className="logo">◆ DTP <b>Cookie Line A</b></span>
      <nav className="modes">
        {(['design', 'simulate', 'analyze'] as Mode[]).map(m =>
          <button key={m} className={mode === m ? 'on' : ''} onClick={() => setMode(m)}>
            <u>{m[0]!.toUpperCase()}</u>{m.slice(1)}</button>)}
      </nav>
      <div className="spacer" />
      <button className="btn" onClick={openReport} title="R">Report</button>
      <button className="btn" onClick={share}>Share ↗</button>
      <button className="btn" onClick={() => setPalOpen(true)}>⌘K</button>
    </header>

    {errs.length > 0 && <div className="flags">{errs.map((e, i) => <span key={i}>⚠ {e}</span>)}</div>}

    <main>
      {mode === 'design' &&
        <aside className="left">
          <div className="ptitle">Machine Library</div>
          {LIBRARY.map(d =>
            <div key={d.id} className="lib" onClick={() => addMachine(d)} title="Click to add to the line">
              <span className="g" />{d.name}<span className="code">{d.code}</span>
            </div>)}
          <div className="note">Click to add. v0.1 builds flow lines; free 2D placement and split/merge routing arrive with the 3D canvas (AWP-005).</div>
        </aside>}

      <section className="center">
        <Strip line={line} snap={snap} selId={selId} onSelect={setSelId} />
      </section>

      <aside className="right">
        {mode !== 'analyze' && <Inspector sel={sel} mode={mode} showAdvanced={showAdvanced}
          onParam={setParam} onRemove={removeSel} onMove={moveSel}
          onToggleAdvanced={() => setShowAdvanced(s => !s)}
          state={snap?.machines.find(m => m.id === selId)?.state} />}
        {mode === 'analyze' && <>
          <div className="ptitle">Engineering Story — why these numbers</div>
          <div className="story">
            {currentStory.map((s, i) =>
              <div key={i} className={s.depth ? 'why' : 'lead'} style={{ marginLeft: s.depth * 14 }}>
                {s.depth ? '↳ ' : ''}{s.text}</div>)}
          </div>
          <div className="ptitle">Improvement Advisor — measured, not guessed</div>
          <div className="advisor">
            <button className="btn primary" onClick={suggest} disabled={advBusy}>
              {advBusy ? 'Simulating candidates…' : 'Suggest improvements (I)'}</button>
            {advice && advice.results.length > 0 && <div className="cands">
              <div className="basel">baseline (600 s headless run): {advice.baseline.throughputPpm.toFixed(1)} ppm · OEE {(advice.baseline.oee * 100).toFixed(1)} % · constraint {advice.baseline.bottleneck}</div>
              {advice.results.map((r: any, i: number) =>
                <div key={i} className="cand">
                  <div className="cl">{r.label}</div>
                  <div className="cm">
                    <span className={r.dTput >= 0 ? 'up' : 'dn'}>{r.dTput >= 0 ? '▲' : '▼'} {Math.abs(r.dTput).toFixed(1)} ppm</span>
                    <span className={r.dOee >= 0 ? 'up' : 'dn'}>OEE {r.dOee >= 0 ? '+' : ''}{(r.dOee * 100).toFixed(1)} pt</span>
                    <span className="nb">new bottleneck: {r.bottleneck}</span>
                    <button className="btn tiny" onClick={() => applySuggestion(r)}>Apply</button>
                  </div>
                </div>)}
              <div className="note">Each candidate was simulated for 600 s with the live parameters and the same seed — deltas are measured results, not estimates. Apply is undoable (Ctrl+Z).</div>
            </div>}
          </div>
        </>}
      </aside>
    </main>

    <footer>
      <div className="transport">
        <button className={`btn ${running ? '' : 'primary'}`} onClick={toggleRun}>{running ? '⏸ Pause' : '▶ Run'}</button>
        <button className="btn" onClick={resetSim} title="same seed ⇒ identical run">↺ Reset</button>
        <div className="speeds">{SPEEDS.map(s =>
          <button key={s} className={speed === s ? 'on' : ''} onClick={() => pickSpeed(s)}>{s}×</button>)}
          <button onClick={sprint} title="M — simulate 1 h instantly">MAX</button></div>
        <span className="hinttext">Space runs · [ ] speed · I improvements · R report · Ctrl+K everything</span>
        <span className="clock">t = {(snap?.time ?? 0).toFixed(1)} s</span>
      </div>
      <div className="kpis">
        <div className="tile click" onClick={() => setDrill(d => !d)}>
          <div className="k">OEE @ constraint — click to explain</div>
          <div className="v">{kpi?.oee ? (kpi.oee.value * 100).toFixed(1) + ' %' : '—'}</div></div>
        <div className="tile"><div className="k">Availability</div><div className="v">{kpi?.A ? (kpi.A.value * 100).toFixed(1) + ' %' : '—'}</div></div>
        <div className="tile"><div className="k">Performance</div><div className="v">{kpi?.P ? (kpi.P.value * 100).toFixed(1) + ' %' : '—'}</div></div>
        <div className="tile"><div className="k">Quality</div><div className="v">{kpi?.Q ? (kpi.Q.value * 100).toFixed(1) + ' %' : '—'}</div></div>
        <div className="tile"><div className="k">Throughput</div><div className="v">{kpi ? kpi.tput.toFixed(1) + ' ppm' : '—'}</div></div>
        <div className={`tile ${kpi?.bot ? 'alert' : ''}`}><div className="k">Bottleneck</div><div className="v small">{kpi?.bot ?? '—'}</div></div>
      </div>
      {drill && kpi?.oee && <div className="drill">
        <div><b>{kpi.oee.formula}</b> = {(kpi.oee.value * 100).toFixed(1)} %</div>
        {[kpi.A, kpi.P, kpi.Q].map((cv, i) => cv &&
          <div key={i}>{cv.formula} = {(cv.value * 100).toFixed(1)} %{cv.inputs &&
            '  ·  inputs: ' + Object.entries(cv.inputs).map(([k, v]) => `${k}=${(v as any).value.toFixed(1)} ${(v as any).unit}`).join(', ')}</div>)}
        <div className="note">Assumption on record: starved/blocked time counts against Performance, not Availability (STANDARDS.md). Full input-tree drill lands with the Analytics screen.</div>
      </div>}
    </footer>

    {palOpen && <Palette commands={commands} onClose={() => setPalOpen(false)} />}
    {toast && <div className="toast">{toast}</div>}
  </div>;
}

// -------------------------------------------------------------------- strip
function Strip({ line, snap, selId, onSelect }: {
  line: Item[]; snap: SimulationSnapshot | null; selId: string | null;
  onSelect: (id: string) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hits = useRef<{ id: string; x: number; w: number }[]>([]);

  useEffect(() => {
    let raf = 0;
    const draw = () => {
      raf = requestAnimationFrame(draw);
      const cv = ref.current; if (!cv) return;
      if (cv.width !== cv.clientWidth || cv.height !== cv.clientHeight) { cv.width = cv.clientWidth; cv.height = cv.clientHeight; }
      const ctx = cv.getContext('2d')!;
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.font = '11px system-ui'; ctx.textAlign = 'center';
      const Y = cv.height / 2 - 26, H = 52, PAD = 24, GAP = 10;
      const weights = line.map(it => defById(it.defId).archetype === 'transport' ? 2 : 1);
      const totalW = weights.reduce((a, b) => a + b, 0);
      const unit = (cv.width - PAD * 2 - GAP * (line.length - 1)) / totalW;
      let x = PAD;
      hits.current = [];
      line.forEach((it, idx) => {
        const def = defById(it.defId);
        const w = weights[idx]! * unit;
        const sm = snap?.machines.find(m => m.id === it.uid);
        const state = sm?.state ?? 'IDLE';
        const isBelt = def.archetype === 'transport';
        const y = isBelt ? Y + 11 : Y, h = isBelt ? H - 22 : H;
        ctx.fillStyle = isBelt ? '#2c2c2a' : '#211f1e';
        ctx.strokeStyle = selId === it.uid ? '#3987e5' : STATE_COLOR[state];
        ctx.lineWidth = selId === it.uid ? 3 : 2;
        ctx.fillRect(x, y, w, h); ctx.strokeRect(x, y, w, h);
        ctx.fillStyle = '#c3c2b7'; ctx.fillText(it.uid, x + w / 2, Y - 18);
        ctx.fillStyle = '#898781';
        ctx.fillText(`${state}${sm && sm.count ? ' · ' + sm.count : ''}`, x + w / 2, Y + H + 16);
        if (isBelt && sm?.positions) for (const p of sm.positions) {
          ctx.beginPath(); ctx.arc(x + p * w, Y + H / 2, 5, 0, 7);
          ctx.fillStyle = '#c98500'; ctx.fill();
        }
        if (def.archetype === 'sink' && sm) {
          ctx.fillStyle = '#0ca30c'; ctx.font = 'bold 17px system-ui';
          ctx.fillText(String(sm.count), x + w / 2, Y + 31); ctx.font = '11px system-ui';
        }
        hits.current.push({ id: it.uid, x, w });
        x += w + GAP;
      });
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [line, snap, selId]);

  return <canvas ref={ref} onClick={e => {
    const r = ref.current!.getBoundingClientRect();
    const px = e.clientX - r.left;
    const hit = hits.current.find(h => px >= h.x && px <= h.x + h.w);
    if (hit) onSelect(hit.id);
  }} />;
}

// ---------------------------------------------------------------- inspector
function Inspector({ sel, mode, state, showAdvanced, onParam, onRemove, onMove, onToggleAdvanced }: {
  sel: Item | null; mode: Mode; state?: MachineState; showAdvanced: boolean;
  onParam: (uid: string, key: string, v: number) => void;
  onRemove: () => void; onMove: (d: number) => void; onToggleAdvanced: () => void;
}) {
  if (!sel) return <><div className="ptitle">Properties</div><div className="note">Click a machine on the canvas.</div></>;
  const def = defById(sel.defId);
  const visible = def.params.filter(p => showAdvanced || !p.advanced);
  const hasAdv = def.params.some(p => p.advanced);
  return <>
    <div className="ptitle">Properties — {def.name} {sel.uid}</div>
    {state && <div className="prow"><label>State</label>
      <span className="chip" style={{ background: STATE_COLOR[state] }}>{state}</span></div>}
    {visible.map(p =>
      <div className="prow" key={p.key}>
        <label>{p.label}</label>
        <input type="number" min={p.min} max={p.max} step={p.step}
          value={sel.params[p.key] ?? p.default}
          onChange={e => { const v = Number(e.target.value); if (!Number.isNaN(v)) onParam(sel.uid, p.key, Math.min(p.max, Math.max(p.min, v))); }} />
        <span className="unit">{p.unit}</span>
      </div>)}
    {hasAdv && <button className="btn tiny" onClick={onToggleAdvanced}>{showAdvanced ? 'Hide' : 'Show'} advanced (failures, quality)</button>}
    {def.derived.length > 0 && <div className="formula">
      <b>Transparent calculations</b><br />
      {def.derived.map((d, i) => { const [f, r] = d.calc(sel.params); return <span key={i}>{d.label} = {f} = <b>{r}</b><br /></span>; })}
    </div>}
    {mode === 'design' && <div className="rowbtns">
      <button className="btn tiny" onClick={() => onMove(-1)}>◀ Move</button>
      <button className="btn tiny" onClick={() => onMove(1)}>Move ▶</button>
      <button className="btn tiny danger" onClick={onRemove}>✕ Remove</button>
    </div>}
  </>;
}

// ------------------------------------------------------------------ palette
function Palette({ commands, onClose }: { commands: { t: string; k: string; f: () => void }[]; onClose: () => void }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const list = commands.filter(c => c.t.toLowerCase().includes(q.toLowerCase()));
  return <div className="pal-bg" onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div className="pal">
      <input autoFocus placeholder="Type a command…" value={q}
        onChange={e => { setQ(e.target.value); setSel(0); }}
        onKeyDown={e => {
          if (e.key === 'ArrowDown') setSel(s => Math.min(s + 1, list.length - 1));
          if (e.key === 'ArrowUp') setSel(s => Math.max(s - 1, 0));
          if (e.key === 'Enter' && list[sel]) { onClose(); list[sel]!.f(); }
          if (e.key === 'Escape') onClose();
        }} />
      {list.map((c, i) =>
        <div key={c.t} className={`item ${i === sel ? 'sel' : ''}`}
          onClick={() => { onClose(); c.f(); }}>{c.t}{c.k && <span className="kbd">{c.k}</span>}</div>)}
    </div>
  </div>;
}

createRoot(document.getElementById('root')!).render(<App />);
