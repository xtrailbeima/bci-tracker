const nodemailer = require('nodemailer');
const { getArticlesSince, getActiveSubscribers, getTrendingKeywords } = require('./db');

// ─── Gmail SMTP Config ───────────────────────────────
// Set these environment variables:
//   GMAIL_USER=your-email@gmail.com
//   GMAIL_APP_PASSWORD=xxxx-xxxx-xxxx-xxxx  (Google App Password)

function createTransporter() {
    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;
    if (!user || !pass) {
        console.warn('⚠️  GMAIL_USER / GMAIL_APP_PASSWORD not set. Email disabled.');
        return null;
    }
    return nodemailer.createTransport({
        service: 'gmail',
        auth: { user, pass }
    });
}

// ─── Generate HTML Briefing ──────────────────────────

function generateBriefingHTML(articles, trending) {
    const date = new Date().toLocaleDateString('zh-CN', { year: 'numeric', month: 'long', day: 'numeric' });

    // Group by category
    const critical = articles.filter(a => a.importanceLevel === 'critical' || a.importance >= 60);
    const journals = articles.filter(a => a.category === 'journal').slice(0, 5);
    const preprints = articles.filter(a => a.category === 'preprint').slice(0, 5);
    const news = articles.filter(a => a.category === 'news').slice(0, 5);

    function articleRow(item) {
        const badge = { critical: '🔴', high: '🟡', medium: '🔵', low: '⚪' }[item.importanceLevel] || '⚪';
        return `
        <tr style="border-bottom: 1px solid #2a2a3e;">
            <td style="padding: 12px; vertical-align: top;">
                <a href="${item.url}" style="color: #00f5d4; text-decoration: none; font-weight: 600;">${item.title}</a>
                ${item.titleZh ? `<br><span style="color: #a0a0b0; font-size: 13px;">${item.titleZh}</span>` : ''}
                ${item.abstract ? `<br><span style="color: #888; font-size: 12px;">${item.abstract.slice(0, 150)}...</span>` : ''}
            </td>
            <td style="padding: 12px; text-align: center; white-space: nowrap;">${badge} ${item.importance}</td>
            <td style="padding: 12px; color: #888; font-size: 12px;">${item.source || item.provider || ''}</td>
        </tr>`;
    }

    function sectionHTML(title, titleEn, items) {
        if (items.length === 0) return '';
        return `
        <h2 style="color: #00f5d4; border-bottom: 1px solid #333; padding-bottom: 8px; margin-top: 30px;">
            ${title} <span style="color: #666; font-weight: normal; font-size: 14px;">${titleEn}</span>
        </h2>
        <table style="width: 100%; border-collapse: collapse;">
            <thead>
                <tr style="color: #888; font-size: 12px; text-align: left;">
                    <th style="padding: 8px;">标题 / Title</th>
                    <th style="padding: 8px; text-align: center;">评分</th>
                    <th style="padding: 8px;">来源</th>
                </tr>
            </thead>
            <tbody>${items.map(articleRow).join('')}</tbody>
        </table>`;
    }

    const trendingHTML = trending.length > 0 ? `
        <h2 style="color: #00f5d4; border-bottom: 1px solid #333; padding-bottom: 8px; margin-top: 30px;">
            🔥 热门关键词 <span style="color: #666; font-weight: normal; font-size: 14px;">Trending Keywords</span>
        </h2>
        <div style="display: flex; flex-wrap: wrap; gap: 8px; margin: 16px 0;">
            ${trending.map(t => `<span style="background: #1a1a2e; border: 1px solid #333; padding: 4px 12px; border-radius: 16px; font-size: 13px; color: #ccc;">${t.keyword} (${t.count})</span>`).join('')}
        </div>
    ` : '';

    return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="background: #0d0d1a; color: #e0e0e8; font-family: -apple-system, 'Segoe UI', sans-serif; padding: 40px 20px; max-width: 700px; margin: 0 auto;">
        <div style="text-align: center; margin-bottom: 30px;">
            <h1 style="margin: 0; font-size: 24px;">
                <span style="color: #00f5d4;">🧠 BCI Tracker</span>
                <span style="color: #888; font-weight: normal; font-size: 16px;"> 每日简报 Daily Briefing</span>
            </h1>
            <p style="color: #666; margin: 8px 0;">${date} · 共 ${articles.length} 条新动态</p>
        </div>

        ${critical.length > 0 ? sectionHTML('⚡ 重点关注', 'Critical / High Importance', critical.slice(0, 5)) : ''}
        ${sectionHTML('📄 期刊论文', 'Journal Articles', journals)}
        ${sectionHTML('📋 预印本', 'Preprints', preprints)}
        ${sectionHTML('📰 产业动态', 'Industry News', news)}
        ${trendingHTML}

        <div style="text-align: center; margin-top: 40px; padding-top: 20px; border-top: 1px solid #333; color: #666; font-size: 12px;">
            <p>由 BCI Tracker 自动生成 · <a href="${process.env.RENDER_EXTERNAL_URL || 'https://bci-tracker-bait.onrender.com'}" style="color: #00f5d4;">查看完整面板</a></p>
            <p>如需退订，请回复此邮件</p>
        </div>
    </body>
    </html>`;
}

// ─── Send Briefing ───────────────────────────────────

async function sendDailyBriefing() {
    const subscribers = getActiveSubscribers();
    if (subscribers.length === 0) {
        console.log('📧 No subscribers. Skipping briefing.');
        return { sent: 0, skipped: 'no subscribers' };
    }

    const transporter = createTransporter();
    if (!transporter) {
        return { sent: 0, skipped: 'email not configured' };
    }

    // Get articles from the last 24 hours
    const articles = getArticlesSince(24);
    if (articles.length === 0) {
        console.log('📧 No new articles in last 24h. Skipping briefing.');
        return { sent: 0, skipped: 'no new articles' };
    }

    const trending = getTrendingKeywords({ limit: 10 });
    const html = generateBriefingHTML(articles, trending);
    const date = new Date().toLocaleDateString('zh-CN', { month: 'long', day: 'numeric' });

    const emails = subscribers.map(s => s.email);
    console.log(`📧 Sending briefing to ${emails.length} subscriber(s)...`);

    try {
        await transporter.sendMail({
            from: `"BCI Tracker" <${process.env.GMAIL_USER}>`,
            bcc: emails, // BCC for privacy
            subject: `🧠 BCI 每日简报 · ${date} · ${articles.length} 条新动态`,
            html
        });
        console.log(`✅ Briefing sent to ${emails.length} subscriber(s)`);
        return { sent: emails.length, articles: articles.length };
    } catch (err) {
        console.error('❌ Briefing send error:', err.message);
        return { sent: 0, error: err.message };
    }
}

module.exports = { sendDailyBriefing, generateBriefingHTML };
