/**
 * WOW-01 — Engineering Story Engine.
 * Turns the recorder's measured facts into a causal chain: every KPI
 * answers "why?" with because-links backed by numbers. No speculation:
 * every clause cites recorded data.
 */
import type { RecorderReport, LineConfig, SimulationSnapshot } from '@dtp/engine';

export interface StoryLine { depth: number; text: string }

const pct = (x: number) => `${(x * 100).toFixed(0)} %`;

export function buildStory(
  cfg: LineConfig, rep: RecorderReport, snap: SimulationSnapshot,
): StoryLine[] {
  const out: StoryLine[] = [];
  if (rep.elapsed < 5) return [{ depth: 0, text: 'Run the simulation to build the causal story.' }];

  const sink = snap.machines.find(m => m.archetype === 'sink');
  const tput = sink ? (sink.count / rep.elapsed) * 60 : 0;
  out.push({ depth: 0, text: `Line throughput is ${tput.toFixed(1)} ppm over ${rep.elapsed.toFixed(0)} s. Why?` });

  const botId = rep.bottleneck;
  const bot = rep.machines.find(m => m.id === botId);
  if (!botId || !bot) { out.push({ depth: 1, text: 'No constraint identified yet — keep running.' }); return out; }

  // upstream evidence
  const upstream = cfg.machines.filter(m => (m.outputs ?? []).includes(botId));
  const upBlocked = upstream
    .map(u => ({ id: u.id, t: rep.machines.find(m => m.id === u.id)?.timeInState.BLOCKED ?? 0 }))
    .sort((a, b) => b.t - a.t)[0];

  out.push({
    depth: 1,
    text: `Because ${botId} is the constraint: ` +
      (upBlocked && upBlocked.t > 0
        ? `${upBlocked.id} spent ${pct(upBlocked.t / rep.elapsed)} of the run blocked, waiting for ${botId} to accept product.`
        : `it has the highest utilization (${pct(bot.utilization.value)}) and nothing upstream is faster.`),
  });

  // decompose the constraint's losses
  const ts = bot.timeInState;
  const cyc = cfg.machines.find(m => m.id === botId)?.params['cycleTime'];
  if (cyc) out.push({ depth: 2, text: `Because its capacity is 60 ÷ ${cyc.toFixed(1)} s = ${(60 / cyc).toFixed(0)} ppm by configuration.` });
  if (ts.DOWN > rep.elapsed * 0.01) {
    const downs = rep.events.filter(e => e.machineId === botId && e.type === 'DOWN').length;
    out.push({ depth: 2, text: `Because it lost ${pct(ts.DOWN / rep.elapsed)} of runtime to ${downs} breakdown${downs === 1 ? '' : 's'} (availability ${bot.availability ? pct(bot.availability.value) : '—'}).` });
  }
  if (bot.quality && bot.quality.value < 0.999) {
    out.push({ depth: 2, text: `Because ${pct(1 - bot.quality.value)} of its output is rejected (quality ${pct(bot.quality.value)}) — ${bot.totalCount - bot.goodCount} pieces lost.` });
  }
  if (ts.STARVED > rep.elapsed * 0.05) {
    out.push({ depth: 2, text: `Note: it is also starved ${pct(ts.STARVED / rep.elapsed)} of the time — upstream supply intermittently limits it too.` });
  }
  if (ts.BLOCKED > rep.elapsed * 0.05) {
    out.push({ depth: 2, text: `Note: it is blocked ${pct(ts.BLOCKED / rep.elapsed)} of the time — the true constraint may be downstream of it.` });
  }

  // what is NOT the problem (engineers trust tools that rule things out)
  const healthy = rep.machines
    .filter(m => m.id !== botId && (m.oee?.value ?? 1) > 0.9 && m.timeInState.DOWN < rep.elapsed * 0.01)
    .map(m => m.id);
  if (healthy.length) out.push({ depth: 1, text: `Ruled out: ${healthy.join(', ')} — no significant losses recorded there.` });

  out.push({ depth: 0, text: `Therefore: improving ${botId} is the only change that can raise line throughput (theory of constraints). Use "Suggest improvements" to measure candidate fixes.` });
  return out;
}
