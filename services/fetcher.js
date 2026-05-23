const { parseStringPromise } = require('xml2js');

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

// ─── Fetch RSS Helper ─────────────────────────────────────

async function fetchRSS(feedUrl, sourceName) {
    try {
        const xml = await fetchText(feedUrl);
        const parsed = await parseStringPromise(xml, { explicitArray: false });

        let items = parsed.rss?.channel?.item || parsed.feed?.entry || [];
        if (!Array.isArray(items)) items = [items];

        return items.slice(0, 15).map((item, i) => {
            const title = item.title?._ || item.title || '';
            const link = item.link?.$.href || item.link || '';
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

// ─── Enrich Item ──────────────────────────────────────────

const { translateTitle } = require('../translate');
const { scoreImportance, getImportanceLevel } = require('../scoring');

function enrichItem(item) {
    // Cap future dates to today — academic journals often set future issue dates
    if (item.date) {
        const parsed = new Date(item.date);
        if (!isNaN(parsed.getTime()) && parsed > new Date()) {
            item.date = new Date().toISOString();
        }
    }

    const titleZh = translateTitle(item.title);
    const importance = scoreImportance(item);
    const importanceLevel = getImportanceLevel(importance);
    return { ...item, titleZh, importance, importanceLevel };
}

// ─── Fetch & Store (background job) ───────────────────────

const { upsertMany, autoAssignCollections, getStats } = require('../db');

let isFetching = false;
let useDemoData = false;

async function fetchAndStore(PORT) {
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

module.exports = {
    fetchText, fetchJSON, truncate, fetchRSS,
    enrichItem, fetchAndStore,
    DEMO_DATA,
    get useDemoData() { return useDemoData; },
    set useDemoData(v) { useDemoData = v; }
};
