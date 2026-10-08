/* ============================================================
   charts.js — hand-rolled SVG/HTML visualisations (no deps)
   ============================================================ */

/* ---------- Recruitment funnel ---------- */
function funnelChart(data, opts = {}) {
    const max = Math.max(...data.map(d => d.value), 1);
    const colors = ['#38bdf8', '#a78bfa', '#f59e0b', '#34d399', '#facc15'];
    let html = `<div class="space-y-2.5">`;
    data.forEach((d, i) => {
        const pct = Math.round((d.value / max) * 100);
        const conv = i === 0 ? null : Math.round((d.value / Math.max(1, data[i - 1].value)) * 100);
        html += `
        <div class="group">
            <div class="flex items-baseline justify-between text-[11px] mb-1">
                <span class="text-gray-300 font-medium flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full" style="background:${colors[i % colors.length]}"></span>${esc(d.label)}
                </span>
                <span class="text-gray-400 tabular">
                    <b class="text-white text-[12px]">${d.value}</b>
                    ${conv !== null ? `<span class="ml-1.5 ${conv >= 50 ? 'text-emerald-400' : 'text-amber-400'}">${conv}% ▸</span>` : ''}
                </span>
            </div>
            <div class="h-6 rounded-md bg-gray-800/70 overflow-hidden border border-gray-800">
                <div class="h-full rounded-md transition-all duration-700 ease-out flex items-center px-2"
                     style="width:${Math.max(pct, 6)}%; background:linear-gradient(90deg, ${colors[i % colors.length]}cc, ${colors[i % colors.length]}55);">
                    <span class="text-[10px] font-bold text-gray-950/80 drop-shadow">${pct}%</span>
                </div>
            </div>
        </div>`;
    });
    html += `</div>`;
    if (opts.conversionNote) html += `<div class="mt-3 text-[11px] text-gray-500">${opts.conversionNote}</div>`;
    return html;
}

/* ---------- Horizontal bar comparison (agents etc.) ---------- */
function hbarChart(items, opts = {}) {
    const max = Math.max(...items.map(i => i.value), 1);
    const color = opts.color || '#3b82f6';
    return `<div class="space-y-2">${items.map(it => {
        const pct = Math.round((it.value / max) * 100);
        const c = it.color || color;
        return `
        <div class="flex items-center gap-3">
            <div class="w-24 shrink-0 text-[11px] text-gray-400 truncate" title="${esc(it.label)}">${esc(it.label)}</div>
            <div class="flex-1 h-4 rounded bg-gray-800/70 border border-gray-800 overflow-hidden">
                <div class="h-full rounded transition-all duration-700" style="width:${Math.max(pct, 3)}%; background:${c};"></div>
            </div>
            <div class="w-14 text-right text-[11px] tabular ${it.valueClass || 'text-gray-300'}">${it.display ?? it.value}</div>
        </div>`;
    }).join('')}</div>`;
}

/* ---------- Donut (SLA compliance) ---------- */
function donutChart(pct, label, sub, color = '#22c55e') {
    const r = 46, c = 2 * Math.PI * r, off = c * (1 - pct / 100);
    return `
    <div class="flex flex-col items-center">
        <svg viewBox="0 0 120 120" class="w-32 h-32 -rotate-90">
            <circle cx="60" cy="60" r="${r}" fill="none" stroke="#1f2937" stroke-width="12"/>
            <circle cx="60" cy="60" r="${r}" fill="none" stroke="${color}" stroke-width="12" stroke-linecap="round"
                    stroke-dasharray="${c}" stroke-dashoffset="${off}" style="transition:stroke-dashoffset .9s ease"/>
        </svg>
        <div class="-mt-[78px] mb-[46px] text-center">
            <div class="text-2xl font-bold tabular">${pct}%</div>
            <div class="text-[10px] uppercase tracking-wider text-gray-500">${label}</div>
        </div>
        <div class="text-[11px] text-gray-500 text-center">${sub}</div>
    </div>`;
}

/* ---------- Sparkline ---------- */
function sparkline(values, color = '#38bdf8', h = 44) {
    if (!values.length) return '';
    const max = Math.max(...values), min = Math.min(...values);
    const rng = Math.max(1, max - min);
    const pts = values.map((v, i) => {
        const x = (i / (values.length - 1)) * 100;
        const y = h - ((v - min) / rng) * (h - 8) - 4;
        return `${x.toFixed(1)},${y.toFixed(1)}`;
    });
    const area = `0,${h} ${pts.join(' ')} 100,${h}`;
    return `
    <svg viewBox="0 0 100 ${h}" preserveAspectRatio="none" class="w-full" style="height:${h}px">
        <polygon points="${area}" fill="${color}18"/>
        <polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
        <circle cx="100" cy="${pts[pts.length - 1].split(',')[1]}" r="2.2" fill="${color}"/>
    </svg>`;
}

/* ---------- Stage throughput line over ticks ---------- */
function trendChart(series, opts = {}) {
    const w = 100, h = 60;
    const max = Math.max(...series, 1);
    const pts = series.map((v, i) => `${((i / (series.length - 1)) * w).toFixed(1)},${(h - (v / max) * (h - 6) - 3).toFixed(1)}`);
    return `
    <svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" class="w-full" style="height:96px">
        ${[0.25, 0.5, 0.75].map(f => `<line x1="0" y1="${(h * f).toFixed(1)}" x2="${w}" y2="${(h * f).toFixed(1)}" stroke="#1f2937" stroke-width=".5"/>`).join('')}
        <polygon points="0,${h} ${pts.join(' ')} ${w},${h}" fill="#38bdf815"/>
        <polyline points="${pts.join(' ')}" fill="none" stroke="#38bdf8" stroke-width="1.6" stroke-linejoin="round" vector-effect="non-scaling-stroke"/>
    </svg>
    <div class="flex justify-between text-[10px] text-gray-600 mt-1"><span>-60m</span><span>now</span></div>`;
}

/* ---------- Score gauge (HITL low-confidence) ---------- */
function scoreGauge(score, threshold) {
    const good = score >= threshold;
    return `
    <div class="relative h-3 rounded-full bg-gray-800 overflow-hidden border border-gray-700">
        <div class="absolute inset-y-0 left-0 rounded-full transition-all duration-700"
             style="width:${score}%; background:linear-gradient(90deg,#ef4444,${good ? '#22c55e' : '#f59e0b'})"></div>
        <div class="absolute inset-y-0 w-px bg-white/70" style="left:${threshold}%"></div>
    </div>
    <div class="flex justify-between text-[10px] text-gray-500 mt-1">
        <span>0</span><span class="text-gray-400">threshold ${threshold}</span><span>100</span>
    </div>`;
}

/* ---------- Mini metric spark (dashboard card) ---------- */
function miniSpark(values, color) {
    return `<div class="opacity-80">${sparkline(values, color, 30)}</div>`;
}
