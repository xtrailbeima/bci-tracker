/**
 * BCI 内容重要性评分系统
 * 综合来源权威性、时效性、关键词相关度三个维度打分
 */

// ── 来源权威性权重 ─────────────────────────────────

const SOURCE_SCORES = {
    'Nature': 95,
    'Nature Neuroscience': 95,
    'Nature BMI': 95,
    'Nature Medicine': 95,
    'Nature Materials': 95,
    'Nature Biotechnology': 95,
    'Science': 93,
    'Science Translational Medicine': 92,
    'The Lancet Neurology': 92,
    'The Lancet': 91,
    'PNAS': 88,
    'Cell': 90,
    'Neuron (Cell)': 90,
    'NEJM': 95,
    'PubMed': 70,
    'arXiv': 60,
    'Google News': 50,
};

// ── 高价值关键词（出现即加分）─────────────────────

const HIGH_VALUE_KEYWORDS = [
    // 核心技术突破
    { pattern: /brain[-\s]?computer\s+interface/i, score: 15 },
    { pattern: /brain[-\s]?machine\s+interface/i, score: 15 },
    { pattern: /brain[-\s]?spine\s+interface/i, score: 15 },
    { pattern: /\bBCI\b/i, score: 12 },
    { pattern: /neural\s+(interface|implant|prosthe)/i, score: 12 },
    { pattern: /deep\s+brain\s+stimulation/i, score: 10 },

    // 里程碑事件
    { pattern: /first[-\s]in[-\s]human/i, score: 20 },
    { pattern: /FDA\s+(clearance|approval|approved|clears)/i, score: 20 },
    { pattern: /clinical\s+trial/i, score: 12 },
    { pattern: /breakthrough/i, score: 10 },
    { pattern: /first\s+(ever|time|demonstration)/i, score: 10 },
    { pattern: /human\s+trial/i, score: 15 },
    { pattern: /restores?\s+(walking|speech|movement|vision|hearing)/i, score: 15 },

    // 核心追踪公司（用户指定 — Tier 1）
    { pattern: /Neuralink/i, score: 18 },
    { pattern: /Synchron/i, score: 15 },
    { pattern: /Blackrock\s+Neurotech/i, score: 15 },
    { pattern: /Paradromics/i, score: 15 },
    { pattern: /Axoft/i, score: 15 },
    { pattern: /Merge\s+Labs/i, score: 15 },
    { pattern: /\bNudge\b.*(?:brain|neural|BCI)/i, score: 15 },
    { pattern: /Forest\s+Neurotech/i, score: 15 },
    { pattern: /SPIRE\s+Therapeutics/i, score: 15 },

    // 上下游 & 同类型公司（Tier 2）
    { pattern: /Precision\s+Neuroscience/i, score: 13 },
    { pattern: /Science\s+Corp/i, score: 12 },
    { pattern: /Neurosoft\s+Bioelectronics/i, score: 12 },
    { pattern: /\bEmotiv\b/i, score: 10 },
    { pattern: /\bNeurable\b/i, score: 10 },
    { pattern: /Cognixion/i, score: 10 },
    { pattern: /g\.tec/i, score: 10 },
    { pattern: /BrainCo/i, score: 10 },
    { pattern: /Kernel/i, score: 10 },
    { pattern: /CTRL[-\s]?Labs/i, score: 10 },

    // 中国核心公司
    { pattern: /脑虎科技/i, score: 15 },
    { pattern: /博睿康|强脑科技/i, score: 15 },
    { pattern: /柔灵科技/i, score: 15 },
    { pattern: /微灵医疗/i, score: 15 },
    { pattern: /脑陆科技/i, score: 13 },
    { pattern: /阶梯星矿/i, score: 13 },

    // 重大资助与融资 (Highly Prioritized)
    { pattern: /Series\s+[A-Z]/i, score: 25 },
    { pattern: /seed\s+round/i, score: 25 },
    { pattern: /funding|financing/i, score: 20 },
    { pattern: /valuation/i, score: 15 },
    { pattern: /raised\s+\$/i, score: 20 },
    { pattern: /\$\d+\s*[MB]/i, score: 20 }, // 大额美元融资
    { pattern: /DARPA/i, score: 12 },
    { pattern: /NIH/i, score: 8 },
    { pattern: /融资|获投/i, score: 25 }, // 中文核心动作
    { pattern: /天使轮|A轮|B轮|C轮|D轮/i, score: 25 }, // 中文轮次
    { pattern: /估值/i, score: 15 },
    { pattern: /亿元|千万|亿美元/i, score: 20 }, // 中文金额

    // 技术方向
    { pattern: /wireless/i, score: 5 },
    { pattern: /high[-\s]?density/i, score: 5 },
    { pattern: /real[-\s]?time/i, score: 4 },
    { pattern: /non[-\s]?invasive/i, score: 5 },
    { pattern: /closed[-\s]?loop/i, score: 5 },
    { pattern: /decoder|decoding/i, score: 5 },
    { pattern: /speech\s+decod/i, score: 8 },
    { pattern: /motor\s+(cortex|control|intention)/i, score: 6 },
    { pattern: /paralyz|tetraplegia|quadriplegia/i, score: 8 },
    { pattern: /spinal\s+cord/i, score: 6 },
    { pattern: /electrode\s+array/i, score: 5 },
    { pattern: /graphene|flexible\s+electrode/i, score: 5 },
    { pattern: /optogenetic/i, score: 5 },
    { pattern: /transformer|foundation\s+model/i, score: 4 },
    { pattern: /ultrasound\s+(neuromod|brain|stimulat|imaging)/i, score: 8 },
    { pattern: /endovascular\s+(brain|BCI|neural)/i, score: 8 },
    { pattern: /soft\s+(electrode|implant|cortical)/i, score: 6 },
    { pattern: /gene\s+therap.*brain/i, score: 6 },
    { pattern: /focused\s+ultrasound/i, score: 7 },
];

/**
 * 计算单条内容的重要性分数 (0-100)
 * @param {Object} item - 内容条目
 * @returns {number} 重要性分数
 */
function scoreImportance(item) {
    let score = 0;

    // 1) 来源权威性 (0-95)
    const srcKey = Object.keys(SOURCE_SCORES).find(k =>
        item.source?.includes(k) || item.provider?.includes(k)
    );
    const sourceScore = srcKey ? SOURCE_SCORES[srcKey] : 40;
    score += sourceScore * 0.35; // 来源占 35%

    // 2) 时效性 (0-100)
    let recencyScore = 50;
    if (item.date) {
        const d = new Date(item.date);
        if (!isNaN(d)) {
            const hoursSince = (Date.now() - d.getTime()) / 3600000;
            if (hoursSince < 6) recencyScore = 100;
            else if (hoursSince < 24) recencyScore = 90;
            else if (hoursSince < 72) recencyScore = 80;
            else if (hoursSince < 168) recencyScore = 65;
            else if (hoursSince < 720) recencyScore = 45;
            else recencyScore = 25;
        }
    }
    score += recencyScore * 0.25; // 时效占 25%

    // 3) 关键词相关度 (0-100)
    const text = `${item.title || ''} ${item.abstract || ''}`;
    let keywordScore = 0;
    for (const kw of HIGH_VALUE_KEYWORDS) {
        if (kw.pattern.test(text)) {
            keywordScore += kw.score;
        }
    }
    keywordScore = Math.min(keywordScore, 100);
    score += keywordScore * 0.40; // 关键词占 40%

    return Math.round(Math.min(score, 100));
}

/**
 * 将分数映射为重要性等级
 * @param {number} score
 * @returns {string} 'critical' | 'high' | 'medium' | 'low'
 */
function getImportanceLevel(score) {
    if (score >= 70) return 'critical';
    if (score >= 50) return 'high';
    if (score >= 30) return 'medium';
    return 'low';
}

module.exports = { scoreImportance, getImportanceLevel };
