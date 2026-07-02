const express = require('express');
const router = express.Router();
const { parseStringPromise } = require('xml2js');
const { requireRole } = require('../middleware/auth');
const { fetchText, truncate, DEMO_DATA } = require('../services/fetcher');

router.get('/news', requireRole('owner', 'operator'), async (req, res) => {
    try {
        const queries = [
            // ── 核心追踪公司（用户指定） ──
            'Neuralink brain-computer interface',
            'Axoft brain implant soft electrode',
            'Synchron Stentrode BCI',
            'Paradromics Connexus neural',
            'Blackrock Neurotech Utah Array',
            'Merge Labs brain interface Sam Altman',
            'Nudge brain interface ultrasound',
            'Forest Neurotech ultrasound brain',
            'SPIRE Therapeutics Diadem brain',

            // ── 上下游 & 同类型公司 ──
            'Precision Neuroscience brain cortical',
            'Science Corporation neural BCI',
            'Neurosoft Bioelectronics soft electrode',
            'Emotiv EEG brain-computer',
            'Neurable brain-computer wearable',
            'Cognixion brain augmented reality',
            'g.tec medical neurotechnology BCI',
            'BrainCo brain-computer interface',

            // ── 重点投资机构 ──
            'Founders Fund brain-computer',
            'ARCH Ventures neurotechnology',
            'Khosla Ventures brain neural',
            'ARK Invest Neuralink BCI',
            'Sequoia Capital brain neural',
            'Lux Capital neuroscience',
            'Bezos Expeditions brain',
            'Thrive Capital neural',
            'Coatue brain-computer',
            '8VC neural interface',
            'Double Point Ventures BCI',
            'QIA brain-computer neural',

            // ── 行业通用 ──
            'brain-computer interface FDA',
            'brain-computer interface funding raised',
            'neural interface IPO acquisition',

            // ── 中国核心公司 ──
            '脑虎科技',             // NeuraLace / Brain Tiger - 侵入式柔性
            '博睿康 脑机接口',       // BrainCo / 强脑科技
            '强脑科技',             // BrainCo Chinese name
            '柔灵科技 脑机接口',     // Rouling - 非侵入式
            '微灵医疗',             // WeiLing - 侵入式
            '脑陆科技 BCI',         // Brain Land - 非侵入式
            '阶梯星矿',             // Emerging CN BCI
            '脑机接口 融资',         // BCI funding
            '脑机接口 临床试验',     // BCI clinical trials
            '脑机接口 亿元',         // BCI massive funding
            '脑机接口 FDA 获批',     // BCI approvals
        ];

        const results = await Promise.allSettled(
            queries.map(async (q, qi) => {
                // Determine locale parameters based on query language
                const isChinese = /[\u4e00-\u9fa5]/.test(q);
                const localeParams = isChinese
                    ? 'hl=zh-CN&gl=CN&ceid=CN:zh-Hans'
                    : 'hl=en-US&gl=US&ceid=US:en';

                const feedUrl = `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&${localeParams}`;
                try {
                    const xml = await fetchText(feedUrl);
                    const parsed = await parseStringPromise(xml, { explicitArray: false });
                    let items = parsed.rss?.channel?.item || [];
                    if (!Array.isArray(items)) items = [items];

                    return items.slice(0, 8).map((item, i) => ({
                        id: `news-${qi}-${i}-${Date.now()}`,
                        title: (item.title || '').replace(/<[^>]*>/g, '').trim(),
                        authors: item.source?._ || item.source || '',
                        source: item.source?._ || item.source || 'News',
                        date: item.pubDate || '',
                        url: item.link || '',
                        abstract: truncate(item.description || ''),
                        category: 'news',
                        provider: 'Google News'
                    }));
                } catch (e) {
                    return [];
                }
            })
        );

        const seen = new Set();
        const articles = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value)
            .filter(a => {
                const key = a.title.toLowerCase().slice(0, 60);
                if (seen.has(key)) return false;
                seen.add(key);
                return true;
            });

        if (articles.length === 0) {
            return res.json(DEMO_DATA.filter(d => d.category === 'news'));
        }

        res.json(articles);
    } catch (err) {
        console.error('News error:', err.message);
        res.json(DEMO_DATA.filter(d => d.category === 'news'));
    }
});

module.exports = router;
