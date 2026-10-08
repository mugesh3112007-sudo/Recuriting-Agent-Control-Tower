/* ============================================================
   integrations.js — ATS / CRM / communications integrations (SW-06)
   Connection health, sync actions, test messages, webhook feed.
   ============================================================ */

const INT_STATUS = {
    CONNECTED:   { label: 'Connected',    dot: 'bg-emerald-500', text: 'text-emerald-300 border-emerald-500/40 bg-emerald-500/10' },
    DEGRADED:    { label: 'Degraded',     dot: 'bg-amber-500',   text: 'text-amber-300 border-amber-500/40 bg-amber-500/10' },
    ERROR:       { label: 'Failing',      dot: 'bg-red-500',     text: 'text-red-300 border-red-500/40 bg-red-500/10' },
    DISCONNECTED:{ label: 'Disconnected', dot: 'bg-gray-600',    text: 'text-gray-400 border-gray-600 bg-gray-700/30' },
};

const getIntegration = id => state.integrations.find(i => i.id === id);

function renderIntegrations() {
    const list = state.integrations;
    const up = list.filter(i => i.status === 'CONNECTED').length;
    const warn = list.filter(i => i.status === 'DEGRADED' || i.status === 'ERROR').length;
    const records = list.reduce((s, i) => s + i.records, 0);
    const lastEvent = state.audit.find(e => e.action === 'INTEGRATION');

    return `
    <div class="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
            <h2 class="text-sm font-semibold flex items-center gap-2"><i data-lucide="plug" class="w-4 h-4 text-teal-400"></i> ATS · CRM · Communications Integrations</h2>
            <p class="text-[11px] text-gray-500">Connected systems the agent fleet reads from and writes to — ${up}/${list.length} healthy · ${warn} need attention · ${records} records synced</p>
        </div>
        <div class="flex gap-1.5">
            <button class="px-3 py-1.5 text-[11px] rounded-md border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition flex items-center gap-1.5"
                onclick="testAllIntegrations()"><i data-lucide="activity" class="w-3.5 h-3.5"></i> Test all</button>
            <button class="px-3 py-1.5 text-[11px] rounded-md bg-teal-600 hover:bg-teal-500 text-white font-medium transition flex items-center gap-1.5"
                onclick="syncAllIntegrations()"><i data-lucide="refresh-cw" class="w-3.5 h-3.5"></i> Sync all</button>
        </div>
    </div>

    <div class="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        ${list.map(integrationCard).join('')}
    </div>

    <section class="mt-5 glass border border-gray-800 rounded-xl overflow-hidden">
        <div class="px-4 py-2.5 border-b border-gray-800 flex items-center gap-2">
            <i data-lucide="radio" class="w-4 h-4 text-teal-400"></i>
            <span class="text-[12px] font-semibold text-gray-300">Inbound webhook receiver</span>
            <span class="ml-auto text-[10.5px] font-mono text-emerald-400">● listening</span>
        </div>
        <div class="p-4 grid md:grid-cols-2 gap-4 text-[11.5px]">
            <div>
                <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Endpoint</div>
                <div class="font-mono text-teal-300/90 break-all">https://hooks.control-tower.local/v1/events</div>
                <div class="text-gray-500 mt-2">Subscribed events</div>
                <div class="flex flex-wrap gap-1.5 mt-1">
                    ${['job.created', 'candidate.stage_changed', 'reply.received', 'interview.completed', 'offer.accepted']
                        .map(ev => `<span class="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-800 border border-gray-700 text-gray-400">${ev}</span>`).join('')}
                </div>
            </div>
            <div>
                <div class="text-[10px] uppercase tracking-wider text-gray-500 mb-1">Last inbound event</div>
                ${lastEvent ? `
                <div class="text-gray-300">${esc(lastEvent.details).slice(0, 140)}</div>
                <div class="text-gray-600 mt-1 font-mono text-[10.5px]">${fmtClock(lastEvent.ts)} · ${fmtAgo(lastEvent.ts)} · 200 OK</div>` : `
                <div class="text-gray-500">No webhook events yet this session.</div>`}
                <div class="text-gray-500 mt-2">Delivery retries: exponential backoff ×3 · dead-letter queue empty</div>
            </div>
        </div>
    </section>`;
}

function integrationCard(i) {
    const st = INT_STATUS[i.status] || INT_STATUS.DISCONNECTED;
    const isComms = i.cat === 'COMMS';
    const primary = isComms
        ? { label: 'Send test', icon: 'send', fn: `sendTestMessage('${i.id}')` }
        : { label: 'Sync now', icon: 'refresh-cw', fn: `syncIntegration('${i.id}')` };
    const busy = i._busy;

    return `
    <article class="glass border ${i.status === 'ERROR' ? 'border-red-500/40' : 'border-gray-800'} rounded-xl p-4 flex flex-col enter">
        <div class="flex items-start gap-3">
            <div class="w-9 h-9 rounded-lg grid place-items-center border ${st.text}">
                <i data-lucide="${i.icon}" class="w-4 h-4"></i>
            </div>
            <div class="min-w-0 flex-1">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="font-semibold text-[13px]">${esc(i.name)}</span>
                    <span class="text-[9.5px] px-1.5 py-0.5 rounded border border-gray-700 text-gray-500 font-mono">${i.cat}</span>
                </div>
                <div class="text-[11px] text-gray-500 leading-snug">${esc(i.desc)}</div>
            </div>
            <span class="px-2 py-0.5 text-[10px] font-semibold border rounded-full flex items-center gap-1.5 ${st.text} shrink-0">
                <span class="w-1.5 h-1.5 rounded-full ${st.dot} ${i.status === 'CONNECTED' ? 'animate-pulse' : ''}"></span>${st.label}</span>
        </div>

        <div class="grid grid-cols-3 gap-2 mt-3">
            ${[['Records', i.records.toLocaleString(), 'text-gray-200'],
               ['Last sync', i.lastSync ? fmtAgo(i.lastSync) : 'never', i.status === 'CONNECTED' ? 'text-gray-200' : 'text-gray-500'],
               ['Latency', i.latency ? i.latency + 'ms' : '—', i.latency > 900 ? 'text-amber-400' : 'text-gray-200']]
            .map(([k, v, cls]) => `
            <div class="bg-gray-900/70 border border-gray-800 rounded-lg px-2 py-1.5 text-center">
                <div class="text-[9.5px] uppercase tracking-wider text-gray-600">${k}</div>
                <div class="text-[12px] font-semibold tabular ${cls} mt-0.5">${v}</div>
            </div>`).join('')}
        </div>

        <div class="mt-2.5 text-[10.5px] font-mono text-gray-600 truncate" title="${esc(i.endpoint)}">${esc(i.endpoint)}</div>
        ${i.auth && /expired/i.test(i.auth) ? `<div class="text-[10.5px] text-red-400 mt-1">⚠ ${esc(i.auth)}</div>` : ''}

        <div class="flex gap-1.5 mt-3 pt-3 border-t border-gray-800">
            <button class="flex-1 px-2 py-1.5 text-[11px] rounded-md border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition flex items-center justify-center gap-1.5 ${busy === 'test' ? 'opacity-60 pointer-events-none' : ''}"
                onclick="testIntegration('${i.id}')">
                ${busy === 'test' ? '<span class="w-3 h-3 border-2 border-gray-400 border-t-transparent rounded-full animate-spin"></span> Testing…' : '<i data-lucide="activity" class="w-3 h-3"></i> Test'}</button>
            <button class="flex-1 px-2 py-1.5 text-[11px] rounded-md bg-teal-600/90 hover:bg-teal-500 text-white font-medium transition flex items-center justify-center gap-1.5 ${busy === 'sync' || busy === 'connect' ? 'opacity-60 pointer-events-none' : ''}"
                onclick="${busy === 'sync' || busy === 'connect' ? '' : primary.fn}">
                ${busy === 'sync' || busy === 'connect'
                    ? '<span class="w-3 h-3 border-2 border-white/70 border-t-transparent rounded-full animate-spin"></span> Working…'
                    : `<i data-lucide="${primary.icon}" class="w-3 h-3"></i> ${i.status === 'DISCONNECTED' ? 'Connect' : primary.label}`}</button>
            <button class="px-2 py-1.5 text-[11px] rounded-md border border-gray-700 text-gray-400 hover:text-red-300 hover:border-red-500/40 transition"
                onclick="toggleIntegration('${i.id}')" title="${i.status === 'DISCONNECTED' ? 'Connect' : 'Disconnect'} ${esc(i.name)}">
                <i data-lucide="${i.status === 'DISCONNECTED' ? 'link' : 'unlink'}" class="w-3 h-3"></i></button>
        </div>
    </article>`;
}

/* ---------------- Actions ---------------- */

async function testIntegration(id) {
    const i = getIntegration(id);
    if (!i || i._busy) return;
    if (i.status === 'DISCONNECTED') { toast('error', 'Connection refused', `${i.name} is disconnected — connect it first`); return; }
    i._busy = 'test';
    renderIf('integrations');
    await sleep(rand(350, 900));
    i.latency = Math.round(rand(70, 420));
    i.lastChecked = Date.now();
    if (i.status === 'ERROR') i.status = 'DEGRADED';
    i._busy = null;
    const ok = i.status !== 'ERROR';
    log('INTEGRATION', null, `${i.name} health check ${ok ? 'OK' : 'failed'} · ${i.latency}ms · auth: ${i.auth}`, 'ControlTower', 'ai');
    toast(ok ? 'success' : 'error', `${i.name} · ${i.latency}ms`, `Status: ${(INT_STATUS[i.status] || {}).label}`);
    renderIf('integrations', 'dashboard');
}

async function syncIntegration(id) {
    const i = getIntegration(id);
    if (!i || i._busy) return;
    if (i.status === 'DISCONNECTED') { toast('error', 'Sync skipped', `${i.name} is disconnected`); return; }
    i._busy = 'sync';
    renderIf('integrations');
    await sleep(rand(600, 1400));
    const n = Math.round(rand(3, 14));
    i.records += n;
    i.lastSync = Date.now();
    i._busy = null;

    let reqId = null;
    if (i.cat === 'ATS' && Math.random() > 0.55) {
        const tpl = pick(REQ_TEMPLATES);
        reqId = createRequisition(tpl, { source: i.name }).id;
    }
    log('INTEGRATION', reqId,
        `Sync from ${i.name}: ${n} records pulled${reqId ? ` · new requisition ${reqId} ingested` : ''} · deltas applied`,
        'ControlTower', 'ai');
    toast('success', `${i.name} synced`, `+${n} records${reqId ? ' · 1 new requisition' : ''}`);
    renderAll();
}

async function sendTestMessage(id) {
    const i = getIntegration(id);
    if (!i || i._busy) return;
    if (i.status === 'DISCONNECTED') { toast('error', 'Not connected', `${i.name} is disconnected`); return; }
    i._busy = 'sync';
    renderIf('integrations');
    await sleep(rand(300, 700));
    i._busy = null;
    i.lastSync = Date.now();
    const ms = Math.round(rand(60, 260));
    log('INTEGRATION', null, `Test message delivered via ${i.name} → ${esc(i.endpoint).split('·')[0].trim()} · round-trip ${ms}ms`, 'ControlTower', 'ai');
    toast('success', `${i.name} · delivered`, `Test message round-trip ${ms}ms`);
    renderIf('integrations');
}

async function toggleIntegration(id) {
    const i = getIntegration(id);
    if (!i || i._busy) return;
    if (i.status === 'DISCONNECTED') {
        i._busy = 'connect';
        renderIf('integrations');
        await sleep(rand(500, 1100));
        i.status = 'CONNECTED';
        i.latency = Math.round(rand(90, 320));
        i.lastSync = Date.now();
        if (/expired/i.test(i.auth || '')) i.auth = i.auth.replace(/expired.*/i, 're-authorized just now');
        i._busy = null;
        log('INTEGRATION', null, `${i.name} connected · ${i.auth} · ${i.latency}ms handshake`, 'Laura Kim', 'human');
        toast('success', `${i.name} connected`, 'Handshake OK · sync armed');
    } else {
        const was = i.status;
        i.status = 'DISCONNECTED';
        log('INTEGRATION', null, `${i.name} disconnected by operator (was ${was}) · agents will skip this source`, 'Laura Kim', 'human');
        toast('info', `${i.name} disconnected`, 'Agents skip this source until reconnected');
    }
    renderAll();
}

async function testAllIntegrations() {
    const targets = state.integrations.filter(i => i.status !== 'DISCONNECTED' && !i._busy);
    if (!targets.length) { toast('info', 'Nothing to test', 'All integrations are disconnected'); return; }
    toast('info', 'Fleet test running', `${targets.length} integrations being checked…`);
    await Promise.all(targets.map(i => testIntegration(i.id)));
}

async function syncAllIntegrations() {
    const targets = state.integrations.filter(i => i.status === 'CONNECTED' && !i._busy);
    if (!targets.length) { toast('info', 'Nothing to sync', 'No healthy integrations connected'); return; }
    toast('info', 'Fleet sync running', `${targets.length} sources…`);
    await Promise.all(targets.map(i => syncIntegration(i.id)));
}

window.renderIntegrations = renderIntegrations;
window.testIntegration = testIntegration;
window.syncIntegration = syncIntegration;
window.sendTestMessage = sendTestMessage;
window.toggleIntegration = toggleIntegration;
window.testAllIntegrations = testAllIntegrations;
window.syncAllIntegrations = syncAllIntegrations;
