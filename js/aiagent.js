/* ============================================================
   aiagent.js — real LLM agent layer (SW-06)
   Frontend → server.py (/api/agent/*) → local OmniRoute gateway.
   The API key stays server-side. Every skill falls back to the
   scripted template when the agent runtime is offline.
   ============================================================ */

const AIAgent = {
    online: null,      // null = not checked yet
    model: null,
    calls: 0,
    lastMs: 0,
    lastTask: null,
    lastError: null,

    async health() {
        try {
            const r = await fetch('/api/agent/health', { cache: 'no-store' });
            const d = await r.json();
            this.online = !!d.ok;
            if (d.model) this.model = d.model;
            this.lastError = d.ok ? null : d.error;
        } catch {
            this.online = false;
            this.lastError = 'server.py not running';
        }
        paintAIStatus();
        return this.online;
    },

    async generate({ system, prompt, task = 'general', maxTokens = 420, temperature = 0.4 }) {
        try {
            const ctrl = (typeof AbortSignal !== 'undefined' && AbortSignal.timeout) ? AbortSignal.timeout(75000) : undefined;
            const r = await fetch('/api/agent/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ system, prompt, max_tokens: maxTokens, temperature }),
                signal: ctrl,
            });
            const d = await r.json().catch(() => ({}));
            if (!r.ok || !d.ok) throw new Error(d.error || `HTTP ${r.status}`);
            const text = String(d.text || '').trim();
            if (!text) throw new Error('empty completion');
            this.online = true;
            this.model = d.model || this.model;
            this.calls++;
            this.lastMs = d.ms;
            this.lastTask = task;
            this.lastError = null;
            paintAIStatus();
            return text;
        } catch (e) {
            this.online = false;
            this.lastError = String(e.message || e);
            paintAIStatus();
            throw e;
        }
    },

    /* ---------- Skills ---------- */

    /** Governance recommendation for a HITL exception → {decision, confidence, reason} */
    async hitlRecommendation(exc) {
        const c = getCandidate(exc.candidateId);
        const req = getReq(exc.reqId);
        const r = state.rules;
        const system = `You are the governance copilot inside "Recruiting Agent Control Tower", an orchestrator for recruiting AI agents.
You advise the human recruiter on a human-in-the-loop exception raised by an AI agent.
Be evidence-driven and conservative: recommend APPROVED only when the evidence clearly supports release; prefer OVERRIDDEN/REJECTED when signals are weak or policy-relevant.
Reply with STRICT JSON only, no markdown, no prose:
{"decision":"APPROVED|OVERRIDDEN|REJECTED|REASSIGNED","confidence":<integer 0-100>,"reason":"<max 2 short sentences>"}`;
        const prompt = `Exception ${exc.id} (${exc.type}, severity ${exc.severity})
Title: ${exc.title}
Raised by agent: ${agentName(exc.agentId)} (${esc(exc.reason)})
Detail: ${JSON.stringify(exc.detail)}
Candidate: ${c ? `${c.name} — ${c.headline} @ ${c.company} · score ${c.score ?? 'n/a'}/100 · stage ${c.stage}` : 'unknown'}
Requisition: ${req ? `${req.id} ${req.title} (${req.urgency}, SLA ${req.slaHours}h)` : exc.reqId}
Active policy: scoreThreshold ${r.scoreThreshold} · autoSendScore ${r.autoSendScore} · sentimentSensitivity ${r.sentimentSensitivity} · execReview ${r.execReview}`;
        const text = await this.generate({ task: 'hitl-advice', system, prompt, maxTokens: 280, temperature: 0.2 });
        const j = extractJSON(text);
        if (!j || !j.decision) throw new Error('unparseable recommendation');
        const allowed = ['APPROVED', 'OVERRIDDEN', 'REJECTED', 'REASSIGNED'];
        const decision = String(j.decision).toUpperCase();
        return {
            decision: allowed.includes(decision) ? decision : 'APPROVED',
            confidence: Number.isFinite(+j.confidence) ? Math.round(+j.confidence) : null,
            reason: String(j.reason || text).replace(/\s+/g, ' ').slice(0, 420),
        };
    },

    /** Personalised outreach email for a candidate → {subject, body} */
    async draftOutreach(c, req) {
        const system = `You are "Echo", the outreach-writing agent inside a recruiting control tower.
Write a warm, specific, peer-to-peer recruiting email that references the candidate's ACTUAL work (skills, company, achievements) — never generic filler.
Rules: subject ≤ 9 words and concrete; body ≤ 80 words; exactly one clear call-to-action (a short call); no buzzwords, no emoji, no em-dash chains; sign off as "— Priya, Talent @ Acme".
Reply with STRICT JSON only:
{"subject":"...","body":"..."}`;
        const prompt = `Candidate: ${c.name} — ${c.headline} @ ${c.company} (${c.location})
Skills: ${c.skills.join(', ')}. Experience: ${c.experience}.
Verification: ${c.verification ? `${c.verification.score}/100 — ${c.verification.summary}` : 'in progress'}.
Role: ${req ? `${req.title} (${req.urgency}) · required skills: ${req.skills.join(', ')} · mode: ${req.mode}` : c.reqId}
Write the outreach email now.`;
        const text = await this.generate({ task: 'outreach-draft', system, prompt, maxTokens: 340, temperature: 0.7 });
        const j = extractJSON(text);
        const subject = j && j.subject ? String(j.subject).trim() : '';
        const body = j && j.body ? String(j.body).trim() : '';
        if (!subject || !body) throw new Error('unparseable draft');
        return { subject: subject.slice(0, 140), body: body.slice(0, 900) };
    },

    /** Screening/fit summary for the dossier → string */
    async screenSummary(c, req) {
        const system = `You are "Verify-7", the screening agent inside a recruiting control tower.
Summarise candidate fit for the role in at most 60 words: strengths, gaps, and a clear hire/no-hire lean. Plain prose, no headings, no lists.`;
        const prompt = `Candidate: ${c.name} — ${c.headline} @ ${c.company}. Skills: ${c.skills.join(', ')}. Experience: ${c.experience}.
${c.verification ? `Verification: ${c.verification.score}/100 (conf ${c.verification.confidence}) — ${c.verification.summary} Flags: ${(c.verification.flags || []).join('; ') || 'none'}.` : ''}
Role: ${req ? `${req.title} · required: ${req.skills.join(', ')}` : c.reqId}`;
        return this.generate({ task: 'screen-summary', system, prompt, maxTokens: 160, temperature: 0.4 });
    },

    /** Suggested human reply to a guarded candidate → string */
    async replySuggestion(exc) {
        const c = getCandidate(exc.candidateId);
        const system = `You are a senior technical recruiter drafting a reply to a candidate who asked guarded questions (compensation, remote policy, on-call).
Answer warmly and honestly without inventing numbers: acknowledge the questions, give a concrete next step, and offer a short call to discuss specifics. ≤ 70 words, plain prose.`;
        const prompt = `Candidate: ${c ? c.name : 'candidate'} replied: "${exc.detail.reply || ''}"
Signals detected: ${(exc.detail.signals || []).join(', ')}. Sentiment: ${exc.detail.sentiment ?? 'n/a'}.
Role context: ${(getReq(exc.reqId) || {}).title || exc.reqId}. Draft the reply.`;
        const text = await this.generate({ task: 'reply-suggestion', system, prompt, maxTokens: 200, temperature: 0.6 });
        const j = extractJSON(text);
        return String((j && j.reply) || text).trim().slice(0, 800);
    },
};

/* ---------- helpers ---------- */
function extractJSON(text) {
    if (!text) return null;
    const t = String(text).replace(/```(?:json)?/gi, '').trim();
    const s = t.indexOf('{'), e = t.lastIndexOf('}');
    if (s === -1 || e <= s) return null;
    try { return JSON.parse(t.slice(s, e + 1)); } catch { return null; }
}

function paintAIStatus() {
    const el = document.getElementById('hdrAI');
    if (el) {
        if (AIAgent.online === true) {
            el.className = 'text-emerald-400';
            el.textContent = `AI ● LIVE`;
            el.title = `${AIAgent.model || 'llm'} · ${AIAgent.calls} calls · last ${AIAgent.lastMs}ms`;
        } else if (AIAgent.online === false) {
            el.className = 'text-red-400';
            el.textContent = `AI ● OFFLINE`;
            el.title = AIAgent.lastError || 'start server.py to enable the LLM agent';
        } else {
            el.className = 'text-gray-500';
            el.textContent = `AI ● …`;
        }
    }
    if (typeof renderIf === 'function') renderIf('registry');
}

function aiOfflineToast() {
    toast('error', 'AI agent offline', AIAgent.lastError || 'start the runtime: python3 server.py');
}
function howToConnect() {
    toast('info', 'Connect the AI runtime', 'Run: python3 server.py  — it proxies LLM calls to the local OmniRoute gateway (model auto/fast).');
}

/* ---------- shared banners ---------- */
function aiBusyBar(txt) {
    return `<div class="mb-3 flex items-center gap-2.5 text-[12px] text-blue-300 border border-blue-500/30 bg-blue-500/5 rounded-lg px-3 py-2">
        <span class="w-3.5 h-3.5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin shrink-0"></span>${esc(txt)}</div>`;
}

function aiRecBanner(e) {
    const rec = e._ai;
    const tone = rec.decision === 'REJECTED' ? 'red' : rec.decision === 'APPROVED' ? 'emerald' : 'blue';
    return `
    <div class="mb-3 border border-violet-500/40 bg-violet-500/[0.07] rounded-lg overflow-hidden">
        <div class="px-3 py-1.5 border-b border-violet-500/20 flex items-center gap-2 text-[11px] text-violet-200">
            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> AI recommendation
            <span class="ml-auto font-mono text-[10px] text-gray-500">${esc(AIAgent.model || 'llm')} · ${AIAgent.lastMs}ms</span>
        </div>
        <div class="px-3 py-2.5">
            <div class="flex items-center gap-2 mb-1.5">
                <span class="px-2 py-0.5 text-[11px] font-bold rounded border border-${tone}-500/40 text-${tone}-300 bg-${tone}-500/10">${rec.decision}</span>
                ${rec.confidence != null ? `<span class="text-[11px] text-gray-500">confidence <b class="text-gray-200 tabular">${rec.confidence}%</b></span>` : ''}
            </div>
            <p class="text-[12px] text-gray-300 leading-relaxed">${esc(rec.reason)}</p>
            <button class="mt-2.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-500 rounded-md text-[11.5px] font-semibold transition"
                onclick="aiApply('${e.id}')">Apply ${rec.decision}</button>
        </div>
    </div>`;
}

function aiReplyBanner(e) {
    return `
    <div class="mb-3 border border-sky-500/40 bg-sky-500/[0.07] rounded-lg overflow-hidden">
        <div class="px-3 py-1.5 border-b border-sky-500/20 flex items-center gap-2 text-[11px] text-sky-200">
            <i data-lucide="sparkles" class="w-3.5 h-3.5"></i> Suggested reply (for reference — policy requires a human-authored send)
            <span class="ml-auto font-mono text-[10px] text-gray-500">${AIAgent.lastMs}ms</span>
        </div>
        <div class="px-3 py-2.5">
            <p class="text-[12px] text-gray-300 leading-relaxed italic">“${esc(e._aiReply)}”</p>
            <button class="mt-2 px-3 py-1.5 bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded-md text-[11.5px] transition"
                onclick="aiCopy('${e.id}')">Copy text</button>
        </div>
    </div>`;
}

/* ---------- HITL actions ---------- */
async function aiRecommend(excId) {
    const e = getExc(excId);
    if (!e || e._aiBusy) return;
    e._aiBusy = 'rec';
    renderIf('hitl');
    try {
        const rec = await AIAgent.hitlRecommendation(e);
        e._ai = rec;
        toast('success', 'AI recommendation ready', `${rec.decision} · confidence ${rec.confidence ?? '—'}%`);
        log('AI_RECOMMEND', e.reqId,
            `${e.id} → ${rec.decision}${rec.confidence != null ? ` (conf ${rec.confidence}%)` : ''} · ${rec.reason.slice(0, 90)}… · model ${AIAgent.model}`,
            'Governance Copilot', 'ai');
    } catch {
        aiOfflineToast();
    }
    e._aiBusy = null;
    renderIf('hitl');
}

function aiApply(excId) {
    const e = getExc(excId);
    if (!e || !e._ai || e.status !== 'PENDING') return;
    const rec = e._ai;
    decideException(e.id, rec.decision, `AI recommendation applied (${rec.confidence ?? '—'}%): ${rec.reason}`);
}

async function aiRegenerateDraft(excId) {
    const e = getExc(excId);
    if (!e || e._aiBusy) return;
    const c = getCandidate(e.candidateId);
    if (!c) return;
    e._aiBusy = 'draft';
    renderIf('hitl');
    try {
        const d = await AIAgent.draftOutreach(c, getReq(e.reqId));
        e.detail.subject = d.subject;
        e.detail.body = d.body;
        if (c.outreach && c.outreach.state === 'draft') {
            c.outreach.subject = d.subject;
            c.outreach.body = d.body;
        }
        toast('success', 'Draft regenerated', `${AIAgent.model} · ${AIAgent.lastMs}ms`);
        log('AI_DRAFT', e.reqId, `${e.id} draft regenerated by LLM · subject “${d.subject.slice(0, 60)}” · ${AIAgent.lastMs}ms`, 'Echo · LLM', 'ai');
    } catch {
        aiOfflineToast();
    }
    e._aiBusy = null;
    renderIf('hitl');
}

async function aiSuggestReply(excId) {
    const e = getExc(excId);
    if (!e || e._aiBusy) return;
    e._aiBusy = 'reply';
    renderIf('hitl');
    try {
        e._aiReply = await AIAgent.replySuggestion(e);
        toast('success', 'Reply drafted', `suggestion ready · ${AIAgent.lastMs}ms`);
        log('AI_DRAFT', e.reqId, `${e.id} reply suggestion drafted by LLM · ${AIAgent.lastMs}ms`, 'Echo · LLM', 'ai');
    } catch {
        aiOfflineToast();
    }
    e._aiBusy = null;
    renderIf('hitl');
}

async function aiCopy(excId) {
    const e = getExc(excId);
    if (!e || !e._aiReply) return;
    try { await navigator.clipboard.writeText(e._aiReply); toast('success', 'Copied', 'Suggested reply copied to clipboard'); }
    catch { toast('info', 'Select & copy', 'Clipboard unavailable in this context'); }
}

/* ---------- Drawer copilot ---------- */
async function aiDrawerDraft() {
    const c = getCandidate(state.ui.drawerCandidate);
    if (!c || c._aiBusy) return;
    c._aiBusy = 'draft';
    renderDrawer();
    try {
        c._aiDraft = await AIAgent.draftOutreach(c, getReq(c.reqId));
        toast('success', 'Draft ready', `${AIAgent.model} · ${AIAgent.lastMs}ms`);
        log('AI_DRAFT', c.reqId, `${c.id} dossier draft generated · model ${AIAgent.model} · ${AIAgent.lastMs}ms`, 'Echo · LLM', 'ai');
    } catch {
        aiOfflineToast();
    }
    c._aiBusy = null;
    renderDrawer();
}

async function aiDrawerNote() {
    const c = getCandidate(state.ui.drawerCandidate);
    if (!c || c._aiBusy) return;
    c._aiBusy = 'note';
    renderDrawer();
    try {
        c._aiNote = await AIAgent.screenSummary(c, getReq(c.reqId));
        toast('success', 'Screening summary ready', `${AIAgent.model} · ${AIAgent.lastMs}ms`);
        log('AI_DRAFT', c.reqId, `${c.id} screening summary generated · ${AIAgent.lastMs}ms`, 'Verify-7 · LLM', 'ai');
    } catch {
        aiOfflineToast();
    }
    c._aiBusy = null;
    renderDrawer();
}

function aiUseDraft() {
    const c = getCandidate(state.ui.drawerCandidate);
    if (!c || !c._aiDraft) return;
    c.outreach = c.outreach && c.outreach.state ? c.outreach : { state: 'draft' };
    c.outreach.state = c.outreach.state === 'not_started' || !c.outreach.state ? 'draft' : c.outreach.state;
    c.outreach.subject = c._aiDraft.subject;
    c.outreach.body = c._aiDraft.body;
    c.outreach.approvedBy = c.outreach.approvedBy || null;
    toast('success', 'Draft applied', `${c.name} · awaiting approval per autonomy policy`);
    log('AI_DRAFT', c.reqId, `${c.id} LLM draft applied to outreach · subject “${c._aiDraft.subject.slice(0, 60)}”`, 'Echo · LLM', 'ai');
    renderDrawer();
    renderIf('pipeline');
}

async function aiCopyDrawer(kind) {
    const c = getCandidate(state.ui.drawerCandidate);
    if (!c) return;
    const txt = kind === 'draft' && c._aiDraft ? `${c._aiDraft.subject}\n\n${c._aiDraft.body}` : (c._aiNote || '');
    if (!txt) return;
    try { await navigator.clipboard.writeText(txt); toast('success', 'Copied', 'AI output copied to clipboard'); }
    catch { toast('info', 'Select & copy', 'Clipboard unavailable in this context'); }
}

/* ---------- Registry strip ---------- */
function aiRuntimeStrip() {
    const on = AIAgent.online === true;
    const off = AIAgent.online === false;
    return `
    <div class="glass border ${on ? 'border-emerald-500/30' : 'border-gray-800'} rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div class="flex items-center gap-2">
            <span class="w-2 h-2 rounded-full ${on ? 'bg-emerald-500 glow-green' : off ? 'bg-red-500' : 'bg-gray-500 animate-pulse'}"></span>
            <span class="text-[12.5px] font-semibold">LLM agent runtime</span>
            <span class="text-[10px] font-mono px-1.5 py-0.5 rounded border ${on ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10' : off ? 'border-red-500/40 text-red-300 bg-red-500/10' : 'border-gray-700 text-gray-500'}">${on ? 'LIVE' : off ? 'OFFLINE' : 'CHECKING'}</span>
        </div>
        <div class="text-[11px] text-gray-500">model <b class="text-blue-300 font-mono">${esc(AIAgent.model || 'auto/fast')}</b></div>
        <div class="text-[11px] text-gray-500">calls <b class="text-gray-200 tabular">${AIAgent.calls}</b></div>
        <div class="text-[11px] text-gray-500">last latency <b class="text-gray-200 tabular">${AIAgent.lastMs ? AIAgent.lastMs + 'ms' : '—'}</b></div>
        <div class="text-[11px] text-gray-500">last task <b class="text-gray-300">${esc(AIAgent.lastTask || '—')}</b></div>
        ${off ? `<button class="px-2.5 py-1 text-[11px] rounded-md bg-blue-600 hover:bg-blue-500 text-white font-medium transition" onclick="howToConnect()">How to connect</button>` : ''}
        <button class="ml-auto px-2.5 py-1 text-[11px] rounded-md border border-gray-700 text-gray-400 hover:text-gray-200 hover:bg-gray-800 transition"
            onclick="AIAgent.health().then(()=>renderAll())">Re-check</button>
    </div>`;
}

window.AIAgent = AIAgent;
window.aiRecommend = aiRecommend;
window.aiApply = aiApply;
window.aiRegenerateDraft = aiRegenerateDraft;
window.aiSuggestReply = aiSuggestReply;
window.aiCopy = aiCopy;
window.aiDrawerDraft = aiDrawerDraft;
window.aiDrawerNote = aiDrawerNote;
window.aiUseDraft = aiUseDraft;
window.aiCopyDrawer = aiCopyDrawer;
window.howToConnect = howToConnect;
