/**
 * GSD HTML Report Generator
 *
 * Produces a single self-contained HTML file with:
 *   - Branding header (project name, path, GSD version, generated timestamp)
 *   - Project summary & overall progress
 *   - Progress tree (milestones → slices → tasks, with critical path)
 *   - Execution timeline (chronological unit history)
 *   - Slice dependency graph (SVG DAG per milestone)
 *   - Cost & token metrics (bar charts, phase/slice/model/tier breakdowns)
 *   - Health & configuration overview
 *   - Changelog (completed slice summaries + file modifications)
 *   - Knowledge base (rules, patterns, lessons)
 *   - Captures log
 *   - Artifacts & milestone planning / discussion state
 *
 * No external dependencies — all CSS and JS is inlined.
 * Printable to PDF from any browser.
 *
 * Design: Linear-inspired — restrained palette, geometric status, no emoji.
 */

import type {
  VisualizerData,
  VisualizerMilestone,
  VisualizerSlice,
} from './visualizer-data.js';
import { formatDateShort, formatDuration } from '../shared/format-utils.js';
import { esc, renderHtmlShell } from '../shared/html-shell.js';
import { formatCost, formatTokenCount } from './metrics.js';
import type { UnitMetrics } from './metrics.js';

// ─── Public API ────────────────────────────────────────────────────────────────

export interface HtmlReportOptions {
  projectName: string;
  projectPath: string;
  gsdVersion: string;
  milestoneId?: string;
  indexRelPath?: string;
}

export function generateHtmlReport(
  data: VisualizerData,
  opts: HtmlReportOptions,
): string {
  const generated = new Date().toISOString();

  const sections = [
    buildSummarySection(data, opts, generated),
    buildBlockersSection(data),
    buildProgressSection(data),
    buildTimelineSection(data),
    buildDepGraphSection(data),
    buildMetricsSection(data),
    buildHealthSection(data),
    buildChangelogSection(data),
    buildKnowledgeSection(data),
    buildCapturesSection(data),
    buildStatsSection(data),
    buildDiscussionSection(data),
  ];

  const title = opts.milestoneId ? `${opts.projectName} / ${opts.milestoneId}` : opts.projectName;

  const backLink = opts.indexRelPath
    ? `<a class="back-link" href="${esc(opts.indexRelPath)}">All Reports</a>`
    : '';

  return renderHtmlShell({
    title,
    documentTitle: `GSD Report — ${opts.projectName}${opts.milestoneId ? ` — ${opts.milestoneId}` : ''}`,
    subtitle: opts.projectPath,
    kind: 'Report',
    version: opts.gsdVersion,
    generatedAt: generated,
    headerActionsHtml: backLink,
    footerNote: opts.milestoneId ? `${opts.projectName} / ${opts.milestoneId}` : opts.projectName,
    toc: [
      { href: '#summary', label: 'Summary' },
      { href: '#blockers', label: 'Blockers' },
      { href: '#progress', label: 'Progress' },
      { href: '#timeline', label: 'Timeline' },
      { href: '#depgraph', label: 'Dependencies' },
      { href: '#metrics', label: 'Metrics' },
      { href: '#health', label: 'Health' },
      { href: '#changelog', label: 'Changelog' },
      { href: '#knowledge', label: 'Knowledge' },
      { href: '#captures', label: 'Captures' },
      { href: '#stats', label: 'Artifacts' },
      { href: '#discussion', label: 'Planning' },
    ],
    mainHtml: sections.join('\n'),
  });
}

// ─── Section: Summary ─────────────────────────────────────────────────────────

function buildSummarySection(
  data: VisualizerData,
  opts: HtmlReportOptions,
  _generated: string,
): string {
  const t = data.totals;
  const totalSlices = data.milestones.reduce((s, m) => s + m.slices.length, 0);
  const doneSlices  = data.milestones.reduce((s, m) => s + m.slices.filter(sl => sl.done).length, 0);
  const doneMilestones = data.milestones.filter(m => m.status === 'complete').length;
  const activeMilestone = data.milestones.find(m => m.status === 'active');
  const pct = totalSlices > 0 ? Math.round((doneSlices / totalSlices) * 100) : 0;

  const act = data.agentActivity;
  const kv = [
    kvi('Milestones', `${doneMilestones}/${data.milestones.length}`),
    kvi('Slices', `${doneSlices}/${totalSlices}`),
    kvi('Phase', data.phase),
    t ? kvi('Cost', formatCost(t.cost)) : '',
    t ? kvi('Tokens', formatTokenCount(t.tokens.total)) : '',
    t ? kvi('Duration', formatDuration(t.duration)) : '',
    t ? kvi('Tool calls', String(t.toolCalls)) : '',
    t ? kvi('Units', String(t.units)) : '',
    data.remainingSliceCount > 0 ? kvi('Remaining', String(data.remainingSliceCount)) : '',
    act ? kvi('Rate', `${act.completionRate.toFixed(1)}/hr`) : '',
    t && doneSlices > 0 ? kvi('Cost/slice', formatCost(t.cost / doneSlices)) : '',
    t && t.toolCalls > 0 ? kvi('Tokens/tool', formatTokenCount(t.tokens.total / t.toolCalls)) : '',
    t && (t.tokens.input + t.tokens.cacheRead) > 0
      ? kvi('Cache hit', ((t.tokens.cacheRead / (t.tokens.input + t.tokens.cacheRead)) * 100).toFixed(1) + '%')
      : '',
    opts.milestoneId ? kvi('Scope', opts.milestoneId) : '',
  ].filter(Boolean).join('');

  const activeInfo = activeMilestone ? (() => {
    const active = activeMilestone.slices.find(s => s.active);
    if (!active) return '';
    return `<div class="active-info">
      Executing <span class="mono">${esc(activeMilestone.id)}/${esc(active.id)}</span> — ${esc(active.title)}
    </div>`;
  })() : '';

  const activityHtml = act?.active ? `
    <div class="activity-line">
      <span class="dot dot-active"></span>
      <span class="mono">${esc(act.currentUnit?.type ?? '')}</span>
      <span class="mono muted">${esc(act.currentUnit?.id ?? '')}</span>
      <span class="muted">${formatDuration(act.elapsed)} elapsed</span>
    </div>` : '';

  const execSummary = buildExecutiveSummary(data, opts);
  const etaLine = buildEtaLine(data);

  return section('summary', 'Summary', `
    ${execSummary}
    <div class="kv-grid">${kv}</div>
    <div class="progress-wrap">
      <div class="progress-track"><div class="progress-fill" style="width:${pct}%"></div></div>
      <span class="progress-label">${pct}%</span>
    </div>
    ${activeInfo}
    ${activityHtml}
    ${etaLine}
  `);
}

function buildExecutiveSummary(data: VisualizerData, opts: HtmlReportOptions): string {
  const totalSlices = data.milestones.reduce((s, m) => s + m.slices.length, 0);
  const doneSlices = data.milestones.reduce((s, m) => s + m.slices.filter(sl => sl.done).length, 0);
  const pct = totalSlices > 0 ? Math.round((doneSlices / totalSlices) * 100) : 0;
  const spent = data.totals?.cost ?? 0;
  const activeMilestone = data.milestones.find(m => m.status === 'active');
  const activeSlice = activeMilestone?.slices.find(s => s.active);
  const currentExec = activeMilestone && activeSlice
    ? ` Currently executing ${esc(activeMilestone.id)}/${esc(activeSlice.id)}.`
    : '';
  const budgetCtx = data.health.budgetCeiling
    ? ` Budget: ${formatCost(spent)} of ${formatCost(data.health.budgetCeiling)} ceiling (${((spent / data.health.budgetCeiling) * 100).toFixed(0)}% used).`
    : '';
  return `<p class="exec-summary">${esc(opts.projectName)} is ${pct}% complete across ${data.milestones.length} milestones. ${formatCost(spent)} spent.${currentExec}${budgetCtx}</p>`;
}

function buildEtaLine(data: VisualizerData): string {
  const act = data.agentActivity;
  if (!act || act.completionRate <= 0 || data.remainingSliceCount <= 0) return '';
  const hoursRemaining = data.remainingSliceCount / act.completionRate;
  const formatted = formatDuration(hoursRemaining * 3_600_000);
  return `<div class="eta-line">ETA: ~${formatted} remaining (${data.remainingSliceCount} slices at ${act.completionRate.toFixed(1)}/hr)</div>`;
}

// ─── Section: Blockers ────────────────────────────────────────────────────────

function buildBlockersSection(data: VisualizerData): string {
  const blockers = data.sliceVerifications.filter(v => v.blockerDiscovered === true);
  const highRisk: { msId: string; slId: string }[] = [];
  for (const ms of data.milestones) {
    for (const sl of ms.slices) {
      if (!sl.done && sl.risk?.toLowerCase() === 'high') {
        highRisk.push({ msId: ms.id, slId: sl.id });
      }
    }
  }

  if (blockers.length === 0 && highRisk.length === 0) {
    return section('blockers', 'Blockers', '<p class="empty">No blockers or high-risk items found.</p>');
  }

  const blockerCards = blockers.map(v => `
    <div class="blocker-card">
      <div class="blocker-id">${esc(v.milestoneId)}/${esc(v.sliceId)}</div>
      <div class="blocker-text">${esc(v.verificationResult ?? 'Blocker discovered')}</div>
    </div>`).join('');

  const riskCards = highRisk
    .filter(hr => !blockers.some(b => b.milestoneId === hr.msId && b.sliceId === hr.slId))
    .map(hr => `
    <div class="blocker-card">
      <div class="blocker-id">${esc(hr.msId)}/${esc(hr.slId)}</div>
      <div class="blocker-text">High risk — incomplete</div>
    </div>`).join('');

  return section('blockers', 'Blockers', `${blockerCards}${riskCards}`);
}

// ─── Section: Health ──────────────────────────────────────────────────────────

function buildHealthSection(data: VisualizerData): string {
  const h = data.health;
  const t = data.totals;

  const rows: string[] = [];
  rows.push(hRow('Token profile', h.tokenProfile));
  if (h.budgetCeiling !== undefined) {
    const spent = t?.cost ?? 0;
    const pct = (spent / h.budgetCeiling) * 100;
    const status = pct > 90 ? 'warn' : pct > 75 ? 'caution' : 'ok';
    rows.push(hRow(
      'Budget ceiling',
      `${formatCost(h.budgetCeiling)} (${formatCost(spent)} spent, ${pct.toFixed(0)}% used)`,
      status,
    ));
  }
  rows.push(hRow(
    'Truncation rate',
    `${h.truncationRate.toFixed(1)}% per unit (${t?.totalTruncationSections ?? 0} total)`,
    h.truncationRate > 20 ? 'warn' : h.truncationRate > 10 ? 'caution' : 'ok',
  ));
  rows.push(hRow(
    'Continue-here rate',
    `${h.continueHereRate.toFixed(1)}% per unit (${t?.continueHereFiredCount ?? 0} total)`,
    h.continueHereRate > 15 ? 'warn' : h.continueHereRate > 8 ? 'caution' : 'ok',
  ));
  if (h.tierSavingsLine) rows.push(hRow('Routing savings', h.tierSavingsLine));
  rows.push(hRow('Tool calls', String(h.toolCalls)));
  rows.push(hRow('Messages', `${h.assistantMessages} assistant / ${h.userMessages} user`));

  const tierRows = h.tierBreakdown.length > 0 ? `
    <h3>Tier breakdown</h3>
    <table class="tbl">
      <thead><tr><th>Tier</th><th>Units</th><th>Cost</th><th>Tokens</th></tr></thead>
      <tbody>
        ${h.tierBreakdown.map(tb =>
          `<tr><td class="mono">${esc(tb.tier)}</td>
           <td>${tb.units}</td><td>${formatCost(tb.cost)}</td>
           <td>${formatTokenCount(tb.tokens.total)}</td></tr>`
        ).join('')}
      </tbody>
    </table>` : '';

  // Progress score section
  let progressHtml = '';
  if (h.progressScore) {
    const ps = h.progressScore;
    const scoreColor = ps.level === 'green' ? '#22c55e' : ps.level === 'yellow' ? '#eab308' : '#ef4444';
    const signalRows = ps.signals.map(s => {
      const icon = s.kind === 'positive' ? '✓' : s.kind === 'negative' ? '✗' : '·';
      const color = s.kind === 'positive' ? '#22c55e' : s.kind === 'negative' ? '#ef4444' : '#888';
      return `<div style="margin-left:1em;color:${color}">${icon} ${esc(s.label)}</div>`;
    }).join('');
    progressHtml = `
      <h3>Progress Score</h3>
      <div style="font-size:1.1em;font-weight:bold;color:${scoreColor}">● ${esc(ps.summary)}</div>
      ${signalRows}`;
  }

  // Doctor history section
  let historyHtml = '';
  const doctorHistory = h.doctorHistory ?? [];
  if (doctorHistory.length > 0) {
    const historyRows = doctorHistory.slice(0, 20).map(entry => {
      const statusIcon = entry.ok ? '✓' : '✗';
      const statusColor = entry.ok ? '#22c55e' : '#ef4444';
      const ts = entry.ts.replace('T', ' ').slice(0, 19);
      const scopeTag = entry.scope ? `<span class="mono" style="color:#888"> [${esc(entry.scope)}]</span>` : '';
      const summaryText = entry.summary ? esc(entry.summary) : `${entry.errors} errors, ${entry.warnings} warnings, ${entry.fixes} fixes`;
      const issueDetails = (entry.issues ?? []).slice(0, 3).map(i => {
        const iColor = i.severity === 'error' ? '#ef4444' : '#eab308';
        return `<div style="margin-left:2em;color:${iColor};font-size:0.85em">${i.severity === 'error' ? '✗' : '⚠'} ${esc(i.message)} <span class="mono" style="color:#888">${esc(i.unitId)}</span></div>`;
      }).join('');
      const fixDetails = (entry.fixDescriptions ?? []).slice(0, 2).map(f =>
        `<div style="margin-left:2em;color:#22c55e;font-size:0.85em">↳ ${esc(f)}</div>`
      ).join('');
      return `<tr style="color:${statusColor}">
        <td class="mono">${statusIcon}</td>
        <td class="mono">${esc(ts)}${scopeTag}</td>
        <td>${summaryText}</td>
      </tr>
      ${issueDetails || fixDetails ? `<tr><td colspan="3">${issueDetails}${fixDetails}</td></tr>` : ''}`;
    }).join('');

    historyHtml = `
      <h3>Doctor Run History</h3>
      <table class="tbl">
        <thead><tr><th></th><th>Time</th><th>Summary</th></tr></thead>
        <tbody>${historyRows}</tbody>
      </table>`;
  }

  return section('health', 'Health', `
    <table class="tbl tbl-kv"><tbody>${rows.join('')}</tbody></table>
    ${tierRows}
    ${progressHtml}
    ${historyHtml}
  `);
}

// ─── Section: Progress ────────────────────────────────────────────────────────

function buildProgressSection(data: VisualizerData): string {
  if (data.milestones.length === 0) {
    return section('progress', 'Progress', '<p class="empty">No milestones found.</p>');
  }

  const critMS = new Set(data.criticalPath.milestonePath);
  const critSL = new Set(data.criticalPath.slicePath);

  const msHtml = data.milestones.map(ms => {
    const doneCount = ms.slices.filter(s => s.done).length;
    const onCrit = critMS.has(ms.id);
    const sliceHtml = ms.slices.length > 0
      ? ms.slices.map(sl => buildSliceRow(sl, critSL, data)).join('')
      : '<p class="empty indent">No slices in roadmap yet.</p>';

    return `
      <details class="ms-block" ${ms.status !== 'pending' && ms.status !== 'parked' ? 'open' : ''}>
        <summary class="ms-summary ms-${ms.status}">
          <span class="dot dot-${ms.status}"></span>
          <span class="mono ms-id">${esc(ms.id)}</span>
          <span class="ms-title">${esc(ms.title)}</span>
          <span class="muted">${doneCount}/${ms.slices.length}</span>
          ${onCrit ? '<span class="label">critical path</span>' : ''}
          ${ms.dependsOn.length > 0 ? `<span class="muted">needs ${ms.dependsOn.map(esc).join(', ')}</span>` : ''}
        </summary>
        <div class="ms-body">${sliceHtml}</div>
      </details>`;
  }).join('');

  return section('progress', 'Progress', msHtml);
}

function buildSliceRow(sl: VisualizerSlice, critSL: Set<string>, data: VisualizerData): string {
  const onCrit = critSL.has(sl.id);
  const ver = data.sliceVerifications.find(v => v.sliceId === sl.id);
  const slack = data.criticalPath.sliceSlack.get(sl.id);
  const status = sl.done ? 'complete' : sl.active ? 'active' : 'pending';

  const taskHtml = sl.tasks.length > 0 ? `
    <ul class="task-list">
      ${sl.tasks.map(t => `
        <li class="task-row">
          <span class="dot dot-${t.done ? 'complete' : t.active ? 'active' : 'pending'} dot-sm"></span>
          <span class="mono muted">${esc(t.id)}</span>
          <span class="${t.done ? 'muted' : ''}">${esc(t.title)}</span>
          ${t.estimate ? `<span class="muted">${esc(t.estimate)}</span>` : ''}
        </li>`).join('')}
    </ul>` : '';

  const tags = [
    ...(ver?.provides ?? []).map(p => `<span class="tag">provides: ${esc(p)}</span>`),
    ...(ver?.requires ?? []).map(r => `<span class="tag">requires: ${esc(r.provides)}</span>`),
  ].join('');

  const keyDecisions = ver?.keyDecisions?.length
    ? `<div class="detail-block"><span class="detail-label">Decisions</span><ul>${ver.keyDecisions.map(d => `<li>${esc(d)}</li>`).join('')}</ul></div>`
    : '';

  const patterns = ver?.patternsEstablished?.length
    ? `<div class="detail-block"><span class="detail-label">Patterns</span><ul>${ver.patternsEstablished.map(p => `<li>${esc(p)}</li>`).join('')}</ul></div>`
    : '';

  const verifBadge = ver?.verificationResult
    ? `<div class="verif ${ver.blockerDiscovered ? 'verif-blocker' : ''}">
        ${ver.blockerDiscovered ? 'Blocker: ' : ''}${esc(ver.verificationResult)}
       </div>`
    : '';

  return `
    <details class="sl-block">
      <summary class="sl-summary ${onCrit ? 'sl-crit' : ''}">
        <span class="dot dot-${status} dot-sm"></span>
        <span class="mono muted">${esc(sl.id)}</span>
        <span class="${status === 'active' ? 'accent' : sl.done ? 'muted' : ''}">${esc(sl.title)}</span>
        <span class="risk risk-${(sl.risk || 'unknown').toLowerCase()}">${esc(sl.risk || '?')}</span>
        ${sl.depends.length > 0 ? `<span class="muted sl-deps">${sl.depends.map(esc).join(', ')}</span>` : ''}
        ${onCrit ? '<span class="label">critical</span>' : ''}
        ${slack !== undefined && slack > 0 ? `<span class="muted">+${slack} slack</span>` : ''}
      </summary>
      <div class="sl-detail">
        ${tags ? `<div class="tag-row">${tags}</div>` : ''}
        ${verifBadge}
        ${keyDecisions}
        ${patterns}
        ${taskHtml}
      </div>
    </details>`;
}

// ─── Section: Dependency Graph ────────────────────────────────────────────────

function buildDepGraphSection(data: VisualizerData): string {
  const hasSlices = data.milestones.some(ms => ms.slices.length > 0);
  if (!hasSlices) return section('depgraph', 'Dependencies', '<p class="empty">No slices to graph.</p>');

  const hasDeps = data.milestones.some(ms => ms.slices.some(s => s.depends.length > 0));
  if (!hasDeps) return section('depgraph', 'Dependencies', '<p class="empty">No dependencies defined.</p>');

  const svgs = data.milestones
    .filter(ms => ms.slices.length > 0)
    .map(ms => buildMilestoneDepSVG(ms, data))
    .filter(Boolean)
    .join('');

  return section('depgraph', 'Dependencies', svgs);
}

function buildMilestoneDepSVG(ms: VisualizerMilestone, data: VisualizerData): string {
  const slices = ms.slices;
  if (slices.length === 0) return '';

  const critSL = new Set(data.criticalPath.slicePath);
  const slMap = new Map(slices.map(s => [s.id, s]));

  const layerMap = new Map<string, number>();
  const inDeg = new Map<string, number>();
  for (const s of slices) inDeg.set(s.id, 0);
  for (const s of slices) {
    for (const dep of s.depends) {
      if (slMap.has(dep)) inDeg.set(s.id, (inDeg.get(s.id) ?? 0) + 1);
    }
  }

  const visited = new Set<string>();
  const q: string[] = [];
  for (const [id, d] of inDeg) {
    if (d === 0) { q.push(id); visited.add(id); layerMap.set(id, 0); }
  }

  while (q.length > 0) {
    const node = q.shift()!;
    for (const s of slices) {
      if (!s.depends.includes(node)) continue;
      const newDeg = (inDeg.get(s.id) ?? 1) - 1;
      inDeg.set(s.id, newDeg);
      layerMap.set(s.id, Math.max(layerMap.get(s.id) ?? 0, (layerMap.get(node) ?? 0) + 1));
      if (newDeg === 0 && !visited.has(s.id)) { visited.add(s.id); q.push(s.id); }
    }
  }
  for (const s of slices) if (!layerMap.has(s.id)) layerMap.set(s.id, 0);

  const maxLayer = Math.max(...[...layerMap.values()]);
  const byLayer = new Map<number, string[]>();
  for (const [id, layer] of layerMap) {
    const arr = byLayer.get(layer) ?? [];
    arr.push(id);
    byLayer.set(layer, arr);
  }

  const NW = 130, NH = 40, CGAP = 56, RGAP = 14, PAD = 20;
  let maxRows = 0;
  for (let c = 0; c <= maxLayer; c++) maxRows = Math.max(maxRows, (byLayer.get(c) ?? []).length);
  const totalH = PAD * 2 + maxRows * NH + Math.max(0, maxRows - 1) * RGAP;
  const totalW = PAD * 2 + (maxLayer + 1) * NW + maxLayer * CGAP;

  const pos = new Map<string, { x: number; y: number }>();
  for (let col = 0; col <= maxLayer; col++) {
    const ids = byLayer.get(col) ?? [];
    const colH = ids.length * NH + Math.max(0, ids.length - 1) * RGAP;
    const startY = (totalH - colH) / 2;
    ids.forEach((id, i) => pos.set(id, { x: PAD + col * (NW + CGAP), y: startY + i * (NH + RGAP) }));
  }

  const edges = slices.flatMap(sl => sl.depends.flatMap(dep => {
    if (!pos.has(dep) || !pos.has(sl.id)) return [];
    const f = pos.get(dep)!, t = pos.get(sl.id)!;
    const x1 = f.x + NW, y1 = f.y + NH / 2;
    const x2 = t.x,       y2 = t.y + NH / 2;
    const mx = (x1 + x2) / 2;
    const crit = critSL.has(sl.id) && critSL.has(dep);
    return [`<path d="M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}" class="edge${crit ? ' edge-crit' : ''}" marker-end="url(#arr${crit ? '-crit' : ''})"/>`];
  }));

  const nodes = slices.map(sl => {
    const p = pos.get(sl.id);
    if (!p) return '';
    const crit = critSL.has(sl.id);
    const sc = sl.done ? 'n-done' : sl.active ? 'n-active' : 'n-pending';
    return `<g class="node ${sc}${crit ? ' n-crit' : ''}" transform="translate(${p.x},${p.y})">
      <rect width="${NW}" height="${NH}" rx="4"/>
      <text x="${NW/2}" y="16" class="n-id">${esc(truncStr(sl.id, 18))}</text>
      <text x="${NW/2}" y="30" class="n-title">${esc(truncStr(sl.title, 18))}</text>
      <title>${esc(sl.id)}: ${esc(sl.title)}</title>
    </g>`;
  });

  const legend = `<div class="dep-legend">
    <span><span class="dot dot-complete dot-sm"></span> done</span>
    <span><span class="dot dot-active dot-sm"></span> active</span>
    <span><span class="dot dot-pending dot-sm"></span> pending</span>
    <span><span class="dot dot-parked dot-sm"></span> parked</span>
  </div>`;

  return `
    <div class="dep-block">
      <h3>${esc(ms.id)}: ${esc(ms.title)}</h3>
      ${legend}
      <div class="dep-wrap">
        <svg class="dep-svg" viewBox="0 0 ${totalW} ${totalH}" width="${totalW}" height="${totalH}">
          <defs>
            <marker id="arr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="var(--border-2)"/>
            </marker>
            <marker id="arr-crit" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto">
              <path d="M0,0 L0,6 L8,3 z" fill="var(--accent)"/>
            </marker>
          </defs>
          ${edges.join('')}
          ${nodes.join('')}
        </svg>
      </div>
    </div>`;
}

// ─── Section: Metrics ─────────────────────────────────────────────────────────

function buildMetricsSection(data: VisualizerData): string {
  if (!data.totals) return section('metrics', 'Metrics', '<p class="empty">No metrics data yet.</p>');
  const t = data.totals;

  const grid = [
    kvi('Total cost', formatCost(t.cost)),
    kvi('Total tokens', formatTokenCount(t.tokens.total)),
    kvi('Input', formatTokenCount(t.tokens.input)),
    kvi('Output', formatTokenCount(t.tokens.output)),
    kvi('Cache read', formatTokenCount(t.tokens.cacheRead)),
    kvi('Cache write', formatTokenCount(t.tokens.cacheWrite)),
    kvi('Duration', formatDuration(t.duration)),
    kvi('Units', String(t.units)),
    kvi('Tool calls', String(t.toolCalls)),
    kvi('Truncations', String(t.totalTruncationSections)),
  ].join('');

  const tokenBreakdown = buildTokenBreakdown(t.tokens);

  const phaseRow = data.byPhase.length > 0 ? `
    <div class="chart-row">
      ${buildBarChart('Cost by phase', data.byPhase.map(p => ({
        label: p.phase, value: p.cost, display: formatCost(p.cost), sub: `${p.units} units`,
      })))}
      ${buildBarChart('Tokens by phase', data.byPhase.map(p => ({
        label: p.phase, value: p.tokens.total, display: formatTokenCount(p.tokens.total), sub: formatCost(p.cost),
      })))}
    </div>` : '';

  const sliceModelRow = (data.bySlice.length > 0 || data.byModel.length > 0) ? `
    <div class="chart-row">
      ${data.bySlice.length > 0 ? buildBarChart('Cost by slice', data.bySlice.map(s => ({
        label: s.sliceId, value: s.cost, display: formatCost(s.cost),
        sub: `${s.units} units`,
      }))) : ''}
      ${data.byModel.length > 0 ? buildBarChart('Cost by model', data.byModel.map(m => ({
        label: shortModel(m.model), value: m.cost, display: formatCost(m.cost),
        sub: `${m.units} units`,
      }))) : ''}
      ${data.bySlice.length > 0 ? buildBarChart('Duration by slice', data.bySlice.map(s => ({
        label: s.sliceId, value: s.duration, display: formatDuration(s.duration),
        sub: formatCost(s.cost),
      }))) : ''}
    </div>` : '';

  const costOverTime = buildCostOverTimeChart(data.units);
  const budgetBurndown = buildBudgetBurndown(data);
  const gantt = buildSliceGantt(data);

  return section('metrics', 'Metrics', `
    <div class="kv-grid">${grid}</div>
    ${budgetBurndown}
    ${tokenBreakdown}
    ${costOverTime}
    ${phaseRow}
    ${sliceModelRow}
    ${gantt}
  `);
}

function buildCostOverTimeChart(units: UnitMetrics[]): string {
  if (units.length < 2) return '';
  const sorted = [...units].sort((a, b) => a.startedAt - b.startedAt);
  const cumulative: number[] = [];
  let running = 0;
  for (const u of sorted) {
    running += u.cost;
    cumulative.push(running);
  }

  const padL = 50, padR = 30, padT = 20, padB = 30;
  const w = 600, h = 200;
  const plotW = w - padL - padR;
  const plotH = h - padT - padB;
  const maxCost = cumulative[cumulative.length - 1] || 1;
  const n = cumulative.length;

  const points = cumulative.map((c, i) => {
    const x = padL + (i / (n - 1)) * plotW;
    const y = padT + plotH - (c / maxCost) * plotH;
    return { x, y };
  });

  const linePath = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${points[points.length - 1].x.toFixed(1)},${(padT + plotH).toFixed(1)} L${points[0].x.toFixed(1)},${(padT + plotH).toFixed(1)} Z`;

  const gridLines: string[] = [];
  for (let i = 0; i <= 4; i++) {
    const y = padT + (plotH / 4) * i;
    const val = formatCost(maxCost * (1 - i / 4));
    gridLines.push(`<line x1="${padL}" y1="${y}" x2="${w - padR}" y2="${y}" class="cost-grid"/>`);
    gridLines.push(`<text x="${padL - 4}" y="${y + 3}" class="cost-axis" text-anchor="end">${val}</text>`);
  }

  return `
    <div class="token-block">
      <h3>Cost over time</h3>
      <svg class="cost-svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
        ${gridLines.join('')}
        <path d="${areaPath}" class="cost-area"/>
        <path d="${linePath}" class="cost-line"/>
        <text x="${padL}" y="${h - 4}" class="cost-axis">#1</text>
        <text x="${w - padR}" y="${h - 4}" class="cost-axis" text-anchor="end">#${n}</text>
      </svg>
    </div>`;
}

function buildBudgetBurndown(data: VisualizerData): string {
  if (!data.health.budgetCeiling) return '';
  const ceiling = data.health.budgetCeiling;
  const spent = data.totals?.cost ?? 0;
  const totalSlices = data.milestones.reduce((s, m) => s + m.slices.length, 0);
  const doneSlices = data.milestones.reduce((s, m) => s + m.slices.filter(sl => sl.done).length, 0);
  const avgCostPerSlice = doneSlices > 0 ? spent / doneSlices : 0;
  const projected = avgCostPerSlice > 0 ? avgCostPerSlice * data.remainingSliceCount + spent : spent;
  const maxVal = Math.max(ceiling, projected, spent);

  const spentPct = (spent / maxVal) * 100;
  const projectedRemPct = Math.max(0, ((projected - spent) / maxVal) * 100);
  const overshoot = projected > ceiling ? ((projected - ceiling) / maxVal) * 100 : 0;
  const projectedClean = projectedRemPct - overshoot;

  const legend = [
    `<span><span class="burndown-dot" style="background:var(--accent)"></span> Spent: ${formatCost(spent)}</span>`,
    `<span><span class="burndown-dot" style="background:var(--caution)"></span> Projected remaining: ${formatCost(Math.max(0, projected - spent))}</span>`,
    `<span><span class="burndown-dot" style="background:var(--border-2)"></span> Ceiling: ${formatCost(ceiling)}</span>`,
    overshoot > 0 ? `<span><span class="burndown-dot" style="background:var(--warn)"></span> Overshoot: ${formatCost(projected - ceiling)}</span>` : '',
  ].filter(Boolean).join('');

  return `
    <div class="burndown-wrap">
      <h3>Budget burndown</h3>
      <div class="burndown-bar">
        <div class="burndown-spent" style="width:${spentPct.toFixed(1)}%"></div>
        ${projectedClean > 0 ? `<div class="burndown-projected" style="width:${projectedClean.toFixed(1)}%"></div>` : ''}
        ${overshoot > 0 ? `<div class="burndown-overshoot" style="width:${overshoot.toFixed(1)}%"></div>` : ''}
      </div>
      <div class="burndown-legend">${legend}</div>
    </div>`;
}

function buildSliceGantt(data: VisualizerData): string {
  const sliceTimings = new Map<string, { min: number; max: number }>();
  for (const u of data.units) {
    const parts = u.id.split('/');
    const sliceKey = parts.length >= 2 ? `${parts[0]}/${parts[1]}` : u.id;
    if (u.startedAt <= 0) continue;
    const existing = sliceTimings.get(sliceKey);
    const end = u.finishedAt > 0 ? u.finishedAt : Date.now();
    if (existing) {
      existing.min = Math.min(existing.min, u.startedAt);
      existing.max = Math.max(existing.max, end);
    } else {
      sliceTimings.set(sliceKey, { min: u.startedAt, max: end });
    }
  }

  if (sliceTimings.size < 2) return '';

  const sliceEntries = [...sliceTimings.entries()].sort((a, b) => a[1].min - b[1].min);
  const globalMin = Math.min(...sliceEntries.map(e => e[1].min));
  const globalMax = Math.max(...sliceEntries.map(e => e[1].max));
  const range = globalMax - globalMin || 1;

  const sliceCount = sliceEntries.length;
  const barH = 18, rowH = 30, padL = 140, padR = 20, padT = 30, padB = 30;
  const plotW = 700 - padL - padR;
  const svgH = sliceCount * rowH + padT + padB;

  // Build a lookup of slice status
  const sliceStatusMap = new Map<string, string>();
  for (const ms of data.milestones) {
    for (const sl of ms.slices) {
      const key = `${ms.id}/${sl.id}`;
      sliceStatusMap.set(key, sl.done ? 'done' : sl.active ? 'active' : 'pending');
    }
  }

  const bars = sliceEntries.map(([sliceId, timing], i) => {
    const x = padL + ((timing.min - globalMin) / range) * plotW;
    const w = Math.max(2, ((timing.max - timing.min) / range) * plotW);
    const y = padT + i * rowH + (rowH - barH) / 2;
    const status = sliceStatusMap.get(sliceId) ?? 'pending';
    return `<text x="${padL - 6}" y="${y + barH / 2 + 4}" class="gantt-label" text-anchor="end">${esc(truncStr(sliceId, 18))}</text>
      <rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH}" rx="2" class="gantt-bar-${status}"><title>${esc(sliceId)}: ${formatDuration(timing.max - timing.min)}</title></rect>`;
  }).join('\n');

  // Time axis labels
  const axisLabels = [0, 0.25, 0.5, 0.75, 1].map(frac => {
    const t = globalMin + frac * range;
    const x = padL + frac * plotW;
    return `<text x="${x.toFixed(1)}" y="${svgH - 8}" class="gantt-axis" text-anchor="middle">${formatDateShort(new Date(t).toISOString())}</text>`;
  }).join('');

  return `
    <div class="gantt-wrap">
      <h3>Slice timeline</h3>
      <svg class="gantt-svg" viewBox="0 0 700 ${svgH}" width="700" height="${svgH}">
        ${bars}
        ${axisLabels}
      </svg>
    </div>`;
}

function buildTokenBreakdown(tokens: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number }): string {
  if (tokens.total === 0) return '';
  const segs = [
    { label: 'Input',       value: tokens.input,      cls: 'seg-1' },
    { label: 'Output',      value: tokens.output,     cls: 'seg-2' },
    { label: 'Cache read',  value: tokens.cacheRead,  cls: 'seg-3' },
    { label: 'Cache write', value: tokens.cacheWrite, cls: 'seg-4' },
  ].filter(s => s.value > 0);

  const bars = segs.map(s => {
    const pct = (s.value / tokens.total) * 100;
    return `<div class="tseg ${s.cls}" style="width:${pct.toFixed(2)}%" title="${s.label}: ${formatTokenCount(s.value)} (${pct.toFixed(1)}%)"></div>`;
  }).join('');

  const legend = segs.map(s => {
    const pct = ((s.value / tokens.total) * 100).toFixed(1);
    return `<span class="leg-item"><span class="leg-dot ${s.cls}"></span>${s.label}: ${formatTokenCount(s.value)} (${pct}%)</span>`;
  }).join('');

  return `
    <div class="token-block">
      <h3>Token breakdown</h3>
      <div class="token-bar">${bars}</div>
      <div class="token-legend">${legend}</div>
    </div>`;
}

interface BarEntry { label: string; value: number; display: string; sub?: string; color?: number }

const CHART_COLORS = 6;

function buildBarChart(title: string, entries: BarEntry[]): string {
  if (entries.length === 0) return '';
  const max = Math.max(...entries.map(e => e.value), 1);
  const rows = entries.map((e, i) => {
    const pct = (e.value / max) * 100;
    const ci = e.color ?? i;
    return `
      <div class="bar-row">
        <div class="bar-lbl">${esc(truncStr(e.label, 22))}</div>
        <div class="bar-track"><div class="bar-fill bar-c${ci % CHART_COLORS}" style="width:${pct.toFixed(1)}%"></div></div>
        <div class="bar-val">${esc(e.display)}</div>
      </div>
      ${e.sub ? `<div class="bar-sub">${esc(e.sub)}</div>` : ''}`;
  }).join('');
  return `<div class="chart-block"><h3>${esc(title)}</h3>${rows}</div>`;
}

// ─── Section: Timeline ────────────────────────────────────────────────────────

function buildTimelineSection(data: VisualizerData): string {
  if (data.units.length === 0) return section('timeline', 'Timeline', '<p class="empty">No units executed yet.</p>');

  const sorted = [...data.units].sort((a, b) => a.startedAt - b.startedAt);
  const maxCost = Math.max(...sorted.map(u => u.cost), 0.01);

  const rows = sorted.map((u, i) => {
    const dur = u.finishedAt > 0 ? formatDuration(u.finishedAt - u.startedAt) : 'running';
    // Cost heatmap: subtle red background for expensive rows
    const intensity = Math.min(u.cost / maxCost, 1);
    const heatStyle = intensity > 0.15 ? ` style="background:rgba(239,68,68,${(intensity * 0.15).toFixed(3)})"` : '';
    return `
      <tr${heatStyle}>
        <td class="muted">${i + 1}</td>
        <td class="mono">${esc(u.type)}</td>
        <td class="mono muted">${esc(u.id)}</td>
        <td>${esc(shortModel(u.model))}</td>
        <td class="muted">${formatDateShort(new Date(u.startedAt).toISOString())}</td>
        <td>${dur}</td>
        <td class="num">${formatCost(u.cost)}</td>
        <td class="num">${formatTokenCount(u.tokens.total)}</td>
        <td class="num">${u.toolCalls}</td>
        <td class="mono">${u.tier ?? ''}</td>
        <td>${u.modelDowngraded ? 'routed' : ''}</td>
        <td class="num">${(u.truncationSections ?? 0) > 0 ? u.truncationSections : ''}</td>
        <td>${u.continueHereFired ? 'yes' : ''}</td>
      </tr>`;
  }).join('');

  return section('timeline', 'Timeline', `
    <div class="table-scroll">
      <table class="tbl">
        <thead><tr>
          <th>#</th><th>Type</th><th>ID</th><th>Model</th>
          <th>Started</th><th>Duration</th><th>Cost</th>
          <th>Tokens</th><th>Tools</th><th>Tier</th><th>Routed</th><th>Trunc</th><th>CHF</th>
        </tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`);
}

// ─── Section: Changelog ───────────────────────────────────────────────────────

function buildChangelogSection(data: VisualizerData): string {
  if (data.changelog.entries.length === 0) return section('changelog', 'Changelog', '<p class="empty">No completed slices yet.</p>');

  const entries = data.changelog.entries.map(e => {
    const filesHtml = e.filesModified.length > 0 ? `
      <details class="files-detail">
        <summary class="muted">${e.filesModified.length} file${e.filesModified.length !== 1 ? 's' : ''} modified</summary>
        <ul class="file-list">
          ${e.filesModified.map(f => `<li><code>${esc(f.path)}</code>${f.description ? ` — ${esc(f.description)}` : ''}</li>`).join('')}
        </ul>
      </details>` : '';

    const ver = data.sliceVerifications.find(v => v.sliceId === e.sliceId);
    const decisionsHtml = ver?.keyDecisions?.length ? `
      <div class="detail-block"><span class="detail-label">Decisions</span>
        <ul>${ver.keyDecisions.map(d => `<li>${esc(d)}</li>`).join('')}</ul>
      </div>` : '';

    return `
      <div class="cl-entry">
        <div class="cl-header">
          <span class="mono muted">${esc(e.milestoneId)}/${esc(e.sliceId)}</span>
          <span class="cl-title">${esc(e.title)}</span>
          ${e.completedAt ? `<span class="muted cl-date">${formatDateShort(e.completedAt)}</span>` : ''}
        </div>
        ${e.oneLiner ? `<p class="cl-liner">${esc(e.oneLiner)}</p>` : ''}
        ${decisionsHtml}
        ${filesHtml}
      </div>`;
  }).join('');

  return section('changelog', `Changelog <span class="count">${data.changelog.entries.length}</span>`, entries);
}

// ─── Section: Knowledge ───────────────────────────────────────────────────────

function buildKnowledgeSection(data: VisualizerData): string {
  const k = data.knowledge;
  if (!k.exists) return section('knowledge', 'Knowledge', '<p class="empty">No KNOWLEDGE.md found.</p>');
  const total = k.rules.length + k.patterns.length + k.lessons.length;
  if (total === 0) return section('knowledge', 'Knowledge', '<p class="empty">KNOWLEDGE.md exists but no entries parsed.</p>');

  const rulesHtml = k.rules.length > 0 ? `
    <h3>Rules <span class="count">${k.rules.length}</span></h3>
    <table class="tbl">
      <thead><tr><th>ID</th><th>Scope</th><th>Rule</th></tr></thead>
      <tbody>${k.rules.map(r => `<tr><td class="mono">${esc(r.id)}</td><td>${esc(r.scope)}</td><td>${esc(r.content)}</td></tr>`).join('')}</tbody>
    </table>` : '';

  const patternsHtml = k.patterns.length > 0 ? `
    <h3>Patterns <span class="count">${k.patterns.length}</span></h3>
    <table class="tbl">
      <thead><tr><th>ID</th><th>Pattern</th></tr></thead>
      <tbody>${k.patterns.map(p => `<tr><td class="mono">${esc(p.id)}</td><td>${esc(p.content)}</td></tr>`).join('')}</tbody>
    </table>` : '';

  const lessonsHtml = k.lessons.length > 0 ? `
    <h3>Lessons <span class="count">${k.lessons.length}</span></h3>
    <table class="tbl">
      <thead><tr><th>ID</th><th>Lesson</th></tr></thead>
      <tbody>${k.lessons.map(l => `<tr><td class="mono">${esc(l.id)}</td><td>${esc(l.content)}</td></tr>`).join('')}</tbody>
    </table>` : '';

  return section('knowledge', `Knowledge <span class="count">${total}</span>`, `${rulesHtml}${patternsHtml}${lessonsHtml}`);
}

// ─── Section: Captures ────────────────────────────────────────────────────────

function buildCapturesSection(data: VisualizerData): string {
  const c = data.captures;
  if (c.totalCount === 0) return section('captures', 'Captures', '<p class="empty">No captures recorded.</p>');

  const badge = c.pendingCount > 0
    ? `<span class="count count-warn">${c.pendingCount} pending</span>`
    : `<span class="count">all triaged</span>`;

  const rows = c.entries.map(e => `
    <tr>
      <td class="muted">${formatDateShort(new Date(e.timestamp).toISOString())}</td>
      <td class="mono">${esc(e.status)}</td>
      <td class="mono">${e.classification ?? ''}</td>
      <td>${e.resolution ?? ''}</td>
      <td>${esc(e.text)}</td>
      <td class="muted">${e.rationale ?? ''}</td>
      <td class="muted">${e.resolvedAt ? formatDateShort(e.resolvedAt) : ''}</td>
      <td>${e.executed !== undefined ? (e.executed ? 'yes' : 'no') : ''}</td>
    </tr>`).join('');

  return section('captures', `Captures ${badge}`, `
    <div class="table-scroll">
      <table class="tbl">
        <thead><tr><th>Captured</th><th>Status</th><th>Class</th><th>Resolution</th><th>Text</th><th>Rationale</th><th>Resolved</th><th>Executed</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`);
}

// ─── Section: Stats ───────────────────────────────────────────────────────────

function buildStatsSection(data: VisualizerData): string {
  const s = data.stats;

  const missingHtml = s.missingCount > 0 ? `
    <h3>Missing changelogs <span class="count">${s.missingCount}</span></h3>
    <table class="tbl">
      <thead><tr><th>Milestone</th><th>Slice</th><th>Title</th></tr></thead>
      <tbody>
        ${s.missingSlices.map(sl => `<tr><td class="mono">${esc(sl.milestoneId)}</td><td class="mono">${esc(sl.sliceId)}</td><td>${esc(sl.title)}</td></tr>`).join('')}
        ${s.missingCount > s.missingSlices.length
          ? `<tr><td colspan="3" class="muted">and ${s.missingCount - s.missingSlices.length} more</td></tr>`
          : ''}
      </tbody>
    </table>` : '';

  const updatedHtml = s.updatedCount > 0 ? `
    <h3>Recently completed <span class="count">${s.updatedCount}</span></h3>
    <table class="tbl">
      <thead><tr><th>Milestone</th><th>Slice</th><th>Title</th><th>Completed</th></tr></thead>
      <tbody>${s.updatedSlices.map(sl => `
        <tr><td class="mono">${esc(sl.milestoneId)}</td><td class="mono">${esc(sl.sliceId)}</td><td>${esc(sl.title)}</td><td class="muted">${sl.completedAt ? formatDateShort(sl.completedAt) : ''}</td></tr>`).join('')}
      </tbody>
    </table>` : '';

  if (!missingHtml && !updatedHtml) {
    return section('stats', 'Artifacts', '<p class="empty">All artifacts accounted for.</p>');
  }

  return section('stats', 'Artifacts', `${missingHtml}${updatedHtml}`);
}

// ─── Section: Discussion ──────────────────────────────────────────────────────

function buildDiscussionSection(data: VisualizerData): string {
  if (data.discussion.length === 0) return section('discussion', 'Planning', '<p class="empty">No milestones.</p>');

  const rows = data.discussion.map(d => `
    <tr>
      <td class="mono">${esc(d.milestoneId)}</td>
      <td>${esc(d.title)}</td>
      <td class="mono">${d.state}</td>
      <td>${d.hasContext ? 'yes' : ''}</td>
      <td>${d.hasDraft ? 'draft' : ''}</td>
      <td class="muted">${d.lastUpdated ? formatDateShort(d.lastUpdated) : ''}</td>
    </tr>`).join('');

  return section('discussion', 'Planning', `
    <table class="tbl">
      <thead><tr><th>ID</th><th>Milestone</th><th>State</th><th>Context</th><th>Draft</th><th>Updated</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`);
}

// ─── Primitives ────────────────────────────────────────────────────────────────

function section(id: string, title: string, body: string): string {
  return `\n<section id="${id}">\n  <h2>${title}</h2>\n  ${body}\n</section>`;
}

function kvi(label: string, value: string): string {
  return `<div class="kv"><span class="kv-val">${esc(value)}</span><span class="kv-lbl">${esc(label)}</span></div>`;
}

function hRow(label: string, value: string, status?: 'ok' | 'caution' | 'warn'): string {
  const cls = status ? ` class="h-${status}"` : '';
  return `<tr${cls}><td>${esc(label)}</td><td>${esc(value)}</td></tr>`;
}

function shortModel(m: string) { return m.replace(/^claude-/, '').replace(/^anthropic\//, ''); }
function truncStr(s: string, n: number) { return s.length > n ? s.slice(0, n - 1) + '\u2026' : s; }

