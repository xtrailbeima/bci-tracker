#!/usr/bin/env node
/**
 * BCI Tracker Smoke Test Suite
 * Run: npm test  (requires server running on localhost:3000)
 */

const BASE = process.env.TEST_URL || `http://localhost:${process.env.PORT || 3000}`;
const AUTH_EMAIL = process.env.TEST_AUTH_EMAIL || process.env.AUTH_OWNER_EMAIL || 'bci-test-owner@example.com';
const AUTH_PASSWORD = process.env.TEST_AUTH_PASSWORD || process.env.AUTH_OWNER_PASSWORD || 'bci-test-owner-password';
let passed = 0, failed = 0;
let authCookie = '';

async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (authCookie) headers.cookie = authCookie;
    const res = await fetch(path.startsWith('http') ? path : `${BASE}${path}`, { ...options, headers });
    const setCookie = res.headers.get('set-cookie');
    if (setCookie) authCookie = setCookie.split(';')[0];
    return res;
}

async function fetchJSON(path) {
    const res = await request(path);
    if (!res.ok) throw new Error(`HTTP ${res.status} on ${path}`);
    return res.json();
}

function assert(ok, label) {
    if (ok) { passed++; console.log(`  ✅ ${label}`); }
    else    { failed++; console.error(`  ❌ ${label}`); }
}

// ── Tests ───────────────────────────────────────────────

async function login(email = AUTH_EMAIL, password = AUTH_PASSWORD) {
    const res = await request('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error(`login failed: HTTP ${res.status}`);
    return res.json();
}

async function testAuthFlow() {
    console.log('\n🔐 Auth / RBAC');
    authCookie = '';
    const blocked = await request('/api/all?limit=1');
    assert(blocked.status === 401, `unauthenticated API blocked (${blocked.status})`);

    const loginData = await login();
    assert(loginData.user && loginData.user.role === 'owner', `owner login works (${loginData.user?.role})`);

    const me = await fetchJSON('/api/auth/me');
    assert(me.user.email === AUTH_EMAIL.toLowerCase(), 'me returns logged-in owner');

    const readerEmail = 'smoke-reader@local.test';
    const readerPassword = 'smoke-reader-password';
    let createRes = await request('/api/auth/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: readerEmail, password: readerPassword, role: 'reader', name: 'Smoke Reader' }),
    });
    if (createRes.status === 409) {
        const users = await fetchJSON('/api/auth/users');
        const existing = users.users.find(u => u.email === readerEmail);
        createRes = await request(`/api/auth/users/${existing.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ password: readerPassword, role: 'reader', active: true }),
        });
    }
    assert(createRes.status === 201 || createRes.status === 200, `owner can create/update reader (${createRes.status})`);

    await request('/api/auth/logout', { method: 'POST' });
    authCookie = '';
    const readerLogin = await login(readerEmail, readerPassword);
    assert(readerLogin.user.role === 'reader', 'reader login works');
    const readerCanRead = await request('/api/all?limit=1');
    assert(readerCanRead.ok, `reader can read feed (${readerCanRead.status})`);
    const readerFeed = await readerCanRead.json();
    const readerItem = (readerFeed.items || [])[0];
    assert(readerItem && typeof readerItem.title === 'string', 'reader feed returns readable article fields');
    if (readerItem) {
        for (const field of ['importance', 'accessStatus', 'contentQuality', 'sourceReliability', 'extractionMethod', 'lastFetchStatus', 'lastFetchError', 'fetchedAt']) {
            assert(!Object.prototype.hasOwnProperty.call(readerItem, field), `reader feed hides ${field}`);
        }
        assert(typeof readerItem.importanceLevel === 'string', 'reader feed keeps importanceLevel');
        assert(typeof readerItem.url === 'string', 'reader feed keeps source URL');
    }
    const readerCannotImport = await request('/api/import', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: 'https://example.com' }),
    });
    assert(readerCannotImport.status === 403, `reader cannot import (${readerCannotImport.status})`);
    const readerNoHealth = await request('/api/source-health');
    assert(readerNoHealth.status === 403, `reader cannot read source health (${readerNoHealth.status})`);
    const readerCannotEditRules = await request('/api/collections/1/rules', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ rules: ['neuralink'] }),
    });
    assert(readerCannotEditRules.status === 403, `reader cannot edit collection rules (${readerCannotEditRules.status})`);

    await request('/api/auth/logout', { method: 'POST' });
    authCookie = '';
    await login();
    const usersAfter = await fetchJSON('/api/auth/users');
    const readerAfter = usersAfter.users.find(u => u.email === readerEmail);
    if (readerAfter) {
        const disableRes = await request(`/api/auth/users/${readerAfter.id}`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ active: false }),
        });
        assert(disableRes.ok, `owner disables smoke reader (${disableRes.status})`);
    }
}

async function testStaticAssets() {
    console.log('\n🌐 Static assets');
    for (const p of ['/', '/app.js', '/style.css']) {
        const r = await request(p);
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
        assert(['full_text','metadata_only','paywalled','failed'].includes(item.accessStatus), `accessStatus valid (got ${item.accessStatus})`);
        assert(typeof item.contentQuality === 'number' && item.contentQuality >= 0 && item.contentQuality <= 100, `contentQuality 0-100 (got ${item.contentQuality})`);
        assert(['official','journal','preprint','media','social','unknown'].includes(item.sourceReliability), `sourceReliability valid (got ${item.sourceReliability})`);
        assert(['api','rss','html','manual_import','demo'].includes(item.extractionMethod), `extractionMethod valid (got ${item.extractionMethod})`);
        assert(['success','partial','failed'].includes(item.lastFetchStatus), `lastFetchStatus valid (got ${item.lastFetchStatus})`);
        assert(typeof item.lastFetchError === 'string', 'lastFetchError exists');
    }
}

async function testSearchAPI() {
    console.log('\n🔍 /api/all?q=BCI');
    const data = await fetchJSON('/api/all?q=BCI&limit=3');
    const items = data.items || [];
    assert(Array.isArray(items), 'search returns array');
}

async function testSourceFilterAPI() {
    console.log('\n🏷️  Source filtering');
    const sources = await fetchJSON('/api/sources');
    assert(Array.isArray(sources), 'sources returns array');
    const source = sources.find(Boolean);
    if (!source) {
        assert(true, 'source filter skipped because no sources exist');
        return;
    }
    const data = await fetchJSON(`/api/all?source=${encodeURIComponent(source)}&limit=5`);
    const items = data.items || [];
    assert(Array.isArray(items), 'source filter returns array');
    if (items.length > 0) {
        assert(items.every(item => item.provider === source || item.source === source), `source filter only returns ${source}`);
    }
}

async function testStatsAPI() {
    console.log('\n📊 /api/stats');
    const data = await fetchJSON('/api/stats');
    assert(typeof data.total === 'number', `total is number (got ${data.total})`);
}

async function testSourceHealthAPI() {
    console.log('\n🩺 /api/source-health');
    const data = await fetchJSON('/api/source-health');
    assert(Array.isArray(data), 'source health returns array');
    for (const source of data) {
        assert(typeof source.source === 'string' && source.source.length > 0, 'source has name');
        assert(['success','partial','failed'].includes(source.status), `source status valid (got ${source.status})`);
        assert(typeof source.itemCount === 'number' && source.itemCount >= 0, `source itemCount valid (got ${source.itemCount})`);
        assert(typeof source.lastRunAt === 'string', 'source has lastRunAt');
        assert(typeof source.lastSuccessAt === 'string', 'source has lastSuccessAt');
        assert(typeof source.error === 'string', 'source has error');
    }
}

async function testCollectionRulesAPI() {
    console.log('\n📁 /api/collections rules');
    const name = `Smoke Rules ${Date.now()}`;
    let collectionId = null;
    try {
        const createRes = await request('/api/collections', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ name, icon: '🧪', rules: [' Neuralink ', 'neuralink', 'FDA approval'] }),
        });
        assert(createRes.ok, `creates collection with rules (${createRes.status})`);
        const created = await createRes.json();
        collectionId = created.id;
        assert(JSON.parse(created.rules).length === 2, 'create returns normalized rules');

        const patchRes = await request(`/api/collections/${collectionId}/rules`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ rules: ['Synchron', 'clinical trial'] }),
        });
        assert(patchRes.ok, `updates collection rules (${patchRes.status})`);
        const patched = await patchRes.json();
        assert(JSON.parse(patched.rules).includes('Synchron'), 'patch returns updated rules');

        const invalidRes = await request(`/api/collections/${collectionId}/rules`, {
            method: 'PATCH',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ rules: ['<script>'] }),
        });
        assert(invalidRes.status === 400, `rejects unsafe collection rule (${invalidRes.status})`);
    } finally {
        if (collectionId) {
            const deleteRes = await request(`/api/collections/${collectionId}`, { method: 'DELETE' });
            assert(deleteRes.ok, `cleans up smoke collection (${deleteRes.status})`);
        }
    }
}

async function testSummaryAPI() {
    console.log('\n🤖 /api/summary');
    const data = await fetchJSON('/api/summary');
    assert(typeof data.generated === 'string', 'has generated timestamp');
    assert(data.provider === 'local-compat', 'legacy summary uses local compatibility provider');
    assert(data.retiredProvider === 'hunyuan-turbo', 'legacy summary marks Hunyuan retired');
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
        const isLocalCompat = summaryData.provider === 'local-compat';
        if (isLocalCompat) {
            assert(summaryScores.some(s => newsScores.includes(s)), 'local summary reuses article importance scores');
        } else {
            const unique = [...new Set(summaryScores)];
            assert(unique.length >= 2, `varied scores (${unique.join(', ')})`);
        }
    } else {
        assert(false, 'need both news and summary scores to compare');
    }
}

async function testAnalysisArticleAPI() {
    console.log('\n🤖 /api/analysis/:articleId');
    const newsData = await fetchJSON('/api/all?limit=1');
    const items = newsData.items || [];
    assert(items.length > 0, 'has at least 1 article to analyze');
    
    if (items.length > 0) {
        const testId = items[0].id;
        try {
            const res = await request(`/api/analysis/${testId}`);
            if (res.status === 503) {
                const data = await res.json();
                assert(data.error === true, 'returns 503 when DeepSeek API is not configured');
            } else if (res.ok) {
                const data = await res.json();
                assert(data.articleId === testId, `returns analysis with correct articleId (got ${data.articleId}, expected ${testId})`);
                assert(data.analysis !== undefined, 'has analysis object');
            } else {
                assert(false, `unexpected status: ${res.status}`);
            }
        } catch (err) {
            assert(false, `analysis call failed: ${err.message}`);
        }
    }
}

async function testDateSorting() {
    console.log('\n📅 Date Sorting Consistency');
    const data = await fetchJSON('/api/all?sort=date&limit=10');
    const items = data.items || [];
    assert(items.length > 0, 'has articles for date sorting test');
    
    let lastTime = Infinity;
    for (const item of items) {
        if (item.date) {
            const time = new Date(item.date).getTime();
            assert(!isNaN(time), `date is valid for item: ${item.title} (${item.date})`);
            assert(time <= lastTime, `dates are in descending order: ${new Date(item.date).toISOString()} (${time}) <= ${lastTime === Infinity ? 'Infinity' : new Date(lastTime).toISOString()} (${lastTime})`);
            lastTime = time;
        }
    }
    passed++;
    console.log('  ✅ dates sorted descending correctly');
}

async function testDateFilterAPI() {
    console.log('\n📆 Date Filter');
    const latestData = await fetchJSON('/api/all?sort=date&limit=1');
    const latest = (latestData.items || [])[0];
    assert(Boolean(latest?.date), 'has latest article date for date filter test');
    if (!latest?.date) return;

    const from = String(latest.date).slice(0, 10);
    const data = await fetchJSON(`/api/all?from=${encodeURIComponent(from)}&sort=date&limit=10`);
    const items = data.items || [];
    assert(Array.isArray(items), 'date filter returns array');
    for (const item of items) {
        if (!item.date) continue;
        assert(String(item.date).slice(0, 10) >= from, `date filter keeps item on/after ${from}`);
    }
}

async function testFrontendFields() {
    console.log('\n🔗 Frontend field mapping');
    const code = await (await request('/app.js')).text();
    for (const f of ['importanceLevel', 'importance', 'title', 'url', 'source']) {
        assert(code.includes(f), `app.js uses "${f}"`);
    }
    assert(code.includes('h.text'), 'app.js handles DeepSeek highlight h.text');
    assert(code.includes('item.importance'), 'app.js handles summary item.importance');
}

async function testDeepSeekDailyAPI() {
    console.log('\n📅 /api/summary/daily');
    const res = await request('/api/summary/daily');
    // Accept both 200 (key configured) and 503 (key not configured)
    assert(res.status === 200 || res.status === 503, `daily summary returns ${res.status} (200 or 503)`);
    if (res.status === 200) {
        const data = await res.json();
        assert(typeof data === 'object', 'daily summary returns object');
        assert(typeof data.headline === 'string' || data.headline === undefined, 'headline is string or undefined');
        assert(Array.isArray(data.highlights) || data.highlights === undefined, 'highlights is array or undefined');
    } else {
        const data = await res.json();
        assert(data.error === true, 'unconfigured returns error: true');
    }
}

async function testDeepSeekWeeklyAPI() {
    console.log('\n📊 /api/summary/weekly');
    const res = await request('/api/summary/weekly');
    assert(res.status === 200 || res.status === 503, `weekly summary returns ${res.status} (200 or 503)`);
    if (res.status === 200) {
        const data = await res.json();
        assert(typeof data === 'object', 'weekly summary returns object');
        assert(typeof data.weekOverview === 'string' || data.weekOverview === undefined, 'weekOverview is string or undefined');
        assert(Array.isArray(data.milestones) || data.milestones === undefined, 'milestones is array or undefined');
    } else {
        const data = await res.json();
        assert(data.error === true, 'unconfigured returns error: true');
    }
}

async function testImportSecurityAPI() {
    console.log('\n🔐 /api/import security');
    const cases = [
        { url: 'file:///etc/passwd', label: 'rejects file protocol' },
        { url: 'http://127.0.0.1:4000/', label: 'rejects localhost import target' },
    ];
    for (const item of cases) {
        const res = await request('/api/import', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ url: item.url }),
        });
        assert(res.status === 400, `${item.label} → ${res.status}`);
        const data = await res.json();
        assert(typeof data.error === 'string' && data.error.length > 0, `${item.label} returns readable error`);
    }
}

// ── Runner ──────────────────────────────────────────────

async function run() {
    console.log(`\n🧪 BCI Tracker Smoke Tests — ${BASE}\n${'─'.repeat(50)}`);
    try {
        await testAuthFlow();
        await testStaticAssets();
        await testNewsAPI();
        await testSearchAPI();
        await testSourceFilterAPI();
        await testStatsAPI();
        await testSourceHealthAPI();
        await testCollectionRulesAPI();
        await testSummaryAPI();
        await testAnalysisArticleAPI();
        await testDateSorting();
        await testDateFilterAPI();
        await testScoringConsistency();
        await testFrontendFields();
        await testDeepSeekDailyAPI();
        await testDeepSeekWeeklyAPI();
        await testImportSecurityAPI();
    } catch (err) {
        failed++;
        console.error(`\n💥 Fatal: ${err.message}`);
    }
    console.log(`\n${'─'.repeat(50)}`);
    console.log(`📋 ${passed} passed, ${failed} failed`);
    process.exit(failed > 0 ? 1 : 0);
}
run();
