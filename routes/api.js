const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');

const { rateLimit } = require('../middleware/security');
const { searchArticles, getStats, getAllSources, getArticleById, getTrendingKeywords, addSubscriber, removeSubscriber, getCollections, getCollectionItems, addToCollection, removeFromCollection, createCollection, deleteCollection } = require('../db');
const { sendDailyBriefing } = require('../briefing');
const gemini = require('../gemini');

// ─── Company Profile ──────────────────────────────────────

const companyProfilePath = path.join(__dirname, '..', 'company_profile.md');
let companyProfile = '';
try {
    companyProfile = fs.readFileSync(companyProfilePath, 'utf-8');
    console.log('📄 Loaded company profile: company_profile.md');
} catch (e) {
    console.warn('⚠️ company_profile.md not found, competitive commentary will be skipped');
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
        res.json(result);
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
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/collections', express.json(), (req, res) => {
    try {
        const { name, icon } = req.body;
        if (!name || typeof name !== 'string') return res.status(400).json({ error: 'name required' });
        // Input validation (security-auditor skill)
        const safeName = name.slice(0, 50).replace(/[<>"'&]/g, '');
        const safeIcon = (icon || '📁').slice(0, 4);
        const result = createCollection(safeName, safeIcon);
        res.json({ id: result.lastInsertRowid, name: safeName, icon: safeIcon });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/collections/:id/add', express.json(), (req, res) => {
    try {
        const { articleId } = req.body;
        addToCollection(parseInt(req.params.id), articleId, 'manual');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/collections/:collectionId/items/:articleId', (req, res) => {
    try {
        removeFromCollection(parseInt(req.params.collectionId), parseInt(req.params.articleId));
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.delete('/collections/:id', (req, res) => {
    try {
        deleteCollection(parseInt(req.params.id));
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

router.post('/briefing/send', async (req, res) => {
    try {
        const result = await sendDailyBriefing();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: AI Summary (Hunyuan) ────────────────────────────

let cachedSummary = null;
let summaryLastGenerated = 0;
const SUMMARY_CACHE_TTL = 45 * 60 * 1000; // 45 minutes

let aiCooldownUntil = 0;
const API_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes global cooldown

router.get('/summary', async (req, res) => {
    try {
        const forceRefresh = req.query.force === '1';

        // Return cached if fresh (unless force refresh)
        if (!forceRefresh && cachedSummary && (Date.now() - summaryLastGenerated) < SUMMARY_CACHE_TTL) {
            return res.json(cachedSummary);
        }

        // 🛡️ API Quota Protection: Prevent frequent manual force-refreshes
        if (Date.now() < aiCooldownUntil) {
            if (cachedSummary) {
                const minutesLeft = Math.ceil((aiCooldownUntil - Date.now()) / 60000);
                const summaryCopy = JSON.parse(JSON.stringify(cachedSummary));
                if (summaryCopy.sections && summaryCopy.sections.length > 0) {
                    summaryCopy.sections[0].items.unshift({
                        text: `【频控提示】因多人同时刷新触发了安全保护，我们为您保留了上一份简报。请在 ${minutesLeft} 分钟后重试。`,
                        importance: 0
                    });
                }
                return res.json(summaryCopy);
            } else {
                const minutesLeft = Math.ceil((aiCooldownUntil - Date.now()) / 60000);
                return res.json({
                    generated: new Date().toISOString(),
                    sections: [
                        { 
                            title: '🛡️ API 额度保护机制', 
                            icon: '⏳', 
                            items: [{ 
                                text: `AI 摘要服务正在冷却中，请在 ${minutesLeft} 分钟后再次刷新。`, 
                                importance: 90 
                            }] 
                        }
                    ]
                });
            }
        }
        
        // Lock the cooldown globally immediately
        aiCooldownUntil = Date.now() + API_COOLDOWN_MS;

        const apiKey = process.env.HUNYUAN_API_KEY || process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.json({
                generated: new Date().toISOString(),
                sections: [
                    { title: '⚠️ AI 总结未启用', icon: '⚙️', items: [{ text: '请设置环境变量 HUNYUAN_API_KEY 以启用 AI 行业总结功能。', importance: 10 }] }
                ]
            });
        }

        // Get recent high-importance items from DB
        const recent = searchArticles({ sort: 'importance', limit: 30 });
        const items = recent.items || [];
        if (items.length === 0) {
            return res.json({ generated: new Date().toISOString(), sections: [{ title: '暂无数据', icon: '📭', items: [{ text: '数据库为空，请等待首次数据抓取完成。' }] }] });
        }

        // Build context for AI — include URLs and actual importance scores
        const context = items.map((it, idx) => {
            const score = it.importance || 0;
            return `[${idx + 1}] [分数:${score}] [${it.category}] ${it.title} | ${it.source} | ${it.date} | URL: ${it.url || 'N/A'}`;
        }).join('\n');

        // Build company context for competitive commentary
        const companyContext = companyProfile
            ? `\n\n以下是我们公司（NeuroWorm）的技术简介，请在第一个板块中结合最新行业动态，从 NeuroWorm 的技术优势角度进行竞品对比评论：\n---\n${companyProfile.substring(0, 2000)}\n---`
            : '';

        const competitiveSection = companyProfile
            ? `{ "title": "NeuroWorm 竞品洞察", "icon": "🧠", "items": [{"text": "...", "url": "...", "importance": 80}, ...] },`
            : '';

        const prompt = `你是BCI行业分析师兼NeuroWorm战略顾问。根据以下数据生成行业简报。

输出严格的JSON，不要有任何其他文字：
{
  "sections": [
    ${competitiveSection}
    { "title": "重点公司动态", "icon": "🏢", "items": [{"text": "...", "url": "...", "importance": 0}, ...] },
    { "title": "融资与投资", "icon": "💰", "items": [{"text": "...", "url": "...", "importance": 0}, ...] },
    { "title": "技术突破", "icon": "🔬", "items": [{"text": "...", "url": "...", "importance": 0}, ...] },
    { "title": "行业趋势", "icon": "📊", "items": [{"text": "...", "url": "...", "importance": 0}, ...] }
  ]
}

规则：
- 每个item有text、url、importance三个字段
- importance是0-100的数字，必须直接使用每条数据前面[分数:XX]中提供的分数，不要自己编造
- 如果一条总结综合了多条数据，取其中最高的分数
- url从下方条目URL中选取
- 每个section写3-5条，text不超100字
${companyProfile ? `- 竞品洞察的importance统一设为80
- 竞品洞察的text格式: 先引述行业动态，再给出NeuroWorm视角分析（柔性材料、磁场导航、60通道、43周稳定、深部微血管）
- 竞品洞察是给CEO的战略简报` : ''}

条目数据：
${context}${companyContext}`;

        const hunyuanUrl = 'https://hunyuan.cloud.tencent.com/openai/v1/chat/completions';
        
        let aiRes;
        try {
            aiRes = await fetch(hunyuanUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'hunyuan-turbo',
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.3,
                    max_tokens: 4096
                })
            });
        } catch (fetchErr) {
            throw new Error(`网络连接失败 (Hunyuan): ${fetchErr.message}`);
        }

        if (!aiRes.ok) {
            const errorText = await aiRes.text();
            throw new Error(`Hunyuan API 错误 ${aiRes.status}: ${errorText}`);
        }

        const aiData = await aiRes.json();
        const rawText = aiData.choices?.[0]?.message?.content || '';
        
        let parsed;
        try {
            parsed = JSON.parse(rawText);
        } catch (initialErr) {
            console.warn('AI Summary: strict JSON parse failed, attempting repair...', initialErr.message);
            
            // SAVE output for debugging
            fs.writeFileSync(path.join(__dirname, '..', 'failed_summary.json'), rawText, 'utf-8');

            // Fallback: extract JSON if it's wrapped in markdown or has trailing garbage
            let cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
            
            // AI models often forget the closing quote on very long URLs.
            cleaned = cleaned.replace(/(\"url\":\s*\"[^\"\n]+)\n/g, '$1",\n');
            cleaned = cleaned.replace(/(\"\w+\":\s*\"[^\"\n]+)(\n\s*(\}|\]))/g, '$1"$2');
            
            // Remove illegal control characters inside strings
            cleaned = cleaned.replace(/[\u0000-\u0009\u000B-\u001F]+/g, '');

            const jsonStart = cleaned.indexOf('{');
            const jsonEnd = cleaned.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
            }
            try {
                parsed = JSON.parse(cleaned);
            } catch (repairErr) {
                console.error('Failed to parse repaired JSON:', repairErr.message);
                throw repairErr;
            }
        }

        cachedSummary = {
            generated: new Date().toISOString(),
            sections: parsed.sections || []
        };
        summaryLastGenerated = Date.now();

        res.json(cachedSummary);
    } catch (err) {
        console.error('AI Summary error:', err.message);
        // Reset cooldown so the user doesn't get locked out for 10 minutes on an error
        aiCooldownUntil = 0;
        
        // Return fallback summary
        res.json({
            generated: new Date().toISOString(),
            sections: [
                { title: '🏢 重点公司动态', icon: '🏢', items: [{text: 'AI 总结生成失败，请稍后重试。错误：' + err.message, importance: 0 }] }
            ]
        });
    }
});

// ─── API: Gemini AI Analysis ──────────────────────────────

let cachedAnalysis = null;
let analysisLastGenerated = 0;
const ANALYSIS_CACHE_TTL = 45 * 60 * 1000; // 45 minutes

let analysisAiCooldownUntil = 0;
const ANALYSIS_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes

router.get('/analysis', async (req, res) => {
    try {
        const forceRefresh = req.query.force === '1';

        // Return cached if fresh
        if (!forceRefresh && cachedAnalysis && (Date.now() - analysisLastGenerated) < ANALYSIS_CACHE_TTL) {
            return res.json(cachedAnalysis);
        }

        // Cooldown protection
        if (Date.now() < analysisAiCooldownUntil) {
            if (cachedAnalysis) {
                const minutesLeft = Math.ceil((analysisAiCooldownUntil - Date.now()) / 60000);
                const copy = JSON.parse(JSON.stringify(cachedAnalysis));
                if (copy.sections && copy.sections.length > 0) {
                    copy.sections[0].items.unshift({
                        text: `【频控提示】Gemini 分析冷却中，已返回缓存结果。请在 ${minutesLeft} 分钟后重试。`,
                        importance: 0
                    });
                }
                return res.json(copy);
            }
            const minutesLeft = Math.ceil((analysisAiCooldownUntil - Date.now()) / 60000);
            return res.json({
                generated: new Date().toISOString(),
                model: 'gemini-3-flash-preview',
                sections: [{ title: '🛡️ 冷却中', icon: '⏳', items: [{ text: `Gemini 分析冷却中，请 ${minutesLeft} 分钟后重试。`, importance: 0 }] }]
            });
        }

        if (!gemini.isAvailable()) {
            return res.json({
                generated: new Date().toISOString(),
                model: null,
                sections: [{ title: '⚠️ Gemini 未配置', icon: '⚙️', items: [{ text: '请设置 GEMINI_API_KEY 环境变量以启用 Gemini AI 分析。', importance: 10 }] }]
            });
        }

        // Lock cooldown
        analysisAiCooldownUntil = Date.now() + ANALYSIS_COOLDOWN_MS;

        const recent = searchArticles({ sort: 'importance', limit: 30 });
        const items = recent.items || [];
        if (items.length === 0) {
            return res.json({ generated: new Date().toISOString(), model: 'gemini-3-flash-preview', sections: [{ title: '暂无数据', icon: '📭', items: [{ text: '数据库为空，请等待首次数据抓取完成。' }] }] });
        }

        const result = await gemini.generateIndustrySummary(items, companyProfile);

        cachedAnalysis = {
            generated: new Date().toISOString(),
            model: 'gemini-3-flash-preview',
            sections: result.sections || []
        };
        analysisLastGenerated = Date.now();

        res.json(cachedAnalysis);
    } catch (err) {
        console.error('Gemini Analysis error:', err.message);
        analysisAiCooldownUntil = 0; // Reset on error
        res.json({
            generated: new Date().toISOString(),
            model: 'gemini-3-flash-preview',
            sections: [{ title: '❌ 分析失败', icon: '⚠️', items: [{ text: 'Gemini 分析生成失败：' + err.message, importance: 0 }] }]
        });
    }
});

router.get('/analysis/:articleId', rateLimit(60000, 10), async (req, res) => {
    try {
        if (!gemini.isAvailable()) {
            return res.status(503).json({ error: 'Gemini 未配置' });
        }

        const articleId = parseInt(req.params.articleId, 10);
        if (isNaN(articleId)) {
            return res.status(400).json({ error: '无效的文章 ID' });
        }

        // Find article in DB using prepared statement
        const article = getArticleById(articleId);
        if (!article) {
            return res.status(404).json({ error: '文章未找到' });
        }

        const analysis = await gemini.analyzeArticle(article, companyProfile);
        res.json({
            articleId,
            model: 'gemini-3-flash-preview',
            analysis
        });
    } catch (err) {
        console.error('Gemini Article Analysis error:', err.message);
        res.status(500).json({ error: '文章分析失败：' + err.message });
    }
});

module.exports = router;
