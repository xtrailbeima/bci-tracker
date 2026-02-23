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

    // 核心公司
    { pattern: /Neuralink/i, score: 18 },
    { pattern: /Synchron/i, score: 15 },
    { pattern: /Blackrock\s+Neurotech/i, score: 14 },
    { pattern: /Paradromics/i, score: 14 },
    { pattern: /Precision\s+Neuroscience/i, score: 13 },
    { pattern: /Kernel/i, score: 10 },
    { pattern: /CTRL[-\s]?Labs/i, score: 10 },

    // 重大资助
    { pattern: /DARPA/i, score: 12 },
    { pattern: /NIH/i, score: 8 },
    { pattern: /\$\d+\s*[MB]/i, score: 10 }, // 大额融资

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
