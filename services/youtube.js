/**
 * YouTube BCI 视频抓取服务
 * 
 * 使用 YouTube Data API v3 搜索 BCI 相关视频。
 * 提取标题、描述、频道名、发布日期等元数据。
 * 
 * 安全：API Key 仅通过 process.env.YOUTUBE_API_KEY 读取。
 */

const YOUTUBE_API_BASE = 'https://www.googleapis.com/youtube/v3';

// BCI 相关搜索关键词（轮换使用，避免结果单一）
const SEARCH_QUERIES = [
    'brain computer interface',
    'neural implant technology',
    'Neuralink BCI',
    'brain machine interface 2026',
    'neuroprosthesis',
    'invasive brain interface',
    'BCI clinical trial',
];

function isAvailable() {
    return !!process.env.YOUTUBE_API_KEY;
}

/**
 * 搜索 YouTube BCI 相关视频
 * @param {Object} options
 * @param {number} options.maxResults - 最多返回条数 (默认 10)
 * @param {string} options.publishedAfter - ISO 日期字符串，仅返回此日期之后发布的视频
 * @returns {Array} 格式化后的文章对象数组
 */
async function searchVideos({ maxResults = 10, publishedAfter } = {}) {
    if (!isAvailable()) {
        console.warn('⚠️ YOUTUBE_API_KEY 未配置，跳过 YouTube 数据抓取');
        return [];
    }

    const apiKey = process.env.YOUTUBE_API_KEY;

    // Rotate through search queries
    const queryIndex = Math.floor(Date.now() / 3600000) % SEARCH_QUERIES.length;
    const query = SEARCH_QUERIES[queryIndex];

    try {
        // Step 1: Search for videos
        const searchParams = new URLSearchParams({
            part: 'snippet',
            q: query,
            type: 'video',
            order: 'date',
            maxResults: String(maxResults),
            relevanceLanguage: 'en',
            key: apiKey,
        });

        if (publishedAfter) {
            searchParams.set('publishedAfter', publishedAfter);
        }

        const searchUrl = `${YOUTUBE_API_BASE}/search?${searchParams}`;
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);

        let searchData;
        try {
            const res = await fetch(searchUrl, { signal: controller.signal });
            if (!res.ok) {
                const errBody = await res.text().catch(() => '');
                throw new Error(`YouTube API ${res.status}: ${errBody.slice(0, 200)}`);
            }
            searchData = await res.json();
        } finally {
            clearTimeout(timeout);
        }

        const items = searchData.items || [];
        if (items.length === 0) return [];

        // Step 2: Get video statistics for view counts
        const videoIds = items.map(i => i.id.videoId).join(',');
        const statsParams = new URLSearchParams({
            part: 'statistics,contentDetails',
            id: videoIds,
            key: apiKey,
        });

        let statsMap = {};
        try {
            const statsRes = await fetch(`${YOUTUBE_API_BASE}/videos?${statsParams}`);
            if (statsRes.ok) {
                const statsData = await statsRes.json();
                for (const v of (statsData.items || [])) {
                    statsMap[v.id] = {
                        viewCount: parseInt(v.statistics?.viewCount || '0'),
                        duration: v.contentDetails?.duration || '',
                    };
                }
            }
        } catch (e) {
            // Stats are optional, continue without them
        }

        // Step 3: Format results
        return items.map(item => {
            const snippet = item.snippet;
            const videoId = item.id.videoId;
            const stats = statsMap[videoId] || {};
            const viewCount = stats.viewCount || 0;
            const viewStr = viewCount > 10000 ? `${(viewCount / 10000).toFixed(1)}万次观看` :
                           viewCount > 0 ? `${viewCount}次观看` : '';

            return {
                id: `youtube-${videoId}`,
                title: snippet.title || '',
                authors: snippet.channelTitle || '',
                source: snippet.channelTitle || 'YouTube',
                date: snippet.publishedAt || '',
                url: `https://www.youtube.com/watch?v=${videoId}`,
                abstract: [snippet.description || '', viewStr].filter(Boolean).join(' | '),
                category: 'video',
                provider: 'YouTube',
            };
        });
    } catch (err) {
        console.error('YouTube fetch error:', err.message);
        return [];
    }
}

module.exports = { searchVideos, isAvailable };
