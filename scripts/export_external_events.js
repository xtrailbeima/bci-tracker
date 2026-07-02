#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const { searchArticles } = require('../db');

const ROOT = path.join(__dirname, '..');
const WATCHLIST_PATH = path.join(ROOT, 'knowledge_base', 'watchlist.yaml');

const DEFAULT_WATCHLIST = {
    companies: ['Neuralink', 'Synchron', 'Blackrock Neurotech', 'Paradromics', 'Axoft'],
    technologyRoutes: [
        'invasive BCI',
        'endovascular BCI',
        'flexible electrode',
        'non-invasive BCI',
        'EEG decoding',
        'speech decoding',
        'ultrasound neuromodulation',
    ],
    indications: ['ALS', 'paralysis', "Parkinson's disease", 'depression', 'communication assistance'],
    policySources: ['FDA', 'ClinicalTrials.gov', 'NMPA', 'NIH', 'DARPA'],
    companyAliases: {},
    technologyRouteAliases: {},
    indicationAliases: {},
};

const COMPANY_ALIASES = {
    'Blackrock Neurotech': ['blackrock neurotech', 'blackrock'],
    'Synchron': ['synchron', 'stentrode'],
    'Neuralink': ['neuralink'],
    'Paradromics': ['paradromics', 'connexus'],
    'Axoft': ['axoft'],
};

const ROUTE_KEYWORDS = [
    { label: 'invasive BCI', terms: ['intracortical', 'implant', 'implantable', 'utah array', 'cortical bci', '侵入式', '植入式', '皮层', '脑内', '微电极'] },
    { label: 'endovascular BCI', terms: ['endovascular', 'stentrode', 'vascular', '血管内', '支架电极'] },
    { label: 'flexible electrode', terms: ['flexible electrode', 'soft electrode', 'thin-film', 'polymer electrode', 'hydrogel', '柔性电极', '柔性', '薄膜电极', '水凝胶'] },
    { label: 'non-invasive BCI', terms: ['non-invasive', 'noninvasive', 'wearable', 'fnirs', '非侵入式', '无创', '可穿戴'] },
    { label: 'EEG decoding', terms: ['eeg', 'motor imagery', 'p300', 'ssvep', '脑电', '运动想象'] },
    { label: 'speech decoding', terms: ['speech decoding', 'brain-to-text', 'speech neuroprosthesis', 'handwriting', '语音解码', '脑到文本', '语言解码', '打字'] },
    { label: 'ultrasound neuromodulation', terms: ['ultrasound', 'focused ultrasound', '超声', '超声波', '聚焦超声'] },
];

const INDICATION_KEYWORDS = [
    { label: 'ALS', terms: ['als', 'amyotrophic lateral sclerosis', 'motor neuron disease', '渐冻症', '肌萎缩侧索硬化'] },
    { label: 'paralysis', terms: ['paralysis', 'tetraplegia', 'locked-in', 'spinal cord injury', '瘫痪', '四肢瘫痪', '脊髓损伤'] },
    { label: "Parkinson's disease", terms: ['parkinson', '帕金森'] },
    { label: 'depression', terms: ['depression', '抑郁'] },
    { label: 'communication assistance', terms: ['communication', 'speech', 'brain-to-text', 'typing', '交流', '沟通', '语音', '打字'] },
];

const EVENT_DEDUPE_WINDOWS = {
    financing: 90,
    regulatory: 45,
    clinical_milestone: 45,
    company_update: 14,
    market_news: 7,
    research_publication: 7,
    public_video: 2,
};

function parseArgs(argv) {
    const args = {
        date: todayLocal(),
        from: '',
        to: '',
        limit: 50,
        minImportance: 0,
        out: '',
        stdout: false,
        dedupe: true,
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];
        const next = argv[i + 1];
        if (arg === '--date' && next) args.date = next, i++;
        else if (arg === '--from' && next) args.from = next, i++;
        else if (arg === '--to' && next) args.to = next, i++;
        else if (arg === '--limit' && next) args.limit = clampInt(next, 1, 500, 50), i++;
        else if (arg === '--min-importance' && next) args.minImportance = clampInt(next, 0, 100, 0), i++;
        else if (arg === '--out' && next) args.out = next, i++;
        else if (arg === '--stdout') args.stdout = true;
        else if (arg === '--no-dedupe') args.dedupe = false;
        else if (arg === '--help' || arg === '-h') {
            printUsage();
            process.exit(0);
        }
    }

    if (!args.out && !args.stdout) {
        args.out = path.join(ROOT, 'external_events', `${args.date}.json`);
    }
    return args;
}

function clampInt(value, min, max, fallback) {
    const n = parseInt(value, 10);
    if (Number.isNaN(n)) return fallback;
    return Math.min(max, Math.max(min, n));
}

function todayLocal() {
    const now = new Date();
    const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0, 10);
}

function dateOnly(value, fallback) {
    const parsed = new Date(value || '');
    if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
    return fallback;
}

function parseSimpleWatchlist(file) {
    const watchlist = JSON.parse(JSON.stringify(DEFAULT_WATCHLIST));
    if (!fs.existsSync(file)) return watchlist;

    let current = '';
    let nested = '';
    for (const rawLine of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const line = rawLine.replace(/\s+#.*$/, '');
        if (!line.trim()) continue;

        const top = line.match(/^([A-Za-z][A-Za-z0-9_]*):\s*$/);
        if (top) {
            current = top[1];
            nested = '';
            if (!(current in watchlist)) watchlist[current] = {};
            continue;
        }

        const child = line.match(/^\s{2}([^:\n]+):\s*$/);
        if (child) {
            nested = child[1].trim();
            if (current === 'companies') {
                if (!watchlist.companyGroups) watchlist.companyGroups = {};
                watchlist.companyGroups[nested] = [];
            } else if (isAliasMapKey(current)) {
                if (!watchlist[current]) watchlist[current] = {};
                watchlist[current][nested] = [];
            }
            continue;
        }

        const item = line.match(/^\s*-\s+(.+?)\s*$/);
        if (item) {
            const value = item[1].replace(/^["']|["']$/g, '');
            if (current === 'companies') {
                watchlist.companies.push(value);
                if (nested && watchlist.companyGroups) watchlist.companyGroups[nested].push(value);
            } else if (isAliasMapKey(current) && nested) {
                watchlist[current][nested].push(value);
            } else if (Array.isArray(watchlist[current])) {
                watchlist[current].push(value);
            }
        }
    }

    for (const key of Object.keys(watchlist)) {
        if (Array.isArray(watchlist[key])) watchlist[key] = [...new Set(watchlist[key])];
    }
    return watchlist;
}

function isAliasMapKey(key) {
    return ['companyAliases', 'technologyRouteAliases', 'indicationAliases'].includes(key);
}

function cleanText(value) {
    return String(value || '')
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/&amp;/gi, '&')
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;/gi, "'")
        .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, num) => String.fromCodePoint(parseInt(num, 10)))
        .replace(/\s+/g, ' ')
        .trim();
}

function textOf(article) {
    return cleanText(`${article.title || ''} ${article.abstract || ''} ${article.source || ''} ${article.provider || ''}`).toLowerCase();
}

function contentTextOf(article) {
    return cleanText(`${article.title || ''} ${article.abstract || ''}`).toLowerCase();
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasTerm(text, term) {
    const needle = cleanText(term).toLowerCase();
    if (!needle) return false;
    if (/^[a-z0-9][a-z0-9\s.&+/$-]*$/i.test(needle)) {
        const pattern = escapeRegExp(needle).replace(/\s+/g, '\\s+');
        return new RegExp(`(^|[^a-z0-9])${pattern}($|[^a-z0-9])`, 'i').test(text);
    }
    return text.includes(needle);
}

function hasAny(text, terms) {
    return terms.some(term => hasTerm(text, term));
}

function matchCompanies(text, watchlist) {
    const matches = new Set();
    const companyNames = [...new Set([...(watchlist.companies || []), ...Object.keys(watchlist.companyAliases || {})])];
    for (const company of companyNames) {
        const aliases = [company, ...(COMPANY_ALIASES[company] || []), ...((watchlist.companyAliases || {})[company] || [])];
        if (hasAny(text, aliases)) matches.add(company);
    }
    return [...matches];
}

function extractCompanyCandidates(article) {
    const raw = cleanText(`${article.title || ''} ${article.abstract || ''}`);
    const candidates = new Set();

    for (const match of raw.matchAll(/[「“"]([^」”"]{2,30})[」”"]/g)) {
        if (/[科技医疗生物脑机接口]/.test(match[1])) candidates.add(match[1]);
    }

    for (const match of raw.matchAll(/脑机接口企业([^，,。；;]{2,24})(?:完成|获|宣布|发布)/g)) {
        candidates.add(match[1]);
    }

    return [...candidates].filter(name => !/[|丨]/.test(name));
}

function matchLabeledTerms(text, keywordSets, watchTerms = [], aliasMap = {}) {
    const matches = new Set();
    for (const item of keywordSets) {
        if (hasAny(text, [...item.terms, ...((aliasMap || {})[item.label] || [])])) matches.add(item.label);
    }
    for (const term of watchTerms) {
        const terms = [term, ...((aliasMap || {})[term] || [])];
        if (hasAny(text, terms)) matches.add(term);
    }
    return [...matches];
}

function inferEventType(text, article, watchlist) {
    if (hasAny(text, ['series a', 'series b', 'series c', 'series d', 'funding', 'financing', 'raised', '融资', '天使轮', 'a轮', 'b轮', 'c轮', 'd轮'])) {
        return 'financing';
    }
    if (hasAny(text, ['fda', 'approval', 'clearance', 'regulatory', 'nmpa', 'policy', 'guidance', '审批', '获批', '监管', '政策'])) {
        return 'regulatory';
    }
    if (hasAny(text, ['clinical trial', 'first-in-human', 'human trial', 'patient', 'follow-up', 'outcomes', '临床', '人体试验', '患者', '随访'])) {
        return 'clinical_milestone';
    }
    if (article.category === 'journal' || article.category === 'preprint') return 'research_publication';
    if (article.category === 'video') return 'public_video';
    const companyTerms = [
        ...(watchlist.companies || []),
        ...Object.values(watchlist.companyAliases || {}).flat(),
    ];
    if (hasAny(text, companyTerms)) return 'company_update';
    return 'market_news';
}

function inferTrack(eventType, article, text, watchlist) {
    if (eventType === 'regulatory' || hasAny(text, watchlist.policySources || [])) return 'policy';
    if (article.category === 'journal' || article.category === 'preprint') return 'research';
    if (article.category === 'video' || article.sourceReliability === 'social') return 'media';
    return 'industry';
}

function inferInvestmentSignal(text, eventType, article) {
    if (hasAny(text, ['adverse event', 'recall', 'safety issue', 'failed', 'failure', 'lawsuit', 'halted'])) {
        return 'negative';
    }
    if (['financing', 'regulatory', 'clinical_milestone'].includes(eventType)) return 'positive';
    if ((article.importance || 0) >= 80) return 'watch';
    if (article.category === 'journal' || article.category === 'preprint') return 'watch';
    return 'neutral';
}

function inferConfidence(article) {
    const reliability = {
        official: 0.86,
        journal: 0.82,
        preprint: 0.68,
        media: 0.58,
        social: 0.46,
        unknown: 0.4,
    }[article.sourceReliability] || 0.45;
    const access = {
        full_text: 0.9,
        metadata_only: 0.65,
        paywalled: 0.45,
        failed: 0.2,
    }[article.accessStatus] || 0.5;
    const quality = Math.min(100, Math.max(0, article.contentQuality || 50)) / 100;
    return Number(Math.min(0.95, Math.max(0.2, reliability * 0.45 + access * 0.35 + quality * 0.2)).toFixed(2));
}

function truncate(value, max) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= max) return text;
    return `${text.slice(0, max - 1)}…`;
}

function uniqueStrings(values) {
    return [...new Set((values || []).map(v => cleanText(v)).filter(Boolean))];
}

function normalizeTitleForDedupe(value) {
    return cleanText(value)
        .toLowerCase()
        .replace(/\s[-–—]\s[^-–—]{2,80}$/u, '')
        .replace(/[丨|].{2,50}$/u, '')
        .replace(/https?:\/\/\S+/g, ' ')
        .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
        .replace(/\b(brain computer interface|brain-computer interface|bci|脑机接口)\b/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function bigrams(value) {
    const text = normalizeTitleForDedupe(value).replace(/\s+/g, '');
    if (!text) return [];
    if (text.length <= 2) return [text];
    const grams = [];
    for (let i = 0; i < text.length - 1; i++) grams.push(text.slice(i, i + 2));
    return grams;
}

function titleSimilarity(a, b) {
    const left = new Set(bigrams(a));
    const right = new Set(bigrams(b));
    if (left.size === 0 || right.size === 0) return 0;
    let overlap = 0;
    for (const gram of left) if (right.has(gram)) overlap++;
    return overlap / (left.size + right.size - overlap);
}

function financingSignature(value) {
    const text = cleanText(value).toLowerCase();
    const round = text.match(/\bseries\s+[a-e]\b|[a-e]轮|天使轮|angel round|seed round|pre-a/iu)?.[0] || '';
    const amount = text.match(/(?:us\$|\$)\s*\d+(?:\.\d+)?\s*(?:m|million|b|billion)?|\d+(?:\.\d+)?\s*(?:million|billion|亿元|亿|万元|万)|数亿元|超\d+(?:\.\d+)?亿元/iu)?.[0] || '';
    const normalizedRound = round.replace(/\s+/g, ' ').trim();
    const normalizedAmount = amount
        .replace(/\s+/g, '')
        .replace(/^us\$/, '$')
        .replace(/million$/i, 'm')
        .replace(/billion$/i, 'b');
    return cleanText(`${normalizedRound}|${normalizedAmount}`);
}

function sameFinancingDetails(a, b) {
    const left = financingSignature(`${a.title} ${a.summary}`);
    const right = financingSignature(`${b.title} ${b.summary}`);
    return left !== '' && left === right;
}

function dateDistanceDays(a, b) {
    const left = new Date(a || '').getTime();
    const right = new Date(b || '').getTime();
    if (Number.isNaN(left) || Number.isNaN(right)) return Infinity;
    return Math.abs(left - right) / 86400000;
}

function companyOverlap(a, b) {
    const left = new Set((a.companies || []).map(v => cleanText(v).toLowerCase()));
    return (b.companies || []).some(v => left.has(cleanText(v).toLowerCase()));
}

function uniqueSources(sources) {
    const seen = new Set();
    const result = [];
    for (const source of sources || []) {
        const key = source.url || `${source.provider || ''}:${source.title || ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(source);
    }
    return result;
}

function eventDedupeKey(event) {
    const dateBucket = ['financing', 'regulatory', 'clinical_milestone'].includes(event.eventType)
        ? String(event.date || '').slice(0, 7)
        : String(event.date || '').slice(0, 10);
    const companies = uniqueStrings(event.companies).sort().join('|');
    const title = normalizeTitleForDedupe(event.title).slice(0, 80);
    const base = [event.eventType, dateBucket, companies || title].join('|');
    return crypto.createHash('sha1').update(base).digest('hex').slice(0, 12);
}

function areDuplicateEvents(a, b) {
    if (a.eventType !== b.eventType) return false;
    const maxDays = EVENT_DEDUPE_WINDOWS[a.eventType] || 7;
    if (dateDistanceDays(a.date, b.date) > maxDays) return false;

    const similarity = titleSimilarity(a.title, b.title);
    if (companyOverlap(a, b)) {
        if (a.eventType === 'financing' && sameFinancingDetails(a, b)) return true;
        if (['financing', 'regulatory', 'clinical_milestone'].includes(a.eventType)) return similarity >= 0.4;
        return similarity >= 0.55;
    }
    return similarity >= 0.82;
}

function mergeEvents(primary, duplicate) {
    const sources = uniqueSources([...(primary.sources || []), ...(duplicate.sources || [])]);
    const mergedIds = uniqueStrings([primary.id, ...(primary.mergedEventIds || []), duplicate.id, ...(duplicate.mergedEventIds || [])]);
    const duplicateTitles = uniqueStrings([
        ...(primary.duplicateTitles || []),
        duplicate.title,
        ...(duplicate.sources || []).map(source => source.title),
    ]).filter(title => title !== primary.title).slice(0, 8);
    const confidence = Math.min(0.98, Math.max(primary.confidence || 0, duplicate.confidence || 0) + Math.log2(sources.length) * 0.03);

    return {
        ...primary,
        date: new Date(duplicate.date || 0) > new Date(primary.date || 0) ? duplicate.date : primary.date,
        summary: cleanText(duplicate.summary).length > cleanText(primary.summary).length ? duplicate.summary : primary.summary,
        companies: uniqueStrings([...(primary.companies || []), ...(duplicate.companies || [])]),
        technologyRoutes: uniqueStrings([...(primary.technologyRoutes || []), ...(duplicate.technologyRoutes || [])]),
        indications: uniqueStrings([...(primary.indications || []), ...(duplicate.indications || [])]),
        investmentSignal: combineSignals(primary.investmentSignal, duplicate.investmentSignal),
        importanceScore: Math.max(primary.importanceScore || 0, duplicate.importanceScore || 0),
        confidence: Number(confidence.toFixed(2)),
        sources,
        sourceCount: sources.length,
        duplicateTitles,
        mergedEventIds: mergedIds,
        dedupeKey: primary.dedupeKey || eventDedupeKey(primary),
    };
}

function combineSignals(a, b) {
    const rank = { negative: 4, positive: 3, watch: 2, neutral: 1 };
    return (rank[b] || 0) > (rank[a] || 0) ? b : a;
}

function dedupeEvents(events) {
    const deduped = [];
    for (const event of events) {
        const enriched = {
            ...event,
            dedupeKey: eventDedupeKey(event),
            sourceCount: (event.sources || []).length,
            mergedEventIds: [event.id],
        };
        const index = deduped.findIndex(existing => areDuplicateEvents(existing, enriched));
        if (index === -1) deduped.push(enriched);
        else deduped[index] = mergeEvents(deduped[index], enriched);
    }
    return deduped;
}

function stableEventId(article) {
    const base = article.url || `${article.id}-${article.title}`;
    const hash = crypto.createHash('sha1').update(base).digest('hex').slice(0, 10);
    return `evt-article-${article.id || hash}-${hash}`;
}

function articleToEvent(article, watchlist, outputDate) {
    const text = textOf(article);
    const contentText = contentTextOf(article);
    const eventType = inferEventType(text, article, watchlist);
    const companies = [...new Set([...matchCompanies(contentText, watchlist), ...extractCompanyCandidates(article)])];
    const technologyRoutes = matchLabeledTerms(contentText, ROUTE_KEYWORDS, watchlist.technologyRoutes, watchlist.technologyRouteAliases);
    const indications = matchLabeledTerms(contentText, INDICATION_KEYWORDS, watchlist.indications, watchlist.indicationAliases);
    return {
        id: stableEventId(article),
        date: dateOnly(article.date, outputDate),
        track: inferTrack(eventType, article, text, watchlist),
        eventType,
        title: truncate(cleanText(article.title) || 'Untitled BCI event', 220),
        summary: truncate(cleanText(article.abstract) || cleanText(article.title) || 'No summary available.', 700),
        companies,
        technologyRoutes,
        indications,
        investmentSignal: inferInvestmentSignal(text, eventType, article),
        importanceScore: Math.min(100, Math.max(0, Number(article.importance || 0))),
        confidence: inferConfidence(article),
        sources: [
            {
                title: truncate(cleanText(article.title), 220),
                url: article.url || '',
                provider: article.provider || article.source || '',
                source: article.source || '',
                accessStatus: article.accessStatus || 'metadata_only',
                contentQuality: article.contentQuality || 50,
            },
        ],
    };
}

function buildPayload(args) {
    const watchlist = parseSimpleWatchlist(WATCHLIST_PATH);
    const result = searchArticles({
        sort: 'importance',
        limit: args.limit,
        dateFrom: args.from || undefined,
        dateTo: args.to || undefined,
    });
    const items = (result.items || []).filter(item => Number(item.importance || 0) >= args.minImportance);
    const candidateEvents = items.map(item => articleToEvent(item, watchlist, args.date));
    const events = args.dedupe ? dedupeEvents(candidateEvents) : candidateEvents;
    return {
        generatedAt: new Date().toISOString(),
        source: {
            table: 'articles',
            inputCount: items.length,
            count: events.length,
            from: args.from || null,
            to: args.to || null,
            minImportance: args.minImportance,
            dedupe: args.dedupe,
        },
        events,
    };
}

function printUsage() {
    console.log(`Usage:
  npm run export:events -- [--date YYYY-MM-DD] [--from ISO_DATE] [--to ISO_DATE] [--limit N] [--min-importance N] [--no-dedupe]
  npm run export:events -- --out /tmp/events.json
  npm run export:events -- --stdout`);
}

function main() {
    const args = parseArgs(process.argv.slice(2));
    const payload = buildPayload(args);
    const json = `${JSON.stringify(payload, null, 2)}\n`;

    if (args.stdout) {
        process.stdout.write(json);
        return;
    }

    fs.mkdirSync(path.dirname(args.out), { recursive: true });
    fs.writeFileSync(args.out, json, 'utf8');
    console.log(`✅ Exported ${payload.events.length} event(s) to ${path.relative(ROOT, args.out)}`);
}

if (require.main === module) main();

module.exports = {
    articleToEvent,
    buildPayload,
    dedupeEvents,
    parseSimpleWatchlist,
};
