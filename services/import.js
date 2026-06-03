/**
 * URL 内容提取服务
 * 
 * 从任意 URL 提取文章内容（标题、摘要、日期、作者、来源）。
 * 支持：微信公众号文章、普通网页、Twitter/X 链接等。
 * 
 * 不引入 Cheerio 等重依赖，使用轻量正则 + 标签解析。
 */

const { truncate } = require('./fetcher');

// ── HTML 标签解析工具 ──────────────────────────────────

function extractMeta(html, name) {
    // Match <meta name="X" content="Y"> or <meta property="X" content="Y">
    const patterns = [
        new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]+content=["']([^"']+)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:name|property)=["']${name}["']`, 'i'),
    ];
    for (const p of patterns) {
        const m = html.match(p);
        if (m) return decodeHtmlEntities(m[1].trim());
    }
    return '';
}

function extractTitle(html) {
    // Priority: og:title > twitter:title > <title>
    const ogTitle = extractMeta(html, 'og:title');
    if (ogTitle) return ogTitle;

    const twTitle = extractMeta(html, 'twitter:title');
    if (twTitle) return twTitle;

    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    if (titleMatch) return decodeHtmlEntities(titleMatch[1].trim());

    return '';
}

function extractDescription(html) {
    return extractMeta(html, 'og:description')
        || extractMeta(html, 'description')
        || extractMeta(html, 'twitter:description')
        || '';
}

function extractDate(html) {
    // Try common date meta tags
    const dateMeta = extractMeta(html, 'article:published_time')
        || extractMeta(html, 'datePublished')
        || extractMeta(html, 'pubdate')
        || extractMeta(html, 'publish_time');
    if (dateMeta) return dateMeta;

    // Try JSON-LD datePublished
    const jsonLdMatch = html.match(/"datePublished"\s*:\s*"([^"]+)"/i);
    if (jsonLdMatch) return jsonLdMatch[1];

    return '';
}

function extractAuthor(html) {
    return extractMeta(html, 'author')
        || extractMeta(html, 'article:author')
        || '';
}

function extractSiteName(html) {
    return extractMeta(html, 'og:site_name')
        || extractMeta(html, 'application-name')
        || '';
}

function extractBodyText(html) {
    // Try to find <article> content first
    const articleMatch = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
    let text = articleMatch ? articleMatch[1] : '';

    // Fallback: find the main content area
    if (!text) {
        const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
        text = mainMatch ? mainMatch[1] : '';
    }

    // Fallback: use meta description
    if (!text) return '';

    // Strip HTML tags and normalize whitespace
    text = text
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();

    return truncate(text, 500);
}

function decodeHtmlEntities(str) {
    return str
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/&#039;/g, "'")
        .replace(/&#x27;/g, "'")
        .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n)));
}

// ── 来源识别 ──────────────────────────────────────────

function detectSource(url) {
    const host = new URL(url).hostname.toLowerCase();

    if (host.includes('mp.weixin.qq.com')) return { provider: 'WeChat', category: 'news' };
    if (host.includes('twitter.com') || host.includes('x.com')) return { provider: 'X/Twitter', category: 'news' };
    if (host.includes('youtube.com') || host.includes('youtu.be')) return { provider: 'YouTube', category: 'video' };
    if (host.includes('nature.com')) return { provider: 'Nature', category: 'journal' };
    if (host.includes('science.org')) return { provider: 'Science', category: 'journal' };
    if (host.includes('pubmed.ncbi.nlm.nih.gov')) return { provider: 'PubMed', category: 'journal' };
    if (host.includes('arxiv.org')) return { provider: 'arXiv', category: 'preprint' };
    if (host.includes('biorxiv.org')) return { provider: 'bioRxiv', category: 'preprint' };
    if (host.includes('zhihu.com')) return { provider: '知乎', category: 'news' };
    if (host.includes('36kr.com')) return { provider: '36氪', category: 'news' };
    if (host.includes('toutiao.com')) return { provider: '头条', category: 'news' };

    return { provider: extractDomain(host), category: 'news' };
}

function extractDomain(host) {
    // "www.example.com" -> "example.com"
    return host.replace(/^www\./, '');
}

// ── 主函数：从 URL 提取文章 ──────────────────────────

async function extractArticleFromURL(url) {
    // Validate URL
    let parsedUrl;
    try {
        parsedUrl = new URL(url);
    } catch {
        throw new Error('无效的 URL 格式');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('仅支持 HTTP/HTTPS 链接');
    }

    // Fetch HTML with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let html;
    try {
        const res = await fetch(url, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
                'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
            },
            signal: controller.signal,
            redirect: 'follow',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        html = await res.text();
    } catch (err) {
        if (err.name === 'AbortError') throw new Error('页面加载超时（15秒）');
        throw new Error(`页面获取失败: ${err.message}`);
    } finally {
        clearTimeout(timeout);
    }

    // Extract content
    const title = extractTitle(html);
    if (!title) throw new Error('无法提取页面标题，该链接可能需要登录或不是文章页面');

    const description = extractDescription(html);
    const bodyText = extractBodyText(html);
    const date = extractDate(html) || new Date().toISOString();
    const author = extractAuthor(html);
    const siteName = extractSiteName(html);
    const { provider, category } = detectSource(url);

    return {
        url: url,
        title: title,
        authors: author,
        source: siteName || provider,
        date: date,
        abstract: description || bodyText || '',
        category: category,
        provider: provider,
    };
}

module.exports = { extractArticleFromURL };
