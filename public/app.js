// ── State ─────────────────────────────────────────────
let allItems = [];
let activeCategory = 'all';
let activeSource = null;
let searchQuery = '';
let currentSort = 'importance'; // 'importance' or 'date'

// Auto-refresh every 2 hours (7200000 ms)
const REFRESH_INTERVAL = 2 * 60 * 60 * 1000;
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

// ── Fetch Data ────────────────────────────────────────
async function fetchAll() {
    loading.classList.remove('hidden');
    emptyState.style.display = 'none';
    cardGrid.innerHTML = '';
    refreshBtn.classList.add('spinning');

    try {
        const res = await fetch(`/api/all?sort=${currentSort}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        allItems = await res.json();
        updateStats();
        buildSourceTags();
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

// ── Auto-Refresh Countdown ────────────────────────────
function startCountdown() {
    if (countdownInterval) clearInterval(countdownInterval);
    countdownInterval = setInterval(() => {
        const remaining = nextRefreshTime - Date.now();
        if (remaining <= 0) {
            fetchAll();
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
function updateStats() {
    const journals = allItems.filter(i => i.category === 'journal').length;
    const preprints = allItems.filter(i => i.category === 'preprint').length;
    const news = allItems.filter(i => i.category === 'news').length;

    animateNumber(statTotal, allItems.length);
    animateNumber(statJournal, journals);
    animateNumber(statPreprint, preprints);
    animateNumber(statNews, news);

    const now = new Date();
    statUpdated.textContent = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

function animateNumber(el, target) {
    const duration = 600;
    const start = parseInt(el.textContent) || 0;
    const diff = target - start;
    const startTime = performance.now();

    function step(time) {
        const progress = Math.min((time - startTime) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        el.textContent = Math.round(start + diff * eased);
        if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
}

function pad(n) { return String(n).padStart(2, '0'); }

// ── Source Tags ───────────────────────────────────────
function buildSourceTags() {
    let itemsForTags = [...allItems];
    if (activeCategory !== 'all') {
        itemsForTags = itemsForTags.filter(i => i.category === activeCategory);
    }
    const sources = [...new Set(itemsForTags.map(i => i.provider))].filter(Boolean);

    // Clear activeSource if it's not available in the new category
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
            renderCards();
        });
    });
}

// ── Render ─────────────────────────────────────────────
function renderCards() {
    let items = [...allItems];

    // Category filter
    if (activeCategory !== 'all') {
        items = items.filter(i => i.category === activeCategory);
    }

    // Source filter
    if (activeSource) {
        items = items.filter(i => i.provider === activeSource);
    }

    // Search
    if (searchQuery) {
        const q = searchQuery.toLowerCase();
        items = items.filter(i =>
            (i.title && i.title.toLowerCase().includes(q)) ||
            (i.titleZh && i.titleZh.toLowerCase().includes(q)) ||
            (i.abstract && i.abstract.toLowerCase().includes(q)) ||
            (i.authors && i.authors.toLowerCase().includes(q)) ||
            (i.source && i.source.toLowerCase().includes(q))
        );
    }

    // Client-side sort (for filtered results)
    if (currentSort === 'importance') {
        items.sort((a, b) => (b.importance || 0) - (a.importance || 0));
    } else {
        items.sort((a, b) => {
            const da = new Date(a.date);
            const db = new Date(b.date);
            if (isNaN(da) && isNaN(db)) return 0;
            if (isNaN(da)) return 1;
            if (isNaN(db)) return -1;
            return db - da;
        });
    }

    if (items.length === 0) {
        cardGrid.innerHTML = '';
        emptyState.style.display = 'flex';
        return;
    }

    emptyState.style.display = 'none';
    cardGrid.innerHTML = items.map(item => createCard(item)).join('');
}

function createCard(item) {
    const badgeClass = {
        journal: 'badge-journal',
        preprint: 'badge-preprint',
        news: 'badge-news'
    }[item.category] || 'badge-journal';

    const badgeLabel = {
        journal: '期刊',
        preprint: '预印本',
        news: '新闻'
    }[item.category] || '其他';

    const dotClass = getDotClass(item.provider);
    const dateStr = formatDate(item.date);

    // Importance
    const impLevel = item.importanceLevel || 'low';
    const impScore = item.importance || 0;
    const impLabel = { critical: '🔴 关键', high: '🟡 重要', medium: '🔵 一般', low: '⚪ 参考' }[impLevel] || '参考';

    // Chinese translation
    const titleZhHtml = item.titleZh
        ? `<p class="card-title-zh">${escapeHtml(item.titleZh)}</p>`
        : '';

    return `
    <article class="card" onclick="window.open('${escapeHtml(item.url)}', '_blank')">
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
    </article>`;
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
        if (isNaN(d)) {
            return dateStr.slice(0, 20);
        }
        const now = new Date();
        const diff = now - d;
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (hours < 1) return '刚刚';
        if (hours < 24) return `${hours} 小时前`;
        if (days < 7) return `${days} 天前`;
        if (days < 60) return `${Math.floor(days / 7)} 周前`;

        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    } catch {
        return dateStr.slice(0, 20);
    }
}

function truncateAuthors(str) {
    if (!str) return '';
    const parts = str.split(',');
    if (parts.length <= 2) return str;
    return parts.slice(0, 2).join(',') + ` 等 ${parts.length} 人`;
}

function escapeHtml(str) {
    if (!str) return '';
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// ── Events ────────────────────────────────────────────
// Filter tabs
document.querySelectorAll('.filter-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.filter-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        activeCategory = tab.dataset.filter;
        buildSourceTags(); // Rebuild tags for the new category
        renderCards();
    });
});

// Sort tabs
document.querySelectorAll('.sort-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.sort-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        currentSort = tab.dataset.sort;
        renderCards();
    });
});

// Search
let searchTimeout;
searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
        searchQuery = e.target.value.trim();
        renderCards();
    }, 250);
});

// Refresh
refreshBtn.addEventListener('click', fetchAll);

// ── Init ──────────────────────────────────────────────
fetchAll();
