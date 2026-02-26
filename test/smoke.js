#!/usr/bin/env node
/**
 * BCI Tracker Smoke Test Suite
 * Run: npm test  (requires server running on localhost:3000)
 */

const BASE = process.env.TEST_URL || 'http://localhost:3000';
let passed = 0, failed = 0;

async function fetchJSON(path) {
    const res = await fetch(`${BASE}${path}`);
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
    return res.json();
}

function assert(ok, label) {
    if (ok) { passed++; console.log(`  ✅ ${label}`); }
    else    { failed++; console.error(`  ❌ ${label}`); }
}

// ── Tests ───────────────────────────────────────────────

async function testStaticAssets() {
    console.log('\n🌐 Static assets');
    for (const p of ['/', '/app.js', '/style.css']) {
        const r = await fetch(`${BASE}${p}`);
        assert(r.ok, `${p} → ${r.status}`);
    }
}

async function testNewsAPI() {
    console.log('\n📰 /api/all');
    const data = await fetchJSON('/api/all?sort=importance&limit=5');
    const items = data.items || [];
    assert(items.length > 0, 'has at least 1 item');

    if (items.length > 0) {
        const item = items[0];
        assert(typeof item.title === 'string' && item.title.length > 0, 'item.title exists');
        assert(typeof item.url === 'string', 'item.url exists');
        assert(typeof item.importance === 'number', `item.importance is number (got ${item.importance})`);
        assert(item.importance >= 0 && item.importance <= 100, `score 0-100 (got ${item.importance})`);
        assert(['critical','high','medium','low'].includes(item.importanceLevel), `importanceLevel valid (got ${item.importanceLevel})`);
        assert(typeof item.source === 'string', 'item.source exists');
        assert(typeof item.category === 'string', 'item.category exists');
    }
}

async function testSearchAPI() {
    console.log('\n🔍 /api/all?q=BCI');
    const data = await fetchJSON('/api/all?q=BCI&limit=3');
    const items = data.items || [];
    assert(Array.isArray(items), 'search returns array');
}

async function testStatsAPI() {
    console.log('\n📊 /api/stats');
    const data = await fetchJSON('/api/stats');
    assert(typeof data.total === 'number', `total is number (got ${data.total})`);
}

async function testSummaryAPI() {
    console.log('\n🤖 /api/summary');
    const data = await fetchJSON('/api/summary');
    assert(typeof data.generated === 'string', 'has generated timestamp');
    assert(Array.isArray(data.sections), 'has sections array');

    if (data.sections.length > 0) {
        for (const section of data.sections) {
            assert(typeof section.title === 'string', `section "${section.title}" has title`);
            assert(Array.isArray(section.items), `section "${section.title}" has items`);

            for (const item of section.items) {
                if (typeof item === 'string') continue;
                assert(typeof item.text === 'string' && item.text.length > 0, `  item has text`);
                assert(typeof item.importance === 'number', `  importance is number (got ${typeof item.importance}: ${item.importance})`);
            }
        }
    }
}

async function testScoringConsistency() {
    console.log('\n⚖️  Scoring consistency');
    const [newsData, summaryData] = await Promise.all([
        fetchJSON('/api/all?sort=importance&limit=10'),
        fetchJSON('/api/summary')
    ]);

    const newsItems = Array.isArray(newsData) ? newsData : (newsData.items || []);
    const newsScores = newsItems.map(i => i.importance).filter(s => typeof s === 'number');
    const summaryScores = (summaryData.sections || [])
        .flatMap(s => s.items)
        .filter(i => typeof i === 'object' && typeof i.importance === 'number')
        .map(i => i.importance);

    if (newsScores.length && summaryScores.length) {
        assert(summaryScores.every(s => s >= 0 && s <= 100), `summary scores in 0-100`);
        const unique = [...new Set(summaryScores)];
        assert(unique.length >= 2, `varied scores (${unique.join(', ')})`);
    } else {
        assert(false, 'need both news and summary scores to compare');
    }
}

async function testFrontendFields() {
    console.log('\n🔗 Frontend field mapping');
    const code = await (await fetch(`${BASE}/app.js`)).text();
    for (const f of ['importanceLevel', 'importance', 'title', 'url', 'source']) {
        assert(code.includes(f), `app.js uses "${f}"`);
    }
    assert(code.includes('item.text'), 'app.js handles summary item.text');
    assert(code.includes('item.importance'), 'app.js handles summary item.importance');
}

// ── Runner ──────────────────────────────────────────────

async function run() {
    console.log(`\n🧪 BCI Tracker Smoke Tests — ${BASE}\n${'─'.repeat(50)}`);
    try {
        await testStaticAssets();
        await testNewsAPI();
        await testSearchAPI();
        await testStatsAPI();
        await testSummaryAPI();
        await testScoringConsistency();
        await testFrontendFields();
    } catch (err) {
        failed++;
        console.error(`\n💥 Fatal: ${err.message}`);
    }
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📋 ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}
run();
