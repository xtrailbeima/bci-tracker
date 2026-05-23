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

// Auto-refresh every 45 minutes
const REFRESH_INTERVAL = 45 * 60 * 1000;
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


// ── Fetch Data ────────────────────────────────────────
async function fetchAll(append = false) {
    if (!append) {
        showSkeletons();
        emptyState.style.display = 'none';
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

    // Performance: batch DOM with DocumentFragment
    const frag = document.createDocumentFragment();
    allItems.forEach(item => {
        const wrapper = document.createElement('div');
        wrapper.innerHTML = createCard(item);
        const card = wrapper.firstElementChild;
        frag.appendChild(card);
    });
    cardGrid.innerHTML = '';
    cardGrid.appendChild(frag);

    // Card mouse-tracking glow effect (delight)
    cardGrid.querySelectorAll('.card').forEach(card => {
        card.addEventListener('mousemove', e => {
            const rect = card.getBoundingClientRect();
            card.style.setProperty('--mouse-x', `${e.clientX - rect.left}px`);
            card.style.setProperty('--mouse-y', `${e.clientY - rect.top}px`);
        });
    });

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
    <div class="card" data-id="${item.id}">
      <div class="card-header">
        <div class="card-header-left">
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="card-title-link">
            <h3 class="card-title">${escapeHtml(item.title)}</h3>
            ${titleZhHtml}
          </a>
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
      <div class="card-bottom">
        <div class="card-source">
          <span class="card-source-dot ${dotClass}"></span>
          ${escapeHtml(item.source || item.provider || '')}
        </div>
        <div class="card-actions">
          <a href="${escapeHtml(item.url)}" target="_blank" rel="noopener noreferrer" class="card-action-btn btn-original" title="查看原文">
            <span class="btn-icon">🌐</span>
            <span class="btn-text">原文</span>
          </a>
          <button class="card-action-btn btn-ai" onclick="analyzeArticleById(${item.id})" title="AI 深度分析">
            <span class="btn-icon">🤖</span>
            <span class="btn-text">AI分析</span>
          </button>
          <button class="card-action-btn btn-bookmark" onclick="showBookmarkDialog(${item.id})" title="归集到专题">
            <span class="btn-icon">📁</span>
            <span class="btn-text">归集</span>
          </button>
        </div>
      </div>
    </div>`;
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
        
        // Handle future dates (e.g. database has 2026/2027 and client is in 2024/2025/etc.),
        // or small timezone/clock differences (less than 1 hour).
        if (diff < 0) {
            if (Math.abs(diff) < 3600000) {
                return '刚刚';
            }
            return new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
        }
        
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

function showCustomAlert(title, message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.innerHTML = `
            <div class="custom-modal" style="max-width: 380px;">
                <div class="custom-modal-header">
                    <h3 class="custom-modal-title">${escapeHtml(title)}</h3>
                    <button class="custom-modal-close" id="closeAlertModal" aria-label="关闭">✕</button>
                </div>
                <div class="custom-modal-body" style="font-size: 14px; color: var(--text-secondary); line-height: 1.5; margin: 8px 0;">
                    ${escapeHtml(message)}
                </div>
                <div class="custom-modal-footer">
                    <button type="button" class="custom-modal-btn" id="btnAlertOk" style="background: var(--gradient-main); border: none; color: #06080f; font-weight: 700;">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        const close = () => {
            overlay.remove();
            resolve();
        };
        
        overlay.querySelector('#closeAlertModal').addEventListener('click', close);
        overlay.querySelector('#btnAlertOk').addEventListener('click', close);
        overlay.addEventListener('click', e => { if (e.target === overlay) close(); });
        
        setTimeout(() => {
            const btn = overlay.querySelector('#btnAlertOk');
            if (btn) btn.focus();
        }, 50);
    });
}

function showCustomConfirm(title, message) {
    return new Promise(resolve => {
        const overlay = document.createElement('div');
        overlay.className = 'custom-modal-overlay';
        overlay.innerHTML = `
            <div class="custom-modal" style="max-width: 380px;">
                <div class="custom-modal-header">
                    <h3 class="custom-modal-title">${escapeHtml(title)}</h3>
                    <button class="custom-modal-close" id="closeConfirmModal" aria-label="关闭">✕</button>
                </div>
                <div class="custom-modal-body" style="font-size: 14px; color: var(--text-secondary); line-height: 1.5; margin: 8px 0;">
                    ${escapeHtml(message)}
                </div>
                <div class="custom-modal-footer">
                    <button type="button" class="custom-modal-btn custom-modal-btn--secondary" id="btnConfirmCancel">取消</button>
                    <button type="button" class="custom-modal-btn" id="btnConfirmOk" style="background: var(--accent-rose); border: none; color: #fff; font-weight: 700;">确定</button>
                </div>
            </div>
        `;
        document.body.appendChild(overlay);
        
        const close = (result) => {
            overlay.remove();
            resolve(result);
        };
        
        overlay.querySelector('#closeConfirmModal').addEventListener('click', () => close(false));
        overlay.querySelector('#btnConfirmCancel').addEventListener('click', () => close(false));
        overlay.querySelector('#btnConfirmOk').addEventListener('click', () => close(true));
        overlay.addEventListener('click', e => { if (e.target === overlay) close(false); });
        
        setTimeout(() => {
            const btn = overlay.querySelector('#btnConfirmCancel');
            if (btn) btn.focus();
        }, 50);
    });
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
    const confirmed = await showCustomConfirm('确定删除专题？', '该操作无法撤销，这将会清空并删除该专题下的所有归集数据。');
    if (!confirmed) return;
    await fetch(`/api/collections/${id}`, { method: 'DELETE' });
    fetchCollections();
}

async function showBookmarkDialog(articleId) {
    if (collectionsCache.length === 0) await fetchCollections();

    // Create the overlay container
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    
    // Build the grid list items
    const itemsHtml = collectionsCache.map(c => `
        <button class="custom-modal-item" type="button" data-id="${c.id}" data-name="${escapeHtml(c.name)}">
            <span class="custom-modal-item-icon">${escapeHtml(c.icon)}</span>
            <div class="custom-modal-item-info">
                <span class="custom-modal-item-name">${escapeHtml(c.name)}</span>
                <span class="custom-modal-item-count">${c.itemCount} 条已归集</span>
            </div>
        </button>
    `).join('');

    overlay.innerHTML = `
        <div class="custom-modal">
            <div class="custom-modal-header">
                <h3 class="custom-modal-title">📁 归集到专题</h3>
                <button class="custom-modal-close" id="closeCustomModal" aria-label="关闭">✕</button>
            </div>
            <div class="custom-modal-subtitle">选择要归集此文章的特定行业专题</div>
            <div class="custom-modal-grid">
                ${itemsHtml}
            </div>
            <div class="custom-modal-footer">
                <button type="button" class="custom-modal-btn custom-modal-btn--secondary" id="cancelCustomModal">取消</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => {
        overlay.remove();
    };

    // Close handlers
    overlay.querySelector('#closeCustomModal').addEventListener('click', closeModal);
    overlay.querySelector('#cancelCustomModal').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // Item click handlers
    overlay.querySelectorAll('.custom-modal-item').forEach(itemBtn => {
        itemBtn.addEventListener('click', async () => {
            const collectionId = parseInt(itemBtn.dataset.id);
            const countEl = itemBtn.querySelector('.custom-modal-item-count');
            const originalCountText = countEl.textContent;
            
            itemBtn.style.opacity = '0.7';
            itemBtn.style.pointerEvents = 'none';
            countEl.textContent = '正在添加...';

            try {
                const res = await fetch(`/api/collections/${collectionId}/add`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ articleId })
                });
                
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                
                countEl.textContent = '✅ 已成功归集';
                countEl.style.color = 'var(--accent-green)';
                itemBtn.style.borderColor = 'var(--accent-green)';
                
                await fetchCollections();
                setTimeout(closeModal, 600);
            } catch (err) {
                console.error('Bookmark error:', err);
                countEl.textContent = '❌ 添加失败';
                countEl.style.color = 'var(--accent-rose)';
                itemBtn.style.borderColor = 'var(--accent-rose)';
                itemBtn.style.pointerEvents = 'auto';
                itemBtn.style.opacity = '1';
                setTimeout(() => {
                    countEl.textContent = originalCountText;
                    countEl.style.color = '';
                    itemBtn.style.borderColor = '';
                }, 2000);
            }
        });
    });
}

// Main tab switching
document.getElementById('mainTabs')?.addEventListener('click', e => {
    const tab = e.target.closest('.main-tab');
    if (!tab) return;
    document.querySelectorAll('.main-tab').forEach(t => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
    });
    tab.classList.add('active');
    tab.setAttribute('aria-selected', 'true');
    const view = tab.dataset.view;
    document.getElementById('feedView').style.display = view === 'feed' ? '' : 'none';
    document.getElementById('analysisView').style.display = view === 'analysis' ? '' : 'none';
    document.getElementById('collectionsView').style.display = view === 'collections' ? '' : 'none';
    if (view === 'collections') fetchCollections();
    if (view === 'analysis') fetchAnalysis();
});

// Back button
document.getElementById('btnBackToCollections')?.addEventListener('click', () => {
    renderCollectionsGrid();
});

// Create collection button with custom elegant modal
document.getElementById('btnCreateCollection')?.addEventListener('click', () => {
    const overlay = document.createElement('div');
    overlay.className = 'custom-modal-overlay';
    
    overlay.innerHTML = `
        <div class="custom-modal">
            <div class="custom-modal-header">
                <h3 class="custom-modal-title">✨ 新建专题</h3>
                <button class="custom-modal-close" id="closeCreateModal" aria-label="关闭">✕</button>
            </div>
            <div class="custom-modal-subtitle">创建一个全新的自定义行业追踪专题</div>
            
            <div style="display:flex; flex-direction:column; gap:14px; margin: 8px 0;">
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <label style="font-size:12px; font-weight:600; color:var(--text-secondary);">专题名称</label>
                    <input type="text" id="newCollectionName" placeholder="例如：Synchron 进展、融资事件..." 
                        style="background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px; color:var(--text-primary); font-size:14px; outline:none; transition:all 0.2s;" />
                </div>
                <div style="display:flex; flex-direction:column; gap:6px;">
                    <label style="font-size:12px; font-weight:600; color:var(--text-secondary);">选择图标</label>
                    <input type="text" id="newCollectionIcon" placeholder="例如：📁, 🔬, 💰..." value="📁"
                        style="background:rgba(255,255,255,0.03); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px; color:var(--text-primary); font-size:14px; outline:none; transition:all 0.2s;" />
                </div>
            </div>
            
            <div class="custom-modal-footer">
                <button type="button" class="custom-modal-btn custom-modal-btn--secondary" id="cancelCreateModal">取消</button>
                <button type="button" class="custom-modal-btn" id="confirmCreateModal" 
                    style="background:var(--gradient-main); border:none; color:#06080f; font-weight:700;">创建</button>
            </div>
        </div>
    `;

    document.body.appendChild(overlay);

    const closeModal = () => overlay.remove();
    overlay.querySelector('#closeCreateModal').addEventListener('click', closeModal);
    overlay.querySelector('#cancelCreateModal').addEventListener('click', closeModal);
    overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });

    // Focus first input automatically
    setTimeout(() => overlay.querySelector('#newCollectionName').focus(), 50);

    const nameInput = overlay.querySelector('#newCollectionName');
    const iconInput = overlay.querySelector('#newCollectionIcon');
    const confirmBtn = overlay.querySelector('#confirmCreateModal');

    // Handle focus visual effects
    [nameInput, iconInput].forEach(inp => {
        inp.addEventListener('focus', () => { inp.style.borderColor = 'rgba(0, 240, 255, 0.4)'; inp.style.boxShadow = '0 0 8px rgba(0, 240, 255, 0.1)'; });
        inp.addEventListener('blur', () => { inp.style.borderColor = ''; inp.style.boxShadow = ''; });
    });

    confirmBtn.addEventListener('click', async () => {
        const name = nameInput.value.trim();
        const icon = iconInput.value.trim() || '📁';
        
        if (!name) {
            nameInput.style.borderColor = 'var(--accent-rose)';
            nameInput.focus();
            return;
        }

        confirmBtn.disabled = true;
        confirmBtn.textContent = '创建中...';

        try {
            const res = await fetch('/api/collections', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, icon })
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            
            fetchCollections();
            closeModal();
        } catch (err) {
            await showCustomAlert('创建失败', err.message);
            confirmBtn.disabled = false;
            confirmBtn.textContent = '创建';
        }
    });
});

// ── Skeleton Loading (animate skill) ──────────────────
function showSkeletons() {
    const count = 6;
    cardGrid.innerHTML = Array.from({ length: count }, (_, i) => `
        <div class="card skeleton-card" style="animation-delay: ${i * 0.05}s">
            <div class="skeleton" style="height: 20px; width: 75%; margin-bottom: 8px;"></div>
            <div class="skeleton" style="height: 14px; width: 90%; margin-bottom: 12px;"></div>
            <div class="skeleton" style="height: 48px; width: 100%; margin-bottom: 12px;"></div>
            <div style="display: flex; gap: 8px;">
                <div class="skeleton" style="height: 12px; width: 80px;"></div>
                <div class="skeleton" style="height: 12px; width: 60px;"></div>
            </div>
        </div>
    `).join('');
    loading.classList.add('hidden');
}

// ── Gemini AI Analysis ───────────────────────────────

let analysisCache = null;

async function fetchAnalysis(force = false) {
    const content = document.getElementById('analysisContent');
    const loading = document.getElementById('analysisLoading');
    const btn = document.getElementById('btnGenerateAnalysis');
    const timestamp = document.getElementById('analysisTimestamp');

    // Show cached if available and not forcing
    if (!force && analysisCache) {
        renderAnalysis(analysisCache);
        return;
    }

    // Show loading
    loading.style.display = 'flex';
    content.innerHTML = '';
    btn.classList.add('loading');

    try {
        const params = force ? '?force=1' : '';
        const res = await fetch(`/api/analysis${params}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();

        analysisCache = data;
        renderAnalysis(data);

        if (data.generated) {
            const d = new Date(data.generated);
            timestamp.textContent = `生成于 ${pad(d.getHours())}:${pad(d.getMinutes())}` +
                (data.model ? ` · ${data.model}` : '');
        }
    } catch (err) {
        content.innerHTML = `
            <div class="analysis-section">
                <div class="analysis-section-title"><span class="analysis-section-icon">⚠️</span> 加载失败</div>
                <div class="analysis-items">
                    <div class="analysis-item">
                        <div class="analysis-item-dot"></div>
                        <div class="analysis-item-text" style="color: var(--accent-rose);">${escapeHtml(err.message)}</div>
                    </div>
                </div>
            </div>`;
    } finally {
        loading.style.display = 'none';
        btn.classList.remove('loading');
    }
}

function renderAnalysis(data) {
    const content = document.getElementById('analysisContent');
    if (!data.sections || data.sections.length === 0) {
        content.innerHTML = '<div class="analysis-section"><div class="analysis-section-title"><span class="analysis-section-icon">📭</span> 暂无分析数据</div></div>';
        return;
    }

    content.innerHTML = data.sections.map(section => {
        const items = (section.items || []).map(item => {
            const linkHtml = item.url
                ? `<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" class="analysis-item-link" title="查看原文">🔗</a>`
                : '';
            const scoreHtml = (item.importance && item.importance > 0)
                ? `<span class="analysis-item-score">${item.importance}</span>`
                : '';
            return `
                <div class="analysis-item">
                    <div class="analysis-item-dot"></div>
                    <div class="analysis-item-text">${escapeHtml(item.text || '')}${linkHtml}${scoreHtml}</div>
                </div>`;
        }).join('');

        return `
            <div class="analysis-section">
                <div class="analysis-section-title">
                    <span class="analysis-section-icon">${section.icon || '📋'}</span>
                    ${escapeHtml(section.title || '')}
                </div>
                <div class="analysis-items">${items}</div>
            </div>`;
    }).join('');
}

// Single article analysis (modal)
async function analyzeArticleById(articleId) {
    // Create overlay
    const overlay = document.createElement('div');
    overlay.className = 'analysis-modal-overlay';
    overlay.innerHTML = `
        <div class="analysis-modal">
            <div class="analysis-modal-header">
                <div class="analysis-modal-title">🤖 AI 深度分析</div>
                <button class="analysis-modal-close" id="closeAnalysisModal">✕</button>
            </div>
            <div class="analysis-modal-body">
                <div class="analysis-loading" style="display:flex;">
                    <div class="analysis-spinner"></div>
                    <p>Gemini 正在分析文章…</p>
                </div>
            </div>
        </div>`;

    document.body.appendChild(overlay);

    // Close handlers
    overlay.querySelector('#closeAnalysisModal').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    try {
        const res = await fetch(`/api/analysis/${encodeURIComponent(articleId)}`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        const a = data.analysis;

        const body = overlay.querySelector('.analysis-modal-body');
        body.innerHTML = `
            <div class="analysis-modal-field">
                <span class="analysis-modal-label">核心摘要</span>
                <div class="analysis-modal-value">${escapeHtml(a.summary || '')}</div>
            </div>
            <div class="analysis-modal-field">
                <span class="analysis-modal-label">关键发现</span>
                <ul class="analysis-modal-findings">
                    ${(a.keyFindings || []).map(f => `<li>${escapeHtml(f)}</li>`).join('')}
                </ul>
            </div>
            <div class="analysis-modal-field">
                <span class="analysis-modal-label">技术分析</span>
                <div class="analysis-modal-value">${escapeHtml(a.technologyAnalysis || '')}</div>
            </div>
            <div class="analysis-modal-field">
                <span class="analysis-modal-label">市场影响</span>
                <div class="analysis-modal-value">${escapeHtml(a.marketImpact || '')}</div>
            </div>
            <div class="analysis-modal-field">
                <span class="analysis-modal-label">竞争洞察</span>
                <div class="analysis-modal-value">${escapeHtml(a.competitiveInsight || '')}</div>
            </div>
            <div class="analysis-modal-field">
                <span class="analysis-modal-label">相关度</span>
                <div class="analysis-modal-value">
                    <span class="analysis-item-score">${a.relevanceScore || 0}</span>
                </div>
            </div>
            ${(a.tags && a.tags.length > 0) ? `
            <div class="analysis-modal-field">
                <span class="analysis-modal-label">标签</span>
                <div class="analysis-modal-tags">
                    ${a.tags.map(t => `<span class="analysis-modal-tag">${escapeHtml(t)}</span>`).join('')}
                </div>
            </div>` : ''}`;
    } catch (err) {
        overlay.querySelector('.analysis-modal-body').innerHTML = `
            <div class="analysis-modal-field">
                <span class="analysis-modal-label">分析失败</span>
                <div class="analysis-modal-value" style="color: var(--accent-rose);">${escapeHtml(err.message)}</div>
            </div>`;
    }
}

// Generate analysis button
document.getElementById('btnGenerateAnalysis')?.addEventListener('click', () => {
    fetchAnalysis(true);
});

// ── Init ──────────────────────────────────────────────
fetchAll();
