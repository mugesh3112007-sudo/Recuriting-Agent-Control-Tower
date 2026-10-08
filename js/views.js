/* ============================================================
   views.js — rendering: header, 6 tabs, drawer, modals, toasts
   ============================================================ */

/* ---------------- Audio feedback ---------------- */
const Sound = {
    enabled: true, ctx: null,
    ensure() {
        if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    },
    tone(freq, dur, type, vol, when) {
        const ctx = this.ensure(), o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type; o.frequency.value = freq;
        g.gain.setValueAtTime(0.0001, when);
        g.gain.exponentialRampToValueAtTime(vol, when + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
        o.connect(g); g.connect(ctx.destination);
        o.start(when); o.stop(when + dur + 0.05);
    },
    play(kind) {
        if (!this.enabled) return;
        try {
            const now = this.ensure().currentTime;
            const seq = {
                exception: [[740, 0, 0.12, 'square'], [590, 0.14, 0.16, 'square']],
                success:   [[523, 0, 0.1, 'sine'], [659, 0.09, 0.1, 'sine'], [784, 0.18, 0.2, 'sine']],
                error:     [[320, 0, 0.16, 'sawtooth'], [220, 0.15, 0.24, 'sawtooth']],
                info:      [[660, 0, 0.08, 'sine']],
                tick:      [[880, 0, 0.05, 'sine']],
            }[kind] || [[660, 0, 0.08, 'sine']];
            seq.forEach(([f, d, dur, t]) => this.tone(f, dur, t, 0.05, now + d));
        } catch (e) { /* audio unavailable */ }
    },
};

/* ---------------- Toasts ---------------- */
const TOAST_META = {
    success:   { border: 'border-emerald-500/60', icon: 'check-circle-2',  ico: 'text-emerald-400', sound: 'success' },
    error:     { border: 'border-red-500/60',     icon: 'alert-octagon',   ico: 'text-red-400',     sound: 'error' },
    info:      { border: 'border-blue-500/60',    icon: 'info',            ico: 'text-blue-400',    sound: 'info' },
    exception: { border: 'border-amber-500/70',   icon: 'siren',           ico: 'text-amber-400',   sound: 'exception' },
};
function toast(kind, title, msg) {
    const m = TOAST_META[kind] || TOAST_META.info;
    Sound.play(m.sound);
    const root = $('#toasts'); if (!root) return;
    const el = document.createElement('div');
    el.className = `pointer-events-auto glass border ${m.border} rounded-lg p-3 flex gap-3 items-start shadow-xl shadow-black/40`;
    el.innerHTML = `
        <i data-lucide="${m.icon}" class="w-4 h-4 mt-0.5 shrink-0 ${m.ico}"></i>
        <div class="min-w-0 flex-1">
            <div class="text-[13px] font-semibold leading-tight">${esc(title)}</div>
            <div class="text-[11px] text-gray-400 mt-0.5 leading-snug">${esc(msg || '')}</div>
        </div>
        <button class="text-gray-500 hover:text-white shrink-0" onclick="this.closest('div').parentElement.remove()">
            <i data-lucide="x" class="w-3.5 h-3.5"></i>
        </button>`;
    root.appendChild(el);
    lucide.createIcons({ attrs: { class: 'w-4 h-4' } });
    setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, 4600);
    while (root.childNodes && root.childNodes.length > 4) root.firstChild.remove();
}

/* ---------------- Render plumbing ---------------- */
function syncTabs() {
    $$('.tab-btn').forEach(b => {
        const on = b.dataset.tab === state.ui.tab;
        b.className = `tab-btn px-3 pb-2.5 pt-1 text-[13px] border-b-2 font-medium ${on ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-400 hover:text-gray-300'}`;
    });
}
function refreshCounts() {
    const pend = pendingExcs().length;
    const hitl = $('#hitlCount');
    if (hitl) { hitl.textContent = pend; hitl.className = `ml-1 px-1.5 py-0.5 text-[10px] rounded ${pend ? 'bg-amber-600 text-white animate-pulse' : 'bg-gray-800 text-gray-500'}`; }
    const pc = $('#pipeCount');
    if (pc) pc.textContent = state.candidates.filter(c => c.stage !== 'SHORTLISTED' && c.stage !== 'REJECTED').length;
    const ev = $('#hdrEvents'); if (ev) ev.textContent = `EVENTS ${state.audit.length}`;
}
function renderActiveTab() {
    const ae = document.activeElement;
    if (ae && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT' || ae.tagName === 'TEXTAREA')) return;
    const views = {
        dashboard: renderDashboard, pipeline: renderPipeline, hitl: renderHitl,
        registry: renderRegistry, integrations: renderIntegrations, analytics: renderAnalytics, audit: renderAudit,
    };
    const el = $('#view-' + state.ui.tab);
    if (el && views[state.ui.tab]) {
        el.innerHTML = views[state.ui.tab]();
        lucide.createIcons();
        state.candidates.forEach(c => { delete c._new; });
    }
}
function renderIf(...tabs) { refreshCounts(); if (tabs.includes(state.ui.tab)) renderActiveTab(); }
function renderAll() { syncTabs(); refreshCounts(); renderActiveTab(); if (state.ui.drawerCandidate) renderDrawer(); }
function switchTab(tab) { state.ui.tab = tab; renderAll(); }
function onAuditEvent(entry) {
    entry.fresh = true;
    refreshCounts();
    if (state.ui.tab === 'audit' && $('#view-audit')) {
        const list = $('#auditList');
        if (list && matchesAuditFilter(entry)) {
            list.insertAdjacentHTML('afterbegin', auditRow(entry));
            lucide.createIcons();
            list.firstElementChild?.classList.add('flash');
        }
        delete entry.fresh;
        return;
    }
    renderIf('dashboard', 'pipeline', 'registry', 'analytics');
}

/* ---------------- Shared bits ---------------- */
function statusChip(a) {
    const map = a.type === 'human' ? HUMAN_STATUS : AGENT_STATUS;
    const s = map[a.status] || AGENT_STATUS.IDLE;
    return `<span class="inline-flex items-center gap-1.5 text-[11px] ${s.text}">
        <span class="w-1.5 h-1.5 rounded-full ${s.dot} ${a.status === 'PROCESSING' ? 'animate-pulse' : ''}"></span>${s.label}</span>`;
}
function urgencyBadge(u) {
    const m = { P0: 'bg-red-500/15 text-red-300 border-red-500/40', P1: 'bg-amber-500/15 text-amber-300 border-amber-500/40', P2: 'bg-gray-500/15 text-gray-300 border-gray-600/50' };
    return `<span class="px-1.5 py-0.5 text-[10px] font-bold border rounded ${m[u]}">${u}</span>`;
}
function autonomyBadge(v) {
    const m = { FULL_AUTO: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', SUPERVISED: 'bg-amber-500/15 text-amber-300 border-amber-500/40', READ_ONLY: 'bg-gray-500/15 text-gray-300 border-gray-600' };
    return `<span class="px-1.5 py-0.5 text-[10px] font-semibold border rounded font-mono ${m[v] || m.READ_ONLY}">${v}</span>`;
}
function scoreRing(score, size = 40) {
    if (score == null) return `<div class="ring" style="--v:0;--c:#374151;width:${size}px;height:${size}px"><span class="text-gray-500">–</span></div>`;
    return `<div class="ring" style="--v:${score};--c:${scoreColor(score)};width:${size}px;height:${size}px;position:relative">
        <span style="color:${scoreColor(score)}">${score}</span></div>`;
}
function slaText(req) {
    const left = req.createdAt + req.slaHours * 3600e3 - Date.now();
    const h = Math.floor(Math.abs(left) / 3600e3), m = Math.floor((Math.abs(left) % 3600e3) / 60e3);
    if (left < 0) return { txt: `breached ${h}h ${m}m ago`, cls: 'text-red-400' };
    if (left < req.slaHours * 3600e3 * 0.25) return { txt: `${h}h ${m}m left`, cls: 'text-red-400' };
    if (left < req.slaHours * 3600e3 * 0.5) return { txt: `${h}h ${m}m left`, cls: 'text-amber-400' };
    return { txt: `${h}h ${m}m left`, cls: 'text-gray-400' };
}

/* ================================================================
   1 · DASHBOARD (Mission Control)
   ================================================================ */
function renderDashboard() {
    const ai = state.agents.filter(a => a.type === 'ai');
    const active = ai.filter(a => a.status === 'PROCESSING').length;
    const waiting = ai.filter(a => a.status === 'WAITING_HUMAN').length;
    const idle = ai.filter(a => a.status === 'IDLE').length;
    const errored = ai.filter(a => a.status === 'ERROR').length;
    const pend = pendingExcs().length;
    const m = state.metrics;
    const openReqs = state.requisitions.filter(r => r.status !== 'CLOSED');
    const p0 = openReqs.filter(r => r.urgency === 'P0').length;
    const ranked = rankedRequisitions();

    const cards = [
        { label: 'Open Requisitions', value: openReqs.length, icon: 'briefcase', cls: 'text-blue-400',
          sub: `<span class="text-red-400 font-semibold">${p0} P0</span> · ${openReqs.filter(r => r.urgency === 'P1').length} P1 · ${openReqs.filter(r => r.urgency === 'P2').length} P2` },
        { label: 'Active AI Agents', value: `${active}<span class="text-gray-500 text-sm">/${ai.length}</span>`, icon: 'cpu', cls: 'text-emerald-400',
          sub: `<span class="text-gray-400">${idle} idle</span> ${waiting ? `· <span class="text-amber-400">${waiting} held</span>` : ''} ${errored ? `· <span class="text-red-400">${errored} error</span>` : ''}` },
        { label: 'Pending Approvals', value: pend, icon: 'siren', cls: pend ? 'text-amber-400' : 'text-gray-500', click: 'switchTab(\'hitl\')',
          sub: pend ? '<span class="text-amber-500 sr-only-pulse">review queue active</span>' : '<span class="text-emerald-400">queue clear</span>' },
        { label: 'Funnel Throughput', value: `${m.discovered}`, icon: 'filter', cls: 'text-violet-400',
          sub: `${m.verified} verified → ${m.contacted} contacted → <b class="text-emerald-400">${m.shortlisted} shortlisted</b>`, spark: m.throughput },
        { label: 'Avg Time-to-Handoff', value: `${m.avgHandoffSec}<span class="text-sm text-gray-500">s</span>`, icon: 'timer', cls: 'text-sky-400',
          sub: `SLA compliance <b class="${m.slaCompliance >= 90 ? 'text-emerald-400' : 'text-amber-400'}">${m.slaCompliance}%</b>` },
    ];

    return `
    <div class="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-3">
        ${cards.map(c => `
        <div class="glass border border-gray-800 rounded-xl p-4 hover:border-gray-700 transition ${c.click ? 'cursor-pointer' : ''}" ${c.click ? `onclick="${c.click}"` : ''}>
            <div class="flex items-start justify-between">
                <span class="text-[11px] uppercase tracking-wider text-gray-500 font-medium">${c.label}</span>
                <i data-lucide="${c.icon}" class="w-4 h-4 ${c.cls} opacity-70"></i>
            </div>
            <div class="text-[26px] font-bold mt-1.5 leading-none tabular ${c.cls}">${c.value}</div>
            <div class="text-[11px] text-gray-500 mt-1.5">${c.sub}</div>
            ${c.spark ? `<div class="mt-1 -mx-1">${miniSpark(c.spark, '#8b5cf6')}</div>` : ''}
        </div>`).join('')}
    </div>

    <div class="grid lg:grid-cols-3 gap-4 mt-4">
        <!-- Priority board -->
        <section class="lg:col-span-2 glass border border-gray-800 rounded-xl">
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <div>
                    <h2 class="text-sm font-semibold flex items-center gap-2"><i data-lucide="list-ordered" class="w-4 h-4 text-blue-400"></i> Job Priority & Dispatch Board</h2>
                    <p class="text-[11px] text-gray-500 mt-0.5">Ranked live by configurable weights · urgency, backlog, SLA risk</p>
                </div>
                <button class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 rounded-md text-xs font-semibold transition flex items-center gap-1.5"
                    onclick="openReqModal()">
                    <i data-lucide="plus" class="w-3.5 h-3.5"></i> New Requisition
                </button>
            </div>
            <div class="divide-y divide-gray-800/70">
                ${ranked.map((r, i) => {
                    const sla = slaText(r);
                    const backlog = getBacklog(r.id);
                    return `
                    <div class="px-4 py-3 flex items-center gap-3 hover:bg-gray-800/30 transition ${i === 0 ? 'bg-blue-500/[0.04]' : ''}">
                        <div class="w-6 text-center text-[11px] font-bold ${i === 0 ? 'text-blue-400' : 'text-gray-600'}">#${i + 1}</div>
                        ${urgencyBadge(r.urgency)}
                        <div class="min-w-0 flex-1">
                            <div class="text-[13px] font-medium truncate flex items-center gap-2">${esc(r.title)}
                                <span class="text-[10px] text-gray-600 font-mono">${r.id}</span></div>
                            <div class="text-[11px] text-gray-500 truncate">${esc(r.mode)} · HM ${esc(r.hm)} · ${r.skills.slice(0, 3).map(s => esc(s)).join(' · ')}</div>
                        </div>
                        <div class="hidden sm:block text-right">
                            <div class="text-[11px] ${sla.cls} tabular">${sla.txt}</div>
                            <div class="text-[10px] text-gray-600">SLA ${r.slaHours}h</div>
                        </div>
                        <div class="hidden md:block w-24">
                            <div class="text-[10px] text-gray-500 mb-1">backlog ${backlog}/${r.target}</div>
                            <div class="h-1.5 rounded bg-gray-800 overflow-hidden"><div class="h-full bg-blue-500 rounded" style="width:${clamp(backlog / r.target * 100, 4, 100)}%"></div></div>
                        </div>
                        <div class="w-20 text-right">
                            <div class="text-[13px] font-bold tabular ${r.score > .7 ? 'text-blue-300' : 'text-gray-400'}">${r.score.toFixed(2)}</div>
                            <div class="h-1.5 rounded bg-gray-800 overflow-hidden mt-1"><div class="h-full bg-gradient-to-r from-blue-600 to-cyan-400 rounded transition-all duration-500" style="width:${r.score * 100}%"></div></div>
                        </div>
                    </div>`;
                }).join('')}
            </div>
        </section>

        <!-- Rules & guardrails -->
        <section class="glass border border-gray-800 rounded-xl">
            <div class="px-4 py-3 border-b border-gray-800">
                <h2 class="text-sm font-semibold flex items-center gap-2"><i data-lucide="sliders-horizontal" class="w-4 h-4 text-violet-400"></i> Rules & Guardrails</h2>
                <p class="text-[11px] text-gray-500 mt-0.5">Operator-configurable — changes are audit-logged</p>
            </div>
            <div class="p-4 space-y-4 text-[12px]">
                <div>
                    <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">Priority weights</div>
                    ${[['urgency', 'Hiring urgency'], ['backlog', 'Backlog size'], ['sla', 'SLA risk']].map(([k, lbl]) => `
                    <div class="flex items-center gap-3 mb-2">
                        <span class="w-24 text-gray-400">${lbl}</span>
                        <input type="range" min="0" max="100" value="${state.rules.weights[k]}" class="flex-1 h-1"
                            oninput="updateWeight('${k}', this.value)" onchange="commitRule('${lbl} weight → ' + this.value)">
                        <span class="w-7 text-right tabular text-gray-300" id="w-${k}">${state.rules.weights[k]}</span>
                    </div>`).join('')}
                </div>
                <div class="border-t border-gray-800 pt-3">
                    <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-2 font-semibold">Human-in-the-loop gates</div>
                    <div class="flex items-center gap-3 mb-2">
                        <span class="w-24 text-gray-400">Score floor</span>
                        <input type="range" min="50" max="95" value="${state.rules.scoreThreshold}" class="flex-1 h-1"
                            oninput="updateRule('scoreThreshold', this.value)" onchange="commitRule('score threshold → ' + state.rules.scoreThreshold + '%')">
                        <span class="w-7 text-right tabular text-amber-300">${state.rules.scoreThreshold}</span>
                    </div>
                    <div class="flex items-center gap-3 mb-2">
                        <span class="w-24 text-gray-400">Auto-send floor</span>
                        <input type="range" min="50" max="99" value="${state.rules.autoSendScore}" class="flex-1 h-1"
                            oninput="updateRule('autoSendScore', this.value)" onchange="commitRule('auto-send floor → ' + state.rules.autoSendScore + '%')">
                        <span class="w-7 text-right tabular text-amber-300">${state.rules.autoSendScore}</span>
                    </div>
                    <label class="flex items-center justify-between py-1.5 cursor-pointer">
                        <span class="text-gray-400" title="Leadership/headcount roles always need a human release">Leadership-role gate</span>
                        <input type="checkbox" ${state.rules.execReview ? 'checked' : ''} class="accent-blue-500 w-4 h-4"
                            onchange="toggleRule('execReview', this.checked)">
                    </label>
                    <div class="flex items-center gap-3">
                        <span class="w-24 text-gray-400">Sentiment floor</span>
                        <input type="range" min="10" max="90" value="${state.rules.sentimentSensitivity * 100}" class="flex-1 h-1"
                            oninput="updateRule('sentimentSensitivity', this.value / 100)" onchange="commitRule('sentiment floor → ' + state.rules.sentimentSensitivity)">
                        <span class="w-7 text-right tabular text-amber-300">${state.rules.sentimentSensitivity.toFixed(2)}</span>
                    </div>
                </div>
            </div>
        </section>
    </div>

    <!-- Agent pulse + live activity -->
    <div class="grid lg:grid-cols-3 gap-4 mt-4">
        <section class="lg:col-span-2 glass border border-gray-800 rounded-xl">
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <h2 class="text-sm font-semibold flex items-center gap-2"><i data-lucide="activity" class="w-4 h-4 text-emerald-400"></i> Agent Pulse</h2>
                <span class="text-[11px] text-gray-500">${ai.length} AI agents · ${state.agents.filter(a => a.type === 'human').length} humans</span>
            </div>
            <div class="p-3 grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-2">
                ${state.agents.map(a => `
                    <div class="border rounded-lg p-2.5 transition ${a.status === 'PROCESSING' ? 'border-blue-500/40 agent-live bg-blue-500/5' : a.status === 'WAITING_HUMAN' ? 'border-amber-500/40 glow-card-amber' : a.status === 'ERROR' ? 'border-red-500/40 glow-red' : 'border-gray-800 hover:border-gray-700'}">
                        <div class="flex items-center gap-2">
                            <span class="w-2 h-2 rounded-full shrink-0 ${(a.type === 'human' ? HUMAN_STATUS : AGENT_STATUS)[a.status]?.dot || 'bg-gray-500'} ${a.status === 'PROCESSING' ? 'animate-pulse' : ''}"></span>
                            <span class="text-[12px] font-semibold truncate">${esc(a.name)}</span>
                            ${a.type === 'human' ? '<i data-lucide="user" class="w-3 h-3 text-gray-500 ml-auto"></i>' : ''}
                        </div>
                        <div class="text-[10px] text-gray-500 mt-1 truncate">${a.role} · ${esc(a.spec.split('·')[0].trim())}</div>
                        <div class="text-[10px] mt-1 truncate ${a.status === 'WAITING_HUMAN' ? 'text-amber-400' : a.status === 'PROCESSING' ? 'text-blue-300' : 'text-gray-600'}">
                            ${a.currentTask ? esc(a.currentTask) : AGENT_STATUS[a.status]?.label || a.status}
                        </div>
                    </div>`).join('')}
            </div>
        </section>

        <section class="glass border border-gray-800 rounded-xl flex flex-col">
            <div class="flex items-center justify-between px-4 py-3 border-b border-gray-800">
                <h2 class="text-sm font-semibold flex items-center gap-2"><i data-lucide="radio" class="w-4 h-4 text-sky-400"></i> Live Activity</h2>
                <button class="text-[11px] text-gray-500 hover:text-blue-400" onclick="switchTab('audit')">view all →</button>
            </div>
            <div class="p-2 space-y-1 overflow-y-auto max-h-[280px]">
                ${state.audit.slice(0, 10).map(e => `
                <div class="px-2 py-1.5 rounded hover:bg-gray-800/40 ${e.fresh ? 'flash' : ''}">
                    <div class="flex items-center gap-2">
                        <span class="text-[10px] text-gray-600 tabular w-14 shrink-0">${fmtClock(e.ts)}</span>
                        ${actionBadge(e.action)}
                        <span class="text-[10px] text-gray-500 truncate ml-auto">${esc(e.actor)}</span>
                    </div>
                    <div class="text-[11px] text-gray-400 truncate" title="${esc(e.details)}">${esc(e.details)}</div>
                </div>`).join('')}
            </div>
        </section>
    </div>

    <!-- Pipeline health strip -->
    <section class="glass border border-gray-800 rounded-xl mt-4 p-4">
        <div class="flex items-center justify-between mb-3">
            <h2 class="text-sm font-semibold flex items-center gap-2"><i data-lucide="git-merge" class="w-4 h-4 text-violet-400"></i> Pipeline Health</h2>
            <button class="text-[11px] text-gray-500 hover:text-blue-400" onclick="switchTab('pipeline')">open board →</button>
        </div>
        <div class="flex items-center gap-2 overflow-x-auto pb-1">
            ${STAGES.map((s, i) => {
                const n = state.candidates.filter(c => c.stage === s.key).length;
                const held = state.candidates.filter(c => c.stage === s.key && c.status === 'waiting').length;
                return `
                <div class="flex items-center gap-2 shrink-0">
                    <div class="border ${s.border} rounded-lg px-3 py-2 min-w-[118px] ${held ? 'glow-card-amber' : ''}">
                        <div class="flex items-center gap-1.5"><i data-lucide="${s.icon}" class="w-3.5 h-3.5 ${s.accent}"></i>
                            <span class="text-[11px] text-gray-400">${s.label}</span></div>
                        <div class="text-lg font-bold tabular leading-tight">${n}
                            ${held ? `<span class="text-[10px] text-amber-400 font-medium">· ${held} held</span>` : ''}</div>
                    </div>
                    ${i < STAGES.length - 1 ? '<i data-lucide="chevron-right" class="w-4 h-4 text-gray-700 shrink-0"></i>' : ''}
                </div>`;
            }).join('')}
            <div class="ml-auto pl-4 border-l border-gray-800 text-right shrink-0">
                <div class="text-[10px] uppercase tracking-wider text-gray-500">Rejected</div>
                <div class="text-lg font-bold tabular text-gray-500">${state.candidates.filter(c => c.stage === 'REJECTED').length}</div>
            </div>
        </div>
    </section>`;
}

/* ---------------- Rule handlers ---------------- */
function updateWeight(k, v) { state.rules.weights[k] = +v; const el = $('#w-' + k); if (el) el.textContent = v; renderIf('dashboard'); }
function updateRule(k, v) { state.rules[k] = +v; renderIf('dashboard'); }
function toggleRule(k, v) { state.rules[k] = v; commitRule(`${k} → ${v}`); }
function commitRule(what) {
    log('POLICY', null, `Operator updated rule: ${what}`, 'Laura Kim', 'human');
    toast('info', 'Rule updated', what);
    renderAll();
}

/* ================================================================
   2 · PIPELINE (multi-agent candidate board)
   ================================================================ */
function renderPipeline() {
    const reqFilter = state.ui.pipelineFilter;
    const cands = state.candidates.filter(c => reqFilter === 'ALL' || c.reqId === reqFilter);
    const rejected = cands.filter(c => c.stage === 'REJECTED');
    const reqs = [...new Set(state.candidates.map(c => c.reqId))];

    return `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
            <h2 class="text-sm font-semibold flex items-center gap-2"><i data-lucide="workflow" class="w-4 h-4 text-blue-400"></i> Multi-Agent Candidate Pipeline</h2>
            <p class="text-[11px] text-gray-500">Dossier context accumulates across handoffs — click any candidate for the full trace</p>
        </div>
        <div class="flex items-center gap-2">
            <select class="bg-gray-900 border border-gray-700 rounded-md text-xs px-2 py-1.5 outline-none focus:border-blue-500"
                onchange="state.ui.pipelineFilter=this.value;renderAll()">
                <option value="ALL" ${reqFilter === 'ALL' ? 'selected' : ''}>All requisitions</option>
                ${reqs.map(r => `<option value="${r}" ${reqFilter === r ? 'selected' : ''}>${r}</option>`).join('')}
            </select>
            <span class="text-[11px] text-gray-500">${cands.length - rejected.length} in flight</span>
        </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-3 xl:grid-cols-5 gap-3 items-start">
        ${STAGES.map(s => {
            const list = cands.filter(c => c.stage === s.key);
            const agents = [...new Set(list.map(c => agentName(c.assignedAgent)))];
            const held = list.filter(c => c.status === 'waiting').length;
            return `
            <section class="glass border ${held ? 'border-amber-500/40' : 'border-gray-800'} rounded-xl overflow-hidden ${held ? 'glow-card-amber' : ''}">
                <div class="px-3 py-2.5 border-b border-gray-800 flex items-center gap-2 ${held ? 'bg-amber-500/5' : ''}">
                    <i data-lucide="${s.icon}" class="w-4 h-4 ${s.accent}"></i>
                    <span class="text-[12px] font-semibold">${s.label}</span>
                    <span class="ml-auto text-[11px] tabular px-1.5 rounded bg-gray-800 text-gray-400">${list.length}</span>
                </div>
                ${agents.length ? `<div class="px-3 pt-2 text-[10px] text-gray-500 truncate">agents: ${agents.map(esc).join(', ')}</div>` : ''}
                <div class="p-2 space-y-2 min-h-[120px]">
                    ${list.length ? list.map(candidateCard).join('') :
                      `<div class="text-center text-[11px] text-gray-700 py-6 border border-dashed border-gray-800 rounded-lg">empty</div>`}
                </div>
            </section>`;
        }).join('')}
    </div>

    ${rejected.length ? `
    <section class="mt-4 border border-gray-800 rounded-xl p-3">
        <div class="text-[11px] uppercase tracking-wider text-gray-500 mb-2 flex items-center gap-1.5">
            <i data-lucide="archive" class="w-3.5 h-3.5"></i> Rejected / Archived · ${rejected.length}</div>
        <div class="flex flex-wrap gap-2">
            ${rejected.map(c => `
            <button class="text-left border border-gray-800 rounded-lg px-3 py-2 opacity-60 hover:opacity-100 transition" onclick="openDrawer('${c.id}')">
                <div class="text-[12px] font-medium line-through decoration-red-500/60">${esc(c.name)}</div>
                <div class="text-[10px] text-gray-500">${c.reqId} · rejected by human</div>
            </button>`).join('')}
        </div>
    </section>` : ''}`;
}

function candidateCard(c) {
    const waiting = c.status === 'waiting';
    const exc = c.exceptionId ? getExc(c.exceptionId) : null;
    return `
    <article class="border ${waiting ? 'border-amber-500/50 glow-card-amber' : 'border-gray-800'} rounded-lg p-2.5 bg-gray-900/60 hover:border-blue-500/40 cursor-pointer transition ${c._new ? 'enter' : ''}"
        onclick="openDrawer('${c.id}')">
        <div class="flex items-start gap-2.5">
            <div class="w-8 h-8 rounded-md bg-gradient-to-br from-blue-600/40 to-violet-600/40 grid place-items-center text-[11px] font-bold shrink-0">${initials(c.name)}</div>
            <div class="min-w-0 flex-1">
                <div class="text-[12.5px] font-semibold truncate leading-tight">${esc(c.name)}</div>
                <div class="text-[10.5px] text-gray-500 truncate" title="${esc(c.headline)}">${esc(c.headline)} · ${esc(c.company)}</div>
            </div>
            ${scoreRing(c.score, 34)}
        </div>
        <div class="flex items-center gap-1.5 mt-2 flex-wrap">
            <span class="text-[10px] font-mono text-gray-600">${c.id}</span>
            <span class="text-[10px] text-gray-600">${c.reqId}</span>
            <span class="text-[10px] px-1.5 py-0.5 rounded ${waiting ? 'bg-amber-500/15 text-amber-300 animate-pulse' : c.stage === 'SHORTLISTED' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-blue-500/10 text-blue-300'}">
                ${waiting ? '⏸ awaiting human' : c.stage === 'SHORTLISTED' ? '✓ shortlisted' : '▸ in flight'}
            </span>
        </div>
        ${exc ? `<div class="mt-2 text-[10.5px] text-amber-300/90 flex items-start gap-1">
            <i data-lucide="${EXC_TYPES[exc.type].icon}" class="w-3 h-3 mt-px shrink-0"></i><span class="line-clamp-2">${esc(exc.title)}</span></div>` : ''}
        <div class="mt-2 pt-2 border-t border-gray-800/80 flex items-center gap-1.5 text-[10.5px] text-gray-500">
            <span class="w-1.5 h-1.5 rounded-full ${waiting ? 'bg-amber-400' : 'bg-blue-400 animate-pulse'}"></span>
            <span class="truncate">${esc(agentName(c.assignedAgent))}</span>
            <span class="ml-auto text-gray-600 shrink-0">${fmtAgo(c.createdAt)}</span>
        </div>
    </article>`;
}

/* ================================================================
   3 · HITL EXCEPTION CENTRE
   ================================================================ */
function renderHitl() {
    const pend = pendingExcs();
    const resolved = state.exceptions.filter(e => e.status !== 'PENDING');
    const m = state.metrics;
    const avgRes = resolved.length ? Math.round(resolved.filter(e => e.resolvedAt).reduce((s, e) => s + (e.resolvedAt - e.createdAt), 0) / resolved.filter(e => e.resolvedAt).length / 1000) : 0;

    return `
    <div class="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
        ${[
            ['Pending review', pend.length, pend.length ? 'text-amber-400' : 'text-emerald-400', 'siren'],
            ['Resolved (session)', m.exceptionsResolved, 'text-blue-400', 'check-check'],
            ['Avg resolution', avgRes ? avgRes + 's' : '—', 'text-sky-400', 'timer'],
            ['Override rate', Math.round(state.exceptions.filter(e => e.status === 'OVERRIDDEN').length / Math.max(1, resolved.length) * 100) + '%', 'text-violet-400', 'git-pull-request-arrow'],
        ].map(([l, v, c, ic]) => `
        <div class="glass border border-gray-800 rounded-xl p-4">
            <div class="flex justify-between"><span class="text-[11px] uppercase tracking-wider text-gray-500">${l}</span>
                <i data-lucide="${ic}" class="w-4 h-4 ${c} opacity-70"></i></div>
            <div class="text-2xl font-bold tabular mt-1 ${c}">${v}</div>
        </div>`).join('')}
    </div>

    ${pend.length ? `
    <div class="grid xl:grid-cols-2 gap-3">
        ${pend.map(exceptionCard).join('')}
    </div>` : `
    <div class="glass border border-dashed border-gray-700 rounded-xl p-10 text-center">
        <div class="text-3xl mb-2">✅</div>
        <div class="text-sm font-semibold">Recruiter queue clear</div>
        <div class="text-[12px] text-gray-500 mt-1">All agents are operating within autonomy bounds. New exceptions will page this inbox.</div>
        <button class="mt-4 px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md text-xs font-semibold transition" onclick="switchTab('pipeline')">Inspect live pipeline</button>
    </div>`}

    ${resolved.length ? `
    <section class="mt-5 border border-gray-800 rounded-xl overflow-hidden">
        <div class="px-4 py-2.5 border-b border-gray-800 text-[12px] font-semibold text-gray-300 flex items-center gap-2">
            <i data-lucide="history" class="w-4 h-4 text-gray-500"></i> Decision history · ${resolved.length}
        </div>
        <div class="divide-y divide-gray-800/70 max-h-[260px] overflow-y-auto">
            ${resolved.map(e => {
                const c = getCandidate(e.candidateId);
                const cls = { APPROVED: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/30', OVERRIDDEN: 'text-blue-400 bg-blue-500/10 border-blue-500/30',
                    REJECTED: 'text-red-400 bg-red-500/10 border-red-500/30', REASSIGNED: 'text-gray-300 bg-gray-500/10 border-gray-600' }[e.status];
                return `
                <div class="px-4 py-2.5 flex items-center gap-3 text-[12px]">
                    <span class="px-2 py-0.5 text-[10px] font-bold border rounded ${cls}">${e.status}</span>
                    <span class="font-medium">${esc(e.title.split('·')[0].trim())}</span>
                    <span class="text-gray-500 truncate hidden sm:block">${esc(e.reason).slice(0, 70)}…</span>
                    <span class="ml-auto text-gray-600 text-[11px] shrink-0">${e.decidedBy ? esc(e.decidedBy) : ''} · ${e.resolvedAt ? fmtAgo(e.resolvedAt) : ''}</span>
                    ${c ? `<button class="text-blue-400 hover:text-blue-300 text-[11px] shrink-0" onclick="openDrawer('${c.id}')">dossier →</button>` : ''}
                </div>`;
            }).join('')}
        </div>
    </section>` : ''}`;
}

function exceptionCard(e) {
    const c = getCandidate(e.candidateId);
    const meta = EXC_TYPES[e.type];
    const age = fmtAgo(e.createdAt);
    let payload = '';
    if (e.type === 'LOW_CONFIDENCE') {
        payload = `
        <div class="mb-3">
            <div class="flex justify-between text-[11px] mb-1.5">
                <span class="text-gray-400">Match score</span>
                <span class="font-bold tabular text-amber-400">${e.detail.score}% <span class="text-gray-500 font-normal">/ floor ${e.detail.threshold}</span></span>
            </div>
            ${scoreGauge(e.detail.score, e.detail.threshold)}
            <ul class="mt-2.5 space-y-1">${(e.detail.flags || []).map(f => `
                <li class="text-[11.5px] text-amber-200/80 flex items-start gap-1.5"><i data-lucide="flag" class="w-3 h-3 mt-0.5 text-amber-400 shrink-0"></i>${esc(f)}</li>`).join('')}
            </ul>
        </div>`;
    } else if (e.type === 'SENTIMENT') {
        payload = `
        <div class="mb-3">
            <div class="flex justify-between text-[11px] mb-1.5">
                <span class="text-gray-400">Reply sentiment</span>
                <span class="font-bold tabular text-red-400">${(e.detail.sentiment ?? 0.3).toFixed(2)} <span class="text-gray-500 font-normal">/ floor ${state.rules.sentimentSensitivity}</span></span>
            </div>
            <div class="h-2 rounded-full bg-gray-800 overflow-hidden border border-gray-700">
                <div class="h-full bg-gradient-to-r from-red-500 to-amber-400" style="width:${((e.detail.sentiment ?? 0.3) * 100).toFixed(0)}%"></div>
            </div>
            <blockquote class="mt-2.5 text-[12px] text-gray-300 italic border-l-2 border-red-500/50 pl-3 bg-red-500/5 rounded-r py-2">“${esc(e.detail.reply || '')}”</blockquote>
            <div class="flex flex-wrap gap-1.5 mt-2">${(e.detail.signals || []).map(s => `<span class="text-[10px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-300 border border-red-500/30">${esc(s)}</span>`).join('')}</div>
        </div>`;
    } else if (e.type === 'DRAFT_REVIEW') {
        payload = `
        <div class="mb-3 rounded-lg border border-gray-700/70 bg-gray-950/60 overflow-hidden">
            <div class="px-3 py-2 border-b border-gray-800 text-[11px] text-gray-400 flex justify-between items-center gap-2">
                <span>drafted by <b class="text-blue-300">${esc(e.detail.agent || agentName(e.agentId))}</b> · score ${e.detail.score}</span>
                <button class="px-2 py-1 text-[10.5px] rounded border border-violet-500/40 text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 transition flex items-center gap-1 ${e._aiBusy === 'draft' ? 'opacity-60 pointer-events-none' : ''}"
                    onclick="aiRegenerate('${e.id}')">
                    ${e._aiBusy === 'draft'
                        ? '<span class="w-2.5 h-2.5 border-2 border-violet-300 border-t-transparent rounded-full animate-spin"></span> Generating…'
                        : '<i data-lucide="sparkles" class="w-3 h-3"></i> Regenerate with AI'}</button>
            </div>
            <div class="px-3 py-2">
                <div class="text-[12px] font-semibold mb-1.5">Subject: ${esc(e.detail.subject || '')}</div>
                <p class="text-[12px] text-gray-300 leading-relaxed">${esc(e.detail.body || '')}</p>
            </div>
        </div>`;
    } else {
        payload = `
        <div class="mb-3 rounded-lg border border-violet-500/30 bg-violet-500/5 p-3">
            <div class="text-[11px] text-violet-300 font-semibold mb-1.5">Policy gate · ${esc((e.detail.flags || []).join(', ') || 'compliance')}</div>
            <div class="text-[12px] text-gray-300">Score ${e.detail.score ?? '—'} · governance requires explicit recruiter release before outreach.</div>
        </div>`;
    }

    return `
    <article class="glass border border-amber-500/40 rounded-xl overflow-hidden glow-card-amber enter">
        <div class="px-4 py-3 border-b border-amber-500/20 bg-amber-500/[0.06] flex items-center gap-2.5 flex-wrap">
            <span class="w-7 h-7 rounded-md bg-amber-500/15 border border-amber-500/40 grid place-items-center">
                <i data-lucide="${meta.icon}" class="w-4 h-4 text-amber-400"></i></span>
            <div class="min-w-0">
                <div class="text-[13px] font-semibold truncate">${esc(e.title)}</div>
                <div class="text-[11px] text-gray-500">${e.id} · ${e.reqId} · held by ${esc(agentName(e.agentId))} · <span class="text-amber-400">${age}</span></div>
            </div>
            <span class="ml-auto px-2 py-0.5 text-[10px] font-bold rounded border ${e.severity === 'CRITICAL' || e.severity === 'HIGH' ? 'bg-red-500/15 text-red-300 border-red-500/40' : 'bg-amber-500/15 text-amber-300 border-amber-500/40'}">${e.severity}</span>
        </div>
        <div class="p-4">
            <p class="text-[12px] text-gray-300 mb-3 leading-relaxed">${esc(e.reason)}</p>
            ${payload}
            ${e._aiBusy === 'rec' ? aiBusyBar('Governance Copilot analysing this exception with the LLM…') : ''}
            ${e._ai && e._ai.decision ? aiRecBanner(e) : ''}
            ${e._aiBusy === 'reply' ? aiBusyBar('Drafting a suggested reply for reference…') : ''}
            ${e._aiReply ? aiReplyBanner(e) : ''}
            <div class="flex flex-wrap gap-2 pt-3 border-t border-gray-800">
                <button class="px-3 py-2 rounded-md text-[12px] font-semibold transition flex items-center justify-center gap-1.5 border border-violet-500/40 text-violet-300 bg-violet-500/10 hover:bg-violet-500/20 ${e._aiBusy ? 'opacity-60 pointer-events-none' : ''}"
                    onclick="aiRecommend('${e.id}')">
                    <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> AI Recommend</button>
                ${e.type === 'SENTIMENT' ? `
                <button class="px-3 py-2 rounded-md text-[12px] font-medium transition flex items-center justify-center gap-1.5 border border-sky-500/40 text-sky-300 bg-sky-500/10 hover:bg-sky-500/20 ${e._aiBusy ? 'opacity-60 pointer-events-none' : ''}"
                    onclick="aiSuggestReply('${e.id}')">
                    <i data-lucide="message-circle-reply" class="w-3.5 h-3.5"></i> Suggest reply</button>` : ''}
                <button class="flex-1 min-w-[120px] px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-md text-[12px] font-semibold transition flex items-center justify-center gap-1.5"
                    onclick="decideException('${e.id}','APPROVED')">
                    <i data-lucide="check" class="w-3.5 h-3.5"></i> Approve &amp; Proceed</button>
                <button class="flex-1 min-w-[110px] px-3 py-2 bg-blue-600/90 hover:bg-blue-500 rounded-md text-[12px] font-semibold transition flex items-center justify-center gap-1.5"
                    onclick="openOverrideModal('${e.id}')">
                    <i data-lucide="pencil" class="w-3.5 h-3.5"></i> Override</button>
                <button class="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md text-[12px] font-medium transition flex items-center justify-center gap-1.5"
                    onclick="openReassignModal('${e.id}')">
                    <i data-lucide="repeat" class="w-3.5 h-3.5"></i> Re-assign</button>
                <button class="px-3 py-2 bg-gray-800 hover:bg-red-600/80 border border-gray-700 rounded-md text-[12px] font-medium transition text-red-300 flex items-center justify-center gap-1.5"
                    onclick="openRejectModal('${e.id}')">
                    <i data-lucide="x" class="w-3.5 h-3.5"></i> Reject</button>
            </div>
        </div>
    </article>`;
}

/* ================================================================
   4 · AGENT & HUMAN REGISTRY
   ================================================================ */
function renderRegistry() {
    const f = state.ui.registryFilter || 'ALL';
    const list = state.agents.filter(a => f === 'ALL' || (f === 'AI' ? a.type === 'ai' : a.type === 'human'));
    const ai = state.agents.filter(a => a.type === 'ai');
    const held = ai.filter(a => a.status === 'WAITING_HUMAN').length;

    return `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
            <h2 class="text-sm font-semibold flex items-center gap-2"><i data-lucide="users" class="w-4 h-4 text-blue-400"></i> Agent &amp; Human Resource Registry</h2>
            <p class="text-[11px] text-gray-500">${ai.length} AI agents · ${state.agents.length - ai.length} humans · ${held} held at human gates</p>
        </div>
        <div class="flex gap-1.5">
            ${['ALL', 'AI', 'HUMAN'].map(x => `
            <button class="px-3 py-1.5 text-[11px] rounded-md border transition ${f === x ? 'border-blue-500/50 bg-blue-500/15 text-blue-300' : 'border-gray-700 text-gray-400 hover:text-gray-200'}"
                onclick="state.ui.registryFilter='${x}';renderAll()">${x === 'ALL' ? 'All' : x === 'AI' ? 'AI Agents' : 'Humans'}</button>`).join('')}
        </div>
    </div>

    ${aiRuntimeStrip()}

    <div class="glass border border-gray-800 rounded-xl overflow-x-auto">
        <table class="w-full text-[12px] min-w-[1080px]">
            <thead class="text-[10px] uppercase tracking-wider text-gray-500 bg-gray-900/70">
                <tr>
                    <th class="text-left font-semibold px-4 py-2.5">Agent</th>
                    <th class="text-left font-semibold px-3 py-2.5">Role / Specialisation</th>
                    <th class="text-left font-semibold px-3 py-2.5">Capabilities</th>
                    <th class="text-left font-semibold px-3 py-2.5">Status</th>
                    <th class="text-left font-semibold px-3 py-2.5">Autonomy</th>
                    <th class="text-left font-semibold px-3 py-2.5 w-32">Load</th>
                    <th class="text-right font-semibold px-3 py-2.5">Success</th>
                    <th class="text-right font-semibold px-3 py-2.5">Latency</th>
                    <th class="text-right font-semibold px-4 py-2.5">Enabled</th>
                </tr>
            </thead>
            <tbody class="divide-y divide-gray-800/70">
                ${list.map(a => {
                    const load = Math.round(a.activeTasks / a.capacity * 100);
                    return `
                    <tr class="hover:bg-gray-800/30 ${a.status === 'ERROR' ? 'bg-red-500/[0.04]' : ''}">
                        <td class="px-4 py-3">
                            <div class="flex items-center gap-2.5">
                                <div class="w-7 h-7 rounded-md grid place-items-center text-[10px] font-bold ${a.type === 'ai' ? 'bg-blue-600/25 text-blue-300 border border-blue-500/30' : 'bg-violet-600/25 text-violet-300 border border-violet-500/30'}">
                                    ${a.type === 'ai' ? '<i data-lucide="bot" class="w-3.5 h-3.5"></i>' : '<i data-lucide="user" class="w-3.5 h-3.5"></i>'}
                                </div>
                                <div>
                                    <div class="font-semibold leading-tight">${esc(a.name)}</div>
                                    <div class="text-[10px] text-gray-600 font-mono">${a.id}${a.model ? ' · ' + a.model : ''}</div>
                                </div>
                            </div>
                        </td>
                        <td class="px-3 py-3">
                            <div class="text-gray-300">${a.role}</div>
                            <div class="text-[10.5px] text-gray-500">${esc(a.spec)}</div>
                        </td>
                        <td class="px-3 py-3">
                            <div class="flex flex-wrap gap-1 max-w-[240px]">
                                ${a.capabilities.slice(0, 3).map(x => `<span class="text-[9.5px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-400 border border-gray-700/70" title="${esc(x)}">${esc(x)}</span>`).join('')}
                                ${a.capabilities.length > 3 ? `<span class="text-[9.5px] px-1.5 py-0.5 text-gray-600">+${a.capabilities.length - 3}</span>` : ''}
                            </div>
                        </td>
                        <td class="px-3 py-3">${statusChip(a)}${a.currentTask ? `<div class="text-[10px] text-gray-600 truncate max-w-[150px]" title="${esc(a.currentTask)}">${esc(a.currentTask)}</div>` : ''}</td>
                        <td class="px-3 py-3">
                            ${a.type === 'ai' ? `
                            <select class="bg-gray-900 border border-gray-700 rounded px-1.5 py-1 text-[10.5px] font-mono outline-none focus:border-blue-500 ${a.permissions === 'FULL_AUTO' ? 'text-emerald-300' : a.permissions === 'SUPERVISED' ? 'text-amber-300' : 'text-gray-400'}"
                                onchange="setAutonomy('${a.id}', this.value)">
                                ${AUTONOMY_LEVELS.map(l => `<option ${a.permissions === l ? 'selected' : ''}>${l}</option>`).join('')}
                            </select>` : `<span class="text-[10.5px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-300 border border-violet-500/30">${a.permissions}</span>`}
                        </td>
                        <td class="px-3 py-3">
                            <div class="flex items-center gap-2">
                                <div class="flex-1 h-1.5 rounded bg-gray-800 overflow-hidden">
                                    <div class="h-full rounded transition-all ${load > 75 ? 'bg-amber-500' : 'bg-blue-500'}" style="width:${Math.max(load, a.activeTasks ? 6 : 0)}%"></div>
                                </div>
                                <span class="text-[10.5px] tabular text-gray-500">${a.activeTasks}/${a.capacity}</span>
                            </div>
                            <div class="text-[10px] text-gray-600 mt-0.5">${a.tasksDone} tasks done${a.tasksFailed ? ` · <span class="text-red-400">${a.tasksFailed} failed</span>` : ''}</div>
                        </td>
                        <td class="px-3 py-3 text-right tabular ${a.successRate >= .96 ? 'text-emerald-400' : a.successRate >= .93 ? 'text-gray-300' : 'text-amber-400'}">${(a.successRate * 100).toFixed(1)}%</td>
                        <td class="px-3 py-3 text-right tabular text-gray-400">${a.avgLatency >= 1000 ? (a.avgLatency / 1000).toFixed(1) + 's' : a.avgLatency + 'ms'}</td>
                        <td class="px-4 py-3 text-right">
                            <button class="relative w-9 h-5 rounded-full transition ${a.enabled ? 'bg-emerald-600' : 'bg-gray-700'}" onclick="toggleAgent('${a.id}')" title="${a.enabled ? 'Disable' : 'Enable'} ${esc(a.name)}">
                                <span class="absolute top-0.5 w-4 h-4 rounded-full bg-white transition-all" style="left:${a.enabled ? '18px' : '2px'}"></span>
                            </button>
                        </td>
                    </tr>`;
                }).join('')}
            </tbody>
        </table>
    </div>

    <div class="grid md:grid-cols-3 gap-3 mt-4">
        ${[['FULL_AUTO', 'Acts without approval; escalates only on error or policy violation.', 'text-emerald-400'],
           ['SUPERVISED', 'Drafts and low-confidence work require recruiter sign-off before release.', 'text-amber-400'],
           ['READ_ONLY', 'Produces analytics and recommendations; never writes to the ATS or inbox.', 'text-gray-400']]
        .map(([k, d, c]) => `
        <div class="glass border border-gray-800 rounded-xl p-3.5">
            <div class="font-mono text-[11px] font-bold ${c} mb-1">${k}</div>
            <div class="text-[11.5px] text-gray-500 leading-relaxed">${d}</div>
        </div>`).join('')}
    </div>`;
}

function toggleAgent(id) {
    const a = getAgent(id); if (!a) return;
    a.enabled = !a.enabled;
    a.status = a.enabled ? 'IDLE' : 'OFFLINE';
    if (!a.enabled) { a.activeTasks = 0; a.currentTask = null; }
    log(a.enabled ? 'POLICY' : 'OFFLINE', null, `${a.name} (${a.id}) ${a.enabled ? 'enabled' : 'disabled'} · autonomy ${a.permissions}`, 'Laura Kim', 'human');
    toast(a.enabled ? 'success' : 'info', a.enabled ? 'Agent enabled' : 'Agent disabled', `${a.name} · ${a.role}`);
    renderAll();
}
function setAutonomy(id, val) {
    const a = getAgent(id); if (!a) return;
    const old = a.permissions; a.permissions = val;
    log('POLICY', null, `${a.name} autonomy ${old} → ${val} · ${val === 'FULL_AUTO' ? 'approval gates released for this agent' : 'human gates armed'}`, 'Laura Kim', 'human');
    toast('info', 'Autonomy updated', `${a.name}: ${old} → ${val}`);
    renderAll();
}

/* ================================================================
   5 · ANALYTICS
   ================================================================ */
function renderAnalytics() {
    const m = state.metrics;
    const ai = state.agents.filter(a => a.type === 'ai');
    const hours = Math.max(0.25, (Date.now() - m.startedAt) / 3600e3);
    const prod = ai.map(a => ({
        label: a.name, value: +(a.tasksDone / hours).toFixed(1),
        display: (a.tasksDone / hours).toFixed(1) + '/h',
        color: a.status === 'PROCESSING' ? '#3b82f6' : a.status === 'WAITING_HUMAN' ? '#f59e0b' : a.status === 'ERROR' ? '#ef4444' : '#4b5563',
    })).sort((x, y) => y.value - x.value);

    const funnel = [
        { label: 'Profiles discovered', value: m.discovered },
        { label: 'Verified', value: m.verified },
        { label: 'Contacted', value: m.contacted },
        { label: 'Responded', value: m.responded },
        { label: 'Shortlisted', value: m.shortlisted },
    ];
    const excItems = Object.entries(m.excByType).map(([k, v]) => ({
        label: EXC_TYPES[k].label.split(' ')[0], value: v,
        display: `${v} · ${Math.round(v / Math.max(1, m.exceptionsRaised) * 100)}%`,
        color: { LOW_CONFIDENCE: '#f59e0b', SENTIMENT: '#ef4444', DRAFT_REVIEW: '#3b82f6', COMPLIANCE: '#a78bfa' }[k],
    })).sort((a, b) => b.value - a.value);

    const reliable = ai.map(a => ({ label: a.name, value: +(a.successRate * 100).toFixed(1), display: (a.successRate * 100).toFixed(1) + '%',
        color: a.successRate >= .96 ? '#22c55e' : a.successRate >= .93 ? '#3b82f6' : '#f59e0b' })).sort((x, y) => y.value - x.value);
    const errRate = (m.tasksFailed / Math.max(1, m.tasksTotal) * 100);

    return `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
            <h2 class="text-sm font-semibold flex items-center gap-2"><i data-lucide="bar-chart-3" class="w-4 h-4 text-blue-400"></i> Funnel &amp; Performance Analytics</h2>
            <p class="text-[11px] text-gray-500">Rolling window · session started ${fmtAgo(m.startedAt)} · updates every 5s during simulation</p>
        </div>
        <div class="flex gap-2 text-[11px]">
            <span class="px-2 py-1 rounded bg-gray-800 text-gray-400 border border-gray-700">tasks <b class="text-white tabular">${m.tasksTotal}</b></span>
            <span class="px-2 py-1 rounded bg-gray-800 text-gray-400 border border-gray-700">failures <b class="tabular ${errRate > 4 ? 'text-red-400' : 'text-emerald-400'}">${errRate.toFixed(1)}%</b></span>
            <span class="px-2 py-1 rounded bg-gray-800 text-gray-400 border border-gray-700">exceptions <b class="text-amber-400 tabular">${m.exceptionsRaised}</b></span>
        </div>
    </div>

    <div class="grid lg:grid-cols-3 gap-4">
        <section class="glass border border-gray-800 rounded-xl p-4">
            <h3 class="text-[12px] font-semibold text-gray-300 mb-3 flex items-center gap-2"><i data-lucide="filter" class="w-4 h-4 text-violet-400"></i> Stage Conversion</h3>
            ${funnelChart(funnel, { conversionNote: 'Conversion measured end-to-end against profiles discovered.' })}
        </section>

        <section class="glass border border-gray-800 rounded-xl p-4">
            <h3 class="text-[12px] font-semibold text-gray-300 mb-3 flex items-center gap-2"><i data-lucide="gauge" class="w-4 h-4 text-emerald-400"></i> SLA &amp; Handoff Speed</h3>
            <div class="flex justify-center">${donutChart(m.slaCompliance, 'within SLA', `${m.avgHandoffSec}s avg time-to-handoff`, m.slaCompliance >= 90 ? '#22c55e' : '#f59e0b')}</div>
            <div class="grid grid-cols-2 gap-2 mt-3">
                <div class="bg-gray-900/70 border border-gray-800 rounded-lg p-2.5 text-center">
                    <div class="text-lg font-bold tabular text-blue-400">${state.requisitions.filter(r => r.urgency === 'P0').length}</div>
                    <div class="text-[10px] text-gray-500">P0 reqs live</div></div>
                <div class="bg-gray-900/70 border border-gray-800 rounded-lg p-2.5 text-center">
                    <div class="text-lg font-bold tabular text-violet-400">${state.requisitions.length}</div>
                    <div class="text-[10px] text-gray-500">total ingested</div></div>
            </div>
        </section>

        <section class="glass border border-gray-800 rounded-xl p-4">
            <h3 class="text-[12px] font-semibold text-gray-300 mb-3 flex items-center gap-2"><i data-lucide="trending-up" class="w-4 h-4 text-sky-400"></i> Throughput Trend</h3>
            ${trendChart(m.throughput)}
            <div class="grid grid-cols-3 gap-2 mt-3 text-center">
                <div><div class="text-lg font-bold tabular text-sky-300">${m.throughput.at(-1)}</div><div class="text-[10px] text-gray-500">now / tick</div></div>
                <div><div class="text-lg font-bold tabular text-white">${Math.round(m.throughput.reduce((a, b) => a + b, 0) / m.throughput.length)}</div><div class="text-[10px] text-gray-500">avg / tick</div></div>
                <div><div class="text-lg font-bold tabular text-emerald-400">${Math.max(...m.throughput)}</div><div class="text-[10px] text-gray-500">peak</div></div>
            </div>
        </section>

        <section class="glass border border-gray-800 rounded-xl p-4 lg:col-span-2">
            <h3 class="text-[12px] font-semibold text-gray-300 mb-3 flex items-center gap-2"><i data-lucide="cpu" class="w-4 h-4 text-blue-400"></i> Agent Productivity <span class="text-gray-600 font-normal">· tasks processed per hour</span></h3>
            ${hbarChart(prod, { color: '#3b82f6' })}
        </section>

        <section class="glass border border-gray-800 rounded-xl p-4">
            <h3 class="text-[12px] font-semibold text-gray-300 mb-3 flex items-center gap-2"><i data-lucide="siren" class="w-4 h-4 text-amber-400"></i> Exception Mix</h3>
            ${hbarChart(excItems, { color: '#f59e0b' })}
            <div class="mt-4 pt-3 border-t border-gray-800">
                <h3 class="text-[12px] font-semibold text-gray-300 mb-2.5 flex items-center gap-2"><i data-lucide="shield-check" class="w-4 h-4 text-emerald-400"></i> Agent Reliability</h3>
                ${hbarChart(reliable, { color: '#22c55e' })}
            </div>
        </section>
    </div>`;
}

/* ================================================================
   6 · AUDIT LOG
   ================================================================ */
const ACTION_COLORS = {
    SOURCED: 'text-sky-300 bg-sky-500/10 border-sky-500/30', VERIFIED: 'text-violet-300 bg-violet-500/10 border-violet-500/30',
    HANDOFF: 'text-blue-300 bg-blue-500/10 border-blue-500/30', EXCEPTION_TRIGGERED: 'text-amber-300 bg-amber-500/10 border-amber-500/40',
    APPROVED: 'text-emerald-300 bg-emerald-500/10 border-emerald-500/30', OVERRIDDEN: 'text-cyan-300 bg-cyan-500/10 border-cyan-500/30',
    REJECTED: 'text-red-300 bg-red-500/10 border-red-500/30', RE_ASSIGN: 'text-gray-300 bg-gray-500/10 border-gray-600',
    EMAIL_SENT: 'text-amber-200 bg-amber-600/10 border-amber-600/30', RESPONSE_RECEIVED: 'text-emerald-200 bg-emerald-600/10 border-emerald-600/30',
    SLOT_OFFERED: 'text-teal-300 bg-teal-500/10 border-teal-500/30', INTERVIEW_BOOKED: 'text-yellow-200 bg-yellow-500/10 border-yellow-500/30',
    JOB_POSTED: 'text-sky-200 bg-sky-600/10 border-sky-600/30', PRIORITIZED: 'text-indigo-300 bg-indigo-500/10 border-indigo-500/30',
    ERROR: 'text-red-300 bg-red-600/15 border-red-600/40', RECOVERED: 'text-emerald-300 bg-emerald-600/10 border-emerald-600/30',
    ASSIGNED: 'text-gray-300 bg-gray-600/15 border-gray-600', SYSTEM: 'text-gray-400 bg-gray-700/30 border-gray-700',
    OFFLINE: 'text-gray-400 bg-gray-700/30 border-gray-700', POLICY: 'text-fuchsia-300 bg-fuchsia-500/10 border-fuchsia-500/30',
    AI_DRAFT: 'text-violet-300 bg-violet-500/10 border-violet-500/40', AI_RECOMMEND: 'text-violet-300 bg-violet-500/10 border-violet-500/40',
    INTEGRATION: 'text-teal-300 bg-teal-500/10 border-teal-500/30',
};
function actionBadge(action) {
    return `<span class="px-1.5 py-0.5 text-[9.5px] font-bold font-mono border rounded ${ACTION_COLORS[action] || ACTION_COLORS.SYSTEM}">${action}</span>`;
}
function matchesAuditFilter(e) {
    const f = state.ui.auditFilter, q = state.ui.auditSearch.trim().toLowerCase();
    if (f !== 'ALL' && e.action !== f) return false;
    if (q && !(`${e.details} ${e.actor} ${e.reqId} ${e.action}`.toLowerCase().includes(q))) return false;
    return true;
}
function auditRow(e) {
    return `
    <div class="px-3 py-2 grid grid-cols-[68px_100px_150px_84px_1fr] gap-3 items-start hover:bg-gray-800/40 font-mono text-[11.5px] ${e.fresh ? 'flash' : ''}">
        <span class="text-gray-600 tabular">${fmtClock(e.ts)}</span>
        <span class="truncate ${e.actorType === 'human' ? 'text-violet-300' : 'text-gray-400'}" title="${esc(e.actor)}">${e.actorType === 'human' ? '👤 ' : '🤖 '}${esc(e.actor)}</span>
        <span>${actionBadge(e.action)}</span>
        <span class="text-gray-600">${esc(e.reqId)}</span>
        <span class="text-gray-400 font-sans leading-snug break-words">${esc(e.details)}</span>
    </div>`;
}
function renderAudit() {
    const filters = ['ALL', 'SOURCED', 'VERIFIED', 'HANDOFF', 'EXCEPTION_TRIGGERED', 'APPROVED', 'EMAIL_SENT', 'INTERVIEW_BOOKED', 'ERROR', 'POLICY'];
    const rows = state.audit.filter(matchesAuditFilter).slice(0, 150);
    return `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-3">
        <div>
            <h2 class="text-sm font-semibold flex items-center gap-2"><i data-lucide="scroll-text" class="w-4 h-4 text-blue-400"></i> Auditable Activity Stream</h2>
            <p class="text-[11px] text-gray-500">${state.audit.length} events · every agent action is timestamped, attributed and traceable</p>
        </div>
        <div class="flex items-center gap-2">
            <div class="relative">
                <i data-lucide="search" class="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-gray-500"></i>
                <input id="auditSearch" value="${esc(state.ui.auditSearch)}" placeholder="filter events…"
                    class="bg-gray-900 border border-gray-700 rounded-md pl-8 pr-3 py-1.5 text-[12px] w-52 outline-none focus:border-blue-500"
                    oninput="state.ui.auditSearch=this.value;renderAuditList()">
            </div>
            <label class="flex items-center gap-1.5 text-[11px] text-gray-400 cursor-pointer select-none">
                <input type="checkbox" ${state.ui.auditAutoScroll ? 'checked' : ''} class="accent-blue-500" onchange="state.ui.auditAutoScroll=this.checked"> live
            </label>
            <button class="px-3 py-1.5 text-[11px] bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md flex items-center gap-1.5"
                onclick="exportAudit()"><i data-lucide="download" class="w-3.5 h-3.5"></i> Export JSON</button>
        </div>
    </div>

    <div class="flex flex-wrap gap-1.5 mb-3">
        ${filters.map(f => `
        <button class="px-2.5 py-1 text-[10.5px] font-mono rounded border transition ${state.ui.auditFilter === f ? 'border-blue-500/60 bg-blue-500/15 text-blue-300' : 'border-gray-700 text-gray-500 hover:text-gray-300'}"
            onclick="state.ui.auditFilter='${f}';renderAll()">${f}</button>`).join('')}
    </div>

    <div class="glass border border-gray-800 rounded-xl overflow-hidden">
        <div class="px-3 py-2 grid grid-cols-[68px_100px_150px_84px_1fr] gap-3 text-[9.5px] uppercase tracking-wider text-gray-600 border-b border-gray-800 bg-gray-900/70 font-semibold">
            <span>Time</span><span>Actor</span><span>Action</span><span>Req ID</span><span>Details</span>
        </div>
        <div id="auditList" class="divide-y divide-gray-800/50 max-h-[62vh] overflow-y-auto">
            ${rows.length ? rows.map(auditRow).join('') : `<div class="p-8 text-center text-[12px] text-gray-600">No events match this filter.</div>`}
        </div>
        <div class="px-3 py-2 text-[10.5px] text-gray-600 border-t border-gray-800 font-mono">
            showing ${rows.length} of ${state.audit.length} events · retention 400 · hash-chained
        </div>
    </div>`;
}
function renderAuditList() {
    const list = $('#auditList'); if (!list) return;
    const rows = state.audit.filter(matchesAuditFilter).slice(0, 150);
    list.innerHTML = rows.length ? rows.map(auditRow).join('') : `<div class="p-8 text-center text-[12px] text-gray-600">No events match this filter.</div>`;
    state.audit.forEach(e => delete e.fresh);
    lucide.createIcons();
}
function exportAudit() {
    const blob = new Blob([JSON.stringify(state.audit, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `control-tower-audit-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('success', 'Audit exported', `${state.audit.length} events written to JSON`);
}

/* ================================================================
   CANDIDATE DRAWER (dossier / trace / context / timeline)
   ================================================================ */
function openDrawer(id) { state.ui.drawerCandidate = id; state.ui.drawerTab = 'overview'; renderDrawer(); $('#drawer').classList.add('open'); }
function closeDrawer() { $('#drawer').classList.remove('open'); state.ui.drawerCandidate = null; }
function drawerTab(t) { state.ui.drawerTab = t; renderDrawer(); }

function renderDrawer() {
    const c = getCandidate(state.ui.drawerCandidate);
    const el = $('#drawer'); if (!el) return;
    if (!c) { el.innerHTML = ''; return; }
    const tab = state.ui.drawerTab || 'overview';
    const exc = c.exceptionId ? getExc(c.exceptionId) : null;
    const req = getReq(c.reqId);

    const tabs = [['overview', 'Dossier'], ['trace', 'Handoffs & Trace'], ['context', 'Context Payload'], ['timeline', 'Timeline']];

    let body = '';
    if (tab === 'overview') {
        body = `
        <div class="space-y-4">
            <div class="flex items-start gap-3">
                <div class="w-12 h-12 rounded-lg bg-gradient-to-br from-blue-600/40 to-violet-600/40 grid place-items-center text-sm font-bold">${initials(c.name)}</div>
                <div class="min-w-0 flex-1">
                    <div class="font-semibold">${esc(c.name)}</div>
                    <div class="text-[12px] text-gray-400">${esc(c.headline)}</div>
                    <div class="text-[11px] text-gray-500">${esc(c.company)} · ${esc(c.location)}</div>
                </div>
                ${scoreRing(c.score, 52)}
            </div>
            ${exc ? `<div class="border border-amber-500/40 bg-amber-500/10 rounded-lg p-3 text-[12px] text-amber-200 flex gap-2">
                <i data-lucide="siren" class="w-4 h-4 shrink-0 text-amber-400"></i>
                <div><b>${EXC_TYPES[exc.type].label}</b> — blocked at ${stageLabel(c.stage)}. ${esc(exc.reason)}</div></div>` : ''}
            <div class="grid grid-cols-2 gap-2 text-[12px]">
                ${[['Requisition', `${c.reqId} — ${esc(req?.title || '—')}`], ['Urgency', req ? req.urgency : '—'],
                   ['Stage', stageLabel(c.stage)], ['Assigned agent', esc(agentName(c.assignedAgent))],
                   ['Created', fmtAgo(c.createdAt)], ['Status', c.status === 'waiting' ? 'Awaiting human' : c.status === 'done' ? 'Complete' : 'In flight']]
                .map(([k, v]) => `<div class="bg-gray-900/70 border border-gray-800 rounded-lg p-2.5">
                    <div class="text-[10px] uppercase tracking-wider text-gray-600">${k}</div>
                    <div class="text-gray-200 mt-0.5">${v}</div></div>`).join('')}
            </div>
            <div>
                <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Skills</div>
                <div class="flex flex-wrap gap-1.5">${c.skills.map(s => `<span class="text-[11px] px-2 py-0.5 rounded bg-blue-500/10 text-blue-300 border border-blue-500/25">${esc(s)}</span>`).join('')}</div>
            </div>
            ${drawerAiCard(c, req)}
            ${c.verification ? `
            <div class="border border-gray-800 rounded-lg p-3">
                <div class="flex justify-between text-[11px] mb-1.5"><span class="text-gray-500">Verification</span>
                    <span class="font-bold" style="color:${scoreColor(c.verification.score)}">${c.verification.score}/100 · conf ${c.verification.confidence}</span></div>
                ${scoreGauge(c.verification.score, state.rules.scoreThreshold)}
                <p class="text-[12px] text-gray-400 mt-2">${esc(c.verification.summary)}</p>
                ${c.verification.flags?.length ? `<ul class="mt-2 space-y-1">${c.verification.flags.map(f => `<li class="text-[11.5px] text-amber-300 flex gap-1.5"><i data-lucide="flag" class="w-3 h-3 mt-0.5"></i>${esc(f)}</li>`).join('')}</ul>` : ''}
                <div class="text-[11px] text-gray-600 mt-2 font-mono">github: ${c.verification.github?.repos} repos · ${c.verification.github?.commits24h} commits/24h</div>
            </div>` : ''}
            ${c.outreach?.state && c.outreach.state !== 'not_started' ? `
            <div class="border border-gray-800 rounded-lg p-3">
                <div class="flex justify-between text-[11px] mb-2"><span class="text-gray-500">Outreach</span>
                    <span class="font-mono ${c.outreach.state === 'replied' ? 'text-emerald-400' : c.outreach.state === 'sent' ? 'text-blue-400' : 'text-amber-400'}">${c.outreach.state}</span></div>
                <div class="text-[12px] font-semibold mb-1">${esc(c.outreach.subject || '')}</div>
                <p class="text-[12px] text-gray-400 leading-relaxed">${esc(c.outreach.body || '')}</p>
                ${c.outreach.reply ? `<blockquote class="mt-2 text-[12px] italic text-gray-300 border-l-2 border-emerald-500/50 pl-2.5 bg-emerald-500/5 py-1.5 rounded-r">“${esc(c.outreach.reply)}”</blockquote>` : ''}
                ${c.outreach.approvedBy ? `<div class="text-[11px] text-emerald-400 mt-2">✓ approved by ${esc(c.outreach.approvedBy)}</div>` : ''}
            </div>` : ''}
            ${c.scheduling?.state && c.scheduling.state !== 'none' ? `
            <div class="border border-gray-800 rounded-lg p-3">
                <div class="flex justify-between text-[11px] mb-2"><span class="text-gray-500">Scheduling</span>
                    <span class="font-mono ${c.scheduling.state === 'booked' ? 'text-emerald-400' : 'text-blue-400'}">${c.scheduling.state}</span></div>
                ${c.scheduling.slots ? `<div class="flex flex-wrap gap-1.5 mb-1.5">${c.scheduling.slots.map(s => `<span class="text-[11px] px-2 py-0.5 rounded bg-gray-800 border border-gray-700">${esc(s)}</span>`).join('')}</div>` : ''}
                ${c.scheduling.interview ? `<div class="text-[12px] text-emerald-300">🎓 ${esc(c.scheduling.interview)}</div>` : ''}
            </div>` : ''}
            ${c.overrides?.length ? `
            <div class="border border-blue-500/30 rounded-lg p-3">
                <div class="text-[10px] uppercase tracking-wider text-blue-400 mb-1.5">Human overrides</div>
                ${c.overrides.map(o => `<div class="text-[11.5px] text-gray-400">“${esc(o.note || 'no note')}” — ${esc(o.by)} · ${fmtAgo(o.at)}</div>`).join('')}
            </div>` : ''}
        </div>`;
    } else if (tab === 'trace') {
        body = `
        <div class="space-y-4">
            <div>
                <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Agent hand-off history</div>
                ${c.handoffs.length ? `<div class="relative border-l border-gray-800 ml-2 space-y-4 pt-1">
                    ${c.handoffs.map(h => `
                    <div class="pl-4 relative">
                        <span class="absolute -left-[5px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500 glow-blue"></span>
                        <div class="text-[12px]"><b class="text-blue-300">${esc(h.from)}</b> <span class="text-gray-600">→</span> <b class="text-violet-300">${esc(h.to)}</b></div>
                        <div class="text-[11px] text-gray-500">${esc(h.note)}</div>
                        <div class="text-[10px] text-gray-600 tabular">${fmtClock(h.at)} · ${fmtAgo(h.at)}</div>
                    </div>`).join('')}
                </div>` : `<div class="text-[12px] text-gray-600">No handoffs yet.</div>`}
            </div>
            <div>
                <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-2">Agent reasoning trace</div>
                <div class="space-y-2">
                    ${c.reasoning.length ? c.reasoning.map(r => `
                    <div class="border border-gray-800 rounded-lg p-2.5 bg-gray-900/60">
                        <div class="flex justify-between text-[10.5px] mb-1">
                            <span class="text-blue-300 font-mono">${esc(r.agent)}</span>
                            <span class="text-gray-600 tabular">${fmtClock(r.at)}</span></div>
                        <div class="text-[12px] text-gray-300 leading-relaxed">${esc(r.text)}</div>
                    </div>`).join('') : '<div class="text-[12px] text-gray-600">No reasoning captured yet.</div>'}
                </div>
            </div>
        </div>`;
    } else if (tab === 'context') {
        const payload = {
            candidate: { id: c.id, name: c.name, headline: c.headline, company: c.company, location: c.location },
            requisition: { id: c.reqId, title: req?.title, urgency: req?.urgency, skills: req?.skills },
            dossier: {
                stage: c.stage, score: c.score, skills: c.skills, experience: c.experience,
                verification: c.verification, outreach_state: c.outreach?.state, scheduling_state: c.scheduling?.state,
            },
            governance: { scoreThreshold: state.rules.scoreThreshold, autoSendScore: state.rules.autoSendScore, execReview: state.rules.execReview },
            last_handoff: c.handoffs.at(-1) || null,
        };
        body = `
        <div class="text-[11px] text-gray-500 mb-2">Context blob passed between agents on each handoff — agents never start cold.</div>
        <pre class="text-[11px] font-mono text-emerald-300/90 bg-gray-950 border border-gray-800 rounded-lg p-3 overflow-x-auto leading-relaxed">${esc(JSON.stringify(payload, null, 2))}</pre>`;
    } else {
        const evts = state.audit.filter(e => e.details.includes(c.id) || e.details.includes(c.name)).slice(0, 60);
        body = `
        <div class="text-[11px] text-gray-500 mb-2">${evts.length} audit events referencing this candidate.</div>
        <div class="space-y-1.5">
            ${evts.length ? evts.map(e => `
            <div class="border border-gray-800 rounded-lg p-2.5 bg-gray-900/60">
                <div class="flex items-center gap-2">${actionBadge(e.action)}
                    <span class="text-[10.5px] text-gray-600 tabular ml-auto">${fmtClock(e.ts)}</span></div>
                <div class="text-[11.5px] text-gray-400 mt-1">${esc(e.details)}</div>
                <div class="text-[10.5px] text-gray-600 mt-0.5">actor: ${esc(e.actor)} · ${esc(e.reqId)}</div>
            </div>`).join('') : '<div class="text-[12px] text-gray-600">No events yet.</div>'}
        </div>`;
    }

    el.innerHTML = `
    <div class="px-4 py-3 border-b border-gray-800 flex items-center gap-3 bg-gray-900/70">
        <div class="min-w-0">
            <div class="text-[10px] uppercase tracking-wider text-gray-500">Candidate dossier</div>
            <div class="font-semibold text-sm truncate">${esc(c.name)} <span class="font-mono text-[10px] text-gray-600">${c.id}</span></div>
        </div>
        <span class="px-2 py-0.5 text-[10px] rounded border ${c.status === 'waiting' ? 'border-amber-500/40 bg-amber-500/10 text-amber-300' : 'border-blue-500/40 bg-blue-500/10 text-blue-300'}">${stageLabel(c.stage)}</span>
        <button class="ml-auto p-1.5 rounded hover:bg-gray-800 text-gray-400 hover:text-white" onclick="closeDrawer()">
            <i data-lucide="x" class="w-4 h-4"></i></button>
    </div>
    <div class="flex border-b border-gray-800 px-2">
        ${tabs.map(([k, l]) => `
        <button class="px-3 py-2 text-[11.5px] border-b-2 transition ${tab === k ? 'border-blue-500 text-blue-400' : 'border-transparent text-gray-500 hover:text-gray-300'}"
            onclick="drawerTab('${k}')">${l}</button>`).join('')}
    </div>
    <div class="flex-1 overflow-y-auto p-4">${body}</div>
    ${exc ? `<div class="p-3 border-t border-amber-500/30 bg-amber-500/[0.07] flex gap-2">
        <button class="flex-1 px-3 py-2 bg-emerald-600 hover:bg-emerald-500 rounded-md text-[12px] font-semibold" onclick="decideException('${exc.id}','APPROVED');renderDrawer()">Approve</button>
        <button class="px-3 py-2 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md text-[12px]" onclick="switchTab('hitl');closeDrawer()">Open in queue →</button>
    </div>` : ''}`;
    lucide.createIcons();
}

/* ---------- Drawer AI copilot card ---------- */
function drawerAiCard(c, req) {
    const busy = c._aiBusy;
    const spin = '<span class="w-3 h-3 border-2 border-violet-200 border-t-transparent rounded-full animate-spin"></span>';
    return `
    <div class="border border-violet-500/30 bg-violet-500/[0.05] rounded-lg p-3">
        <div class="flex items-center gap-2 mb-2">
            <i data-lucide="sparkles" class="w-4 h-4 text-violet-300"></i>
            <span class="text-[10.5px] uppercase tracking-wider text-violet-300 font-semibold">AI copilot</span>
            <span class="ml-auto text-[10px] font-mono ${AIAgent.online ? 'text-emerald-400' : 'text-gray-500'}">${AIAgent.online ? '● ' + esc(AIAgent.model || 'live') : 'offline · templates only'}</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
            <button class="px-2.5 py-1.5 text-[11px] rounded-md border border-violet-500/40 text-violet-200 bg-violet-500/10 hover:bg-violet-500/20 transition flex items-center gap-1.5 ${busy ? 'opacity-60 pointer-events-none' : ''}"
                onclick="aiDrawerDraft()">
                ${busy === 'draft' ? spin + 'Generating…' : `<i data-lucide="sparkles" class="w-3 h-3"></i> ${c.outreach?.body ? 'Rewrite outreach' : 'Draft outreach'}`}</button>
            <button class="px-2.5 py-1.5 text-[11px] rounded-md border border-gray-700 text-gray-300 hover:bg-gray-800 transition flex items-center gap-1.5 ${busy ? 'opacity-60 pointer-events-none' : ''}"
                onclick="aiDrawerNote()">
                ${busy === 'note' ? spin + 'Summarising…' : '<i data-lucide="file-search" class="w-3 h-3"></i> Screening summary'}</button>
        </div>
        ${c._aiDraft ? `
        <div class="mt-2.5 bg-gray-950/70 border border-gray-800 rounded-lg p-2.5">
            <div class="text-[11.5px] font-semibold mb-1">${esc(c._aiDraft.subject)}</div>
            <p class="text-[11.5px] text-gray-400 leading-relaxed whitespace-pre-line">${esc(c._aiDraft.body)}</p>
            <div class="flex gap-1.5 mt-2">
                <button class="px-2.5 py-1 bg-violet-600 hover:bg-violet-500 rounded text-[11px] font-semibold transition" onclick="aiUseDraft()">Use as outreach draft</button>
                <button class="px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[11px] transition" onclick="aiCopyDrawer('draft')">Copy</button>
            </div>
        </div>` : ''}
        ${c._aiNote ? `
        <div class="mt-2.5 bg-gray-950/70 border border-gray-800 rounded-lg p-2.5">
            <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">LLM screening summary</div>
            <p class="text-[11.5px] text-gray-300 leading-relaxed">${esc(c._aiNote)}</p>
            <button class="mt-2 px-2.5 py-1 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded text-[11px] transition" onclick="aiCopyDrawer('note')">Copy</button>
        </div>` : ''}
    </div>`;
}

/* ================================================================
   MODALS
   ================================================================ */
function openModal(html) {
    const root = $('#modalRoot');
    root.classList.remove('hidden'); root.classList.add('flex');
    root.innerHTML = `<div class="w-full max-w-lg glass border border-gray-700 rounded-xl shadow-2xl shadow-black/60 enter" onclick="event.stopPropagation()">${html}</div>`;
    lucide.createIcons();
}
function closeModal() { const r = $('#modalRoot'); r.classList.add('hidden'); r.classList.remove('flex'); r.innerHTML = ''; }

function openReqModal() {
    const t = REQ_TEMPLATES[0];
    openModal(`
        <div class="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
            <i data-lucide="briefcase" class="w-4 h-4 text-blue-400"></i>
            <h3 class="font-semibold text-sm">Trigger New Requisition</h3>
            <span class="ml-auto text-[10px] text-gray-600 font-mono">POST /ats/webhook</span>
        </div>
        <div class="p-5 space-y-3 text-[12px]">
            <label class="block"><span class="text-gray-500 text-[11px]">Role title</span>
                <input id="reqTitle" value="${esc(t.title)}" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 outline-none focus:border-blue-500"></label>
            <div class="grid grid-cols-2 gap-3">
                <label class="block"><span class="text-gray-500 text-[11px]">Urgency</span>
                    <select id="reqUrgency" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 outline-none focus:border-blue-500">
                        ${['P0', 'P1', 'P2'].map(u => `<option ${u === 'P1' ? 'selected' : ''}>${u}</option>`).join('')}
                    </select></label>
                <label class="block"><span class="text-gray-500 text-[11px]">SLA (hours)</span>
                    <input id="reqSla" type="number" value="${t.slaHours}" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 outline-none focus:border-blue-500"></label>
            </div>
            <label class="block"><span class="text-gray-500 text-[11px]">Skills (comma separated)</span>
                <input id="reqSkills" value="${t.skills.join(', ')}" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 outline-none focus:border-blue-500"></label>
            <label class="block"><span class="text-gray-500 text-[11px]">Work mode</span>
                <input id="reqMode" value="${esc(t.mode)}" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 outline-none focus:border-blue-500"></label>
            <label class="flex items-center gap-2 text-gray-400 cursor-pointer pt-1">
                <input id="reqKick" type="checkbox" checked class="accent-blue-500"> Auto-dispatch sourcing agents now</label>
        </div>
        <div class="px-5 py-3 border-t border-gray-800 flex justify-end gap-2">
            <button class="px-4 py-2 text-[12px] text-gray-400 hover:text-white" onclick="closeModal()">Cancel</button>
            <button class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md text-[12px] font-semibold" onclick="submitReq()">Create &amp; Dispatch</button>
        </div>`);
}
async function submitReq() {
    const tpl = {
        title: $('#reqTitle').value.trim() || 'Untitled role',
        urgency: $('#reqUrgency').value,
        slaHours: +$('#reqSla').value || 72,
        skills: $('#reqSkills').value.split(',').map(s => s.trim()).filter(Boolean),
        mode: $('#reqMode').value.trim() || 'Remote',
    };
    const kick = $('#reqKick').checked;
    closeModal();
    const req = createRequisition(tpl, { source: 'manual' });
    toast('success', 'Requisition created', `${req.urgency} · ${req.title}`);
    renderAll();
    if (kick) {
        toast('info', 'Dispatching sourcing agents', `${req.id} → priority engine`);
        for (let i = 0; i < 3; i++) {
            const c = await sourceCandidate(req);
            if (c) progressCandidate(c);
        }
    }
}

function openOverrideModal(excId) {
    const e = getExc(excId); if (!e) return;
    const isDraft = e.type === 'DRAFT_REVIEW';
    openModal(`
        <div class="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
            <i data-lucide="pencil" class="w-4 h-4 text-blue-400"></i>
            <h3 class="font-semibold text-sm">Override decision · ${e.id}</h3>
        </div>
        <div class="p-5 space-y-3 text-[12px]">
            <p class="text-gray-400">${isDraft
                ? 'Edit the outreach draft below. Your version will be sent and recorded as a human override in the audit trail.'
                : 'Record why you are releasing this candidate despite the flag. Override rate is tracked per recruiter.'}</p>
            ${isDraft ? `
            <label class="block"><span class="text-gray-500 text-[11px]">Subject</span>
                <input id="ovSubject" value="${esc(e.detail.subject || '')}" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 outline-none focus:border-blue-500"></label>
            <label class="block"><span class="text-gray-500 text-[11px]">Email body</span>
                <textarea id="ovBody" rows="5" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 outline-none focus:border-blue-500 leading-relaxed">${esc(e.detail.body || '')}</textarea></label>` : ''}
            ${e.type === 'LOW_CONFIDENCE' ? `
            <label class="block"><span class="text-gray-500 text-[11px]">Adjusted score (optional)</span>
                <input id="ovScore" type="number" min="0" max="100" value="${e.detail.score}" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 outline-none focus:border-blue-500"></label>` : ''}
            <label class="block"><span class="text-gray-500 text-[11px]">Override note (required for audit)</span>
                <textarea id="ovNote" rows="2" placeholder="e.g. portfolio compensates for timeline gap"
                    class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 outline-none focus:border-blue-500">${isDraft ? '' : 'Reviewed manually — releasing with conditions.'}</textarea></label>
            <div id="ovErr" class="text-red-400 text-[11.5px] hidden">A note is required for every override.</div>
        </div>
        <div class="px-5 py-3 border-t border-gray-800 flex justify-end gap-2">
            <button class="px-4 py-2 text-[12px] text-gray-400 hover:text-white" onclick="closeModal()">Cancel</button>
            <button class="px-4 py-2 bg-blue-600 hover:bg-blue-500 rounded-md text-[12px] font-semibold" onclick="submitOverride('${excId}')">Confirm override</button>
        </div>`);
}
function submitOverride(excId) {
    const note = $('#ovNote')?.value.trim();
    if (!note) { $('#ovErr')?.classList.remove('hidden'); $('#ovNote')?.classList.add('shake'); setTimeout(() => $('#ovNote')?.classList.remove('shake'), 450); return; }
    const extra = { note };
    if ($('#ovBody')) extra.body = $('#ovBody').value;
    if ($('#ovSubject')) extra.subject = $('#ovSubject').value;
    if ($('#ovScore')) extra.newScore = clamp(+$('#ovScore').value, 0, 100);
    closeModal();
    decideException(excId, 'OVERRIDDEN', note, extra);
}

function openReassignModal(excId) {
    const e = getExc(excId); if (!e) return;
    const c = getCandidate(e.candidateId);
    const role = STAGES.find(s => s.key === (c?.stage || 'SCREENING'))?.role;
    const pool = state.agents.filter(a => a.type === 'ai' && a.enabled && a.role === role && a.id !== e.agentId);
    openModal(`
        <div class="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
            <i data-lucide="repeat" class="w-4 h-4 text-violet-400"></i>
            <h3 class="font-semibold text-sm">Re-assign task · ${e.id}</h3>
        </div>
        <div class="p-5 space-y-3 text-[12px]">
            <p class="text-gray-400">Route this ${stageLabel(c?.stage || 'SCREENING').toLowerCase()} task to a different ${role} agent. The receiving agent inherits the full candidate dossier.</p>
            ${pool.length ? `
            <div class="space-y-2">
                ${pool.map((a, i) => `
                <label class="flex items-center gap-3 border border-gray-700 rounded-lg p-3 cursor-pointer hover:border-blue-500/50 ${i === 0 ? 'border-blue-500/50 bg-blue-500/5' : ''}">
                    <input type="radio" name="reassign" value="${a.id}" ${i === 0 ? 'checked' : ''} class="accent-blue-500">
                    <div class="flex-1">
                        <div class="font-medium">${esc(a.name)} <span class="font-mono text-[10px] text-gray-600">${a.id}</span></div>
                        <div class="text-[11px] text-gray-500">${a.spec} · load ${a.activeTasks}/${a.capacity} · ${(a.successRate * 100).toFixed(1)}%</div>
                    </div>
                    ${autonomyBadge(a.permissions)}
                </label>`).join('')}
            </div>` : `<div class="text-amber-400">No alternative ${role} agent is available. Enable one in the Registry.</div>`}
        </div>
        <div class="px-5 py-3 border-t border-gray-800 flex justify-end gap-2">
            <button class="px-4 py-2 text-[12px] text-gray-400 hover:text-white" onclick="closeModal()">Cancel</button>
            ${pool.length ? `<button class="px-4 py-2 bg-violet-600 hover:bg-violet-500 rounded-md text-[12px] font-semibold" onclick="submitReassign('${excId}')">Re-assign</button>` : ''}
        </div>`);
}
function submitReassign(excId) {
    const sel = document.querySelector('input[name="reassign"]:checked');
    if (!sel) return;
    const target = sel.value;
    closeModal();
    decideException(excId, 'REASSIGNED', '', { target });
}

function openRejectModal(excId) {
    const e = getExc(excId); if (!e) return;
    openModal(`
        <div class="px-5 py-4 border-b border-gray-800 flex items-center gap-2">
            <i data-lucide="x-octagon" class="w-4 h-4 text-red-400"></i>
            <h3 class="font-semibold text-sm">Reject candidate · ${e.id}</h3>
        </div>
        <div class="p-5 space-y-3 text-[12px]">
            <p class="text-gray-400">This removes <b class="text-white">${esc(e.title.split('·')[0].trim())}</b> from the pipeline and releases the held agent. The decision is written to the audit trail.</p>
            <label class="block"><span class="text-gray-500 text-[11px]">Reason (required)</span>
                <textarea id="rjNote" rows="2" placeholder="e.g. seniority below level bar" class="mt-1 w-full bg-gray-900 border border-gray-700 rounded-md px-3 py-2 outline-none focus:border-blue-500"></textarea></label>
            <div id="rjErr" class="text-red-400 text-[11.5px] hidden">A reason is required.</div>
        </div>
        <div class="px-5 py-3 border-t border-gray-800 flex justify-end gap-2">
            <button class="px-4 py-2 text-[12px] text-gray-400 hover:text-white" onclick="closeModal()">Cancel</button>
            <button class="px-4 py-2 bg-red-600 hover:bg-red-500 rounded-md text-[12px] font-semibold" onclick="submitReject('${excId}')">Reject candidate</button>
        </div>`);
}
function submitReject(excId) {
    const note = $('#rjNote')?.value.trim();
    if (!note) { $('#rjErr')?.classList.remove('hidden'); $('#rjNote')?.classList.add('shake'); setTimeout(() => $('#rjNote')?.classList.remove('shake'), 450); return; }
    closeModal();
    decideException(excId, 'REJECTED', note);
}

/* ================================================================
   HEADER / SIM CONTROLS
   ================================================================ */
function updateSimControls() {
    const btn = $('#simBtn'), label = $('#simBtnLabel'), pause = $('#pauseBtn');
    if (!btn) return;
    if (SIM.running) {
        btn.className = 'px-4 py-2 bg-gray-800 hover:bg-red-600/80 border border-gray-700 rounded-md text-sm font-semibold transition flex items-center gap-2';
        btn.innerHTML = `<i data-lucide="square" class="w-4 h-4"></i><span id="simBtnLabel">Stop Simulation</span>`;
    } else {
        btn.className = 'px-4 py-2 bg-green-600 hover:bg-green-500 rounded-md text-sm font-semibold transition flex items-center gap-2 shadow-lg shadow-green-600/20';
        btn.innerHTML = `<i data-lucide="play" class="w-4 h-4"></i><span id="simBtnLabel">Simulate Live Pipeline</span>`;
    }
    if (pause) pause.disabled = !SIM.running;
    const sp = $('#speedBtn'); if (sp) sp.textContent = SIM.speed + '×';
    lucide.createIcons();
}
