/* ============================================================
   engine.js — state, priority engine, task allocation,
   candidate flow, HITL exceptions, audit, simulation loop
   ============================================================ */

const CANCEL = Symbol('cancel');

/* ---------- Global state ---------- */
const state = {
    agents: seedAgents(),
    requisitions: seedRequisitions(),
    candidates: seedCandidates(),
    exceptions: seedExceptions(),
    audit: seedAudit(),
    integrations: seedIntegrations(),
    metrics: {
        discovered: 148, verified: 96, contacted: 71, responded: 38, shortlisted: 14,
        exceptionsRaised: 22, exceptionsResolved: 19, tasksTotal: 340, tasksFailed: 7,
        avgHandoffSec: 47, slaCompliance: 92, throughput: [8, 11, 9, 14, 12, 17, 15, 13, 18, 16, 21, 19],
        excByType: { LOW_CONFIDENCE: 11, SENTIMENT: 6, DRAFT_REVIEW: 4, COMPLIANCE: 1 },
        startedAt: Date.now() - 42 * 60e3,
    },
    rules: {
        scoreThreshold: 75,       // below → HITL gate
        autoSendScore: 80,        // below → draft-review gate (SUPERVISED agents)
        execReview: true,         // P0 roles always get a human gate
        sentimentSensitivity: 0.5,// replies under this sentiment → HITL
        weights: { urgency: 50, backlog: 25, sla: 25 },
    },
    ui: { tab: 'dashboard', drawerCandidate: null, auditFilter: 'ALL', auditSearch: '', auditAutoScroll: true, pipelineFilter: 'ALL' },
    seq: { req: 2418, cand: 8900, exc: 4403, log: 9100 },
};

/* ---------- SIM control ---------- */
const SIM = { running: false, stopped: false, paused: false, speed: 1, runId: 0 };

/* ---------- Small helpers ---------- */
const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const rand = (a, b) => a + Math.random() * (b - a);
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const uid = p => `${p}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;

function fmtClock(ts) {
    return new Date(ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}
function fmtAgo(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return `${s}s ago`;
    if (s < 3600) return `${Math.round(s / 60)}m ago`;
    return `${Math.round(s / 3600)}h ago`;
}
function initials(name) {
    return name.split(/[\s-]+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase();
}

/* Sleep that respects pause + speed. Always resolves true (in-flight flows
   complete even after the sim stops ingesting new work). */
function sleep(ms) {
    return new Promise(resolve => {
        let remaining = ms / SIM.speed;
        let last = performance.now();
        const tick = () => {
            const now = performance.now();
            if (!SIM.paused) remaining -= (now - last);
            last = now;
            if (remaining <= 0) return resolve(true);
            setTimeout(tick, clamp(remaining, 15, 70));
        };
        setTimeout(tick, clamp(ms / SIM.speed, 15, 70));
    });
}

/* ---------- Lookups ---------- */
const getAgent    = id => state.agents.find(a => a.id === id);
const getReq      = id => state.requisitions.find(r => r.id === id);
const getCandidate= id => state.candidates.find(c => c.id === id);
const getExc      = id => state.exceptions.find(e => e.id === id);
const pendingExcs = () => state.exceptions.filter(e => e.status === 'PENDING');
const agentName   = id => getAgent(id)?.name ?? id ?? '—';

/* ---------- Audit trail ---------- */
function log(action, reqId, details, actor = 'ControlTower', actorType = 'ai') {
    const entry = { id: 'LOG-' + (++state.seq.log), ts: Date.now(), actor, actorType, action, reqId: reqId || '—', details };
    state.audit.unshift(entry);
    if (state.audit.length > 400) state.audit.length = 400;
    if (typeof onAuditEvent === 'function') onAuditEvent(entry);
    return entry;
}

/* ---------- Priority engine (configurable rules) ---------- */
function urgencyScore(u) { return u === 'P0' ? 1 : u === 'P1' ? 0.6 : 0.3; }

/* Leadership requisitions always require a human release (execReview rule). */
const LEADERSHIP_RE = /\bhead of|chief|director|\bvp\b|vice president|principal architect|staff architect|head\b/i;
function isLeadershipReq(req) { return !!req && LEADERSHIP_RE.test(req.title || ''); }

function priorityScore(req) {
    const w = state.rules.weights;
    const backlog = getBacklog(req.id);
    const backlogScore = clamp(backlog / 8, 0, 1);
    const slaLeft = (req.createdAt + req.slaHours * 3600e3 - Date.now()) / (req.slaHours * 3600e3);
    const slaScore = clamp(1 - slaLeft, 0, 1);
    const total = w.urgency + w.backlog + w.sla || 1;
    return (w.urgency * urgencyScore(req.urgency) + w.backlog * backlogScore + w.sla * slaScore) / total;
}
function getBacklog(reqId) {
    return state.candidates.filter(c => c.reqId === reqId && c.stage !== 'SHORTLISTED' && c.stage !== 'REJECTED').length;
}
function rankedRequisitions() {
    return [...state.requisitions]
        .map(r => ({ ...r, score: priorityScore(r) }))
        .sort((a, b) => b.score - a.score);
}

/* ---------- Task allocation ---------- */
function allocateAgent(role, opts = {}) {
    const pool = state.agents.filter(a =>
        a.type === 'ai' && a.role === role && a.enabled &&
        (a.status === 'IDLE' || a.status === 'PROCESSING') &&
        a.activeTasks < a.capacity &&
        (!opts.exclude || opts.exclude !== a.id));
    if (!pool.length) return null;
    pool.sort((a, b) =>
        (a.status === 'IDLE' ? 0 : 1) - (b.status === 'IDLE' ? 0 : 1) ||
        (a.activeTasks / a.capacity) - (b.activeTasks / b.capacity) ||
        b.successRate - a.successRate);
    const agent = pool[0];
    agent.status = 'PROCESSING';
    agent.activeTasks = Math.min(agent.capacity, agent.activeTasks + 1);
    return agent;
}

function attachTask(agent, reqId, label) {
    agent.currentTask = `${reqId} · ${label}`;
}
function releaseAgent(agent, ok = true) {
    if (!agent) return;
    agent.activeTasks = Math.max(0, agent.activeTasks - 1);
    if (!ok) {
        agent.status = 'ERROR';
        agent.tasksFailed = (agent.tasksFailed || 0) + 1;
        setTimeout(() => { if (agent.status === 'ERROR') agent.status = 'IDLE'; renderIf('registry', 'dashboard'); }, 2600);
    } else if (agent.activeTasks === 0 && agent.status !== 'OFFLINE') {
        agent.status = 'IDLE';
        agent.currentTask = null;
    }
    state.metrics.tasksTotal++;
}
function holdForHuman(agent, label) {
    if (!agent) return;
    agent.status = 'WAITING_HUMAN';
    agent.currentTask = label || agent.currentTask;
}
function releaseHold(agent) {
    if (!agent) return;
    if (agent.status === 'WAITING_HUMAN') {
        agent.status = agent.activeTasks > 0 ? 'PROCESSING' : 'IDLE';
        if (agent.activeTasks === 0) agent.currentTask = null;
    }
}

/* ---------- Candidate helpers ---------- */
function stageIndex(stage) { return STAGE_ORDER.indexOf(stage); }
function stageLabel(stage) { return STAGES.find(s => s.key === stage)?.label ?? stage; }

function handoff(c, fromName, toName, note) {
    c.handoffs.push({ from: fromName, to: toName, at: Date.now(), note });
    log('HANDOFF', c.reqId, `${c.id} ${fromName} → ${toName} · ${note}`);
}
function reason(c, agent, text) {
    c.reasoning.push({ agent, at: Date.now(), text });
}
function scoreColor(v) {
    if (v == null) return '#6b7280';
    return v >= 85 ? '#22c55e' : v >= state.rules.scoreThreshold ? '#3b82f6' : '#f59e0b';
}

/* ---------- Requisition creation ---------- */
function createRequisition(tpl, opts = {}) {
    const req = {
        id: 'REQ-' + (++state.seq.req), title: tpl.title, urgency: tpl.urgency, mode: tpl.mode,
        skills: [...tpl.skills], hm: tpl.hm || 'J. Okafor', slaHours: tpl.slaHours, ageH: 0,
        target: tpl.target || 10, owner: null, status: 'OPEN', createdAt: Date.now(), shortlisted: 0,
    };
    state.requisitions.unshift(req);
    log('JOB_POSTED', req.id, `${req.urgency} requisition “${req.title}” · SLA ${req.slaHours}h · ${req.mode}${opts.source ? ' · source: ' + opts.source : ''}`);
    return req;
}

/* ---------- HITL exception lifecycle ---------- */
function raiseException({ candidate, type, severity, title, reason: why, detail, agent, onApprove }) {
    const exc = {
        id: 'EXC-' + (++state.seq.exc), candidateId: candidate.id, reqId: candidate.reqId,
        type, severity, status: 'PENDING', createdAt: Date.now(), agentId: agent?.id ?? candidate.assignedAgent,
        title, reason: why, detail: detail || {}, onApprove,
    };
    state.exceptions.unshift(exc);
    state.metrics.exceptionsRaised++;
    state.metrics.excByType[type] = (state.metrics.excByType[type] || 0) + 1;
    candidate.status = 'waiting';
    candidate.exceptionId = exc.id;
    candidate.halted = true;
    if (agent) holdForHuman(agent, `HITL · ${exc.id}`);
    log('EXCEPTION_TRIGGERED', exc.reqId, `${exc.id} type=${type} severity=${severity} · ${title}`);
    toast('exception', 'Human approval required', `${EXC_TYPES[type].label} · ${candidate.name}`);
    renderAll();
    return exc;
}

function decideException(excId, decision, note = '', extra = {}) {
    const exc = getExc(excId);
    if (!exc || exc.status !== 'PENDING') return;
    const c = getCandidate(exc.candidateId);
    const human = state.agents.find(a => a.type === 'human' && a.permissions === 'APPROVER') || { name: 'Operator' };
    exc.status = decision;
    exc.resolvedAt = Date.now();
    exc.decidedBy = human.name;
    exc.note = note;
    state.metrics.exceptionsResolved++;

    const heldAgent = getAgent(exc.agentId);
    releaseHold(heldAgent);

    const label = { APPROVED: 'APPROVED', OVERRIDDEN: 'OVERRIDDEN', REJECTED: 'REJECTED', REASSIGNED: 'RE_ASSIGN' }[decision];
    log(label, exc.reqId, `${exc.id} · ${decision} by ${human.name}${note ? ` · note: “${note}”` : ''}${extra.target ? ` · → ${agentName(extra.target)}` : ''}`, human.name, 'human');

    if (c) {
        c.exceptionId = null;
        c.halted = false;

        if (decision === 'REJECTED') {
            c.stage = 'REJECTED';
            c.status = 'done';
            releaseAgent(heldAgent, true);
            toast('error', 'Candidate rejected', `${c.name} removed from ${c.reqId}`);
        } else if (decision === 'REASSIGNED') {
            const target = getAgent(extra.target) || heldAgent;
            if (target && target !== heldAgent) {
                target.status = 'PROCESSING';
                target.activeTasks = Math.min(target.capacity, target.activeTasks + 1);
                attachTask(target, c.reqId, stageLabel(c.stage));
                c.assignedAgent = target.id;
                handoff(c, agentName(exc.agentId), target.name, `HITL re-assignment · ${exc.id}`);
                if (heldAgent && heldAgent !== target) releaseAgent(heldAgent, true);
            } else if (heldAgent) { heldAgent.status = 'PROCESSING'; }
            toast('info', 'Re-assigned', `${c.name} → ${agentName(c.assignedAgent)}`);
        } else {
            if (decision === 'OVERRIDDEN') c.overrides = (c.overrides || []).concat([{ at: Date.now(), by: human.name, note, exc: exc.id }]);
            if (c.verification && exc.type === 'LOW_CONFIDENCE') {
                c.verification.approved = true;
                if (decision === 'OVERRIDDEN' && extra.newScore != null) {
                    c.verification.recruiterScore = extra.newScore;
                    c.score = extra.newScore;
                    c.verification.summary += ` [Recruiter override → ${extra.newScore}]`;
                }
                reason(c, human.name, `Approved below-threshold candidate (${c.verification.score} < ${state.rules.scoreThreshold}). ${note || ''}`.trim());
            }
            if (c.outreach && exc.type === 'DRAFT_REVIEW') {
                if (extra.body) c.outreach.body = extra.body;
                c.outreach.approvedBy = human.name;
            }
            if (exc.type === 'SENTIMENT') c.sentimentCleared = true;
            if (typeof exc.onApprove === 'function') { const fn = exc.onApprove; exc.onApprove = null; fn(); }
            toast('success', `${decision} · ${c.name}`, heldAgent ? `Released ${heldAgent.name} → pipeline resumed` : 'Pipeline resumed');
            progressCandidate(c);
        }
    }
    renderAll();
}

/* ---------- Candidate pipeline flow ---------- */
async function progressCandidate(c) {
    if (c.flowActive || c.stage === 'SHORTLISTED' || c.stage === 'REJECTED') return;
    c.flowActive = true;
    c.status = c.status === 'waiting' && !c.halted ? 'active' : c.status;
    try {
        while (true) {
            const stage = c.stage;
            if (stage === 'SHORTLISTED' || stage === 'REJECTED') break;

            /* ---- STAGE 1 · SOURCING (hand off the freshly ingested profile) ---- */
            if (stage === 'SOURCING') {
                await sleep(rand(500, 900));
                const srcName = agentName(c.assignedAgent);
                const verId = agentIdForRole('Verification');
                handoff(c, srcName, verId ? agentName(verId) : 'Verification', 'Profile enriched · ready for screening');
                c.assignedAgent = verId;
                c.stage = 'SCREENING';
                renderIf('pipeline', 'dashboard');
                continue;
            }

            /* ---- STAGE 2 · SCREENING / VERIFICATION ---- */
            if (stage === 'SCREENING') {
                const agent = stageAgent(c, 'Verification', 'Verification');
                if (!agent) { await sleep(600); continue; }

                if (!c.verification) {
                    await sleep(rand(1300, 2200));

                    /* injected transient failure → fallback-recovery demo */
                    if (c.failOnce) {
                        c.failOnce = false;
                        releaseAgent(agent, false);
                        c.agentHeld = false;
                        log('ERROR', c.reqId, `${agent.name} task timeout on employment_registry (504) · allocating fallback`, agent.name, 'ai');
                        toast('error', 'Agent failure · recovering', `${agent.name} timed out — retrying with fallback agent`);
                        state.metrics.tasksFailed++;
                        c.assignedAgent = null;
                        renderAll();
                        await sleep(1500);
                        const alt = allocateAgent('Verification', { exclude: agent.id });
                        if (alt) {
                            attachTask(alt, c.reqId, 'Verification · fallback');
                            c.assignedAgent = alt.id; c.agentHeld = true;
                            log('RECOVERED', c.reqId, `${agent.name} → ${alt.name} · task re-dispatched by orchestrator`, alt.name, 'ai');
                        }
                        renderIf('registry', 'dashboard');
                        continue;
                    }
                    computeVerification(c, agent);
                    renderIf('pipeline');
                }

                const v = c.verification;
                const execGate = state.rules.execReview && isLeadershipReq(getReq(c.reqId));

                if (!v.approved && v.score < state.rules.scoreThreshold && !c.lowScoreHandled) {
                    c.lowScoreHandled = true;
                    raiseException({
                        candidate: c, type: 'LOW_CONFIDENCE', severity: v.score < 60 ? 'CRITICAL' : 'HIGH',
                        title: `${c.name} · match score ${v.score}% below threshold ${state.rules.scoreThreshold}`,
                        reason: `Verification confidence ${v.confidence} — ${v.flags[0] || 'signals below bar'}; outreach is blocked until a recruiter signs off.`,
                        detail: { score: v.score, threshold: state.rules.scoreThreshold, flags: v.flags, confidence: v.confidence },
                        agent,
                    });
                    break;
                }
                if (execGate && !c.execReviewed) {
                    c.execReviewed = true;
                    raiseException({
                        candidate: c, type: 'COMPLIANCE', severity: 'MEDIUM',
                        title: `${c.name} · leadership-track role requires human sign-off`,
                        reason: 'Governance rule “execReview” is active: candidates for headcount-leadership requisitions must be released by a recruiter before any outreach leaves the tower.',
                        detail: { score: v.score, threshold: state.rules.scoreThreshold, flags: ['execReview policy · leadership requisition'] },
                        agent,
                    });
                    break;
                }

                v.approved = true;
                if (c.halted) break;
                doneStage(c, agent, true);
                log('VERIFIED', c.reqId, `${c.id} ${c.name} score ${v.score}/100 · confidence ${v.confidence}${v.flags.length ? ' · flags: ' + v.flags.join('; ') : ''}`, agent.name, 'ai');
                state.metrics.verified++;
                reason(c, agent.name, `Screening complete: ${v.summary}`);
                const outId = agentIdForRole('Outreach');
                handoff(c, agent.name, outId ? agentName(outId) : 'Outreach', `Verified ${v.score}/100 · ${v.score >= state.rules.autoSendScore ? 'auto-send permitted' : 'draft review required'}`);
                c.assignedAgent = outId;
                c.stage = 'OUTREACH';
                renderIf('pipeline', 'dashboard');
                continue;
            }

            /* ---- STAGE 3 · OUTREACH ---- */
            if (stage === 'OUTREACH') {
                const agent = stageAgent(c, 'Outreach', 'Outreach drafting');
                if (!agent) { await sleep(600); continue; }

                if (!c.outreach.state || c.outreach.state === 'not_started') {
                    await sleep(rand(1200, 1900));
                    await buildOutreach(c, agent);
                    renderIf('pipeline');
                }

                const needsDraftReview = agent.permissions === 'SUPERVISED' &&
                    c.verification.score < state.rules.autoSendScore &&
                    !c.outreach.approvedBy && !c.draftHandled;
                if (needsDraftReview) {
                    c.draftHandled = true;
                    raiseException({
                        candidate: c, type: 'DRAFT_REVIEW', severity: 'MEDIUM',
                        title: `${c.name} · outreach draft awaiting approval`,
                        reason: `${agent.name} operates under SUPERVISED autonomy and candidate confidence (${c.verification.score}) is under the auto-send floor (${state.rules.autoSendScore}).`,
                        detail: { subject: c.outreach.subject, body: c.outreach.body, agent: agent.name, score: c.verification.score },
                        agent,
                    });
                    break;
                }

                if (c.outreach.state === 'draft') {
                    await sleep(rand(700, 1200));
                    c.outreach.state = 'sent';
                    c.outreach.sentAt = Date.now();
                    log('EMAIL_SENT', c.reqId, `${c.id} ${c.name} · subject “${c.outreach.subject}” · prompt #${Math.random().toString(16).slice(2, 6)}`, agent.name, 'ai');
                    state.metrics.contacted++;
                    reason(c, agent.name, 'Personalised email dispatched in local send-window.');
                    toast('info', 'Outreach sent', `${c.name} · ${agent.name}`);
                    renderIf('pipeline', 'analytics');
                }

                if (!c.responded) {
                    await sleep(rand(2600, 4600));
                    c.responded = true;
                    state.metrics.responded++;
                    c.outreach.state = 'replied';
                    c.outreach.reply = c.cannedReply || pick([
                        'Happy to chat — what does the comp band look like?',
                        'Interested. Is the team remote-friendly and how heavy is on-call?',
                        'This looks relevant. Could you share the job description?',
                    ]);
                    log('RESPONSE_RECEIVED', c.reqId, `${c.id} ${c.name} replied · “${c.outreach.reply.slice(0, 70)}…”`, agent.name, 'ai');

                    const sentiment = c.scriptedComplaint ? 0.28 : rand(0.62, 0.9);
                    if (c.scriptedComplaint && !c.sentimentCleared) {
                        c.scriptedComplaint = false;
                        raiseException({
                            candidate: c, type: 'SENTIMENT', severity: 'HIGH',
                            title: `${c.name} · compensation / policy questions in reply`,
                            reason: `Sentiment ${sentiment.toFixed(2)} (guarded) crossed the sensitivity floor ${state.rules.sentimentSensitivity}. Policy requires a human-authored answer before scheduling continues.`,
                            detail: { sentiment, signals: ['compensation negotiation', 'remote policy', 'on-call concern'], reply: c.outreach.reply },
                            agent,
                        });
                        break;
                    }
                }

                if (c.halted) break;
                releaseAgent(agent, true);
                handoff(c, agent.name, agentNameForRole('Scheduling'), 'Positive reply · intent flag set');
                c.assignedAgent = agentNameForRole('Scheduling');
                c.stage = 'SCHEDULING';
                renderIf('pipeline', 'dashboard');
                continue;
            }

            /* ---- STAGE 4 · SCHEDULING ---- */
            if (stage === 'SCHEDULING') {
                const agent = stageAgent(c, 'Scheduling', 'Slot negotiation');
                if (!agent) { await sleep(600); continue; }

                if (c.scheduling.state !== 'offered' && c.scheduling.state !== 'booked') {
                    await sleep(rand(1100, 1700));
                    c.scheduling.state = 'offered';
                    c.scheduling.slots = ['Thu 10:00 CET', 'Fri 15:30 CET'];
                    log('SLOT_OFFERED', c.reqId, `${c.id} ${c.name} · ${c.scheduling.slots.join(' / ')}`, agent.name, 'ai');
                    reason(c, agent.name, 'Resolved timezone overlap + panel availability → proposed 2 slots.');
                    renderIf('pipeline');
                }
                if (c.scheduling.state !== 'booked') {
                    await sleep(rand(1800, 3000));
                    c.scheduling.state = 'booked';
                    c.scheduling.interview = `Technical Interview · ${c.scheduling.slots[0]} · Panel: ${getReq(c.reqId)?.hm || 'J. Okafor'}`;
                    log('INTERVIEW_BOOKED', c.reqId, `${c.id} ${c.name} · ${c.scheduling.interview}`, agent.name, 'ai');
                    c.stage = 'SHORTLISTED';
                    c.status = 'done';
                    state.metrics.shortlisted++;
                    const req = getReq(c.reqId); if (req) req.shortlisted++;
                    doneStage(c, agent, true);
                    handoff(c, agent.name, 'Aarthi Menon', 'Interview booked · full dossier attached');
                    toast('success', 'Interview booked 🎉', `${c.name} → shortlist for ${c.reqId}`);
                    renderAll();
                    break;
                }
                break;
            }

            break;
        }
    } finally {
        c.flowActive = false;
        if (c.halted) c.status = 'waiting';
        renderIf('pipeline', 'dashboard');
    }
}

function agentIdForRole(role) {
    const pool = state.agents.filter(a => a.type === 'ai' && a.role === role && a.enabled);
    if (!pool.length) return null;
    pool.sort((a, b) => (a.status === 'IDLE' ? 0 : 1) - (b.status === 'IDLE' ? 0 : 1) || a.activeTasks - b.activeTasks);
    return pool[0].id;
}
function agentNameForRole(role) {
    const id = agentIdForRole(role);
    return id ? agentName(id) : role;
}

/* Acquire (or reuse the held) agent for the candidate's current stage. */
function stageAgent(c, role, label) {
    if (c.agentHeld) {
        const a = getAgent(c.assignedAgent);
        if (a) { if (a.status === 'IDLE') a.status = 'PROCESSING'; return a; }
        c.agentHeld = false;
    }
    const a = allocateAgent(role);
    if (!a) return null;
    attachTask(a, c.reqId, label);
    c.assignedAgent = a.id;
    c.agentHeld = true;
    return a;
}
function doneStage(c, agent, ok = true) {
    releaseAgent(agent, ok);
    c.agentHeld = false;
}

function computeVerification(c, agent) {
    const score = c.scriptedScore ?? c.score ?? clamp(Math.round((c.base ?? 80) + rand(-8, 8)), 55, 98);
    const flags = [];
    if (score < state.rules.scoreThreshold) flags.push('Aggregate signal below hiring bar');
    if (score < 60) flags.push('Employment timeline gap detected');
    const confidence = clamp(score / 100 + rand(-0.05, 0.04), 0.4, 0.98);
    c.score = score;
    c.verification = {
        score, confidence: +confidence.toFixed(2),
        summary: score >= 90 ? 'Exceptional match — owns comparable systems at scale.'
            : score >= state.rules.scoreThreshold ? `Solid match across ${c.skills.filter(s => (getReq(c.reqId)?.skills || []).some(k => k.toLowerCase() === s.toLowerCase())).length} core requirements.`
            : 'Mixed signals — domain overlap present but seniority or scope claims need confirmation.',
        flags, approved: false,
        github: { repos: Math.round(rand(6, 42)), commits24h: Math.round(rand(0, 14)) },
    };
    reason(c, agent.name, `Scored ${score}/100 (confidence ${confidence.toFixed(2)}) · ${flags.length ? flags.join('; ') : 'no blockers'}`);
}

/* Build the outreach draft. Uses the real LLM agent when the runtime is
   live; falls back to the scripted template when offline. */
async function buildOutreach(c, agent) {
    const req = getReq(c.reqId);
    let subject = null, body = null, live = false;
    if (typeof AIAgent !== 'undefined' && AIAgent.online !== false) {
        try {
            const d = await AIAgent.draftOutreach(c, req);
            subject = d.subject; body = d.body; live = true;
            log('AI_DRAFT', c.reqId, `${c.id} personalised draft generated · model ${AIAgent.model} · ${AIAgent.lastMs}ms`, `${agent.name} · LLM`, 'ai');
        } catch { /* offline → template below */ }
    }
    c.outreach = {
        state: 'draft',
        subject: subject || `${req?.urgency === 'P0' ? 'P0 role' : 'Role'}: ${req?.title || 'a role'} — your ${c.skills[0]} work stood out`,
        body: body || `Hi ${c.name.split(' ')[0]} — your work on ${c.skills.slice(0, 2).join(' and ')} at ${c.company} is closely aligned with what we're building. ` +
              `We're hiring a ${req?.title || 'senior engineer'} and your ${c.experience.toLowerCase()} background maps directly. ` +
              `Open to a 20-minute conversation this week?`,
        approvedBy: null, sentAt: null,
    };
    reason(c, agent.name, live
        ? `LLM draft generated (${AIAgent.model} · ${AIAgent.lastMs}ms) · anchors: ${c.skills.slice(0, 2).join(', ')} @ ${c.company}`
        : `Draft generated · tone=peer-to-peer · anchors: ${c.skills.slice(0, 2).join(', ')} @ ${c.company}`);
}

/* ---------- Candidate creation (sourcing) ---------- */
async function sourceCandidate(req, profile) {
    const agent = allocateAgent('Sourcing');
    if (!agent) return null;
    attachTask(agent, req.id, 'Sourcing');
    await sleep(rand(1000, 1600));
    const p = profile || pick(PROFILE_POOL);
    const c = {
        id: 'CND-' + (++state.seq.cand), name: p.name, headline: p.headline, company: p.company,
        location: p.location, reqId: req.id, stage: 'SOURCING', status: 'active', score: null,
        assignedAgent: agent.id, responded: false, createdAt: Date.now(),
        skills: [...p.skills], experience: p.experience,
        verification: null, outreach: { state: 'not_started' }, scheduling: { state: 'none' },
        reasoning: [], handoffs: [],
    };
    if (p.scheduled) { c.scriptedScore = p.scheduled.score; }
    state.candidates.unshift(c);
    log('SOURCED', req.id, `${c.id} ${c.name} · ${c.headline} @ ${c.company} · ${c.location}`, agent.name, 'ai');
    state.metrics.discovered++;
    if (!req.owner) req.owner = agent.id;
    releaseAgent(agent, true);
    renderIf('pipeline', 'dashboard', 'analytics');
    return c;
}

/* ---------- Simulation script ---------- */
async function startSimulation() {
    if (SIM.running) return;
    SIM.running = true; SIM.stopped = false; SIM.paused = false;
    const run = ++SIM.runId;
    updateSimControls();
    log('SYSTEM', null, 'Simulation run started · orchestrator spinning up agents');
    toast('info', 'Simulation started', 'Orchestrator is allocating an urgent requisition…');

    const step = async ms => { await sleep(ms); if (SIM.stopped || SIM.runId !== run) throw CANCEL; };

    try {
        /* 1 · ingest P0 requisition */
        const tpl = pick(REQ_TEMPLATES.filter(t => t.urgency === 'P0').concat(REQ_TEMPLATES.slice(0, 2)));
        const req = createRequisition({ ...tpl, hm: 'J. Okafor', target: 10 }, { source: 'Greenhouse webhook' });
        renderAll();
        await step(1300);

        /* 2 · prioritise + dispatch */
        const ranked = rankedRequisitions().find(r => r.id === req.id);
        log('PRIORITIZED', req.id, `Priority score ${ranked.score.toFixed(2)} · rank #${state.requisitions.indexOf(req) + 1} · weights U${state.rules.weights.urgency}/B${state.rules.weights.backlog}/S${state.rules.weights.sla}`);
        toast('info', `P0 requisition prioritised`, `${req.title} · score ${ranked.score.toFixed(2)}`);
        renderIf('dashboard');
        await step(1100);

        /* 3 · source 4 candidates with scripted outcomes */
        const script = [
            { name: 'Ravi Krishnan', headline: 'Distributed Systems Engineer', company: 'Uber', location: 'Hyderabad',
              skills: ['Java', 'Zookeeper', 'Kafka'], experience: '9 yrs · ex-Uber, ex-Amazon', scriptedScore: 68,
              cannedReply: 'Thanks — happy to discuss.' },
            { name: 'Ana Costa', headline: 'Platform Engineer · K8s', company: 'Red Hat', location: 'Lisbon',
              skills: ['Kubernetes', 'Operators', 'Go'], experience: '7 yrs · ex-Red Hat', scriptedScore: 79,
              cannedReply: 'Interesting — send over more details please.' },
            { name: 'Fatima Zahra', headline: 'Staff Engineer · Data Plane', company: 'Datadog', location: 'Casablanca',
              skills: ['Go', 'Kafka', 'ClickHouse'], experience: '11 yrs · ex-Datadog', scriptedScore: 93,
              scriptedComplaint: true, cannedReply: 'Interested, but what is the comp band and is this fully remote? On-call load matters to me.' },
            { name: 'Noah Becker', headline: 'Backend Engineer · Payments', company: 'Stripe', location: 'Dublin',
              skills: ['Ruby', 'Postgres', 'Kafka'], experience: '8 yrs · ex-Stripe', scriptedScore: 91, failOnce: true,
              cannedReply: 'Let us set up a call — mornings work.' },
        ];

        const created = [];
        for (const p of script) {
            if (SIM.stopped || SIM.runId !== run) throw CANCEL;
            const c = await sourceCandidate(req, p);
            if (!c) { await step(700); continue; }
            if (p.scriptedScore) c.scriptedScore = p.scriptedScore;
            if (p.scriptedComplaint) c.scriptedComplaint = true;
            if (p.cannedReply) c.cannedReply = p.cannedReply;
            if (p.failOnce) c.failOnce = true;
            created.push(c);
            renderIf('pipeline');
            await step(900);
        }

        /* 4 · push them down the pipeline (staggered) */
        for (const c of created) {
            if (SIM.stopped || SIM.runId !== run) throw CANCEL;
            progressCandidate(c);
            await step(800);
        }
        toast('success', 'Pipeline live', `${created.length} candidates in flight across 4 agents`);

        /* 5 · keep the tower fed while running */
        let feed = 0;
        while (!SIM.stopped && SIM.runId === run) {
            await step(7000);
            const active = state.candidates.filter(c => c.stage !== 'SHORTLISTED' && c.stage !== 'REJECTED').length;
            if (active < 9) {
                const live = pick(PROFILE_POOL);
                const c = await sourceCandidate(req, { ...live, name: live.name + (feed ? ' ' + (++feed) : '') });
                if (c) progressCandidate(c);
            }
            /* periodic prioritisation heartbeat */
            const top = rankedRequisitions()[0];
            log('PRIORITIZED', top.id, `Heartbeat re-score · top of queue “${top.title}” (score ${top.score.toFixed(2)})`);
            metricsTick();
        }
    } catch (e) {
        if (e !== CANCEL) console.error(e);
    } finally {
        if (SIM.runId === run) {
            SIM.running = false; SIM.paused = false;
            updateSimControls();
            log('SYSTEM', null, 'Simulation stopped · in-flight candidates continue to completion');
            toast('info', 'Simulation stopped', 'No new profiles will be ingested.');
            renderAll();
        }
    }
}

function stopSimulation() { SIM.stopped = true; SIM.runId++; SIM.running = false; SIM.paused = false; updateSimControls(); renderAll(); }

function togglePause() {
    SIM.paused = !SIM.paused;
    const banner = $('#pausedBanner');
    if (banner) banner.classList.toggle('hidden', !SIM.paused);
    const dot = $('#sysDot');
    if (dot) dot.className = `w-2.5 h-2.5 rounded-full pulse-dot ${SIM.paused ? 'bg-amber-500 glow-amber text-amber-400' : 'bg-green-500 glow-green text-green-400'}`;
    const st = $('#hdrState');
    if (st) { st.textContent = SIM.paused ? '● SYSTEM PAUSED' : '● SYSTEM NOMINAL'; st.className = SIM.paused ? 'text-amber-400' : 'text-green-400'; }
    log('SYSTEM', null, SIM.paused ? 'Operator paused all agents' : 'Operator resumed all agents');
    updateSimControls();
    renderAll();
}

function cycleSpeed() {
    const order = [1, 2, 4];
    SIM.speed = order[(order.indexOf(SIM.speed) + 1) % order.length];
    const b = $('#speedBtn'); if (b) b.textContent = SIM.speed + '×';
}

function metricsTick() {
    const m = state.metrics;
    const base = 12 + Math.round(rand(-3, 6));
    m.throughput = [...m.throughput.slice(1), Math.max(4, base)];
    const active = state.agents.filter(a => a.type === 'ai' && a.status === 'PROCESSING').length;
    m.avgHandoffSec = clamp(Math.round(m.avgHandoffSec + rand(-6, 5)), 22, 120);
    if (active >= 3) m.slaCompliance = clamp(m.slaCompliance + 1, 0, 99);
    renderIf('analytics', 'dashboard');
}
setInterval(() => { if (SIM.running && !SIM.paused) metricsTick(); }, 5000);
