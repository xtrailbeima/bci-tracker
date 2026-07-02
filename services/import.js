/**
 * URL 内容提取服务
 * 
 * 从任意 URL 提取文章内容（标题、摘要、日期、作者、来源）。
 * 支持：微信公众号文章、普通网页、Twitter/X 链接等。
 * 
 * 不引入 Cheerio 等重依赖，使用轻量正则 + 标签解析。
 */

const dns = require('dns').promises;
const net = require('net');

const { truncate } = require('./fetcher');

const MAX_IMPORT_BYTES = 1024 * 1024;
const MAX_REDIRECTS = 3;

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

function isLikelyPaywalled(html) {
    const text = html.toLowerCase();
    return [
        'subscribe to continue',
        'sign in to continue',
        'create an account to continue',
        'access through your institution',
        'purchase access',
        '付费阅读',
        '订阅后继续阅读',
        '登录后继续阅读',
    ].some(marker => text.includes(marker.toLowerCase()));
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

// ── URL 安全边界 ────────────────────────────────────────

function parseImportUrl(url) {
    let parsedUrl;
    try {
        parsedUrl = new URL(String(url || '').trim());
    } catch {
        throw new Error('无效的 URL 格式');
    }

    if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
        throw new Error('仅支持 HTTP/HTTPS 链接');
    }
    if (parsedUrl.href.length > 2048) {
        throw new Error('URL 过长');
    }
    assertPublicHostname(parsedUrl.hostname);
    return parsedUrl;
}

function assertPublicHostname(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost')) {
        throw new Error('不支持导入本机或内网地址');
    }
    if (net.isIP(host)) {
        if (isPrivateAddress(host)) throw new Error('不支持导入本机或内网地址');
        return;
    }
    if (!host.includes('.')) {
        throw new Error('不支持导入本机或内网地址');
    }
}

function isPrivateAddress(address) {
    const ip = String(address || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (net.isIP(ip) === 4) {
        const parts = ip.split('.').map(Number);
        const [a, b] = parts;
        return a === 0
            || a === 10
            || a === 127
            || (a === 100 && b >= 64 && b <= 127)
            || (a === 169 && b === 254)
            || (a === 172 && b >= 16 && b <= 31)
            || (a === 192 && b === 168)
            || (a === 198 && (b === 18 || b === 19))
            || a >= 224;
    }
    if (net.isIP(ip) === 6) {
        if (ip === '::' || ip === '::1') return true;
        if (ip.startsWith('fe80:') || ip.startsWith('fc') || ip.startsWith('fd')) return true;
        if (ip.startsWith('::ffff:')) return isPrivateAddress(ip.slice(7));
    }
    return false;
}

async function assertPublicResolvedAddress(parsedUrl) {
    const host = parsedUrl.hostname;
    if (net.isIP(host)) return;

    let records;
    try {
        records = await dns.lookup(host, { all: true, verbatim: true });
    } catch {
        throw new Error('无法解析该 URL 的域名');
    }

    if (!records.length || records.some(record => isPrivateAddress(record.address))) {
        throw new Error('不支持导入本机或内网地址');
    }
}

function assertHtmlContentType(contentType) {
    const type = String(contentType || '').split(';')[0].trim().toLowerCase();
    if (!type) return;
    if (!['text/html', 'application/xhtml+xml', 'application/xml', 'text/xml'].includes(type)) {
        throw new Error('仅支持导入 HTML 文章页面');
    }
}

async function readLimitedText(res, maxBytes = MAX_IMPORT_BYTES) {
    const reader = res.body?.getReader?.();
    if (!reader) {
        const text = await res.text();
        if (Buffer.byteLength(text) > maxBytes) throw new Error('页面内容过大，无法导入');
        return text;
    }

    const chunks = [];
    let total = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        total += value.byteLength;
        if (total > maxBytes) throw new Error('页面内容过大，无法导入');
        chunks.push(Buffer.from(value));
    }
    return Buffer.concat(chunks).toString('utf8');
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
    // Fetch HTML with timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    let html;
    let currentUrl = parseImportUrl(url);
    try {
        for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
            await assertPublicResolvedAddress(currentUrl);
            const res = await fetch(currentUrl.href, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9',
                    'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8',
                },
                signal: controller.signal,
                redirect: 'manual',
            });

            if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
                currentUrl = parseImportUrl(new URL(res.headers.get('location'), currentUrl).href);
                continue;
            }
            if (res.status >= 300 && res.status < 400) throw new Error('页面跳转缺少目标地址');
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            assertHtmlContentType(res.headers.get('content-type'));
            html = await readLimitedText(res);
            break;
        }
        if (!html) throw new Error('页面跳转次数过多');
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
    const { provider, category } = detectSource(currentUrl.href);
    const accessStatus = isLikelyPaywalled(html) && bodyText.length < 120
        ? 'paywalled'
        : bodyText.length > 350 ? 'full_text' : 'metadata_only';

    return {
        url: currentUrl.href,
        title: title,
        authors: author,
        source: siteName || provider,
        date: date,
        abstract: description || bodyText || '',
        category: category,
        provider: provider,
        accessStatus,
        extractionMethod: 'manual_import',
        lastFetchStatus: accessStatus === 'paywalled' ? 'partial' : 'success',
        lastFetchError: accessStatus === 'paywalled' ? 'paywall_detected' : '',
    };
}

module.exports = {
    extractArticleFromURL,
    parseImportUrl,
    assertHtmlContentType,
    isPrivateAddress,
    readLimitedText,
};
