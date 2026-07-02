/**
 * DeepSeek AI 智能总结服务
 * 
 * 使用 DeepSeek API (OpenAI 兼容格式) 生成 BCI 行业每日速递与每周周报。
 * 从天使投资人 (Angel Investor) 视角提供早期投资洞察。
 * 
 * 安全：API Key 仅通过 process.env.DEEPSEEK_API_KEY 读取，绝不暴露到前端。
 */

const { parseAIJsonResponse } = require('./ai_json');

const DEEPSEEK_API_URL = 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_MODEL = 'deepseek-chat'; // DeepSeek-V3

function isAvailable() {
    return !!process.env.DEEPSEEK_API_KEY;
}

// ─── Prompt 模板 ──────────────────────────────────────────

function buildDailyPrompt(articles) {
    const articleList = articles.map((a, i) => {
        return `[${i + 1}] 标题: ${a.title}${a.titleZh ? ` (${a.titleZh})` : ''}
   来源: ${a.source || a.provider || '未知'} | 类别: ${a.category || '未知'} | 日期: ${a.date || '未知'}
   摘要: ${(a.abstract || '').slice(0, 300)}
   链接: ${a.url || ''}`;
    }).join('\n\n');

    return `你是一位资深天使投资人与 BCI（脑机接口）行业分析师。请基于以下最近 24 小时内收录的 BCI 行业动态，生成一份精炼的 **每日行业速递**。

**分析视角要求**：
- 以天使投资人的视角分析，重点关注：早期技术商业化可行性、技术壁垒与护城河、团队背景与执行力信号、市场窗口与时机判断
- 关注融资事件、临床进展、监管里程碑、重大合作等投资信号
- 对标已知头部公司（Neuralink, Synchron, BrainGate, Paradromics 等）评估新兴玩家的差异化定位

**数据条目**：
${articleList}

**请严格返回以下 JSON 格式（不要添加任何其他文字或 markdown 包裹）**：
{
  "headline": "一句话核心总结（≤60字，高度凝练当日最重要的投资信号）",
  "highlights": [
    {
      "text": "关键动态描述（包含投资价值判断）",
      "tag": "分类标签：融资/临床/监管/技术/合作/IPO",
      "importance": 1-10的重要性评分,
      "url": "对应原文链接（如有）"
    }
  ],
  "sectors": [
    {
      "name": "板块名称（如：侵入式 BCI / 非侵入式 BCI / 神经调控 / BCI 软件与算法 / 柔性电极与材料）",
      "icon": "板块对应 emoji",
      "summary": "该板块当日综述（≤100字）",
      "investmentSignal": "投资信号判断：利好/利空/中性"
    }
  ],
  "investorTakeaway": "今日天使投资风向标（≤150字，给出具体的早期投资建议和值得关注的种子/天使轮项目方向）"
}`;
}

function buildWeeklyPrompt(articles) {
    const articleList = articles.map((a, i) => {
        return `[${i + 1}] 标题: ${a.title}${a.titleZh ? ` (${a.titleZh})` : ''}
   来源: ${a.source || a.provider || '未知'} | 类别: ${a.category || '未知'} | 日期: ${a.date || '未知'}
   重要性: ${a.importance || 0} | 摘要: ${(a.abstract || '').slice(0, 250)}
   链接: ${a.url || ''}`;
    }).join('\n\n');

    return `你是一位资深天使投资人与 BCI（脑机接口）行业分析师。请基于以下最近 7 天收录的 BCI 行业动态，生成一份深度的 **每周行业周报**。

**分析视角要求**：
- 以天使投资人的视角进行宏观战略分析，评估 BCI 赛道的早期投资机会窗口
- 识别本周的技术突破、临床里程碑、融资事件中蕴含的投资主题
- 对比分析不同技术路线（侵入式 vs 非侵入式、有线 vs 无线、硬件 vs 算法）的投资回报预期
- 重点分析：柔性电极、高带宽无线传输、AI 解码算法、神经调控治疗等前沿赛道的投资窗口

**数据条目**：
${articleList}

**请严格返回以下 JSON 格式（不要添加任何其他文字或 markdown 包裹）**：
{
  "weekOverview": "本周宏观投资态势总结（≤200字，概括 BCI 赛道的整体投资温度和关键转折点）",
  "milestones": [
    {
      "text": "里程碑事件描述",
      "date": "事件日期",
      "significance": "对早期投资的意义分析",
      "tag": "分类标签",
      "url": "原文链接（如有）"
    }
  ],
  "sectorReviews": [
    {
      "name": "板块名称",
      "icon": "emoji",
      "weekTrend": "上升/稳定/下降",
      "highlights": "本周板块关键亮点（≤120字）",
      "investmentOutlook": "投资展望（≤80字）"
    }
  ],
  "fundingLandscape": {
    "summary": "本周融资态势概览（≤120字）",
    "deals": [
      {
        "company": "公司名",
        "round": "融资轮次",
        "amount": "金额（如有）",
        "significance": "投资价值点评"
      }
    ]
  },
  "strategicGuide": {
    "hotTracks": ["值得重仓的赛道方向1", "赛道方向2"],
    "risks": ["需要警惕的风险1", "风险2"],
    "earlyStageOpportunities": "天使投资者本周应重点关注的种子期/天使期机会方向（≤150字）"
  }
}`;
}

// ─── API 调用 ─────────────────────────────────────────────

async function callDeepSeek(prompt) {
    if (!isAvailable()) {
        throw new Error('DEEPSEEK_API_KEY 未配置');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60s timeout

    try {
        const response = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY}`
            },
            body: JSON.stringify({
                model: DEEPSEEK_MODEL,
                messages: [
                    { role: 'system', content: '你是一位专注 BCI（脑机接口）赛道的资深天使投资人。你的分析以投资回报、技术壁垒、市场窗口、创始团队为核心维度。请始终返回严格 JSON 格式。' },
                    { role: 'user', content: prompt }
                ],
                response_format: { type: 'json_object' },
                temperature: 0.7,
                max_tokens: 4096
            }),
            signal: controller.signal
        });

        if (!response.ok) {
            const errBody = await response.text().catch(() => '');
            const err = new Error(`DeepSeek API ${response.status}: ${errBody.slice(0, 200)}`);
            err.code = 'DEEPSEEK_HTTP_ERROR';
            throw err;
        }

        const data = await response.json();
        const rawText = data.choices?.[0]?.message?.content || '';

        return parseJsonResponse(rawText);
    } catch (err) {
        if (err.name === 'AbortError') {
            const timeoutErr = new Error('DeepSeek API 请求超时');
            timeoutErr.code = 'DEEPSEEK_TIMEOUT';
            throw timeoutErr;
        }
        throw err;
    } finally {
        clearTimeout(timeout);
    }
}

// ─── JSON 解析与修复 ──────────────────────────────────────

function parseJsonResponse(rawText) {
    return parseAIJsonResponse(rawText, {
        provider: 'DeepSeek',
        errorCode: 'DEEPSEEK_JSON_PARSE_FAILED',
        userMessage: 'DeepSeek 返回数据解析失败',
    });
}

function fallbackDailySummary(reason) {
    return {
        headline: 'DeepSeek 每日速递需要人工确认',
        highlights: [
            {
                text: 'DeepSeek 返回了非标准 JSON，本次每日速递已降级，需要人工确认后再用于投资判断。',
                tag: '解析失败',
                importance: 0,
                url: ''
            }
        ],
        sectors: [],
        investorTakeaway: '暂不生成强投资建议。请稍后重试，或先按信息流重要性等级人工筛选。',
        degraded: true,
        errorCode: 'DEEPSEEK_JSON_PARSE_FAILED',
        reason,
    };
}

function fallbackWeeklySummary(reason) {
    return {
        weekOverview: 'DeepSeek 每周周报需要人工确认：上游返回了非标准 JSON，本次结果已降级。',
        milestones: [],
        sectorReviews: [],
        fundingLandscape: {
            summary: '周报解析失败，融资格局需人工复核。',
            deals: []
        },
        strategicGuide: {
            hotTracks: [],
            risks: ['AI 周报解析失败，不能直接作为投资判断依据。'],
            earlyStageOpportunities: '暂不生成强投资建议。请稍后重试，或基于本周高重要性条目人工复核。'
        },
        degraded: true,
        errorCode: 'DEEPSEEK_JSON_PARSE_FAILED',
        reason,
    };
}

function fallbackArticleAnalysis(article, reason) {
    return {
        summary: (article.abstract || article.title || 'DeepSeek 返回内容解析失败，已生成基础占位分析。').slice(0, 150),
        keyFindings: [
            'DeepSeek 返回了非标准 JSON，本次分析需要人工确认。',
            '原文已成功读取，系统未暴露 API key 或内部错误堆栈。',
            '建议稍后重试 AI 分析，或先按标题、来源和重要性分数进行人工初筛。'
        ],
        investmentAnalysis: 'AI 上游响应解析失败，暂不生成强投资判断。建议等待下一次稳定响应后再用于投资决策。',
        marketImpact: '待人工确认。',
        competitiveInsight: '待人工确认。',
        investmentScore: 5,
        tags: ['needs_review', 'json_parse_failed'],
        degraded: true,
        reason,
    };
}

// ─── 公共接口 ─────────────────────────────────────────────

async function generateDailySummary(articles) {
    const prompt = buildDailyPrompt(articles);
    return callDeepSeek(prompt);
}

async function generateWeeklySummary(articles) {
    const prompt = buildWeeklyPrompt(articles);
    return callDeepSeek(prompt);
}

async function analyzeArticle(article) {
    const prompt = `你是一位资深天使投资人与 BCI（脑机接口）行业分析师。请从天使投资人的视角对以下文章进行深度分析。

**文章信息**：
标题: ${article.title}${article.titleZh ? ` (${article.titleZh})` : ''}
来源: ${article.source || article.provider || '未知'}
类别: ${article.category || '未知'}
日期: ${article.date || '未知'}
摘要: ${article.abstract || '无'}
链接: ${article.url || ''}

**分析要求**：
- 从早期投资角度评估该研究/动态的商业化潜力
- 评估技术壁垒和护城河深度
- 分析对 BCI 赛道各细分领域的影响
- 识别竞争格局变化和投资机会信号

**请严格返回以下 JSON 格式**：
{
  "summary": "核心摘要（≤150字）",
  "keyFindings": ["关键发现1", "关键发现2", "关键发现3"],
  "investmentAnalysis": "投资价值分析（≤200字，包含技术壁垒、商业化路径评估）",
  "marketImpact": "市场影响分析（≤150字）",
  "competitiveInsight": "竞争洞察（≤150字，对标行业头部玩家）",
  "investmentScore": 1-10的投资价值评分,
  "tags": ["标签1", "标签2", "标签3"]
}`;

    try {
        return await callDeepSeek(prompt);
    } catch (err) {
        if (err.code === 'DEEPSEEK_JSON_PARSE_FAILED') {
            return fallbackArticleAnalysis(article, err.message);
        }
        throw err;
    }
}

module.exports = {
    isAvailable,
    generateDailySummary,
    generateWeeklySummary,
    analyzeArticle,
    parseJsonResponse,
    fallbackArticleAnalysis,
    fallbackDailySummary,
    fallbackWeeklySummary
};
