# Recruiting Agent Control Tower (SW-06)

> **Autonomous Multi-Agent Orchestration & Human-in-the-Loop Governance for Talent Acquisition**  
> *Built for KERNEL PRIME '26 Hackathon · Oct 8, 2026*

---

## 🎯 Executive Overview

Modern talent acquisition teams are moving from single standalone recruiting bots to **fleets of specialized AI agents** (sourcing, candidate verification, personalized outreach, interview scheduling, market intelligence).

The **Recruiting Agent Control Tower** solves the orchestration, priority dispatch, and governance challenges:
- **Prioritization & Dispatch:** Dynamically scores requisitions by urgency ($P0/P1/P2$), backlog depth, and SLA risk ($50/25/25\%$ weights).
- **Multi-Agent State Pipeline:** Preserves rich candidate context, dossiers, and reasoning traces across handoffs (`SOURCING` ➔ `SCREENING` ➔ `OUTREACH` ➔ `SCHEDULING` ➔ `SHORTLISTED`).
- **Human-in-the-Loop (HITL) Guardrails:** Enforces human gates on confidence floors ($<75\%$), candidate sentiment anomalies ($<0.50$), supervised draft reviews ($<80\%$), and executive leadership requisitions (`execReview`).
- **Live LLM Agent Copilot:** Real-time generation powered by cloud-routed LLMs (`auto/fast` via OmniRoute proxy) for outreach generation, screening summaries, and governance recommendations.
- **Enterprise Integrations:** Native connectors for ATS (Greenhouse, Ashby, Lever), CRM (Salesforce Talent), and Communications (Slack, Gmail/SMTP, Google Calendar, Zoom, LinkedIn, GitHub).
- **Observability & Audit:** Immutable audit trail, funnel conversion metrics, SLA compliance, and agent fleet telemetry.

---

## 🏗️ System Architecture

```
                       ┌──────────────────────────────┐
                       │   Open Requisitions Queue    │
                       │   (P0 Urgent, P1 High, P2)   │
                       └──────────────┬───────────────┘
                                      │
                       ┌──────────────▼───────────────┐
                       │     Control Tower Engine     │
                       │  - Requisition Dispatcher    │
                       │  - Capacity & SLA Router     │
                       │  - HITL Policy Guardrails    │
                       └──────────────┬───────────────┘
                                      │
         ┌────────────────────────────┼────────────────────────────┐
         │                            │                            │
┌────────▼────────┐          ┌────────▼────────┐          ┌────────▼────────┐
│  Sourcing Agent │          │ Verification    │          │ Outreach Agent  │
│  - Orion / Nova │ ──State─►│ Agent (Verify-7)│ ──State─►│ - Echo / Blitz  │
│  - Talent Graph │  Handoff │ - Repo Activity │  Handoff │ - LLM Drafts    │
└─────────────────┘          │ - Match Scoring │          └────────┬────────┘
                             └────────┬────────┘                   │
                                      │                            │
                                      │ (Confidence < 75%)         │ (Supervised / Sentiment < 0.5)
                                      └─────────────┬──────────────┘
                                                    │
                                     ┌──────────────▼──────────────┐
                                     │   HITL Exception Center     │
                                     │   (Human Recruiter Review)  │
                                     │   - AI Recommendation       │
                                     │   - Approve / Override /    │
                                     │     Reassign / Reject       │
                                     └──────────────┬──────────────┘
                                                    │
                                     ┌──────────────▼──────────────┐
                                     │  Scheduling Agent & Handoff │
                                     │  - Tempo (Calendar / Zoom)  │
                                     │  - Shortlist & ATS Sync     │
                                     └─────────────────────────────┘
```

---

## 🚀 Key Modules & Tabs

1. **Dashboard (Mission Control):**
   - KPI telemetry (Open Requisitions, Active AI Agents, Pending Approvals, Funnel Throughput, Avg Handoff Latency).
   - Priority Dispatch Board with configurable weights ($W_{urgency}, W_{backlog}, W_{sla}$).
   - Policy Guardrail sliders (Score Floor, Auto-send Floor, Sentiment Floor, Leadership Gate).
   - Live Agent Pulse grid + Real-time activity ticker.

2. **Pipeline (Kanban Flow):**
   - 5-stage candidate board (`Sourcing`, `Screening`, `Outreach`, `Scheduling`, `Shortlisted`).
   - Deep **Candidate Dossier Drawer** with multi-agent handoff history, structured context payloads, and full reasoning traces.

3. **HITL Queue (Exception Action Center):**
   - Instant triage for blocked candidates (Low Confidence, Sentiment Anomaly, Supervised Draft Review, Compliance Gate).
   - **AI Governance Copilot:** Generates 1-click recommendations and reference reply suggestions.
   - Actions: `Approve & Proceed`, `Override Score/Draft`, `Re-assign Agent`, `Reject`.

4. **Agent & Human Registry:**
   - Unified directory of 8 AI Agents (`Orion`, `Nova`, `Verify-7`, `Credence`, `Echo`, `Blitz`, `Tempo`, `Scout`) and 3 Human Recruiters.
   - Per-agent Autonomy switch (`FULL_AUTO`, `SUPERVISED`, `READ_ONLY`), live load meters, success rates, latency, and kill-switches.

5. **Integrations (ATS / CRM / Comms):**
   - 10 pre-configured enterprise connectors (Greenhouse, Ashby, Lever, Salesforce CRM, Slack, Gmail SMTP, Google Calendar, Zoom, LinkedIn, GitHub).
   - One-click health checks, live syncs (pulls real candidates & requisitions), test messaging, and inbound webhook listener.

6. **Analytics & Funnel Observability:**
   - 5-stage conversion funnel with step-by-step dropoff analysis.
   - Recruiter productivity benchmarks (AI agent fleet vs traditional workflow).
   - SLA compliance gauge & exception breakdown charts.

7. **Audit Log:**
   - Searchable, filterable event stream of every dispatch, handoff, score calculation, policy trigger, and human decision.
   - CSV export capability for compliance.

---

## ⌨️ Keyboard Shortcuts

| Key | Action |
|---|---|
| `Space` | Start / Stop Live Simulation |
| `P` | Pause / Resume all in-flight agents |
| `S` | Cycle Simulation Speed ($1\times \rightarrow 2\times \rightarrow 4\times$) |
| `M` | Switch to **Dashboard** |
| `D` | Switch to **Pipeline** |
| `H` | Switch to **HITL Queue** |
| `R` | Switch to **Registry** |
| `I` | Switch to **Integrations** |
| `A` | Switch to **Analytics** |
| `L` | Switch to **Audit Log** |
| `Esc` | Close Dossier Drawer / Modal |

---

## 💻 Running the Application

### Option 1: Full AI Agent Stack (Recommended)
Run the Python server to serve the frontend and activate the real LLM agent proxy:
```bash
python3 server.py 8080
```
Open **`http://127.0.0.1:8080/`** in your browser.

### Option 2: Static Standalone Demo (No Backend)
The frontend runs purely in any modern browser without build steps (Tailwind CDN + Lucide CDN):
```bash
python3 -m http.server 8080
```
*(When running without `server.py`, the AI agent gracefully falls back to structured templates).*

---

## 🛠️ Technology Stack

- **Frontend:** Vanilla ES6+ JavaScript, Tailwind CSS (CDN), Lucide Icons, HTML5 Canvas Charts.
- **Backend / AI Runtime:** Lightweight Python 3 HTTP Server (`server.py`) with streaming reverse proxy to OmniRoute gateway (`auto/fast`).
- **Zero Build Step:** No Webpack/Vite/Node required — runs instantly out of the box.
