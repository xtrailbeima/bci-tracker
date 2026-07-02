const express = require('express');
const router = express.Router();
const fetcher = require('../services/fetcher');
const { requireRole } = require('../middleware/auth');
const { fetchRSS, DEMO_DATA } = fetcher;

router.get('/journals', requireRole('owner', 'operator'), async (req, res) => {
    try {
        const feeds = [
            { url: 'https://www.nature.com/subjects/neuroscience.rss', name: 'Nature Neuroscience' },
            { url: 'https://www.nature.com/subjects/brain-machine-interface.rss', name: 'Nature BMI' },
            { url: 'https://www.science.org/action/showFeed?type=etoc&feed=rss&jc=science', name: 'Science' },
            { url: 'https://www.cell.com/neuron/rss', name: 'Neuron (Cell)' },
        ];

        const results = await Promise.allSettled(
            feeds.map(f => fetchRSS(f.url, f.name))
        );

        const articles = results
            .filter(r => r.status === 'fulfilled')
            .flatMap(r => r.value);

        if (articles.length === 0 && fetcher.useDemoData) {
            return res.json(DEMO_DATA.filter(d =>
                d.provider.includes('Nature') || d.provider === 'Science'
            ));
        }

        res.json(articles);
    } catch (err) {
        console.error('Journals error:', err.message);
        res.json(DEMO_DATA.filter(d =>
            d.provider.includes('Nature') || d.provider === 'Science'
        ));
    }
});

module.exports = router;
