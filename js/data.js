/* ============================================================
   Recruiting Agent Control Tower · SW-06
   data.js — constants, seed registry, requisitions, dossiers
   ============================================================ */

/* ---------- Pipeline model ---------- */
const STAGES = [
    { key: 'SOURCING',   label: 'Sourcing',   role: 'Sourcing',     icon: 'search',       accent: 'text-sky-400',     border: 'border-sky-500/30' },
    { key: 'SCREENING',  label: 'Screening',  role: 'Verification', icon: 'shield-check', accent: 'text-violet-400',  border: 'border-violet-500/30' },
    { key: 'OUTREACH',   label: 'Outreach',   role: 'Outreach',     icon: 'send',         accent: 'text-amber-400',   border: 'border-amber-500/30' },
    { key: 'SCHEDULING', label: 'Scheduling', role: 'Scheduling',   icon: 'calendar-clock', accent: 'text-emerald-400', border: 'border-emerald-500/30' },
    { key: 'SHORTLISTED',label: 'Shortlisted',role: null,           icon: 'trophy',       accent: 'text-yellow-300',  border: 'border-yellow-500/30' },
];
const STAGE_ORDER = ['SOURCING', 'SCREENING', 'OUTREACH', 'SCHEDULING', 'SHORTLISTED'];

const AUTONOMY_LEVELS = ['FULL_AUTO', 'SUPERVISED', 'READ_ONLY'];
const AGENT_STATUS = {
    IDLE:           { label: 'Idle',           dot: 'bg-gray-400',  text: 'text-gray-300',  ring: '' },
    PROCESSING:     { label: 'Processing',     dot: 'bg-blue-500',  text: 'text-blue-300',  ring: 'agent-live' },
    WAITING_HUMAN:  { label: 'Waiting · Human',dot: 'bg-amber-500', text: 'text-amber-300', ring: 'glow-amber' },
    ERROR:          { label: 'Error',          dot: 'bg-red-500',   text: 'text-red-300',   ring: 'glow-red' },
    OFFLINE:        { label: 'Offline',        dot: 'bg-gray-600',  text: 'text-gray-500',  ring: '' },
};
const HUMAN_STATUS = {
    AVAILABLE:   { label: 'Available',   dot: 'bg-green-500', text: 'text-green-300' },
    IN_MEETING:  { label: 'In meeting',  dot: 'bg-amber-500', text: 'text-amber-300' },
    FOCUS_MODE:  { label: 'Focus mode',  dot: 'bg-sky-500',   text: 'text-sky-300' },
    OFFLINE:     { label: 'Offline',     dot: 'bg-gray-600',  text: 'text-gray-500' },
};

const EXC_TYPES = {
    LOW_CONFIDENCE: { label: 'Low confidence score', icon: 'gauge',            color: 'amber' },
    SENTIMENT:      { label: 'Candidate sentiment',  icon: 'message-square-warning', color: 'red' },
    DRAFT_REVIEW:   { label: 'Outreach draft review',icon: 'mail-question',    color: 'blue' },
    COMPLIANCE:     { label: 'Compliance / DEI gate',icon: 'scale',            color: 'violet' },
};

/* ---------- Agent & human resource registry ---------- */
function seedAgents() {
    return [
        { id: 'AG-SRC-01', name: 'Orion', type: 'ai', role: 'Sourcing', spec: 'Tech talent discovery · NA',
          capabilities: ['Boolean search', 'Talent-graph traversal', 'Profile enrichment'],
          tools: ['linkedin_api', 'github_search', 'internal_talent_db'],
          permissions: 'FULL_AUTO', status: 'IDLE', enabled: true, capacity: 4, activeTasks: 0,
          successRate: 0.968, avgLatency: 840, tasksDone: 118, model: 'gpt-agent/mini' },
        { id: 'AG-SRC-02', name: 'Nova', type: 'ai', role: 'Sourcing', spec: 'High-volume sourcing · EMEA',
          capabilities: ['Batch discovery', 'Company talent-map', 'Passive-candidate ranking'],
          tools: ['linkedin_api', 'job_boards'],
          permissions: 'FULL_AUTO', status: 'IDLE', enabled: true, capacity: 6, activeTasks: 0,
          successRate: 0.941, avgLatency: 1120, tasksDone: 96, model: 'gpt-agent/mini' },
        { id: 'AG-VER-01', name: 'Verify-7', type: 'ai', role: 'Verification', spec: 'Experience & credential validation',
          capabilities: ['Resume parsing', 'Employment timeline check', 'Confidence scoring 0–100'],
          tools: ['resume_parser', 'github_api', 'employment_registry'],
          permissions: 'SUPERVISED', status: 'WAITING_HUMAN', enabled: true, capacity: 3, activeTasks: 1,
          successRate: 0.982, avgLatency: 1460, tasksDone: 143, model: 'reasoner/x' },
        { id: 'AG-VER-02', name: 'Credence', type: 'ai', role: 'Verification', spec: 'Skills benchmarking & GitHub analysis',
          capabilities: ['Repo activity analysis', 'Skill-gap mapping', 'Signal extraction'],
          tools: ['github_api', 'stack Overflow_api', 'skill_ontology'],
          permissions: 'FULL_AUTO', status: 'IDLE', enabled: true, capacity: 3, activeTasks: 0,
          successRate: 0.957, avgLatency: 1210, tasksDone: 87, model: 'reasoner/x' },
        { id: 'AG-OUT-01', name: 'Echo', type: 'ai', role: 'Outreach', spec: 'Personalised 1:1 outreach copy',
          capabilities: ['Project-aware personalisation', 'Tone control', 'Follow-up sequencing'],
          tools: ['smtp_gateway', 'profile_context'],
          permissions: 'SUPERVISED', status: 'IDLE', enabled: true, capacity: 5, activeTasks: 0,
          successRate: 0.974, avgLatency: 980, tasksDone: 132, model: 'writer/l' },
        { id: 'AG-OUT-02', name: 'Blitz', type: 'ai', role: 'Outreach', spec: 'High-volume sequenced campaigns',
          capabilities: ['Template variants', 'Send-window optimisation', 'Bounce handling'],
          tools: ['smtp_gateway', 'crm_write'],
          permissions: 'FULL_AUTO', status: 'IDLE', enabled: true, capacity: 8, activeTasks: 0,
          successRate: 0.928, avgLatency: 610, tasksDone: 210, model: 'writer/s' },
        { id: 'AG-SCH-01', name: 'Tempo', type: 'ai', role: 'Scheduling', spec: 'Interview coordination',
          capabilities: ['Calendar sync', 'Slot negotiation', 'Timezone resolution', 'Invite dispatch'],
          tools: ['google_calendar', 'zoom provisioner'],
          permissions: 'FULL_AUTO', status: 'IDLE', enabled: true, capacity: 6, activeTasks: 0,
          successRate: 0.991, avgLatency: 540, tasksDone: 74, model: 'planner/s' },
        { id: 'AG-INT-01', name: 'Scout', type: 'ai', role: 'Intelligence', spec: 'Compensation & market intelligence',
          capabilities: ['Comp benchmarking', 'Talent-market heat maps', 'Competitor hiring signals'],
          tools: ['comp_datasets', 'news_ingest'],
          permissions: 'READ_ONLY', status: 'OFFLINE', enabled: false, capacity: 2, activeTasks: 0,
          successRate: 0.913, avgLatency: 2200, tasksDone: 41, model: 'analyst/s' },
        { id: 'HUM-01', name: 'Aarthi Menon', type: 'human', role: 'Recruiter', spec: 'Senior Technical Recruiter · Eng',
          capabilities: ['Exception approvals', 'Score overrides', 'Final shortlist sign-off'],
          tools: ['control_tower', 'ats_write'], permissions: 'APPROVER', status: 'AVAILABLE',
          enabled: true, capacity: 6, activeTasks: 1, successRate: 0.95, avgLatency: 34000, tasksDone: 58, timezone: 'IST (UTC+5:30)' },
        { id: 'HUM-02', name: 'Dev Patel', type: 'human', role: 'Recruiter', spec: 'Talent Sourcer · EMEA',
          capabilities: ['Candidate screening', 'Sourcing calibration'],
          tools: ['control_tower'], permissions: 'CONTRIBUTOR', status: 'IN_MEETING',
          enabled: true, capacity: 4, activeTasks: 0, successRate: 0.93, avgLatency: 61000, tasksDone: 37, timezone: 'CET (UTC+1)' },
        { id: 'HUM-03', name: 'Laura Kim', type: 'human', role: 'Ops Admin', spec: 'Recruiting Ops · Governance',
          capabilities: ['Autonomy policy', 'Audit export', 'Agent enable/disable'],
          tools: ['control_tower', 'policy_engine'], permissions: 'ADMIN', status: 'FOCUS_MODE',
          enabled: true, capacity: 3, activeTasks: 0, successRate: 0.99, avgLatency: 12000, tasksDone: 12, timezone: 'PST (UTC-8)' },
    ];
}

/* ---------- Job requisitions (prioritised backlog) ---------- */
function seedRequisitions() {
    const now = Date.now();
    return [
        { id: 'REQ-2417', title: 'Staff Distributed Systems Engineer', urgency: 'P0', mode: 'Remote · US/EU',
          skills: ['Rust', 'Kafka', 'Kubernetes', 'gRPC'], hm: 'J. Okafor', slaHours: 48, ageH: 5,
          target: 12, owner: 'AG-SRC-01', status: 'OPEN' },
        { id: 'REQ-2412', title: 'ML Platform Engineer', urgency: 'P1', mode: 'Hybrid · Bengaluru',
          skills: ['PyTorch', 'Ray', 'MLOps'], hm: 'S. Rao', slaHours: 96, ageH: 26,
          target: 10, owner: 'AG-SRC-02', status: 'OPEN' },
        { id: 'REQ-2409', title: 'Fullstack Architect · Payments', urgency: 'P1', mode: 'Remote · Global',
          skills: ['TypeScript', 'Node', 'Postgres'], hm: 'M. Fischer', slaHours: 120, ageH: 41,
          target: 8, owner: 'AG-SRC-02', status: 'OPEN' },
        { id: 'REQ-2402', title: 'Head of Security Engineering', urgency: 'P0', mode: 'On-site · San Francisco',
          skills: ['AppSec', 'SOC 2', 'Team Leadership'], hm: 'CEO Office', slaHours: 24, ageH: 19,
          target: 6, owner: null, status: 'OPEN' },
        { id: 'REQ-2398', title: 'Frontend Engineer II', urgency: 'P2', mode: 'Hybrid · Berlin',
          skills: ['React', 'Tailwind', 'A11y'], hm: 'K. Vogel', slaHours: 240, ageH: 73,
          target: 15, owner: null, status: 'BACKLOG' },
    ].map(r => ({ ...r, createdAt: now - r.ageH * 3600e3, shortlisted: 0 }));
}

/* ---------- Candidate dossier seeds ---------- */
function seedCandidates() {
    return [
        {
            id: 'CND-8801', name: 'Marcus Chen', headline: 'Principal Engineer · Distributed Storage', company: 'Cohesity',
            location: 'Singapore', reqId: 'REQ-2417', stage: 'SCREENING', status: 'waiting', score: 68,
            assignedAgent: 'AG-VER-01', exceptionId: 'EXC-4401', responded: false, createdAt: Date.now() - 5400e3,
            skills: ['Go', 'Raft', 'Kubernetes', 'gRPC'], experience: '11 yrs · ex-Stripe, ex-Vmware',
            verification: { score: 68, confidence: 0.61, summary: 'Timeline gap of 7 months in 2021; claimed Staff scope at Cohesity unverified. GitHub active but repos are forks.', flags: ['Employment timeline gap', 'Claimed title unverified'], github: { repos: 24, commits24h: 3 } },
            outreach: { state: 'not_started' }, scheduling: { state: 'none' },
            reasoning: [{ agent: 'Verify-7', at: Date.now() - 560e3, text: 'Match score 68 < threshold 75. Experience claim confidence 0.61 — escalating to recruiter before any outreach is drafted.' }],
            handoffs: [{ from: 'Orion', to: 'Verify-7', at: Date.now() - 720e3, note: 'Profile enriched · 4 skill signals' }],
        },
        {
            id: 'CND-8802', name: 'Priya Raghavan', headline: 'Senior Backend Engineer · Payments', company: 'Razorpay',
            location: 'Bengaluru', reqId: 'REQ-2417', stage: 'OUTREACH', status: 'waiting', score: 87,
            assignedAgent: 'AG-OUT-01', exceptionId: 'EXC-4402', responded: true, createdAt: Date.now() - 4300e3,
            skills: ['Java', 'Kafka', 'Stripe API', 'DDD'], experience: '8 yrs · ex-Flipkart, ex-Amazon',
            verification: { score: 87, confidence: 0.89, summary: 'Consistent payments-domain track record. Open-source Kafka connector maintainer.', flags: [], github: { repos: 31, commits24h: 9 } },
            outreach: { state: 'replied', subject: 'Your Kafka connector work + a Staff-level payments role',
                body: "Hi Priya — your Kafka-based outbox connector (2.1k stars) is exactly the pattern we're rebuilding at scale. Open to a 20-min chat about a Staff Distributed Systems role?",
                reply: "Thanks — interested. Before I invest time: what's the comp band and is this role fully remote? Also, is the team on-call heavy?" },
            scheduling: { state: 'none' },
            reasoning: [
                { agent: 'Echo', at: Date.now() - 900e3, text: 'Draft personalised around maintained OSS project; tone: peer-to-peer, 118 words.' },
                { agent: 'Sentiment-01', at: Date.now() - 240e3, text: 'Reply sentiment 0.31 (guarded). Signals: compensation negotiation + remote policy + on-call concern. Requires human response.' },
            ],
            handoffs: [{ from: 'Verify-7', to: 'Echo', at: Date.now() - 960e3, note: 'Verified 87/100 · outreach authorised' }],
        },
        {
            id: 'CND-8803', name: 'Elena Petrova', headline: 'Staff SRE · Edge Platform', company: 'Cloudflare',
            location: 'Belgrade', reqId: 'REQ-2417', stage: 'SCHEDULING', status: 'active', score: 93,
            assignedAgent: 'AG-SCH-01', responded: true, createdAt: Date.now() - 3600e3,
            skills: ['Rust', 'BGP', 'Terraform', 'eBPF'], experience: '10 yrs · ex-Cloudflare, ex-RedHat',
            verification: { score: 93, confidence: 0.94, summary: 'Direct edge-platform ownership. Talk recordings confirm systems depth.', flags: [], github: { repos: 18, commits24h: 6 } },
            outreach: { state: 'replied', subject: 'Edge platform at P0 urgency — your eBPF work',
                body: 'Hi Elena — your eBPF talk at KubeCon caught our eye. We are hiring a Staff SRE for a P0 distributed-systems req. Worth 20 minutes?',
                reply: 'Happy to talk this week — mornings CET work best.' },
            scheduling: { state: 'offered', slots: ['Thu 09:30 CET', 'Fri 11:00 CET'] },
            reasoning: [{ agent: 'Tempo', at: Date.now() - 300e3, text: 'Candidate prefers mornings CET; proposed 2 slots, awaiting confirmation.' }],
            handoffs: [{ from: 'Echo', to: 'Tempo', at: Date.now() - 420e3, note: 'Positive reply · intent flag set' }],
        },
        {
            id: 'CND-8804', name: 'Aisha Bello', headline: 'Backend Engineer · Infrastructure', company: 'Paystack',
            location: 'Lagos', reqId: 'REQ-2412', stage: 'OUTREACH', status: 'active', score: 84,
            assignedAgent: 'AG-OUT-02', responded: false, createdAt: Date.now() - 2700e3,
            skills: ['Python', 'Ray', 'Kubernetes'], experience: '6 yrs · ex-Paystack, ex-Interswitch',
            verification: { score: 84, confidence: 0.86, summary: 'Strong infra fundamentals; limited large-scale ML platform exposure.', flags: [], github: { repos: 12, commits24h: 4 } },
            outreach: { state: 'sent', subject: 'ML Platform Engineer — Ray + Kubernetes stack',
                body: 'Hi Aisha — your Ray tuning notes were excellent. We have an ML Platform Engineer req (P1) that matches your infra background.' },
            scheduling: { state: 'none' },
            reasoning: [{ agent: 'Blitz', at: Date.now() - 600e3, text: 'Sent in 09:00–11:00 local window · open-rate tracking enabled.' }],
            handoffs: [{ from: 'Credence', to: 'Blitz', at: Date.now() - 660e3, note: 'Verified 84/100 · auto-send permitted' }],
        },
        {
            id: 'CND-8805', name: 'Diego Ramirez', headline: 'Staff Engineer · Observability', company: 'Datadog',
            location: 'Madrid', reqId: 'REQ-2417', stage: 'SHORTLISTED', status: 'done', score: 96,
            assignedAgent: 'AG-SCH-01', responded: true, createdAt: Date.now() - 9000e3,
            skills: ['Go', 'OpenTelemetry', 'Prometheus'], experience: '12 yrs · ex-Datadog, ex-Cabify',
            verification: { score: 96, confidence: 0.97, summary: 'Textbook match: owns observability pipeline at comparable scale.', flags: [], github: { repos: 40, commits24h: 12 } },
            outreach: { state: 'replied', subject: 'Observability at our scale — Staff role', body: 'Hi Diego — your OTel sampling work is directly relevant.', reply: 'Interested — send details.' },
            scheduling: { state: 'booked', slots: ['Wed 16:00 CET'], interview: 'Technical Interview · Wed 16:00 CET · Panel: J. Okafor, R. Silva' },
            reasoning: [{ agent: 'Tempo', at: Date.now() - 3000e3, text: 'Invite confirmed by candidate + panel. Handed to recruiter dossier.' }],
            handoffs: [{ from: 'Tempo', to: 'Aarthi Menon', at: Date.now() - 2900e3, note: 'Interview booked · full dossier attached' }],
        },
        {
            id: 'CND-8806', name: 'Yuki Tanaka', headline: 'Senior Engineer · Streaming', company: 'Money Forward',
            location: 'Tokyo', reqId: 'REQ-2409', stage: 'SOURCING', status: 'active', score: null,
            assignedAgent: 'AG-SRC-02', responded: false, createdAt: Date.now() - 480e3,
            skills: ['TypeScript', 'Kafka', 'NestJS'], experience: '7 yrs',
            verification: null, outreach: { state: 'not_started' }, scheduling: { state: 'none' },
            reasoning: [{ agent: 'Nova', at: Date.now() - 400e3, text: 'Discovered via talent-graph traversal: 3/4 signal phrases matched job spec.' }],
            handoffs: [],
        },
        {
            id: 'CND-8807', name: 'Sana Iqbal', headline: 'Staff ML Engineer', company: 'Careem',
            location: 'Dubai', reqId: 'REQ-2412', stage: 'SHORTLISTED', status: 'done', score: 91,
            assignedAgent: 'AG-SCH-01', responded: true, createdAt: Date.now() - 12000e3,
            skills: ['PyTorch', 'Ray', 'Feature Stores'], experience: '9 yrs',
            verification: { score: 91, confidence: 0.92, summary: 'Owned feature-store migration for 400+ models.', flags: [], github: { repos: 15, commits24h: 5 } },
            outreach: { state: 'replied', subject: 'ML Platform · feature store at scale', body: 'Your feature-store migration is exactly our problem.', reply: 'Let us talk.' },
            scheduling: { state: 'booked', slots: ['Tue 14:00 IST'], interview: 'Technical Interview · Tue 14:00 IST' },
            reasoning: [{ agent: 'Tempo', at: Date.now() - 8000e3, text: 'Booked in 1 exchange — zero back-and-forth.' }],
            handoffs: [{ from: 'Tempo', to: 'Aarthi Menon', at: Date.now() - 7900e3, note: 'Interview booked' }],
        },
        {
            id: 'CND-8808', name: 'Tobias Lund', headline: 'Security Engineer · AppSec', company: 'Klarna',
            location: 'Stockholm', reqId: 'REQ-2402', stage: 'SCREENING', status: 'active', score: null,
            assignedAgent: 'AG-VER-01', responded: false, createdAt: Date.now() - 900e3,
            skills: ['AppSec', 'Threat Modeling', 'Go'], experience: '8 yrs',
            verification: null, outreach: { state: 'not_started' }, scheduling: { state: 'none' },
            reasoning: [{ agent: 'Orion', at: Date.now() - 850e3, text: 'Leadership-track requisition (Head of Security Engineering) — exec-review gate armed, human release required regardless of score.' }],
            handoffs: [{ from: 'Orion', to: 'Verify-7', at: Date.now() - 800e3, note: 'Leadership role · exec-review gate armed' }],
        },
    ];
}

/* ---------- Pending HITL exceptions at boot ---------- */
function seedExceptions() {
    const now = Date.now();
    return [
        {
            id: 'EXC-4401', candidateId: 'CND-8801', reqId: 'REQ-2417', type: 'LOW_CONFIDENCE',
            severity: 'HIGH', status: 'PENDING', createdAt: now - 555e3, agentId: 'AG-VER-01',
            title: 'Marcus Chen · match score 68% below threshold',
            reason: 'Verification confidence 0.61 — employment timeline gap detected and current-title claim unverified.',
            detail: { score: 68, threshold: 75, flags: ['Employment timeline gap (7 months, 2021)', 'Claimed title unverified'] },
        },
        {
            id: 'EXC-4402', candidateId: 'CND-8802', reqId: 'REQ-2417', type: 'SENTIMENT',
            severity: 'MEDIUM', status: 'PENDING', createdAt: now - 235e3, agentId: 'AG-OUT-01',
            title: 'Priya Raghavan · compensation & remote-policy questions',
            reason: 'Sentiment 0.31 (guarded). Candidate raised comp band, remote policy and on-call load — policy requires a human-authored reply.',
            detail: { sentiment: 0.31, signals: ['compensation negotiation', 'remote policy', 'on-call concern'],
                reply: 'Thanks — interested. Before I invest time: what\'s the comp band and is this role fully remote? Also, is the team on-call heavy?' },
        },
    ];
}

/* ---------- Seed audit stream ---------- */
function seedAudit() {
    const t = Date.now();
    const rows = [
        [0,    'Aarthi Menon', 'human', 'APPROVED',           'REQ-2417', 'Score override 68 → 79 accepted for A. Silva · note: “portfolio compensates for timeline gap”'],
        [95,   'Tempo',        'ai',    'INTERVIEW_BOOKED',   'REQ-2417', 'CND-8805 Diego Ramirez · Wed 16:00 CET · invite accepted by panel'],
        [180,  'Echo',         'ai',    'RESPONSE_RECEIVED',  'REQ-2417', 'CND-8802 Priya Raghavan replied · sentiment 0.31 → routed to HITL'],
        [235,  'Sentiment-01', 'ai',    'EXCEPTION_TRIGGERED','REQ-2417', 'EXC-4402 type=SENTIMENT severity=MEDIUM · held by AG-OUT-01'],
        [300,  'Tempo',        'ai',    'SLOT_OFFERED',       'REQ-2417', 'CND-8803 Elena Petrova · 2 slots offered (Thu 09:30 / Fri 11:00 CET)'],
        [420,  'Echo',         'ai',    'EMAIL_SENT',         'REQ-2417', 'CND-8803 · subject “Edge platform at P0 urgency — your eBPF work” · prompt #4a2f'],
        [555,  'Verify-7',     'ai',    'EXCEPTION_TRIGGERED','REQ-2417', 'EXC-4401 type=LOW_CONFIDENCE score=68<thr=75 · held by AG-VER-01'],
        [660,  'Credence',     'ai',    'HANDOFF',            'REQ-2412', 'CND-8804 Verification → Outreach (Blitz) · context: 4 signals, confidence 0.86'],
        [720,  'Orion',        'ai',    'VERIFIED',           'REQ-2417', 'CND-8801 score 68/100 · 2 flags raised'],
        [800,  'Orion',        'ai',    'HANDOFF',            'REQ-2402', 'CND-8808 Sourcing → Screening · P0 exec-review gate armed'],
        [900,  'Nova',         'ai',    'SOURCED',            'REQ-2409', 'CND-8806 Yuki Tanaka · talent-graph match 3/4 signals'],
        [1080, 'Blitz',        'ai',    'EMAIL_SENT',         'REQ-2412', 'CND-8804 · campaign variant B · send-window 09:00 local'],
        [1240, 'Aarthi Menon', 'human', 'RE_ASSIGN',          'REQ-2412', 'EXC-4399 reassigned Verify-7 → Credence · reason: “calibration drift”'],
        [1400, 'Nova',         'ai',    'ASSIGNED',           'REQ-2412', 'Sourcing task allocated by priority engine · score 0.71 (P1)'],
        [1620, 'Verify-7',     'ai',    'ERROR',              'REQ-2412', 'Task timeout on employment_registry (504) · retry #1 scheduled'],
        [1710, 'Verify-7',     'ai',    'RECOVERED',          'REQ-2412', 'Retry succeeded via fallback endpoint · task completed'],
        [1980, 'ControlTower', 'ai',    'PRIORITIZED',        'REQ-2417', 'Backlog re-scored · REQ-2417 promoted to rank 1 (score 0.94)'],
        [2260, 'Echo',         'ai',    'APPROVED',           'REQ-2412', 'Draft review auto-cleared · confidence ≥ autoSend floor'],
        [2600, 'Orion',        'ai',    'SOURCED',            'REQ-2417', '3 profiles discovered · enriched 12 attributes'],
        [3100, 'Scout',        'ai',    'OFFLINE',            '—',        'Agent disabled by HUM-03 Laura Kim · cost policy'],
        [3600, 'ControlTower', 'ai',    'JOB_POSTED',         'REQ-2402', 'Ingested from Greenhouse webhook · urgency P0 · SLA 24h'],
        [4200, 'Aarthi Menon', 'human', 'REJECTED',           'REQ-2409', 'EXC-4394 · candidate not aligned to level bar'],
        [5400, 'ControlTower', 'ai',    'SYSTEM',             '—',        'Orchestrator booted · 8 agents registered · 3 humans onboarded'],
    ];
    return rows.map(([minsAgo, actor, actorType, action, reqId, details], i) => ({
        id: 'LOG-' + (9000 - i), ts: t - minsAgo * 1000, actor, actorType, action, reqId, details,
    }));
}

/* ---------- Simulation profile pool ---------- */
const PROFILE_POOL = [
    { name: 'Hannah Wolfe',   headline: 'Senior Engineer · Streaming Infra', company: 'Confluent',   location: 'London',      skills: ['Kafka', 'Flink', 'Go'],          experience: '8 yrs · ex-Confluent, ex-Bloomberg', base: 88 },
    { name: 'Omar Haddad',    headline: 'Staff Backend Engineer',           company: 'Datadog',      location: 'Paris',       skills: ['Go', 'gRPC', 'Cassandra'],       experience: '10 yrs · ex-Datadog, ex-UBL',      base: 92 },
    { name: 'Ana Costa',      headline: 'Platform Engineer · K8s',          company: 'Red Hat',      location: 'Lisbon',      skills: ['Kubernetes', 'Operators', 'Go'], experience: '7 yrs',                              base: 79 },
    { name: 'Ravi Krishnan',  headline: 'Distributed Systems Engineer',     company: 'Uber',         location: 'Hyderabad',   skills: ['Java', 'Zookeeper', 'Kafka'],    experience: '9 yrs · ex-Uber, ex-Amazon',       base: 68 },
    { name: 'Mira Jansen',    headline: 'Site Reliability Engineer',        company: 'Adyen',        location: 'Amsterdam',   skills: ['eBPF', 'Terraform', 'Rust'],     experience: '6 yrs',                              base: 84 },
    { name: 'Kenji Sato',     headline: 'Principal Engineer · Storage',     company: 'Mercari',      location: 'Tokyo',       skills: ['Rust', 'Raft', 'S3'],            experience: '13 yrs',                             base: 95 },
    { name: 'Lucia Ferrari',  headline: 'Backend Engineer · Fintech',       company: 'N26',          location: 'Berlin',      skills: ['Kotlin', 'Postgres', 'Kafka'],   experience: '7 yrs',                              base: 82 },
    { name: 'Sam Okafor',     headline: 'Infrastructure Engineer',          company: 'Vercel',       location: 'Austin',      skills: ['Edge', 'Rust', 'WASM'],          experience: '6 yrs',                              base: 86 },
    { name: 'Fatima Zahra',   headline: 'Staff Engineer · Data Plane',      company: 'Datadog',      location: 'Casablanca',  skills: ['Go', 'Kafka', 'ClickHouse'],     experience: '11 yrs',                             base: 90 },
    { name: 'Noah Becker',    headline: 'Backend Engineer · Payments',      company: 'Stripe',       location: 'Dublin',      skills: ['Ruby', 'Postgres', 'Kafka'],     experience: '8 yrs · ex-Stripe, ex-PayPal',      base: 87 },
];

/* ---------- Requisition templates for "New Requisition" action ---------- */
const REQ_TEMPLATES = [
    { title: 'Staff Distributed Systems Engineer', urgency: 'P0', skills: ['Rust', 'Kafka', 'Kubernetes'], mode: 'Remote · US/EU', slaHours: 48 },
    { title: 'Senior ML Systems Engineer',         urgency: 'P1', skills: ['PyTorch', 'CUDA', 'Triton'],   mode: 'Hybrid · Bengaluru', slaHours: 96 },
    { title: 'Principal Frontend Architect',        urgency: 'P1', skills: ['React', 'TypeScript', 'WebGL'], mode: 'Remote · Global', slaHours: 120 },
    { title: 'Head of Security Engineering',        urgency: 'P0', skills: ['AppSec', 'SOC 2'],             mode: 'On-site · SF', slaHours: 24 },
    { title: 'Data Platform Engineer',              urgency: 'P2', skills: ['Spark', 'Iceberg', 'dbt'],     mode: 'Hybrid · Berlin', slaHours: 240 },
];
