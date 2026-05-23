/**
 * DeepSeek AI 智能总结服务
 * 
 * 使用 DeepSeek API (OpenAI 兼容格式) 生成 BCI 行业每日速递与每周周报。
 * 从天使投资人 (Angel Investor) 视角提供早期投资洞察。
 * 
 * 安全：API Key 仅通过 process.env.DEEPSEEK_API_KEY 读取，绝不暴露到前端。
 */

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
            throw new Error(`DeepSeek API ${response.status}: ${errBody.slice(0, 200)}`);
        }

        const data = await response.json();
        const rawText = data.choices?.[0]?.message?.content || '';

        return parseJsonResponse(rawText);
    } finally {
        clearTimeout(timeout);
    }
}

// ─── JSON 解析与修复 ──────────────────────────────────────

function parseJsonResponse(rawText) {
    // First attempt: direct parse
    try {
        return JSON.parse(rawText);
    } catch (e) {
        // Fallback: strip markdown fences and repair
    }

    let cleaned = rawText
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

    // Fix unclosed string values
    cleaned = cleaned.replace(/(\"url\":\s*\"[^\"\n]+)\n/g, '$1",\n');
    cleaned = cleaned.replace(/(\"[^\"]+\":\s*\"[^\"\n]+)(\n\s*(\}|\]))/g, '$1"$2');

    // Remove illegal control characters
    cleaned = cleaned.replace(/[\u0000-\u0009\u000B-\u001F]+/g, '');

    // Extract JSON object
    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }

    try {
        return JSON.parse(cleaned);
    } catch (repairErr) {
        console.error('DeepSeek JSON parse failed:', repairErr.message);
        console.error('Raw response (first 500 chars):', rawText.slice(0, 500));
        throw new Error('DeepSeek 返回数据解析失败');
    }
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

    return callDeepSeek(prompt);
}

module.exports = {
    isAvailable,
    generateDailySummary,
    generateWeeklySummary,
    analyzeArticle
};
