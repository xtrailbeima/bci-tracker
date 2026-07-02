#!/usr/bin/env node

const assert = require('assert');
const path = require('path');

const { articleToEvent, dedupeEvents, parseSimpleWatchlist } = require('./export_external_events');

const watchlist = {
    companies: ['Neuralink', 'Synchron', 'Blackrock Neurotech', 'Paradromics', 'Axoft'],
    technologyRoutes: ['ultrasound neuromodulation'],
    indications: [],
    policySources: ['FDA', 'NMPA'],
};

const articles = [
    {
        id: 1,
        url: 'https://news.google.com/rss/articles/shuli-sina',
        title: '脑机接口企业术理创新完成数亿元C轮融资，道禾资本参投 - 新浪财经',
        abstract: '脑机接口企业术理创新完成数亿元C轮融资，道禾资本参投',
        source: '新浪财经',
        provider: 'Google News',
        date: '2026-02-28T00:00:00.000Z',
        category: 'news',
        importance: 68,
        accessStatus: 'metadata_only',
        contentQuality: 50,
        sourceReliability: 'media',
    },
    {
        id: 2,
        url: 'https://news.google.com/rss/articles/shuli-pedaily',
        title: '脑机接口企业术理创新完成数亿元C轮融资 - 投资界',
        abstract: '脑机接口企业术理创新完成数亿元C轮融资',
        source: '投资界',
        provider: 'Google News',
        date: '2026-02-28T00:00:00.000Z',
        category: 'news',
        importance: 66,
        accessStatus: 'metadata_only',
        contentQuality: 50,
        sourceReliability: 'media',
    },
    {
        id: 3,
        url: 'https://news.google.com/rss/articles/gestalt-sina',
        title: '「格式塔科技」获1.5亿元天使轮融资，加速超声波脑机接口临床开发丨早起看早期 - 新浪网',
        abstract: '「格式塔科技」获1.5亿元天使轮融资，加速超声波脑机接口临床开发',
        source: '新浪网',
        provider: 'Google News',
        date: '2026-03-28T00:00:00.000Z',
        category: 'news',
        importance: 66,
        accessStatus: 'metadata_only',
        contentQuality: 50,
        sourceReliability: 'media',
    },
    {
        id: 4,
        url: 'https://example.com/neuralink-650m-fierce',
        title: 'Neuralink secures $650M series E funding to expand patient access to brain chip technology - Fierce Biotech',
        abstract: 'Neuralink secures $650M series E funding.',
        source: 'Fierce Biotech',
        provider: 'Google News',
        date: '2025-06-04T00:00:00.000Z',
        category: 'news',
        importance: 65,
        accessStatus: 'metadata_only',
        contentQuality: 50,
        sourceReliability: 'media',
    },
    {
        id: 5,
        url: 'https://example.com/neuralink-650-million-bazaar',
        title: 'Elon Musk’s Neuralink raises $650 million in Series E funding - The American Bazaar',
        abstract: 'Neuralink raises $650 million in Series E funding.',
        source: 'The American Bazaar',
        provider: 'Google News',
        date: '2025-06-04T00:00:00.000Z',
        category: 'news',
        importance: 64,
        accessStatus: 'metadata_only',
        contentQuality: 50,
        sourceReliability: 'media',
    },
];

const events = articles.map(article => articleToEvent(article, watchlist, '2026-06-28'));
const deduped = dedupeEvents(events);
const shuli = deduped.find(event => event.companies.includes('术理创新'));
const gestalt = deduped.find(event => event.companies.includes('格式塔科技'));
const neuralink = deduped.find(event => event.companies.includes('Neuralink'));

assert.strictEqual(deduped.length, 3, 'duplicate financing coverage should merge into one event');
assert(shuli, 'merged Shuli Innovation event exists');
assert(gestalt, 'separate Gestalt event remains');
assert(neuralink, 'merged Neuralink financing event exists');
assert.strictEqual(shuli.sourceCount, 2, 'merged event keeps both source records');
assert.strictEqual(shuli.sources.length, 2, 'merged event sources are not collapsed away');
assert.strictEqual(shuli.importanceScore, 68, 'merged event keeps the strongest importance score');
assert(shuli.duplicateTitles.length >= 1, 'merged event explains duplicate titles');
assert(Array.isArray(shuli.mergedEventIds) && shuli.mergedEventIds.length === 2, 'merged event records source event ids');
assert.strictEqual(neuralink.sourceCount, 2, 'financing amount and round merge despite different wording');

const localWatchlist = parseSimpleWatchlist(path.join(__dirname, '..', 'knowledge_base', 'watchlist.yaml'));
const braincoEvent = articleToEvent({
    id: 6,
    url: 'https://example.com/brainco-eeg',
    title: '强脑科技发布无创脑机接口脑电解码新进展',
    abstract: 'BrainCo 面向可穿戴脑机接口和脑电解码场景。',
    source: 'Example',
    provider: 'Manual',
    date: '2026-07-02T00:00:00.000Z',
    category: 'news',
    importance: 50,
}, localWatchlist, '2026-07-02');
assert(braincoEvent.companies.includes('强脑科技'), 'watchlist extracts Chinese company aliases');
assert(braincoEvent.technologyRoutes.includes('non-invasive BCI'), 'watchlist extracts Chinese non-invasive route');
assert(braincoEvent.technologyRoutes.includes('EEG decoding'), 'watchlist extracts Chinese EEG route');

const ultrasoundEvent = articleToEvent({
    id: 7,
    url: 'https://example.com/ultrasound-bci',
    title: '思昇科技获数千万元种子轮融资，推进超声脑机接口临床转化',
    abstract: '项目聚焦超声神经调控。',
    source: 'Example',
    provider: 'Manual',
    date: '2026-07-02T00:00:00.000Z',
    category: 'news',
    importance: 50,
}, localWatchlist, '2026-07-02');
assert(ultrasoundEvent.companies.includes('思昇科技'), 'watchlist extracts Chinese emerging company');
assert(ultrasoundEvent.technologyRoutes.includes('ultrasound neuromodulation'), 'watchlist extracts ultrasound route aliases');

console.log('✅ external event dedupe test passed');
