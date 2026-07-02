const express = require('express');
const router = express.Router();
const { requireRole } = require('../middleware/auth');
const { fetchJSON, DEMO_DATA } = require('../services/fetcher');

router.get('/pubmed', requireRole('owner', 'operator'), async (req, res) => {
    try {
        const query = req.query.q || 'brain-computer interface';
        const maxResults = req.query.max || 20;

        const searchUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&term=${encodeURIComponent(query)}&retmax=${maxResults}&sort=date&retmode=json`;
        const searchData = await fetchJSON(searchUrl);
        const ids = searchData.esearchresult?.idlist || [];

        if (ids.length === 0) return res.json([]);

        const summaryUrl = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&id=${ids.join(',')}&retmode=json`;
        const summaryData = await fetchJSON(summaryUrl);

        const articles = ids.map(id => {
            const d = summaryData.result?.[id];
            if (!d) return null;
            return {
                id: `pubmed-${id}`,
                title: d.title || '',
                authors: (d.authors || []).map(a => a.name).join(', '),
                source: d.fulljournalname || d.source || 'PubMed',
                date: d.pubdate || '',
                url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
                abstract: d.title ? require('../services/fetcher').truncate(d.title) : '',
                category: 'journal',
                provider: 'PubMed'
            };
        }).filter(Boolean);

        res.json(articles);
    } catch (err) {
        console.error('PubMed error:', err.message);
        require('../services/fetcher').useDemoData = true;
        res.json(DEMO_DATA.filter(d => d.provider === 'PubMed'));
    }
});

module.exports = router;
