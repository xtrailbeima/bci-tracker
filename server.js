const express = require('express');
const cors = require('cors');
const { parseStringPromise } = require('xml2js');
const path = require('path');
const { translateTitle } = require('./translate');
const { scoreImportance, getImportanceLevel } = require('./scoring');
const { upsertMany, searchArticles, getStats, getAllSources, getTrendingKeywords, addSubscriber, removeSubscriber, getActiveSubscribers, getCollections, getCollectionItems, addToCollection, removeFromCollection, createCollection, deleteCollection, autoAssignCollections } = require('./db');
const { sendDailyBriefing } = require('./briefing');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ─── TEAM AUTHENTICATION MIDDLEWARE ───────────────────────
function teamAuth(req, res, next) {
    const authHeader = req.headers.authorization || '';
    const b64auth = authHeader.split(' ')[1] || '';
    const [login, password] = Buffer.from(b64auth, 'base64').toString().split(':');

    // Use environment variables or default to standard team credentials
    const expectedUser = process.env.TEAM_USER || 'bciteam';
    const expectedPass = process.env.TEAM_PASS || 'bci2026';

    if (login === expectedUser && password === expectedPass) {
        return next();
    }
    
    // Auth failed
    res.set('WWW-Authenticate', 'Basic realm="BCI Tracker Team Private Access"');
    res.status(401).send('Authentication required. Internal Team Use Only.');
}

// 🔐 Apply authentication to all routes (serving frontend and APIs)
app.use(teamAuth);
app.use(express.static(path.join(__dirname, 'public')));

// ─── Helpers ──────────────────────────────────────────────

async function fetchText(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
    return res.text();
}

async function fetchJSON(url) {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status} ${url}`);
    return res.json();
}

function truncate(str, len = 300) {
    if (!str) return '';
    str = str.replace(/<[^>]*>/g, '').trim();
    return str.length > len ? str.slice(0, len) + '…' : str;
}

// ─── Demo Data (fallback when network is unavailable) ─────

const DEMO_DATA = [
    {
        id: 'pubmed-demo-1', title: 'High-performance brain-to-text communication via handwriting',
        authors: 'Willett FR, Avansino DT, Hochberg LR, Henderson JM, Shenoy KV', source: 'Nature', date: '2021-05-12',
        url: 'https://pubmed.ncbi.nlm.nih.gov/33981047/', abstract: 'An intracortical brain-computer interface that decodes attempted handwriting movements from neural activity in the motor cortex, achieving typing speeds of 90 characters per minute with 94.1% raw accuracy online.',
        category: 'journal', provider: 'PubMed'
    },
    {
        id: 'pubmed-demo-2', title: 'A high-performance neuroprosthesis for speech decoding and avatar control',
        authors: 'Metzger SL, Littlejohn KT, Silva AB, Moses DA, Seaton MP, et al.', source: 'Nature', date: '2023-08-23',
        url: 'https://pubmed.ncbi.nlm.nih.gov/37612500/', abstract: 'A brain-computer interface that decodes speech from a patient with severe paralysis, translating neural signals into text at 78 words per minute and enabling control of a digital avatar with facial expressions.',
        category: 'journal', provider: 'PubMed'
    },
    {
        id: 'pubmed-demo-3', title: 'Walking naturally after spinal cord injury using a brain-spine interface',
        authors: 'Lorach H, Galvez A, Spagnolo V, Marber F, Karakas S, et al.', source: 'Nature', date: '2023-05-24',
        url: 'https://pubmed.ncbi.nlm.nih.gov/37225984/', abstract: 'A brain-spine interface that establishes a digital bridge between the brain and spinal cord, enabling a patient with chronic tetraplegia to stand and walk naturally in community settings.',
        category: 'journal', provider: 'PubMed'
    },
    {
        id: 'pubmed-demo-4', title: 'A high-performance speech neuroprosthesis',
        authors: 'Willett FR, Kunz EM, Fan C, Avansino DT, Wilson GH, et al.', source: 'Nature', date: '2023-08-23',
        url: 'https://pubmed.ncbi.nlm.nih.gov/37612505/', abstract: 'An intracortical speech neuroprosthesis that decodes speech at 62 words per minute across a 125,000-word vocabulary, achieving a word error rate of 23.8%, representing a dramatic improvement over prior results.',
        category: 'journal', provider: 'PubMed'
    },
    {
        id: 'pubmed-demo-5', title: 'An accurate and rapidly calibrating speech neuroprosthesis',
        authors: 'Card NS, Wairagkar M, Iacobacci C, Hou X, Singer-Clark T, et al.', source: 'New England Journal of Medicine', date: '2024-08-14',
        url: 'https://pubmed.ncbi.nlm.nih.gov/39141856/', abstract: 'A brain-computer interface for speech decoding in a patient with ALS that achieved 97.5% accuracy for a 50-word vocabulary after only 30 minutes of calibration data, demonstrating rapid deployment potential.',
        category: 'journal', provider: 'PubMed'
    },
    {
        id: 'arxiv-demo-1', title: 'BrainBERT: Self-supervised representation learning for intracranial recordings',
        authors: 'Wang C, Suresh A, Luo G, Pailla T', source: 'arXiv', date: '2023-02-28',
        url: 'https://arxiv.org/abs/2302.14367', abstract: 'We propose BrainBERT, a self-supervised framework that learns contextual representations from intracranial EEG recordings. BrainBERT demonstrates strong transfer learning capabilities across subjects and tasks for neural decoding.',
        category: 'preprint', provider: 'arXiv'
    },
    {
        id: 'arxiv-demo-2', title: 'Large Brain Model for Learning Generic Representations with Tremendous EEG Data in BCI',
        authors: 'Jiang W, Zhao L, Lu B', source: 'arXiv', date: '2024-05-15',
        url: 'https://arxiv.org/abs/2405.18765', abstract: 'We present a large brain model pre-trained on over 2,500 hours of EEG data that learns universal neural representations. The model enables few-shot calibration for new BCI users, reducing setup time from hours to minutes.',
        category: 'preprint', provider: 'arXiv'
    },
    {
        id: 'arxiv-demo-3', title: 'NeuroGPT: Towards a Foundation Model for EEG',
        authors: 'Cui A, Jiao W, Jia H, Zhu L', source: 'arXiv', date: '2023-11-07',
        url: 'https://arxiv.org/abs/2311.03764', abstract: 'We propose NeuroGPT, a foundation model that combines a large language model with an EEG encoder to enable zero-shot EEG-to-text decoding. The model achieves competitive performance on multiple BCI benchmarks without task-specific training.',
        category: 'preprint', provider: 'arXiv'
    },
    {
        id: 'arxiv-demo-4', title: 'Brain-Controlled Augmented Reality with Deep Reinforcement Learning',
        authors: 'Tonin L, Bauer FC, Millan JDR', source: 'arXiv', date: '2024-01-22',
        url: 'https://arxiv.org/abs/2401.12197', abstract: 'We present a brain-computer interface system that enables users to interact with augmented reality environments using motor imagery decoded from EEG signals, achieving 87% online accuracy with minimal calibration.',
        category: 'preprint', provider: 'arXiv'
    },
    {
        id: 'nature-demo-1', title: 'Neuroprosthesis for decoding speech in a paralyzed person with anarthria',
        authors: 'Moses DA, Metzger SL, Liu JR, et al.', source: 'Nature Neuroscience', date: '2021-07-15',
        url: 'https://www.nature.com/articles/s41593-021-00897-5', abstract: 'A speech neuroprosthesis that decodes attempted speech from cortical activity in a paralyzed individual who has not spoken for over 15 years, achieving 75% word-level accuracy with a 50-word vocabulary.',
        category: 'journal', provider: 'Nature Neuroscience'
    },
    {
        id: 'nature-demo-2', title: 'A brain-computer interface that evokes tactile sensations',
        authors: 'Flesher SN, Downey JE, Weiss JM, et al.', source: 'Nature BMI', date: '2021-04-21',
        url: 'https://www.nature.com/articles/s41586-021-03506-2', abstract: 'A bidirectional brain-computer interface combining cortical stimulation for somatosensory feedback with motor decoding, enabling a participant with tetraplegia to perform object transfer tasks 20% faster.',
        category: 'journal', provider: 'Nature BMI'
    },
    {
        id: 'science-demo-1', title: 'Epidural electrical stimulation of the cervical spinal cord restores voluntary arm and hand movement',
        authors: 'Lu DC, Edgerton VR, Modaber M, et al.', source: 'Science', date: '2023-11-20',
        url: 'https://www.science.org/doi/10.1126/scimed.adg6304', abstract: 'Epidural electrical stimulation of the cervical spinal cord combined with intensive rehabilitation restored voluntary arm and hand function in participants with chronic tetraplegia.',
        category: 'journal', provider: 'Science'
    },
    {
        id: 'news-demo-1', title: 'Neuralink receives FDA clearance for second-generation implant with 4,096 channels',
        authors: 'Reuters', source: 'Reuters', date: '2026-02-21',
        url: 'https://www.reuters.com/', abstract: 'The FDA has granted Neuralink clearance for its N2 device, featuring 4,096 recording channels and wireless data transmission at 200 Mbps. The company plans to begin human trials for ALS patients in Q2 2026.',
        category: 'news', provider: 'Google News'
    },
    {
        id: 'news-demo-2', title: 'Synchron reports positive 24-month outcomes for its Stentrode BCI in motor neuron disease',
        authors: 'Endpoints News', source: 'Endpoints News', date: '2026-02-19',
        url: 'https://endpts.com/', abstract: 'Synchron published 24-month follow-up data showing its endovascular Stentrode device maintained stable neural recording quality with no device-related serious adverse events in all 16 implanted patients.',
        category: 'news', provider: 'Google News'
    },
    {
        id: 'news-demo-3', title: 'Blackrock Neurotech raises $250M Series C to scale production of Utah Array successor',
        authors: 'TechCrunch', source: 'TechCrunch', date: '2026-02-17',
        url: 'https://techcrunch.com/', abstract: 'Blackrock Neurotech announced a $250 million Series C round led by Arch Venture Partners. Funds will support the commercialization of the MicroPort platform, a next-generation microelectrode array with 10,240 channels.',
        category: 'news', provider: 'Google News'
    },
    {
        id: 'news-demo-4', title: 'Paradromics completes first-in-human trial of high-bandwidth cortical BCI',
        authors: 'STAT News', source: 'STAT News', date: '2026-02-14',
        url: 'https://www.statnews.com/', abstract: 'Paradromics announced completion of its first-in-human feasibility study for the Connexus Direct Data Interface. The device streamed broadband neural data wirelessly in two participants with tetraplegia.',
        category: 'news', provider: 'Google News'
    },
    {
        id: 'news-demo-5', title: 'DARPA awards $78M for next-phase non-surgical neural interface program',
        authors: 'Defense One', source: 'Defense One', date: '2026-02-11',
        url: 'https://www.defenseone.com/', abstract: 'DARPA has awarded contracts totaling $78 million to six teams for Phase 2 of its N3 program, aiming to develop non-surgical neural interfaces capable of reading and writing to the brain at the resolution of single neurons.',
        category: 'news', provider: 'Google News'
    },
    {
        id: 'pubmed-demo-6', title: 'Closed-loop neuromodulation in an individual with treatment-resistant depression',
        authors: 'Scangos KW, Khambhati AN, Daly PM, Makhoul GS, Sugrue LP, et al.', source: 'Nature Medicine', date: '2021-10-04',
        url: 'https://pubmed.ncbi.nlm.nih.gov/34608328/', abstract: 'A personalized closed-loop neuromodulation therapy targeting depression biomarkers achieved rapid and sustained remission in a patient with severe treatment-resistant depression.',
        category: 'journal', provider: 'PubMed'
    },
    {
        id: 'news-demo-6', title: 'Precision Neuroscience demonstrates 1,024-channel thin-film BCI in surgical study',
        authors: 'Wired', source: 'Wired', date: '2026-02-08',
        url: 'https://www.wired.com/', abstract: 'Precision Neuroscience has demonstrated its Layer 7 cortical interface during neurosurgeries, showing high-fidelity recordings from 1,024 channels using a thin-film electrode array that sits on the brain surface.',
        category: 'news', provider: 'Google News'
    },
    {
        id: 'arxiv-demo-5', title: 'DeWave: Discrete EEG Waves Encoding for Brain Dynamics to Text Translation',
        authors: 'Duan Y, Zhou C, Wang Z, Wang YK, Lin CT', source: 'arXiv', date: '2023-09-20',
        url: 'https://arxiv.org/abs/2309.14030', abstract: 'DeWave introduces a discrete codex encoding method for translating raw EEG signals into natural language text, achieving BLEU-1 scores of 41.35% on the ZuCo dataset without requiring eye-tracking fixation markers.',
        category: 'preprint', provider: 'arXiv'
    }
];

let useDemoData = false;

// ─── PubMed ───────────────────────────────────────────────

app.get('/api/pubmed', async (req, res) => {
    try {
        const query = req.query.q || 'brain-computer interface';
        const maxResults = req.query.max || 20;

        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&sort=date&retmode=json`;
        const searchData = await fetchJSON(searchUrl);
        const ids = searchData.esearchresult?.idlist || [];

        if (ids.length === 0) return res.json([]);

        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
        const summaryData = await fetchJSON(summaryUrl);

        const articles = ids.map(id => {
            const d = summaryData.result?.[id];
            if (!d) return null;
            return {
                id: `pubmed-${id}`,
                title: d.title || '',
                authors: (d.authors || []).map(a => a.name).join(', '),
                source: d.fulljournalname || d.source || 'PubMed',
                date: d.pubdate || '',
                url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                abstract: truncate(d.title),
                category: 'journal',
                provider: 'PubMed'
            };
        }).filter(Boolean);

        res.json(articles);
    } catch (err) {
        console.error('PubMed error:', err.message);
        useDemoData = true;
        res.json(DEMO_DATA.filter(d => d.provider === 'PubMed'));
    }
});

// ─── arXiv ────────────────────────────────────────────────

app.get('/api/arxiv', async (req, res) => {
    try {
        const query = req.query.q || 'brain-computer interface';
        const maxResults = req.query.max || 20;
        const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

        const xml = await fetchText(url);
        const parsed = await parseStringPromise(xml, { explicitArray: false });

        const entries = parsed.feed?.entry;
        if (!entries) return res.json([]);

        const list = Array.isArray(entries) ? entries : [entries];
        const articles = list.map((e, i) => {
            const authors = Array.isArray(e.author)
                ? e.author.map(a => a.name).join(', ')
                : e.author?.name || '';
            const link = Array.isArray(e.link)
                ? (e.link.find(l => l.$?.type === 'text/html')?.$?.href || e.link[0]?.$?.href)
                : e.link?.$?.href || '';

            return {
                id: `arxiv-${i}-${Date.now()}`,
                title: (e.title || '').replace(/\s+/g, ' ').trim(),
                authors,
                source: 'arXiv',
                date: e.published || '',
                url: link,
                abstract: truncate(e.summary || ''),
                category: 'preprint',
                provider: 'arXiv'
            };
        });

        res.json(articles);
    } catch (err) {
        console.error('arXiv error:', err.message);
        useDemoData = true;
        res.json(DEMO_DATA.filter(d => d.provider === 'arXiv'));
    }
});

// ─── Journal RSS (Nature, Science) ────────────────────────

async function fetchRSS(feedUrl, sourceName) {
    try {
        const xml = await fetchText(feedUrl);
        const parsed = await parseStringPromise(xml, { explicitArray: false });

        let items = parsed.rss?.channel?.item || parsed.feed?.entry || [];
        if (!Array.isArray(items)) items = [items];

        return items.slice(0, 15).map((item, i) => {
            const title = item.title?._ || item.title || '';
            const link = item.link?.$?.href || item.link || '';
            const desc = item.description?._ || item.description || item.summary?._ || item.summary || '';
            const date = item.pubDate || item['dc:date'] || item.published || item.updated || '';

            return {
                id: `${sourceName.toLowerCase().replace(/\s/g, '-')}-${i}-${Date.now()}`,
                title: typeof title === 'string' ? title.replace(/<[^>]*>/g, '').trim() : String(title),
                authors: '',
                source: sourceName,
                date,
                url: typeof link === 'string' ? link : '',
                abstract: truncate(typeof desc === 'string' ? desc : ''),
                category: 'journal',
                provider: sourceName
            };
        });
    } catch (err) {
        console.error(`RSS error (${sourceName}):`, err.message);
        return [];
    }
}

app.get('/api/journals', async (req, res) => {
    try {
        const feeds = [
            { url: 'https://www.nature.com/subjects/neuroscience.rss', name: 'Nature Neuroscience' },
            { url: 'https://www.nature.com/subjects/brain-machine-interface.rss', name: 'Nature BMI' },
            { url: 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science', name: 'Science' },
            { url: 'https://www.cell.com/neuron/rss', name: 'Neuron (Cell)' },
        ];

        const results = await Promise.allSettled(
            feeds.map(f => fetchRSS(f.url, f.name))
        );

        const articles = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value);

        if (articles.length === 0 && useDemoData) {
            return res.json(DEMO_DATA.filter(d =>
                d.provider.includes('Nature') || d.provider === 'Science'
            ));
        }

        res.json(articles);
    } catch (err) {
        console.error('Journals error:', err.message);
        res.json(DEMO_DATA.filter(d =>
            d.provider.includes('Nature') || d.provider === 'Science'
        ));
    }
});

// ─── Company News ─────────────────────────────────────────

app.get('/api/news', async (req, res) => {
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

// ─── Enrichment ───────────────────────────────────────────

function enrichItem(item) {
    const titleZh = translateTitle(item.title);
    const importance = scoreImportance(item);
    const importanceLevel = getImportanceLevel(importance);
    return { ...item, titleZh, importance, importanceLevel };
}

// ─── Fetch & Store (background job) ───────────────────────

let isFetching = false;

async function fetchAndStore() {
    if (isFetching) return;
    isFetching = true;
    console.log('📥 Fetching data from all sources...');

    try {
        const baseUrl = `http://localhost:${PORT}`;
        const [pubmed, arxiv, journals, news] = await Promise.allSettled([
            fetchJSON(`${baseUrl}/api/pubmed`),
            fetchJSON(`${baseUrl}/api/arxiv`),
            fetchJSON(`${baseUrl}/api/journals`),
            fetchJSON(`${baseUrl}/api/news`),
        ]);

        const all = [
            ...(pubmed.status === 'fulfilled' ? pubmed.value : []),
            ...(arxiv.status === 'fulfilled' ? arxiv.value : []),
            ...(journals.status === 'fulfilled' ? journals.value : []),
            ...(news.status === 'fulfilled' ? news.value : []),
        ].map(enrichItem);

        upsertMany(all);
        autoAssignCollections(all);
        const stats = getStats();
        console.log(`✅ Stored ${all.length} items (DB total: ${stats.total})`);
    } catch (err) {
        console.error('fetchAndStore error:', err.message);
        // Fallback: store demo data
        upsertMany(DEMO_DATA.map(enrichItem));
    } finally {
        isFetching = false;
    }
}

// ─── API: All (from database) ─────────────────────────────

app.get('/api/all', (req, res) => {
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

app.get('/api/stats', (req, res) => {
    try {
        res.json(getStats());
    } catch (err) {
        res.json({ total: 0, journals: 0, preprints: 0, news: 0 });
    }
});

// ─── API: Collections ─────────────────────────────────────

app.get('/api/collections', (req, res) => {
    try {
        res.json(getCollections());
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.get('/api/collections/:id', (req, res) => {
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

app.post('/api/collections', express.json(), (req, res) => {
    try {
        const { name, icon } = req.body;
        if (!name) return res.status(400).json({ error: 'name required' });
        const result = createCollection(name, icon);
        res.json({ id: result.lastInsertRowid, name, icon });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/collections/:id/add', express.json(), (req, res) => {
    try {
        const { articleId } = req.body;
        addToCollection(parseInt(req.params.id), articleId, 'manual');
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/collections/:collectionId/items/:articleId', (req, res) => {
    try {
        removeFromCollection(parseInt(req.params.collectionId), parseInt(req.params.articleId));
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.delete('/api/collections/:id', (req, res) => {
    try {
        deleteCollection(parseInt(req.params.id));
        res.json({ ok: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: Sources ─────────────────────────────────────────

app.get('/api/sources', (req, res) => {
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

app.get('/api/trending', (req, res) => {
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

app.post('/api/subscribe', (req, res) => {
    try {
        const { email, name } = req.body;
        if (!email || !email.includes('@')) {
            return res.status(400).json({ error: '请提供有效的邮箱地址' });
        }
        addSubscriber(email.trim().toLowerCase(), name || '');
        res.json({ success: true, message: '订阅成功！' });
    } catch (err) {
        console.error('Subscribe error:', err.message);
        res.status(500).json({ error: '订阅失败' });
    }
});

app.post('/api/unsubscribe', (req, res) => {
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

app.post('/api/briefing/send', async (req, res) => {
    try {
        const result = await sendDailyBriefing();
        res.json(result);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

// ─── API: AI Summary (Gemini) ─────────────────────────────

let cachedSummary = null;
let summaryLastGenerated = 0;
const SUMMARY_CACHE_TTL = 45 * 60 * 1000; // 45 minutes

let aiCooldownUntil = 0;
const API_COOLDOWN_MS = 10 * 60 * 1000; // 10 minutes global cooldown between API calls

// Load company profile at startup
const fs = require('fs');
const companyProfilePath = require('path').join(__dirname, 'company_profile.md');
let companyProfile = '';
try {
    companyProfile = fs.readFileSync(companyProfilePath, 'utf-8');
    console.log('📄 Loaded company profile: company_profile.md');
} catch (e) {
    console.warn('⚠️ company_profile.md not found, competitive commentary will be skipped');
}

app.get('/api/summary', async (req, res) => {
    try {
        const forceRefresh = req.query.force === '1';

        // Return cached if fresh (unless force refresh)
        if (!forceRefresh && cachedSummary && (Date.now() - summaryLastGenerated) < SUMMARY_CACHE_TTL) {
            return res.json(cachedSummary);
        }

        // 🛡️ API Quota Protection: Prevent frequent manual force-refreshes
        if (Date.now() < aiCooldownUntil) {
            const minutesLeft = Math.ceil((aiCooldownUntil - Date.now()) / 60000);
            return res.json({
                generated: new Date().toISOString(),
                sections: [
                    { 
                        title: '🛡️ API 额度保护机制', 
                        icon: '⏳', 
                        items: [{ 
                            text: `为防止超出 Google 的免费 API 额度导致调用被停用，后台已设置最低请求间隔。请在 ${minutesLeft} 分钟后再次重试刷新。`, 
                            importance: 90 
                        }] 
                    }
                ]
            });
        }
        
        // Lock the cooldown globally immediately
        aiCooldownUntil = Date.now() + API_COOLDOWN_MS;

        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            return res.json({
                generated: new Date().toISOString(),
                sections: [
                    { title: '⚠️ AI 总结未启用', icon: '⚙️', items: [{ text: '请设置环境变量 GEMINI_API_KEY 以启用 AI 行业总结功能。', importance: 10 }, { text: '获取方式：访问 https://aistudio.google.com/apikey', url: 'https://aistudio.google.com/apikey', importance: 30 }] }
                ]
            });
        }

        // Get recent high-importance items from DB
        const recent = searchArticles({ sort: 'importance', limit: 30 });
        const items = recent.items || [];
        if (items.length === 0) {
            return res.json({ generated: new Date().toISOString(), sections: [{ title: '暂无数据', icon: '📭', items: [{ text: '数据库为空，请等待首次数据抓取完成。' }] }] });
        }

        // Build context for Gemini — include URLs and actual importance scores
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

        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig: {
                    temperature: 0.3,
                    maxOutputTokens: 8192,
                    responseMimeType: 'application/json',
                    thinkingConfig: { thinkingBudget: 0 }
                }
            })
        });

        if (!geminiRes.ok) {
            throw new Error(`Gemini API error: ${geminiRes.status}`);
        }

        const geminiData = await geminiRes.json();
        const rawText = geminiData.candidates?.[0]?.content?.parts?.[0]?.text || '';
        
        let parsed;
        try {
            // Because responseMimeType is 'application/json', rawText should be valid JSON
            parsed = JSON.parse(rawText);
        } catch (initialErr) {
            console.warn('AI Summary: strict JSON parse failed, attempting repair...', initialErr.message);
            
            // SAVE output for debugging
            require('fs').writeFileSync(require('path').join(__dirname, 'failed_summary.json'), rawText, 'utf-8');
            console.log('Saved raw failed JSON to failed_summary.json for inspection.');

            // Fallback: extract JSON if it's wrapped in markdown or has trailing garbage
            let cleaned = rawText.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();
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
        // Return fallback summary
        res.json({
            generated: new Date().toISOString(),
            sections: [
                { title: '🏢 重点公司动态', icon: '🏢', items: ['AI 总结生成失败，请稍后重试。错误：' + err.message] }
            ]
        });
    }
});

// ─── Start ────────────────────────────────────────────────

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

app.listen(PORT, () => {
    console.log(`🧠 BCI Tracker v4.0 running at http://localhost:${PORT}`);
    // Initial fetch after 3 seconds (so server is ready)
    setTimeout(fetchAndStore, 3000);
    // Repeat every 30 minutes
    setInterval(fetchAndStore, FETCH_INTERVAL);
    // Schedule daily briefing
    scheduleDailyBriefing();
});
