const express = require('express');
const router = express.Router();
const { parseStringPromise } = require('xml2js');
const { requireRole } = require('../middleware/auth');
const { fetchText, truncate, DEMO_DATA } = require('../services/fetcher');

router.get('/arxiv', requireRole('owner', 'operator'), async (req, res) => {
    try {
        const query = req.query.q || 'brain-computer interface';
        const maxResults = req.query.max || 20;
        const url = `https://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${maxResults}&sortBy=submittedDate&sortOrder=descending`;

        const xml = await fetchText(url);
        const parsed = await parseStringPromise(xml, { explicitArray: false });

        const entries = parsed.feed?.entry;
        if (!entries) return res.json([]);

        const list = Array.isArray(entries) ? entries : [entries];
        const articles = list.map((e, i) => {
            const authors = Array.isArray(e.author)
                ? e.author.map(a => a.name).join(', ')
                : e.author?.name || '';
            const link = Array.isArray(e.link)
                ? (e.link.find(l => l.$?.type === 'text/html')?.$?.href || e.link[0]?.$?.href)
                : e.link?.$?.href || '';

            return {
                id: `arxiv-${i}-${Date.now()}`,
                title: (e.title || '').replace(/\s+/g, ' ').trim(),
                authors,
                source: 'arXiv',
                date: e.published || '',
                url: link,
                abstract: truncate(e.summary || ''),
                category: 'preprint',
                provider: 'arXiv'
            };
        });

        res.json(articles);
    } catch (err) {
        console.error('arXiv error:', err.message);
        require('../services/fetcher').useDemoData = true;
        res.json(DEMO_DATA.filter(d => d.provider === 'arXiv'));
    }
});

module.exports = router;
