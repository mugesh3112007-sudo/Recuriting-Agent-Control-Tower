/* ============================================================
   main.js — boot, event wiring, global exports for inline handlers
   ============================================================ */

/* ---- globals for inline onclick ---- */
window.switchTab = switchTab;
window.decideException = decideException;
window.openDrawer = openDrawer;
window.closeDrawer = closeDrawer;
window.drawerTab = drawerTab;
window.openReqModal = openReqModal;
window.openOverrideModal = openOverrideModal;
window.openReassignModal = openReassignModal;
window.openRejectModal = openRejectModal;
window.submitOverride = submitOverride;
window.submitReassign = submitReassign;
window.submitReject = submitReject;
window.setAutonomy = setAutonomy;
window.toggleAgent = toggleAgent;
window.exportAudit = exportAudit;
window.updateRule = updateRule;
window.toggleRule = toggleRule;
window.commitRule = commitRule;
window.updateWeight = updateWeight;
window.state = state;
window.SIM = SIM;
window.renderIntegrations = typeof renderIntegrations !== 'undefined' ? renderIntegrations : null;

/* ---- Boot ---- */
function boot() {
    lucide.createIcons();
    renderAll();

    /* Probe the LLM agent runtime (server.py → OmniRoute) */
    if (typeof AIAgent !== 'undefined') AIAgent.health();

    /* Header controls */
    $('#simBtn')?.addEventListener('click', () => {
        if (SIM.running) { stopSimulation(); }
        else { startSimulation(); }
    });
    $('#pauseBtn')?.addEventListener('click', togglePause);
    $('#speedBtn')?.addEventListener('click', cycleSpeed);
    $('#soundBtn')?.addEventListener('click', () => { Sound.enabled = !Sound.enabled; Sound.play(Sound.enabled ? 'info' : 'tick'); renderAll(); });

    /* Tab clicks */
    $$('.tab-btn').forEach(b => b.addEventListener('click', () => {
        const tab = b.dataset.tab; if (tab) switchTab(tab);
    }));

    /* Click outside drawer/modal to close */
    document.addEventListener('click', e => {
        const drawer = $('#drawer');
        if (drawer.classList.contains('open') &&
            !drawer.contains(e.target) &&
            !e.target.closest('[onclick*="openDrawer"]') &&
            !e.target.closest('.candidate-card')) {
            closeDrawer();
        }
    });
    $('#modalRoot')?.addEventListener('click', closeModal);

    /* Uptime ticker */
    setInterval(() => {
        const uptime = Date.now() - state.metrics.startedAt;
        const h = Math.floor(uptime / 3600e3), m = Math.floor((uptime % 3600e3) / 60e3), s = Math.floor((uptime % 60e3) / 1000);
        const u = $('#hdrUptime'); if (u) u.textContent = `UPTIME ${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
        const ev = $('#hdrEvents'); if (ev) ev.textContent = `EVENTS ${state.audit.length}`;
    }, 1000);

    /* Keyboard shortcuts */
    document.addEventListener('keydown', e => {
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') return;
        if (e.key === ' ') { e.preventDefault(); SIM.running ? stopSimulation() : startSimulation(); }
        else if (e.key === 'p' || e.key === 'P') togglePause();
        else if (e.key === 's' || e.key === 'S') cycleSpeed();
        else if (e.key === 'h' || e.key === 'H') switchTab('hitl');
        else if (e.key === 'a' || e.key === 'A') switchTab('analytics');
        else if (e.key === 'l' || e.key === 'L') switchTab('audit');
        else if (e.key === 'r' || e.key === 'R') switchTab('registry');
        else if (e.key === 'i' || e.key === 'I') switchTab('integrations');
        else if (e.key === 'd' || e.key === 'D') switchTab('pipeline');
        else if (e.key === 'm' || e.key === 'M') switchTab('dashboard');
        else if (e.key === 'Escape') { closeDrawer(); closeModal(); }
    });

    /* Initial metrics prime */
    metricsTick();

    console.log('%c🎯 Recruiting Agent Control Tower · SW-06', 'font-size:14px;color:#38bdf8;font-weight:600');
    console.log('%cShortcuts: Space=run/stop · P=pause · S=speed · H=hitl · A=analytics · L=audit · R=registry · I=integrations · D=pipeline · M=dashboard · Esc=close', 'color:#6b7280');
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();