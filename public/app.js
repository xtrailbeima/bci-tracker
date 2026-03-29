// ── State ─────────────────────────────────────────────
let allItems = [];
let activeCategory = 'all';
let activeSource = null;
let searchQuery = '';
let currentSort = 'importance'; // 'importance' or 'date'
let currentPage = 1;
let hasMore = false;
let totalItems = 0;
let activeTimeRange = 'all'; // 'all', 'week', 'month', 'quarter', 'year'

// Auto-refresh every 30 minutes (1800000 ms)
const REFRESH_INTERVAL = 45 * 60 * 1000; // 45 min — keeps daily Gemini API calls under 50
let nextRefreshTime = Date.now() + REFRESH_INTERVAL;
let countdownInterval = null;

// ── DOM ───────────────────────────────────────────────
const cardGrid = document.getElementById('cardGrid');
const loading = document.getElementById('loading');
const emptyState = document.getElementById('emptyState');
const searchInput = document.getElementById('searchInput');
const refreshBtn = document.getElementById('refreshBtn');
const sourceFilters = document.getElementById('sourceFilters');
const statTotal = document.getElementById('statTotal');
const statJournal = document.getElementById('statJournal');
const statPreprint = document.getElementById('statPreprint');
const statNews = document.getElementById('statNews');
const statUpdated = document.getElementById('statUpdated');
const refreshCountdown = document.getElementById('refreshCountdown');
const trendingPanel = document.getElementById('trendingPanel');
const trendingTags = document.getElementById('trendingTags');
const summaryContent = document.getElementById('summaryContent');
const summaryTime = document.getElementById('summaryTime');
const summaryRefreshBtn = document.getElementById('summaryRefreshBtn');

// ── Time Range Helpers ────────────────────────────────
function getDateRange(range) {
    const now = new Date();
    switch (range) {
        case 'week': return new Date(now - 7 * 86400000).toISOString();
        case 'month': return new Date(now - 30 * 86400000).toISOString();
        case 'quarter': return new Date(now - 90 * 86400000).toISOString();
        case 'year': return new Date(now - 365 * 86400000).toISOString();
        default: return undefined;
    }
}

// ── AI Summary ────────────────────────────────────────
async function fetchSummary(force = false) {
    if (!summaryContent) return;

    summaryContent.innerHTML = `
        <div class="summary-loading">
            <div class="spinner-sm"></div>
            <span>正在分析行业动态...</span>
        </div>`;

    try {
        const url = force ? '/api/summary?force=1' : '/api/summary';
        const res = await fetch(url);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (summaryTime && data.generated) {
            const t = new Date(data.generated);
            summaryTime.textContent = `${pad(t.getHours())}:${pad(t.getMinutes())} 生成`;
        }

        if (!data.sections || data.sections.length === 0) {
            summaryContent.innerHTML = '<p class="summary-empty">暂无分析数据</p>';
            return;
        }

        summaryContent.innerHTML = data.sections.map(section => `
            <div class="summary-section">
                <h4 class="summary-section-title">${escapeHtml(section.icon || '')} ${escapeHtml(section.title)}</h4>
                <ul class="summary-list">
                    ${section.items.map(item => {
            if (typeof item === 'string') return `<li>${escapeHtml(item)}</li>`;
            const text = item.text || '';
            const url = item.url || '';
            const imp = item.importance || '';
            const linkHtml = url ? `<a class="summary-link" href="${escapeHtml(url)}" target="_blank" title="查看信源">🔗</a>` : '';
            const score = typeof item.importance === 'number' ? item.importance : 0;
            const level = score >= 80 ? 'critical' : score >= 60 ? 'high' : score >= 40 ? 'medium' : 'low';
            const levelLabel = { critical: '🔴 关键', high: '🟡 重要', medium: '🔵 一般', low: '⚪ 参考' }[level];
            const badgeHtml = score ? `<span class="card-importance importance-${level}">${levelLabel} ${score}</span>` : '';
            return `<li>${escapeHtml(text)} ${linkHtml} ${badgeHtml}</li>`;
        }).join('')}
                </ul>
            </div>
        `).join('');

        // Add fade-in animation (respect reduced motion)
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (!prefersReducedMotion) {
            summaryContent.querySelectorAll('.summary-section').forEach((el, i) => {
                el.style.animationDelay = `${i * 0.1}s`;
            });
        }
    } catch (err) {
        console.error('Summary error:', err);
        summaryContent.innerHTML = `
            <div class="summary-error">
                <p>⚠️ AI 分析加载失败</p>
                <p class="summary-error-detail">${escapeHtml(err.message)}</p>
            </div>`;
    }
}

// Summary refresh button
if (summaryRefreshBtn) {
    summaryRefreshBtn.addEventListener('click', () => fetchSummary(true));
}

// ── Fetch Data ────────────────────────────────────────
async function fetchAll(append = false) {
    if (!append) {
        loading.classList.remove('hidden');
        emptyState.style.display = 'none';
        cardGrid.innerHTML = '';
        currentPage = 1;
        allItems = [];
    }
    refreshBtn.classList.add('spinning');

    try {
        const params = new URLSearchParams({
            sort: currentSort,
            page: currentPage,
            limit: 50,
        });
        if (activeCategory && activeCategory !== 'all') {
            params.set('category', activeCategory);
        }
        if (activeSource) {
            params.set('source', activeSource);
        }
        if (searchQuery) {
            params.set('q', searchQuery);
        }
        const dateFrom = getDateRange(activeTimeRange);
        if (dateFrom) {
            params.set('from', dateFrom);
        }

        const res = await fetch(`/api/all?${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        if (Array.isArray(data)) {
            allItems = data;
            totalItems = data.length;
            hasMore = false;
        } else {
            if (append) {
                allItems = [...allItems, ...data.items];
            } else {
                allItems = data.items;
            }
            totalItems = data.total;
            hasMore = data.hasMore;
        }

        await updateStats();
        await buildSourceTags();
        await fetchTrending();
        renderCards();

        // Reset auto-refresh timer
        nextRefreshTime = Date.now() + REFRESH_INTERVAL;
        startCountdown();
    } catch (err) {
        console.error('Fetch error:', err);
        cardGrid.innerHTML = `
      <div class="empty-state" style="grid-column: 1/-1;">
        <p style="color: var(--accent-rose);">数据加载失败：${err.message}</p>
        <p style="color: var(--text-muted); font-size: 13px;">请检查服务器是否正常运行，稍后重试</p>
      </div>`;
    } finally {
        loading.classList.add('hidden');
        refreshBtn.classList.remove('spinning');
    }
}

// ── Trending Keywords ─────────────────────────────────
async function fetchTrending() {
    try {
        const period = activeTimeRange !== 'all' ? activeTimeRange : '';
        const url = period ? `/api/trending?period=${period}` : '/api/trending';
        const res = await fetch(url);
        const keywords = res.ok ? await res.json() : [];

        if (keywords.length > 0) {
            trendingPanel.style.display = 'block';
            trendingTags.innerHTML = keywords.map(k =>
                `<button class="trending-tag" data-kw="${k.keyword}">${k.keyword}<span class="tag-count">${k.count}</span></button>`
            ).join('');

            // Click trending keyword to search
            trendingTags.querySelectorAll('.trending-tag').forEach(tag => {
                tag.addEventListener('click', () => {
                    searchInput.value = tag.dataset.kw;
                    searchQuery = tag.dataset.kw;
                    fetchAll();
                });
            });
        } else {
            trendingPanel.style.display = 'none';
        }
    } catch (e) {
        trendingPanel.style.display = 'none';
    }
}

// ── Auto-Refresh Countdown ────────────────────────────
function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        const remaining = nextRefreshTime - Date.now();
        if (remaining <= 0) {
            fetchAll();
            fetchSummary();
            return;
        }
        const h = Math.floor(remaining / 3600000);
        const m = Math.floor((remaining % 3600000) / 60000);
        const s = Math.floor((remaining % 60000) / 1000);
        if (refreshCountdown) {
            refreshCountdown.textContent = `下次刷新：${h}:${pad(m)}:${pad(s)}`;
        }
    }, 1000);
}

// ── Stats ─────────────────────────────────────────────
async function updateStats() {
    try {
        const res = await fetch('/api/stats');
        if (res.ok) {
            const stats = await res.json();
            animateNumber(statTotal, stats.total);
            animateNumber(statJournal, stats.journals);
            animateNumber(statPreprint, stats.preprints);
            animateNumber(statNews, stats.news);
        }
    } catch (e) {
        animateNumber(statTotal, allItems.length);
    }
    const now = new Date();
    statUpdated.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function animateNumber(el, target) {
    if (typeof target !== 'number' || isNaN(target)) { el.textContent = '—'; return; }
    target = Math.max(0, Math.round(target));
    const duration = 600;
    const start = Math.max(0, parseInt(el.textContent.replace(/[^0-9]/g, '')) || 0);
    if (start === target) { el.textContent = target; return; }
    const diff = target - start;
    const startTime = performance.now();
    function step(time) {
        const progress = Math.min((time - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.max(0, Math.round(start + diff * eased));
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── Source Tags ───────────────────────────────────────
async function buildSourceTags() {
    try {
        const params = activeCategory !== 'all' ? `?category=${activeCategory}` : '';
        const res = await fetch(`/api/sources${params}`);
        const sources = res.ok ? await res.json() : [];

        if (activeSource && !sources.includes(activeSource)) {
            activeSource = null;
        }

        sourceFilters.innerHTML = sources.map(s => {
            const isActive = s === activeSource ? 'active' : '';
            return `<button class="source-tag ${isActive}" data-source="${s}">${s}</button>`;
        }).join('');

        sourceFilters.querySelectorAll('.source-tag').forEach(btn => {
            btn.addEventListener('click', () => {
                if (activeSource === btn.dataset.source) {
                    activeSource = null;
                    btn.classList.remove('active');
                } else {
                    sourceFilters.querySelectorAll('.source-tag').forEach(b => b.classList.remove('active'));
                    activeSource = btn.dataset.source;
                    btn.classList.add('active');
                }
                fetchAll();
            });
        });
    } catch (e) {
        console.error('Source tags error:', e);
    }
}

// ── Render ─────────────────────────────────────────────
function renderCards() {
    if (allItems.length === 0) {
        cardGrid.innerHTML = '';
        emptyState.style.display = 'flex';
        removeLoadMore();
        return;
    }
    emptyState.style.display = 'none';
    cardGrid.innerHTML = allItems.map(item => createCard(item)).join('');
    if (hasMore) { addLoadMore(); } else { removeLoadMore(); }
}

function addLoadMore() {
    removeLoadMore();
    const btn = document.createElement('button');
    btn.id = 'loadMoreBtn';
    btn.className = 'load-more-btn';
    btn.textContent = `加载更多 (已显示 ${allItems.length} / ${totalItems})`;
    btn.addEventListener('click', () => { currentPage++; fetchAll(true); });
    cardGrid.parentElement.appendChild(btn);
}

function removeLoadMore() {
    const existing = document.getElementById('loadMoreBtn');
    if (existing) existing.remove();
}

function createCard(item) {
    const badgeClass = { journal: 'badge-journal', preprint: 'badge-preprint', news: 'badge-news' }[item.category] || 'badge-journal';
    const badgeLabel = { journal: '期刊', preprint: '预印本', news: '新闻' }[item.category] || '其他';
    const dotClass = getDotClass(item.provider);
    const dateStr = formatDate(item.date);
    const impLevel = item.importanceLevel || 'low';
    const impScore = item.importance || 0;
    const impLabel = { critical: '🔴 关键', high: '🟡 重要', medium: '🔵 一般', low: '⚪ 参考' }[impLevel] || '参考';
    const titleZhHtml = item.titleZh ? `<p class="card-title-zh">${escapeHtml(item.titleZh)}</p>` : '';

    return `
    <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="card">
      <div class="card-header">
        <div class="card-header-left">
          <h3 class="card-title">${escapeHtml(item.title)}</h3>
          ${titleZhHtml}
        </div>
        <div class="card-badges">
          <span class="card-importance importance-${impLevel}" title="重要性评分: ${impScore}">${impLabel} ${impScore}</span>
          <span class="card-badge ${badgeClass}">${badgeLabel}</span>
        </div>
      </div>
      ${item.abstract ? `<p class="card-abstract">${escapeHtml(item.abstract)}</p>` : ''}
      <div class="card-meta">
        ${item.authors ? `<span class="card-meta-item">${escapeHtml(truncateAuthors(item.authors))}</span>` : ''}
        ${item.authors && dateStr ? '<span class="card-meta-dot"></span>' : ''}
        ${dateStr ? `<span class="card-meta-item">${dateStr}</span>` : ''}
      </div>
      <div class="card-source">
        <span class="card-source-dot ${dotClass}"></span>
        ${escapeHtml(item.source || item.provider || '')}
      </div>
    </a>`;
}

function getDotClass(provider) {
    if (!provider) return 'dot-default';
    const p = provider.toLowerCase();
    if (p.includes('pubmed')) return 'dot-pubmed';
    if (p.includes('arxiv')) return 'dot-arxiv';
    if (p.includes('nature')) return 'dot-nature';
    if (p.includes('science') || p.includes('neuron')) return 'dot-science';
    if (p.includes('news')) return 'dot-news';
    return 'dot-default';
}

function formatDate(dateStr) {
    if (!dateStr) return '';
    try {
        const d = new Date(dateStr);
        if (isNaN(d)) return dateStr.slice(0, 20);
        const now = new Date();
        const diff = now - d;
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (hours < 1) return '刚刚';
        if (hours < 24) return `${hours} 小时前`;
        if (days < 7) return `${days} 天前`;
        if (days < 60) return `${Math.floor(days / 7)} 周前`;
        return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch { return dateStr.slice(0, 20); }
}

function truncateAuthors(str) {
    if (!str) return '';
    const parts = str.split(',');
    if (parts.length <= 2) return str;
    return parts.slice(0, 2).join(',') + ` 等 ${parts.length} 人`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;');
}

// ── Events ────────────────────────────────────────────

// Filter tabs (category)
document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeCategory = tab.dataset.filter;
        fetchAll();
    });
});

// Time range tabs
document.querySelectorAll('.time-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.time-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeTimeRange = tab.dataset.range;
        fetchAll();
    });
});

// Sort tabs
document.querySelectorAll('.sort-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentSort = tab.dataset.sort;
        fetchAll();
    });
});

// Search
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchQuery = e.target.value.trim();
        fetchAll();
    }, 400);
});

// Refresh
refreshBtn.addEventListener('click', () => {
    fetchAll();
    fetchSummary(true);
});

// Subscribe form
const subscribeForm = document.getElementById('subscribeForm');
const subscribeMsg = document.getElementById('subscribeMsg');

if (subscribeForm) {
    subscribeForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = document.getElementById('subEmail').value.trim();
        const name = document.getElementById('subName').value.trim();
        if (!email) return;

        subscribeMsg.className = 'subscribe-msg';
        subscribeMsg.textContent = '正在提交...';

        try {
            const res = await fetch('/api/subscribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, name })
            });
            const data = await res.json();
            if (data.success) {
                subscribeMsg.className = 'subscribe-msg success';
                subscribeMsg.textContent = '✅ 订阅成功！每日简报将发送到 ' + email;
                subscribeForm.reset();
            } else {
                subscribeMsg.className = 'subscribe-msg error';
                subscribeMsg.textContent = '❌ ' + (data.error || '订阅失败');
            }
        } catch (err) {
            subscribeMsg.className = 'subscribe-msg error';
            subscribeMsg.textContent = '❌ 网络错误，请稍后重试';
        }
    });
}

// ── Collections ──────────────────────────────────────

let collectionsCache = [];

async function fetchCollections() {
    try {
        const res = await fetch('/api/collections');
        collectionsCache = await res.json();
        renderCollectionsGrid();
    } catch (err) {
        console.error('Failed to fetch collections:', err);
    }
}

function renderCollectionsGrid() {
    const grid = document.getElementById('collectionsGrid');
    const detail = document.getElementById('collectionDetail');
    if (!grid) return;
    grid.style.display = 'grid';
    detail.style.display = 'none';

    grid.innerHTML = collectionsCache.map(c => `
        <button class="collection-card" type="button" onclick="openCollection(${c.id}, '${escapeHtml(c.icon)} ${escapeHtml(c.name)}')">
            <div class="collection-icon">${escapeHtml(c.icon)}</div>
            <div class="collection-info">
                <span class="collection-name">${escapeHtml(c.name)}</span>
                <span class="collection-count">${c.itemCount} 条内容</span>
            </div>
            ${c.isPreset ? '<span class="collection-preset">预设</span>' : `<span class="collection-delete" onclick="event.stopPropagation(); deleteCollectionById(${c.id})" role="button" tabindex="0" title="删除" aria-label="删除专题 ${escapeHtml(c.name)}">✕</span>`}
        </button>
    `).join('');
}

async function openCollection(id, title) {
    const grid = document.getElementById('collectionsGrid');
    const detail = document.getElementById('collectionDetail');
    grid.style.display = 'none';
    detail.style.display = 'block';
    document.getElementById('collectionDetailTitle').textContent = title;

    try {
        const res = await fetch(`/api/collections/${id}`);
        const data = await res.json();
        document.getElementById('collectionDetailCount').textContent = `${data.total} 条`;
        const container = document.getElementById('collectionDetailItems');
        if (data.items.length === 0) {
            container.innerHTML = '<div class="empty-collection">暂无内容，系统会自动归集匹配的文章</div>';
            return;
        }
        container.innerHTML = data.items.map(item => {
            const impLevel = item.importanceLevel || 'low';
            const impScore = item.importance || 0;
            const impLabel = { critical: '🔴 严重', high: '🟠 重要', medium: '🟡 一般', low: '⚪ 普通' }[impLevel] || '⚪';
            return `
                <a href="${escapeHtml(item.url)}" target="_blank" class="collection-item">
                    <div class="collection-item-main">
                        <span class="collection-item-title">${escapeHtml(item.title)}</span>
                        ${item.titleZh ? `<span class="collection-item-zh">${escapeHtml(item.titleZh)}</span>` : ''}
                    </div>
                    <div class="collection-item-meta">
                        <span class="collection-item-source">${escapeHtml(item.source || item.provider || '')}</span>
                        <span class="collection-item-date">${item.date || ''}</span>
                        <span class="card-importance importance-${impLevel}">${impLabel} ${impScore}</span>
                    </div>
                </a>
            `;
        }).join('');
    } catch (err) {
        document.getElementById('collectionDetailItems').innerHTML = '<div class="empty-collection">加载失败</div>';
    }
}

async function deleteCollectionById(id) {
    if (!confirm('确定删除这个专题？')) return;
    await fetch(`/api/collections/${id}`, { method: 'DELETE' });
    fetchCollections();
}

async function showBookmarkDialog(articleId) {
    if (collectionsCache.length === 0) await fetchCollections();
    const names = collectionsCache.map((c, i) => `${i + 1}. ${c.icon} ${c.name}`).join('\n');
    const choice = prompt(`选择专题（输入编号）:\n${names}`);
    if (!choice) return;
    const idx = parseInt(choice) - 1;
    if (idx < 0 || idx >= collectionsCache.length) return alert('无效编号');
    try {
        await fetch(`/api/collections/${collectionsCache[idx].id}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ articleId })
        });
        alert(`已添加到「${collectionsCache[idx].name}」`);
    } catch (err) {
        alert('添加失败');
    }
}

// Main tab switching
document.getElementById('mainTabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.main-tab');
    if (!tab) return;
    document.querySelectorAll('.main-tab').forEach(t => t.classList.remove('active'));
    tab.classList.add('active');
    const view = tab.dataset.view;
    document.getElementById('feedView').style.display = view === 'feed' ? '' : 'none';
    document.getElementById('collectionsView').style.display = view === 'collections' ? '' : 'none';
    if (view === 'collections') fetchCollections();
});

// Back button
document.getElementById('btnBackToCollections')?.addEventListener('click', () => {
    renderCollectionsGrid();
});

// Create collection button
document.getElementById('btnCreateCollection')?.addEventListener('click', async () => {
    const name = prompt('专题名称：');
    if (!name) return;
    const icon = prompt('选择图标（默认 📁）：') || '📁';
    try {
        await fetch('/api/collections', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, icon })
        });
        fetchCollections();
    } catch (err) {
        alert('创建失败: ' + err.message);
    }
});

// ── Init ──────────────────────────────────────────────
fetchAll();
// Load AI summary after a short delay (let data fetch first)
setTimeout(() => fetchSummary(), 5000);
