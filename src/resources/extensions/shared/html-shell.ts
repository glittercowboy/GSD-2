export interface HtmlShellLink {
  href: string;
  label: string;
}

export interface HtmlShellOptions {
  title: string;
  documentTitle?: string;
  subtitle?: string;
  kind: string;
  version?: string;
  generatedAt: string;
  mainHtml: string;
  toc?: readonly HtmlShellLink[];
  headerActionsHtml?: string;
  footerNote?: string;
}

export interface HtmlShellTemplateOptions extends Omit<HtmlShellOptions, "mainHtml" | "generatedAt"> {
  mainPlaceholder: string;
  generatedAtPlaceholder?: string;
}

export function renderHtmlShell(options: HtmlShellOptions): string {
  const version = options.version ? `v${esc(options.version)}` : "";
  const documentTitle = options.documentTitle ?? `${options.kind} - ${options.title}`;
  const subtitle = options.subtitle ? `<span class="header-path">${esc(options.subtitle)}</span>` : "";
  const toc = options.toc?.length
    ? `<nav class="toc" aria-label="Report sections">
  <ul>
${options.toc.map((item) => `    <li><a href="${esc(item.href)}">${esc(item.label)}</a></li>`).join("\n")}
  </ul>
</nav>`
    : "";
  const actions = options.headerActionsHtml ? `${options.headerActionsHtml}` : "";
  const footerNote = options.footerNote ? `<span class="sep">/</span>\n    <span>${esc(options.footerNote)}</span>` : "";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${esc(documentTitle)}</title>
<style>${HTML_SHELL_CSS}</style>
</head>
<body>
<header>
  <div class="header-inner">
    <div class="branding">
      <span class="logo">GSD</span>
      ${version ? `<span class="version">${version}</span>` : ""}
    </div>
    <div class="header-meta">
      <h1>${esc(options.title)}</h1>
      ${subtitle}
    </div>
    <div class="header-right">
      ${actions}
      <span class="kind-chip">${esc(options.kind)}</span>
      <div class="generated">${formatDateLong(options.generatedAt)}</div>
    </div>
  </div>
</header>
${toc}
<main>
${options.mainHtml}
</main>
<footer>
  <div class="footer-inner">
    <span>GSD${version ? ` ${version}` : ""}</span>
    <span class="sep">/</span>
    <span>${esc(options.kind)}</span>
    ${footerNote}
    <span class="sep">/</span>
    <span>${formatDateLong(options.generatedAt)}</span>
  </div>
</footer>
<script>${HTML_SHELL_JS}</script>
</body>
</html>`;
}

export function renderHtmlShellTemplate(options: HtmlShellTemplateOptions): string {
  return renderHtmlShell({
    ...options,
    generatedAt: options.generatedAtPlaceholder ?? "{{GENERATED_AT}}",
    mainHtml: options.mainPlaceholder,
  });
}

export function formatDateLong(iso: string): string {
  if (/^\{\{[A-Z_]+\}\}$/.test(iso)) return iso;
  try {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZoneName: 'short' });
  } catch { return iso; }
}

export function esc(s: string | undefined | null): string {
  if (s == null) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export const HTML_SHELL_CSS = `
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg-0:#0f1115;--bg-1:#16181d;--bg-2:#1e2028;--bg-3:#272a33;
  --border-1:#2b2e38;--border-2:#3b3f4c;
  --text-0:#ededef;--text-1:#a1a1aa;--text-2:#71717a;
  --accent:#5e6ad2;--accent-subtle:rgba(94,106,210,.12);
  --ok:#22c55e;--ok-subtle:rgba(34,197,94,.12);--warn:#ef4444;--caution:#eab308;
  /* Chart palette - 6 hues for bar charts */
  --c0:#5e6ad2;--c1:#e5796d;--c2:#14b8a6;--c3:#a78bfa;--c4:#f59e0b;--c5:#10b981;
  /* Token breakdown - 4 distinct hues */
  --tk-input:#5e6ad2;--tk-output:#e5796d;--tk-cache-r:#2dd4bf;--tk-cache-w:#64748b;
  --font:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
  --mono:'JetBrains Mono','Fira Code',ui-monospace,SFMono-Regular,monospace;
}
html{scroll-behavior:smooth;font-size:13px}
body{background:var(--bg-0);color:var(--text-0);font-family:var(--font);line-height:1.6;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
code{font-family:var(--mono);font-size:12px;background:var(--bg-3);padding:1px 5px;border-radius:3px}
.mono{font-family:var(--mono);font-size:12px}
.muted{color:var(--text-2)}
.accent{color:var(--accent)}
.sep{color:var(--border-2);margin:0 4px}
.empty{color:var(--text-2);padding:8px 0;font-size:13px}
.indent{padding-left:12px}
.num{font-variant-numeric:tabular-nums;text-align:right}
.dot{display:inline-block;width:8px;height:8px;border-radius:50%;flex-shrink:0;vertical-align:middle}
.dot-sm{width:6px;height:6px}
.dot-complete{background:var(--ok);opacity:.6}
.dot-active{background:var(--accent)}
.dot-pending{background:transparent;border:1.5px solid var(--border-2)}
.dot-parked{background:var(--warn);opacity:.5}
header{background:var(--bg-1);border-bottom:1px solid var(--border-1);padding:12px 32px;position:sticky;top:0;z-index:200}
.header-inner{display:flex;align-items:center;gap:16px;max-width:1280px;margin:0 auto}
.branding{display:flex;align-items:baseline;gap:6px;flex-shrink:0}
.logo{font-size:18px;font-weight:800;letter-spacing:-.5px;color:var(--text-0)}
.version{font-size:10px;color:var(--text-2);font-family:var(--mono)}
.header-meta{flex:1;min-width:0}
.header-meta h1{font-size:15px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.header-path{font-size:11px;color:var(--text-2);font-family:var(--mono);display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.header-right{text-align:right;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-end;gap:4px}
.generated{font-size:11px;color:var(--text-2)}
.kind-chip{font-size:10px;font-weight:600;color:var(--accent);background:var(--accent-subtle);border:1px solid rgba(94,106,210,.25);border-radius:3px;padding:2px 7px;text-transform:uppercase;letter-spacing:.4px}
.back-link{font-size:12px;color:var(--text-1)}
.back-link:hover{color:var(--accent)}
.toc{background:var(--bg-1);border-bottom:1px solid var(--border-1);overflow-x:auto}
.toc ul{display:flex;list-style:none;max-width:1280px;margin:0 auto;padding:0 32px}
.toc a{display:inline-block;padding:8px 12px;color:var(--text-2);font-size:12px;font-weight:500;border-bottom:2px solid transparent;transition:color .12s,border-color .12s;white-space:nowrap;text-decoration:none}
.toc a:hover{color:var(--text-0);border-bottom-color:var(--border-2)}
.toc a.active{color:var(--text-0);border-bottom-color:var(--accent)}
main{max-width:1280px;margin:0 auto;padding:32px;display:flex;flex-direction:column;gap:48px}
section{scroll-margin-top:82px}
section>h2{font-size:14px;font-weight:600;text-transform:uppercase;letter-spacing:.5px;color:var(--text-1);margin-bottom:16px;padding-bottom:8px;border-bottom:1px solid var(--border-1);display:flex;align-items:center;gap:8px}
h3{font-size:13px;font-weight:600;color:var(--text-1);margin:20px 0 8px}
.count{font-size:11px;font-weight:500;color:var(--text-2);background:var(--bg-3);border-radius:3px;padding:1px 6px}
.count-warn{color:var(--caution)}
.kv-grid{display:flex;flex-wrap:wrap;gap:1px;background:var(--border-1);border:1px solid var(--border-1);border-radius:4px;overflow:hidden;margin-bottom:16px}
.kv{background:var(--bg-1);padding:10px 16px;display:flex;flex-direction:column;gap:2px;min-width:110px;flex:1}
.kv-val{font-size:18px;font-weight:600;color:var(--text-0);font-variant-numeric:tabular-nums}
.kv-lbl{font-size:10px;color:var(--text-2);text-transform:uppercase;letter-spacing:.4px}
.progress-wrap{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.progress-track{flex:1;height:4px;background:var(--bg-3);border-radius:2px;overflow:hidden}
.progress-fill{height:100%;background:var(--accent);border-radius:2px}
.progress-label{font-size:12px;font-weight:600;color:var(--text-1);min-width:40px;text-align:right}
.active-info{font-size:12px;color:var(--text-1);margin-bottom:4px}
.activity-line{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--text-1);padding:6px 0}
.tbl{width:100%;border-collapse:collapse;font-size:12px}
.tbl th{color:var(--text-2);font-weight:500;padding:6px 12px;text-align:left;border-bottom:1px solid var(--border-1);font-size:11px;text-transform:uppercase;letter-spacing:.3px;white-space:nowrap}
.tbl td{padding:6px 12px;border-bottom:1px solid var(--border-1);vertical-align:top}
.tbl tr:last-child td{border-bottom:none}
.tbl tbody tr:hover td{background:var(--accent-subtle)}
.tbl-kv td:first-child{color:var(--text-2);width:180px}
.table-scroll{overflow-x:auto;border:1px solid var(--border-1);border-radius:4px}
.table-scroll .tbl{border:none}
.h-ok td:first-child{color:var(--text-1)}
.h-caution td{color:var(--caution)}
.h-warn td{color:var(--warn)}
.label{font-size:10px;font-weight:500;color:var(--accent);text-transform:uppercase;letter-spacing:.4px}
.risk{font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:.3px;flex-shrink:0}
.risk-low{color:var(--text-2)}
.risk-medium{color:var(--caution)}
.risk-high{color:var(--warn)}
.risk-unknown{color:var(--text-2)}
.tag-row{display:flex;flex-wrap:wrap;gap:4px;margin-bottom:8px}
.tag{font-size:11px;font-family:var(--mono);color:var(--text-2);background:var(--bg-3);border-radius:3px;padding:1px 6px}
.verif{font-size:12px;color:var(--text-1);padding:4px 0;margin-bottom:6px}
.verif-blocker{color:var(--warn)}
.detail-block{font-size:12px;color:var(--text-2);margin-bottom:6px}
.detail-label{font-weight:600;color:var(--text-1);display:block;margin-bottom:2px}
.detail-block ul{padding-left:16px;margin-top:2px}
.detail-block li{margin-bottom:1px}
.ms-block{border:1px solid var(--border-1);border-radius:4px;overflow:hidden;margin-bottom:8px}
.ms-summary{display:flex;align-items:center;gap:8px;padding:10px 14px;cursor:pointer;list-style:none;background:var(--bg-1);user-select:none;font-size:13px}
.ms-summary:hover{background:var(--bg-2)}
.ms-summary::-webkit-details-marker{display:none}
.ms-id{font-weight:600}
.ms-title{flex:1;font-weight:500;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ms-body{padding:6px 12px 8px 24px;display:flex;flex-direction:column;gap:4px}
.sl-block{border:1px solid var(--border-1);border-radius:3px;overflow:hidden}
.sl-summary{display:flex;align-items:center;gap:6px;padding:6px 10px;cursor:pointer;list-style:none;background:var(--bg-2);font-size:12px;user-select:none}
.sl-summary:hover{background:var(--bg-3)}
.sl-summary::-webkit-details-marker{display:none}
.sl-crit{border-left:2px solid var(--accent)}
.sl-deps::before{content:'\\2190 ';color:var(--border-2)}
.sl-detail{padding:8px 12px;background:var(--bg-0);border-top:1px solid var(--border-1)}
.task-list{list-style:none;padding:4px 0 0;display:flex;flex-direction:column;gap:2px}
.task-row{display:flex;align-items:center;gap:6px;font-size:12px;padding:3px 6px;border-radius:2px}
.dep-block{margin-bottom:28px}
.dep-legend{display:flex;gap:14px;font-size:12px;color:var(--text-2);margin-bottom:8px;align-items:center}
.dep-legend span{display:flex;align-items:center;gap:4px}
.dep-wrap{overflow-x:auto;background:var(--bg-1);border:1px solid var(--border-1);border-radius:4px;padding:16px}
.dep-svg{display:block}
.edge{fill:none;stroke:var(--border-2);stroke-width:1.5}
.edge-crit{stroke:var(--accent);stroke-width:2}
.node rect{fill:var(--bg-2);stroke:var(--border-2);stroke-width:1}
.n-done rect{fill:var(--ok-subtle);stroke:rgba(34,197,94,.4)}
.n-active rect{fill:var(--accent-subtle);stroke:var(--accent)}
.n-crit rect{stroke:var(--accent)!important;stroke-width:1.5!important}
.n-id{font-family:var(--mono);font-size:10px;fill:var(--text-1);font-weight:600;text-anchor:middle}
.n-title{font-size:9px;fill:var(--text-2);text-anchor:middle}
.n-active .n-id{fill:var(--accent)}
.token-block{background:var(--bg-1);border:1px solid var(--border-1);border-radius:4px;padding:14px;margin-bottom:16px}
.token-bar{display:flex;height:16px;border-radius:2px;overflow:hidden;gap:1px;margin-bottom:8px}
.tseg{height:100%;min-width:2px}
.seg-1{background:var(--tk-input)}
.seg-2{background:var(--tk-output)}
.seg-3{background:var(--tk-cache-r)}
.seg-4{background:var(--tk-cache-w)}
.token-legend{display:flex;flex-wrap:wrap;gap:12px}
.leg-item{display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text-2)}
.leg-dot{width:8px;height:8px;border-radius:2px;flex-shrink:0}
.chart-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px;margin-bottom:16px}
.chart-block{background:var(--bg-1);border:1px solid var(--border-1);border-radius:4px;padding:14px}
.bar-row{display:grid;grid-template-columns:120px 1fr 68px;align-items:center;gap:6px;margin-bottom:2px}
.bar-lbl{font-size:12px;color:var(--text-2);text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bar-track{height:14px;background:var(--bg-3);border-radius:2px;overflow:hidden}
.bar-fill{height:100%;border-radius:2px;background:var(--c0)}
.bar-c0{background:var(--c0)}.bar-c1{background:var(--c1)}.bar-c2{background:var(--c2)}
.bar-c3{background:var(--c3)}.bar-c4{background:var(--c4)}.bar-c5{background:var(--c5)}
.bar-val{font-size:11px;font-variant-numeric:tabular-nums;color:var(--text-1)}
.bar-sub{font-size:10px;color:var(--text-2);padding-left:128px;margin-bottom:6px}
.cl-entry{border-bottom:1px solid var(--border-1);padding:12px 0}
.cl-entry:last-child{border-bottom:none}
.cl-header{display:flex;align-items:center;gap:8px;margin-bottom:4px}
.cl-title{flex:1;font-weight:500}
.cl-date{margin-left:auto;white-space:nowrap}
.cl-liner{font-size:13px;color:var(--text-1);margin-bottom:6px}
.files-detail summary{font-size:12px;cursor:pointer}
.file-list{list-style:none;padding-left:10px;margin-top:4px;display:flex;flex-direction:column;gap:2px}
.file-list li{font-size:12px;color:var(--text-1)}
footer{border-top:1px solid var(--border-1);padding:20px 32px;margin-top:40px}
.footer-inner{display:flex;align-items:center;gap:6px;justify-content:center;font-size:11px;color:var(--text-2);flex-wrap:wrap}
.exec-summary{font-size:13px;color:var(--text-1);margin-bottom:12px;line-height:1.7}
.eta-line{font-size:12px;color:var(--accent);margin-top:4px}
.cost-svg{display:block;margin:8px 0;background:var(--bg-1);border:1px solid var(--border-1);border-radius:4px}
.cost-line{fill:none;stroke:var(--accent);stroke-width:2}
.cost-area{fill:var(--accent-subtle);stroke:none}
.cost-axis{fill:var(--text-2);font-family:var(--mono);font-size:10px}
.cost-grid{stroke:var(--border-1);stroke-width:1;stroke-dasharray:4,4}
.burndown-wrap{background:var(--bg-1);border:1px solid var(--border-1);border-radius:4px;padding:14px;margin-bottom:16px}
.burndown-bar{display:flex;height:20px;border-radius:3px;overflow:hidden;gap:1px;margin-bottom:8px}
.burndown-spent{background:var(--accent);height:100%}
.burndown-projected{background:var(--caution);height:100%;opacity:.6}
.burndown-overshoot{background:var(--warn);height:100%;opacity:.7}
.burndown-legend{display:flex;flex-wrap:wrap;gap:12px;font-size:11px;color:var(--text-2)}
.burndown-legend span{display:flex;align-items:center;gap:4px}
.burndown-dot{display:inline-block;width:8px;height:8px;border-radius:2px}
.blocker-card{border-left:3px solid var(--warn);background:var(--bg-1);border-radius:0 4px 4px 0;padding:10px 14px;margin-bottom:8px}
.blocker-id{font-family:var(--mono);font-size:12px;color:var(--warn);margin-bottom:2px}
.blocker-text{font-size:12px;color:var(--text-1)}
.blocker-risk{font-size:11px;color:var(--caution);margin-top:2px}
.gantt-wrap{overflow-x:auto;background:var(--bg-1);border:1px solid var(--border-1);border-radius:4px;padding:16px;margin-top:16px}
.gantt-svg{display:block}
.gantt-bar-done{fill:var(--ok);opacity:.7}
.gantt-bar-active{fill:var(--accent)}
.gantt-bar-pending{fill:var(--border-2)}
.gantt-label{fill:var(--text-2);font-family:var(--mono);font-size:10px}
.gantt-axis{fill:var(--text-2);font-family:var(--mono);font-size:9px}
.tl-filter{display:block;width:100%;padding:6px 10px;margin-bottom:8px;background:var(--bg-2);border:1px solid var(--border-1);border-radius:4px;color:var(--text-0);font-size:12px;font-family:var(--font);outline:none}
.tl-filter:focus{border-color:var(--accent)}
.tl-filter::placeholder{color:var(--text-2)}
.sec-toggle{background:none;border:1px solid var(--border-2);color:var(--text-2);width:20px;height:20px;border-radius:3px;cursor:pointer;font-size:14px;line-height:1;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0}
.sec-toggle:hover{border-color:var(--text-1);color:var(--text-1)}
.theme-toggle{background:var(--bg-3);border:1px solid var(--border-2);color:var(--text-1);padding:4px 10px;border-radius:4px;cursor:pointer;font-size:11px;font-family:var(--font)}
.theme-toggle:hover{border-color:var(--accent);color:var(--accent)}
.callout-info,.callout-warn,.callout-ok{border-left:3px solid var(--accent);background:var(--bg-1);border-radius:0 4px 4px 0;padding:10px 14px}
.callout-warn{border-left-color:var(--caution)}
.callout-ok{border-left-color:var(--ok)}
.card-row{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.card{background:var(--bg-1);border:1px solid var(--border-1);border-radius:4px;padding:14px}
.light-theme{--bg-0:#fff;--bg-1:#fafafa;--bg-2:#f5f5f5;--bg-3:#ebebeb;--border-1:#e5e5e5;--border-2:#d4d4d4;--text-0:#1a1a1a;--text-1:#525252;--text-2:#a3a3a3;--accent:#4f46e5;--accent-subtle:rgba(79,70,229,.08);--ok:#16a34a;--ok-subtle:rgba(22,163,74,.08);--warn:#dc2626;--caution:#ca8a04;--c0:#4f46e5;--c1:#dc2626;--c2:#0d9488;--c3:#7c3aed;--c4:#d97706;--c5:#059669;--tk-input:#4f46e5;--tk-output:#dc2626;--tk-cache-r:#0d9488;--tk-cache-w:#64748b}
@media(max-width:768px){
  header{padding:10px 16px}
  .header-inner{flex-wrap:wrap;gap:8px}
  .header-meta h1{font-size:13px}
  main{padding:16px}
  .kv-grid{gap:1px}
  .kv{min-width:80px;padding:8px 10px}
  .kv-val{font-size:14px}
  .chart-row{grid-template-columns:1fr}
  .toc ul{padding:0 16px}
  .toc a{padding:6px 8px;font-size:11px}
  .bar-row{grid-template-columns:80px 1fr 56px}
  .ms-body{padding-left:12px}
}
@media(max-width:480px){
  .kv{min-width:60px;padding:6px 8px}
  .kv-val{font-size:12px}
  .kv-lbl{font-size:9px}
  .bar-row{grid-template-columns:60px 1fr 48px}
  .bar-lbl{font-size:10px}
  .toc ul{flex-wrap:wrap}
  .header-right{display:none}
  .gantt-wrap{overflow-x:auto}
}
@media print{
  header,nav.toc{position:static}
  body{background:#fff;color:#1a1a1a}
  :root{--bg-0:#fff;--bg-1:#fafafa;--bg-2:#f5f5f5;--bg-3:#ebebeb;--border-1:#e5e5e5;--border-2:#d4d4d4;--text-0:#1a1a1a;--text-1:#525252;--text-2:#a3a3a3;--accent:#4f46e5;--ok:#16a34a;--ok-subtle:rgba(22,163,74,.08);--c0:#4f46e5;--c1:#dc2626;--c2:#0d9488;--c3:#7c3aed;--c4:#d97706;--c5:#059669;--tk-input:#4f46e5;--tk-output:#dc2626;--tk-cache-r:#0d9488;--tk-cache-w:#64748b}
  section{page-break-inside:avoid}
  .table-scroll{overflow:visible}
}
`;

export const HTML_SHELL_JS = `
(function(){
  const sections=document.querySelectorAll('section[id]');
  const links=document.querySelectorAll('.toc a');
  if(!sections.length||!links.length)return;
  const obs=new IntersectionObserver(entries=>{
    for(const e of entries){
      if(!e.isIntersecting)continue;
      for(const l of links)l.classList.remove('active');
      const a=document.querySelector('.toc a[href="#'+e.target.id+'"]');
      if(a)a.classList.add('active');
    }
  },{rootMargin:'-10% 0px -80% 0px',threshold:0});
  for(const s of sections)obs.observe(s);
})();
(function(){
  var tl=document.getElementById('timeline');
  if(!tl)return;
  var table=tl.querySelector('.tbl');
  if(!table)return;
  var input=document.createElement('input');
  input.className='tl-filter';
  input.placeholder='Filter timeline\\u2026';
  input.type='text';
  table.parentNode.insertBefore(input,table);
  var rows=table.querySelectorAll('tbody tr');
  input.addEventListener('input',function(){
    var q=this.value.toLowerCase();
    for(var i=0;i<rows.length;i++){
      rows[i].style.display=rows[i].textContent.toLowerCase().indexOf(q)>-1?'':'none';
    }
  });
})();
function safeLocalStorageSet(key,value){
  try{localStorage.setItem(key,value)}catch(e){}
}
function safeLocalStorageGet(key){
  try{return localStorage.getItem(key)}catch(e){return null}
}
(function(){
  var saved={};
  try{saved=JSON.parse(safeLocalStorageGet('gsd-collapsed')||'{}')}catch(e){}
  document.querySelectorAll('section[id]').forEach(function(sec){
    var h2=sec.querySelector('h2');
    if(!h2)return;
    var btn=document.createElement('button');
    btn.className='sec-toggle';
    btn.textContent=saved[sec.id]?'+':'-';
    btn.setAttribute('aria-label','Toggle section');
    h2.prepend(btn);
    if(saved[sec.id])toggleSection(sec,true);
    btn.addEventListener('click',function(e){
      e.preventDefault();
      var collapsed=btn.textContent==='-';
      toggleSection(sec,collapsed);
      btn.textContent=collapsed?'+':'-';
      saved[sec.id]=collapsed;
      safeLocalStorageSet('gsd-collapsed',JSON.stringify(saved));
    });
  });
  function toggleSection(sec,hide){
    var children=sec.children;
    for(var i=0;i<children.length;i++){
      if(children[i].tagName!=='H2')children[i].style.display=hide?'none':'';
    }
  }
})();
(function(){
  var hr=document.querySelector('.header-right');
  if(!hr)return;
  var stored=safeLocalStorageGet('gsd-theme');
  var btn=document.createElement('button');
  btn.className='theme-toggle';
  btn.textContent=stored==='light'?'Dark':'Light';
  if(stored==='light')document.documentElement.classList.add('light-theme');
  btn.addEventListener('click',function(){
    document.documentElement.classList.toggle('light-theme');
    var isLight=document.documentElement.classList.contains('light-theme');
    btn.textContent=isLight?'Dark':'Light';
    safeLocalStorageSet('gsd-theme',isLight?'light':'dark');
  });
  hr.prepend(btn);
})();
`;
