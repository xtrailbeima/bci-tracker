const express = require('express');
const cors = require('cors');
const path = require('path');

const { securityHeaders, errorHandler } = require('./middleware/security');
const { fetchAndStore } = require('./services/fetcher');
const { sendDailyBriefing } = require('./briefing');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Middleware ───────────────────────────────────────────
app.use(cors());
app.use(express.json({ limit: '100kb' }));
app.use(securityHeaders);
app.use(express.static(path.join(__dirname, 'public')));

// ─── Routes ──────────────────────────────────────────────
app.use('/api', require('./routes/pubmed'));
app.use('/api', require('./routes/arxiv'));
app.use('/api', require('./routes/journals'));
app.use('/api', require('./routes/news'));
app.use('/api', require('./routes/api'));

// ─── Error Handler (must be last) ────────────────────────
app.use(errorHandler);

// ─── Scheduled Tasks ─────────────────────────────────────

const FETCH_INTERVAL = 30 * 60 * 1000; // 30 minutes

// Daily briefing: schedule for 8:00 AM Beijing time (UTC+8)
function scheduleDailyBriefing() {
    const now = new Date();
    const beijing = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Shanghai' }));
    const next8am = new Date(beijing);
    next8am.setHours(8, 0, 0, 0);
    if (beijing >= next8am) next8am.setDate(next8am.getDate() + 1);

    const msUntil8am = next8am - beijing;
    console.log(`📧 Daily briefing scheduled in ${Math.round(msUntil8am / 60000)} minutes`);

    setTimeout(() => {
        sendDailyBriefing();
        // Then repeat every 24 hours
        setInterval(sendDailyBriefing, 24 * 60 * 60 * 1000);
    }, msUntil8am);
}

// ─── Start ───────────────────────────────────────────────

app.listen(PORT, () => {
    console.log(`🧠 BCI Tracker v4.2 running at http://localhost:${PORT}`);
    console.log(`🛡️ Security headers: ON | Rate limiting: ON`);
    console.log(`📦 Modules: middleware/security, services/fetcher, routes/{pubmed,arxiv,journals,news,api}`);
    // Initial fetch after 3 seconds (so server is ready)
    setTimeout(() => fetchAndStore(PORT), 3000);
    // Repeat every 30 minutes
    setInterval(() => fetchAndStore(PORT), FETCH_INTERVAL);
    // Schedule daily briefing
    scheduleDailyBriefing();
});
