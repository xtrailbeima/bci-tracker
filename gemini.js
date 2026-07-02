/**
 * gemini.js — Gemini AI 分析模块
 *
 * 使用 @google/genai SDK (SKILL.md 规范)
 * 模型: gemini-3-flash-preview
 * 认证: GEMINI_API_KEY (Express Mode) 或 ADC
 */

const { GoogleGenAI } = require('@google/genai');
const { parseAIJsonResponse } = require('./services/ai_json');

// ─── Client Initialization ───────────────────────────────
// Per SKILL.md: prefer env vars, initialize without hard-coding

let _client = null;

function getClient() {
    if (_client) return _client;

    const apiKey = process.env.GEMINI_API_KEY;
    const useVertexAI = process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true';

    if (useVertexAI) {
        // ADC mode: requires GOOGLE_CLOUD_PROJECT + GOOGLE_CLOUD_LOCATION
        _client = new GoogleGenAI({
            vertexai: {
                project: process.env.GOOGLE_CLOUD_PROJECT,
                location: process.env.GOOGLE_CLOUD_LOCATION || 'global'
            }
        });
    } else if (apiKey) {
        // Express Mode: API key
        _client = new GoogleGenAI({ apiKey });
    } else {
        return null;
    }

    return _client;
}

// ─── Model Config ─────────────────────────────────────────
// Per SKILL.md: gemini-3-flash-preview for fast, balanced performance
const MODEL = 'gemini-3-flash-preview';

// ─── Industry Summary ─────────────────────────────────────

/**
 * Generate a structured BCI industry summary from recent articles.
 * Output matches existing /api/summary format for frontend compatibility.
 *
 * @param {Array} articles - Recent articles from DB
 * @param {string} companyProfile - NeuroWorm profile markdown
 * @returns {Promise<Object>} Structured summary { sections: [...] }
 */
async function generateIndustrySummary(articles, companyProfile) {
    const client = getClient();
    if (!client) throw new Error('Gemini 未配置：请设置 GEMINI_API_KEY 环境变量');

    // Build context — include scores and URLs for grounding
    const context = articles.map((it, idx) => {
        const score = it.importance || 0;
        return `[${idx + 1}] [分数:${score}] [${it.category}] ${it.title} | ${it.source} | ${it.date} | URL: ${it.url || 'N/A'}`;
    }).join('\n');

    const companyContext = companyProfile
        ? `\n\n以下是我们公司（NeuroWorm）的技术简介，请在第一个板块中结合最新行业动态，从 NeuroWorm 的技术优势角度进行竞品对比评论：\n---\n${companyProfile.substring(0, 2000)}\n---`
        : '';

    const competitiveSection = companyProfile
        ? `{ "title": "NeuroWorm 竞品洞察", "icon": "🧠", "items": [{"text": "...", "url": "...", "importance": 80}] },`
        : '';

    const prompt = `你是BCI行业分析师兼NeuroWorm战略顾问。根据以下数据生成行业简报。

输出严格的JSON，不要有任何其他文字：
{
  "sections": [
    ${competitiveSection}
    { "title": "重点公司动态", "icon": "🏢", "items": [{"text": "...", "url": "...", "importance": 0}] },
    { "title": "融资与投资", "icon": "💰", "items": [{"text": "...", "url": "...", "importance": 0}] },
    { "title": "技术突破", "icon": "🔬", "items": [{"text": "...", "url": "...", "importance": 0}] },
    { "title": "行业趋势", "icon": "📊", "items": [{"text": "...", "url": "...", "importance": 0}] }
  ]
}

规则：
- 每个item有text、url、importance三个字段
- importance是0-100的数字，必须直接使用每条数据前面[分数:XX]中提供的分数
- 如果一条总结综合了多条数据，取其中最高的分数
- url从下方条目URL中选取
- 每个section写3-5条，text不超100字
${companyProfile ? `- 竞品洞察的importance统一设为80
- 竞品洞察的text格式: 先引述行业动态，再给出NeuroWorm视角分析
- 竞品洞察是给CEO的战略简报` : ''}

条目数据：
${context}${companyContext}`;

    const response = await client.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            temperature: 0.3,
            maxOutputTokens: 4096,
        }
    });

    const rawText = response.text || '';
    return parseJSONResponse(rawText);
}

// ─── Single Article Analysis ──────────────────────────────

/**
 * Deep-analyze a single BCI article with competitive intelligence.
 *
 * @param {Object} article - Article object { title, abstract, source, url, ... }
 * @param {string} companyProfile - NeuroWorm profile markdown
 * @returns {Promise<Object>} Analysis result
 */
async function analyzeArticle(article, companyProfile) {
    const client = getClient();
    if (!client) throw new Error('Gemini 未配置：请设置 GEMINI_API_KEY 环境变量');

    const companyContext = companyProfile
        ? `\n\n参考公司信息：\n${companyProfile.substring(0, 1500)}`
        : '';

    const prompt = `你是BCI行业资深分析师。请对以下文章进行深度分析。

文章信息：
- 标题: ${article.title || ''}
- 来源: ${article.source || ''} (${article.category || ''})
- 日期: ${article.date || ''}
- 摘要: ${article.abstract || ''}
- URL: ${article.url || ''}
${companyContext}

输出严格的JSON：
{
  "summary": "一段话总结核心内容（中文，80字内）",
  "keyFindings": ["发现1", "发现2", "发现3"],
  "technologyAnalysis": "技术层面分析（100字内）",
  "marketImpact": "市场影响评估（80字内）",
  "competitiveInsight": "对NeuroWorm的竞争启示（80字内，若无公司信息则写通用行业洞察）",
  "relevanceScore": 0,
  "tags": ["标签1", "标签2"]
}

规则：
- relevanceScore 是 0-100，表示对BCI行业的重要程度
- tags 最多5个，用于分类
- 所有文本为中文
- 不要编造原文中没有的数据`;

    const response = await client.models.generateContent({
        model: MODEL,
        contents: prompt,
        config: {
            responseMimeType: 'application/json',
            temperature: 0.2,
            maxOutputTokens: 2048,
        }
    });

    const rawText = response.text || '';
    return parseJSONResponse(rawText);
}

// ─── Availability Check ───────────────────────────────────

/**
 * Check if Gemini API is configured and available.
 * @returns {boolean}
 */
function isAvailable() {
    return !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_GENAI_USE_VERTEXAI === 'true');
}

// ─── JSON Parser with Repair ──────────────────────────────

function parseJSONResponse(rawText) {
    return parseAIJsonResponse(rawText, {
        provider: 'Gemini',
        errorCode: 'GEMINI_JSON_PARSE_FAILED',
        userMessage: 'Gemini 返回的 JSON 无法解析',
    });
}

module.exports = {
    generateIndustrySummary,
    analyzeArticle,
    isAvailable,
    parseJSONResponse,
};
