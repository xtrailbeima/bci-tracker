const express = require('express');
const router = express.Router();

const { rateLimit } = require('../middleware/security');
const { requireRole } = require('../middleware/auth');
const { searchArticles, getStats, getAllSources, getArticleById, getTrendingKeywords, getSourceHealth, addSubscriber, removeSubscriber, getCollections, getCollectionItems, addToCollection, removeFromCollection, createCollection, deleteCollection, upsertArticle, autoAssignCollections, logAudit } = require('../db');
const { sendDailyBriefing } = require('../briefing');
const deepseek = require('../services/deepseek');
const { extractArticleFromURL } = require('../services/import');
const { enrichItem } = require('../services/fetcher');

function audit(req, action, target, metadata) {
    logAudit({ user: req.user, action, target, metadata, ip: req.ip });
}

const READER_HIDDEN_ARTICLE_FIELDS = [
    'importance',
    'accessStatus',
    'contentQuality',
    'sourceReliability',
    'extractionMethod',
    'lastFetchStatus',
    'lastFetchError',
    'fetchedAt',
    'addedBy',
    'collectedAt',
];

function sanitizeArticleForRole(user, article) {
    if (user?.role !== 'reader' || !article || typeof article !== 'object') {
        return article;
    }
    const sanitized = { ...article };
    for (const field of READER_HIDDEN_ARTICLE_FIELDS) {
        delete sanitized[field];
    }
    return sanitized;
}

function sanitizeArticleResultForRole(user, result) {
    if (user?.role !== 'reader' || !result || !Array.isArray(result.items)) {
        return result;
    }
    return {
        ...result,
        items: result.items.map(item => sanitizeArticleForRole(user, item)),
    };
}

// ─── API: All (from database) ─────────────────────────────

router.get('/all', (req, res) => {
    try {
        const { q, category, source, sort, page, limit, from, to } = req.query;
        const result = searchArticles({
            query: q,
            category: category || 'all',
            source,
            sort: sort || 'importance',
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 50,
            dateFrom: from || undefined,
            dateTo: to || undefined
        });
        res.json(sanitizeArticleResultForRole(req.user, result));
    } catch (err) {
        console.error('DB query error:', err.message);
        res.json({ items: [], total: 0, page: 1, limit: 50, hasMore: false });
    }
});

// ─── API: Stats ───────────────────────────────────────────

router.get('/stats', (req, res) => {
    try {
        res.json(getStats());
    } catch (err) {
        res.json({ total: 0, journals: 0, preprints: 0, news: 0 });
    }
});

router.get('/source-health', requireRole('owner', 'operator'), (req, res) => {
    try {
        res.json(getSourceHealth());
    } catch (err) {
        res.json([]);
    }
});

// ─── API: Collections ─────────────────────────────────────

router.get('/collections', (req, res) => {
    try {
        res.json(getCollections());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/collections/:id', (req, res) => {
    try {
        const { page, limit } = req.query;
        const data = getCollectionItems(parseInt(req.params.id), {
            page: parseInt(page) || 1,
            limit: parseInt(limit) || 50
        });
        res.json(sanitizeArticleResultForRole(req.user, data));
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/collections', requireRole('owner', 'operator'), express.json(), (req, res) => {
    try {
        const { name, icon } = req.body;
        if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
        // Input validation (security-auditor skill)
        const safeName = name.slice(0, 50).replace(/[<>"'&]/g, '');
        const safeIcon = (icon || '📁').slice(0, 4);
        const result = createCollection(safeName, safeIcon);
        audit(req, 'collection.create', safeName);
        res.json({ id: result.lastInsertRowid, name: safeName, icon: safeIcon });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/collections/:id/add', requireRole('owner', 'operator'), express.json(), (req, res) => {
    try {
        const { articleId } = req.body;
        addToCollection(parseInt(req.params.id), articleId, 'manual');
        audit(req, 'collection.add_item', String(req.params.id), { articleId });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/collections/:collectionId/items/:articleId', requireRole('owner', 'operator'), (req, res) => {
    try {
        removeFromCollection(parseInt(req.params.collectionId), parseInt(req.params.articleId));
        audit(req, 'collection.remove_item', String(req.params.collectionId), { articleId: req.params.articleId });
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/collections/:id', requireRole('owner', 'operator'), (req, res) => {
    try {
        deleteCollection(parseInt(req.params.id));
        audit(req, 'collection.delete', String(req.params.id));
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Sources ─────────────────────────────────────────

router.get('/sources', (req, res) => {
    try {
        const { category } = req.query;
        if (category && category !== 'all') {
            const result = searchArticles({ category, limit: 1000 });
            const sources = [...new Set(result.items.map(i => i.provider))].filter(Boolean);
            return res.json(sources);
        }
        res.json(getAllSources());
    } catch (err) {
        res.json([]);
    }
});

// ─── API: Trending ────────────────────────────────────────

router.get('/trending', (req, res) => {
    try {
        const { period } = req.query; // week, month, quarter, year
        const now = new Date();
        let dateFrom;
        switch (period) {
            case 'week': dateFrom = new Date(now - 7 * 86400000).toISOString(); break;
            case 'month': dateFrom = new Date(now - 30 * 86400000).toISOString(); break;
            case 'quarter': dateFrom = new Date(now - 90 * 86400000).toISOString(); break;
            case 'year': dateFrom = new Date(now - 365 * 86400000).toISOString(); break;
            default: dateFrom = undefined;
        }
        res.json(getTrendingKeywords({ dateFrom, limit: 15 }));
    } catch (err) {
        res.json([]);
    }
});

// ─── API: Subscribe ───────────────────────────────────────

router.post('/subscribe', rateLimit(60000, 5), (req, res) => {
    try {
        const { email, name } = req.body;
        // Stricter email validation (security-auditor skill)
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
        if (!email || !emailRegex.test(email) || email.length > 255) {
            return res.status(400).json({ error: '请提供有效的邮箱地址' });
        }
        const safeName = (name || '').slice(0, 100).replace(/[<>"'&]/g, '');
        addSubscriber(email.trim().toLowerCase(), safeName);
        res.json({ success: true, message: '订阅成功！' });
    } catch (err) {
        console.error('Subscribe error:', err.message);
        res.status(500).json({ error: '订阅失败' });
    }
});

router.post('/unsubscribe', (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: '请提供邮箱' });
        removeSubscriber(email.trim().toLowerCase());
        res.json({ success: true, message: '已退订' });
    } catch (err) {
        res.status(500).json({ error: '退订失败' });
    }
});

// ─── API: Manual Briefing Trigger ─────────────────────────

router.post('/briefing/send', requireRole('owner'), async (req, res) => {
    try {
        const result = await sendDailyBriefing();
        audit(req, 'briefing.send', 'daily');
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Legacy Summary Compatibility ───────────────────

let cachedSummary = null;
let summaryLastGenerated = 0;
const SUMMARY_CACHE_TTL = 45 * 60 * 1000; // 45 minutes

const LEGACY_SUMMARY_SECTIONS = [
    {
        title: '🏢 重点公司动态',
        icon: '🏢',
        keywords: ['neuralink', 'synchron', 'blackrock', 'paradromics', 'precision', 'axon', 'axoft', '强脑', '脑虎', '博睿康', '公司', '合作']
    },
    {
        title: '💰 融资与投资',
        icon: '💰',
        keywords: ['融资', '投资', 'funding', 'financing', 'venture', 'seed', 'series', 'ipo', 'acquisition', '并购', '轮融资']
    },
    {
        title: '🔬 技术突破',
        icon: '🔬',
        keywords: ['electrode', 'implant', 'ultrasound', 'eeg', 'decoder', 'algorithm', 'flexible', 'neural', 'interface', '电极', '植入', '超声', '算法', '柔性']
    },
    {
        title: '📊 行业趋势',
        icon: '📊',
        keywords: []
    }
];

function itemMatchesKeywords(item, keywords) {
    if (!keywords.length) return true;
    const haystack = `${item.title || ''} ${item.titleZh || ''} ${item.abstract || ''} ${item.source || ''}`.toLowerCase();
    return keywords.some(keyword => haystack.includes(keyword.toLowerCase()));
}

function summarizeLegacyItem(item) {
    const source = item.source || item.provider || '未知来源';
    const title = item.titleZh || item.title || '未命名动态';
    const clippedTitle = title.length > 72 ? `${title.slice(0, 72)}...` : title;
    return {
        text: `${clippedTitle}（${source}）`,
        url: item.url || '',
        importance: Math.max(0, Math.min(100, Number(item.importance) || 0))
    };
}

function buildLegacySummary(items) {
    const usedUrls = new Set();
    const sections = LEGACY_SUMMARY_SECTIONS.map(section => {
        let candidates = items
            .filter(item => !usedUrls.has(item.url || item.id))
            .filter(item => itemMatchesKeywords(item, section.keywords))
            .slice(0, 5);

        if (candidates.length === 0) {
            candidates = items
                .filter(item => !usedUrls.has(item.url || item.id))
                .slice(0, 3);
        }

        candidates.forEach(item => usedUrls.add(item.url || item.id));

        return {
            title: section.title,
            icon: section.icon,
            items: candidates.map(summarizeLegacyItem)
        };
    });

    return {
        generated: new Date().toISOString(),
        provider: 'local-compat',
        model: 'local-compat',
        retiredProvider: 'hunyuan-turbo',
        sections
    };
}

router.get('/summary', requireRole('owner', 'operator'), async (req, res) => {
    try {
        const forceRefresh = req.query.force === '1';

        if (!forceRefresh && cachedSummary && (Date.now() - summaryLastGenerated) < SUMMARY_CACHE_TTL) {
            return res.json(cachedSummary);
        }

        const recent = searchArticles({ sort: 'importance', limit: 30 });
        const items = recent.items || [];
        if (items.length === 0) {
            cachedSummary = {
                generated: new Date().toISOString(),
                provider: 'local-compat',
                model: 'local-compat',
                retiredProvider: 'hunyuan-turbo',
                sections: [
                    { title: '暂无数据', icon: '📭', items: [{ text: '数据库为空，请等待首次数据抓取完成。', importance: 0 }] }
                ]
            };
        } else {
            cachedSummary = buildLegacySummary(items);
        }

        summaryLastGenerated = Date.now();
        audit(req, 'summary.legacy_compat', 'local', { forceRefresh, count: items.length });

        res.json(cachedSummary);
    } catch (err) {
        console.error('Legacy Summary error:', err.message);
        res.json({
            generated: new Date().toISOString(),
            provider: 'local-compat',
            model: 'local-compat',
            retiredProvider: 'hunyuan-turbo',
            sections: [
                { title: '🏢 重点公司动态', icon: '🏢', items: [{ text: '兼容简报生成失败，请稍后重试。', importance: 0 }] }
            ]
        });
    }
});

// ─── API: DeepSeek Daily Summary ──────────────────────────

let cachedDailySummary = null;
let dailySummaryLastGenerated = 0;
const DAILY_CACHE_TTL = 60 * 60 * 1000; // 1 hour

let dailyCooldownUntil = 0;
const DAILY_COOLDOWN_MS = 2 * 60 * 1000; // 2 minutes

router.get('/summary/daily', requireRole('owner', 'operator'), async (req, res) => {
    try {
        const forceRefresh = req.query.force === '1';

        // Return cached if fresh
        if (!forceRefresh && cachedDailySummary && (Date.now() - dailySummaryLastGenerated) < DAILY_CACHE_TTL) {
            return res.json(cachedDailySummary);
        }

        // Cooldown protection
        if (Date.now() < dailyCooldownUntil) {
            if (cachedDailySummary) {
                const minutesLeft = Math.ceil((dailyCooldownUntil - Date.now()) / 60000);
                const copy = JSON.parse(JSON.stringify(cachedDailySummary));
                copy._cooldownNotice = `冷却中，已返回缓存结果。${minutesLeft} 分钟后可刷新。`;
                return res.json(copy);
            }
            const minutesLeft = Math.ceil((dailyCooldownUntil - Date.now()) / 60000);
            return res.json({ error: false, headline: `⏳ 冷却中，请 ${minutesLeft} 分钟后重试`, highlights: [], sectors: [], investorTakeaway: '' });
        }

        if (!deepseek.isAvailable()) {
            return res.status(503).json({ error: true, message: 'DEEPSEEK_API_KEY 未配置' });
        }

        // Lock cooldown
        dailyCooldownUntil = Date.now() + DAILY_COOLDOWN_MS;

        // Fetch articles from last 24 hours, fallback to latest 20
        const now = new Date();
        const dateFrom = new Date(now - 24 * 60 * 60 * 1000).toISOString();
        let result = searchArticles({ dateFrom, sort: 'importance', limit: 30 });
        if (!result.items || result.items.length < 5) {
            result = searchArticles({ sort: 'importance', limit: 20 });
        }

        if (!result.items || result.items.length === 0) {
            return res.json({ headline: '暂无数据', highlights: [], sectors: [], investorTakeaway: '数据库为空，请等待首次数据抓取。' });
        }

        const summary = await deepseek.generateDailySummary(result.items);
        audit(req, 'ai.summary_daily', 'deepseek', { forceRefresh, count: result.items.length });

        cachedDailySummary = {
            generated: new Date().toISOString(),
            model: 'deepseek-chat',
            type: 'daily',
            ...summary
        };
        dailySummaryLastGenerated = Date.now();

        res.json(cachedDailySummary);
    } catch (err) {
        console.error('DeepSeek Daily Summary error:', err.message);
        if (err.code === 'DEEPSEEK_JSON_PARSE_FAILED') {
            cachedDailySummary = {
                generated: new Date().toISOString(),
                model: 'deepseek-chat',
                type: 'daily',
                ...deepseek.fallbackDailySummary(err.message)
            };
            dailySummaryLastGenerated = Date.now();
            return res.json(cachedDailySummary);
        }

        dailyCooldownUntil = 0; // Reset on upstream/runtime errors
        res.json({
            generated: new Date().toISOString(),
            model: 'deepseek-chat',
            type: 'daily',
            headline: '❌ 每日速递生成失败',
            highlights: [{ text: err.message, tag: '错误', importance: 0 }],
            sectors: [],
            investorTakeaway: '请稍后重试。',
            errorCode: err.code || 'DEEPSEEK_UPSTREAM_FAILED'
        });
    }
});

// ─── API: DeepSeek Weekly Summary ─────────────────────────

let cachedWeeklySummary = null;
let weeklySummaryLastGenerated = 0;
const WEEKLY_CACHE_TTL = 4 * 60 * 60 * 1000; // 4 hours

let weeklyCooldownUntil = 0;
const WEEKLY_COOLDOWN_MS = 5 * 60 * 1000; // 5 minutes

router.get('/summary/weekly', requireRole('owner', 'operator'), async (req, res) => {
    try {
        const forceRefresh = req.query.force === '1';

        if (!forceRefresh && cachedWeeklySummary && (Date.now() - weeklySummaryLastGenerated) < WEEKLY_CACHE_TTL) {
            return res.json(cachedWeeklySummary);
        }

        if (Date.now() < weeklyCooldownUntil) {
            if (cachedWeeklySummary) {
                const minutesLeft = Math.ceil((weeklyCooldownUntil - Date.now()) / 60000);
                const copy = JSON.parse(JSON.stringify(cachedWeeklySummary));
                copy._cooldownNotice = `冷却中，已返回缓存结果。${minutesLeft} 分钟后可刷新。`;
                return res.json(copy);
            }
            const minutesLeft = Math.ceil((weeklyCooldownUntil - Date.now()) / 60000);
            return res.json({ error: false, weekOverview: `⏳ 冷却中，请 ${minutesLeft} 分钟后重试`, milestones: [], sectorReviews: [], fundingLandscape: { summary: '', deals: [] }, strategicGuide: { hotTracks: [], risks: [], earlyStageOpportunities: '' } });
        }

        if (!deepseek.isAvailable()) {
            return res.status(503).json({ error: true, message: 'DEEPSEEK_API_KEY 未配置' });
        }

        weeklyCooldownUntil = Date.now() + WEEKLY_COOLDOWN_MS;

        const now = new Date();
        const dateFrom = new Date(now - 7 * 24 * 60 * 60 * 1000).toISOString();
        let result = searchArticles({ dateFrom, sort: 'importance', limit: 60 });
        if (!result.items || result.items.length < 10) {
            result = searchArticles({ sort: 'importance', limit: 40 });
        }

        if (!result.items || result.items.length === 0) {
            return res.json({ weekOverview: '暂无数据', milestones: [], sectorReviews: [], fundingLandscape: { summary: '', deals: [] }, strategicGuide: { hotTracks: [], risks: [], earlyStageOpportunities: '数据库为空，请等待首次数据抓取。' } });
        }

        const summary = await deepseek.generateWeeklySummary(result.items);
        audit(req, 'ai.summary_weekly', 'deepseek', { forceRefresh, count: result.items.length });

        cachedWeeklySummary = {
            generated: new Date().toISOString(),
            model: 'deepseek-chat',
            type: 'weekly',
            ...summary
        };
        weeklySummaryLastGenerated = Date.now();

        res.json(cachedWeeklySummary);
    } catch (err) {
        console.error('DeepSeek Weekly Summary error:', err.message);
        if (err.code === 'DEEPSEEK_JSON_PARSE_FAILED') {
            cachedWeeklySummary = {
                generated: new Date().toISOString(),
                model: 'deepseek-chat',
                type: 'weekly',
                ...deepseek.fallbackWeeklySummary(err.message)
            };
            weeklySummaryLastGenerated = Date.now();
            return res.json(cachedWeeklySummary);
        }

        weeklyCooldownUntil = 0;
        res.json({
            generated: new Date().toISOString(),
            model: 'deepseek-chat',
            type: 'weekly',
            weekOverview: '❌ 每周周报生成失败：' + err.message,
            milestones: [],
            sectorReviews: [],
            fundingLandscape: { summary: '', deals: [] },
            strategicGuide: { hotTracks: [], risks: [], earlyStageOpportunities: '请稍后重试。' },
            errorCode: err.code || 'DEEPSEEK_UPSTREAM_FAILED'
        });
    }
});

// ─── DeepSeek Article Analysis ────────────────────────────

router.get('/analysis/:articleId', requireRole('owner', 'operator'), rateLimit(60000, 10), async (req, res) => {
    try {
        if (!deepseek.isAvailable()) {
            return res.status(503).json({ error: true, message: 'DeepSeek API 未配置' });
        }

        const articleId = parseInt(req.params.articleId, 10);
        if (isNaN(articleId)) {
            return res.status(400).json({ error: '无效的文章 ID' });
        }

        const article = getArticleById(articleId);
        if (!article) {
            return res.status(404).json({ error: '文章未找到' });
        }

        const analysis = await deepseek.analyzeArticle(article);
        audit(req, 'ai.article_analysis', String(articleId));
        res.json({
            articleId,
            model: 'deepseek-chat',
            analysis
        });
    } catch (err) {
        console.error('DeepSeek Article Analysis error:', err.message);
        res.status(500).json({ error: '文章分析失败：' + err.message });
    }
});

// ─── API: Import Article from URL ─────────────────────

router.post('/import', requireRole('owner', 'operator'), rateLimit(60000, 10), async (req, res) => {
    try {
        const { url } = req.body;

        // Validate input
        if (!url || typeof url !== 'string') {
            return res.status(400).json({ error: '请提供文章 URL' });
        }

        const trimmedUrl = url.trim();
        if (trimmedUrl.length > 2048) {
            return res.status(400).json({ error: 'URL 过长' });
        }

        // Extract article content from URL
        const rawArticle = await extractArticleFromURL(trimmedUrl);

        // Enrich: translate title + calculate importance score
        const enriched = enrichItem(rawArticle);

        // Store in database
        upsertArticle(enriched);

        // Auto-assign to collections
        autoAssignCollections([enriched]);

        console.log(`📥 Imported: ${enriched.title} (${enriched.provider}, score: ${enriched.importance})`);
        audit(req, 'article.import', enriched.url, { provider: enriched.provider, importance: enriched.importance });

        res.json({
            success: true,
            article: {
                url: enriched.url,
                title: enriched.title,
                titleZh: enriched.titleZh,
                source: enriched.source,
                provider: enriched.provider,
                category: enriched.category,
                importance: enriched.importance,
                importanceLevel: enriched.importanceLevel,
            }
        });
    } catch (err) {
        console.error('Import error:', err.message);
        res.status(400).json({ error: err.message });
    }
});

module.exports = router;
