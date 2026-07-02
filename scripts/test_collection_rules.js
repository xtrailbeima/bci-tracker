#!/usr/bin/env node

const assert = require('assert');

const {
    autoAssignCollections,
    createCollection,
    deleteCollection,
    deleteCollectionByName,
    getCollectionItems,
    normalizeCollectionRules,
    searchArticles,
    updateCollectionRules,
} = require('../db');

function pickKeyword(article) {
    const text = `${article.title || ''} ${article.abstract || ''}`;
    const match = text.match(/[A-Za-z][A-Za-z0-9-]{4,}/);
    if (match) return match[0].toLowerCase();
    const compactTitle = String(article.title || '').replace(/[^\p{L}\p{N}]+/gu, '');
    return compactTitle.slice(0, 4) || '脑机接口';
}

assert.deepStrictEqual(
    normalizeCollectionRules([' Neuralink ', 'neuralink', 'FDA approval']),
    ['Neuralink', 'FDA approval'],
    'normalizes and deduplicates rules'
);
assert.throws(
    () => normalizeCollectionRules(['<script>']),
    /unsupported characters/,
    'rejects unsafe rule characters'
);
assert.throws(
    () => normalizeCollectionRules(Array.from({ length: 21 }, (_, i) => `kw${i}`)),
    /too many/,
    'limits rule count'
);

const article = (searchArticles({ sort: 'importance', limit: 1 }).items || [])[0];
assert(article, 'needs at least one article for collection rule assignment test');

const name = `Smoke Rule ${Date.now()}`;
let collectionId = null;

try {
    deleteCollectionByName(name);
    const keyword = pickKeyword(article);
    const created = createCollection(name, '🧪', [keyword]);
    collectionId = Number(created.lastInsertRowid);

    autoAssignCollections([article]);
    const assigned = getCollectionItems(collectionId, { limit: 10 }).items;
    assert(
        assigned.some(item => item.id === article.id),
        'autoAssignCollections assigns matching article to custom rule collection'
    );

    const updated = updateCollectionRules(collectionId, ['Synchron', ' synchron ', 'clinical trial']);
    assert.strictEqual(updated.changes, 1, 'updates custom collection rules');
    assert.deepStrictEqual(updated.rules, ['Synchron', 'clinical trial'], 'stores normalized updated rules');
} finally {
    if (collectionId) deleteCollection(collectionId);
}

console.log('✅ collection rules test passed');
