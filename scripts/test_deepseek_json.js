#!/usr/bin/env node

const assert = require('assert');

const { fallbackArticleAnalysis, parseJsonResponse } = require('../services/deepseek');

assert.deepStrictEqual(parseJsonResponse('```json\n{"ok":true}\n```'), { ok: true }, 'parses fenced JSON');

const originalError = console.error;
try {
    console.error = () => {};
    assert.throws(
        () => parseJsonResponse('{"summary":"broken" "tags":[]}'),
        err => err.code === 'DEEPSEEK_JSON_PARSE_FAILED',
        'malformed JSON exposes a stable parse error code'
    );
} finally {
    console.error = originalError;
}

const fallback = fallbackArticleAnalysis({
    title: 'Neuralink raises new funding',
    abstract: 'Funding event summary for a BCI company.',
}, 'DeepSeek 返回数据解析失败');

assert.strictEqual(fallback.degraded, true, 'fallback marks degraded analysis');
assert.strictEqual(fallback.reason, 'DeepSeek 返回数据解析失败', 'fallback keeps reason');
assert(Array.isArray(fallback.keyFindings), 'fallback has key findings');
assert(Array.isArray(fallback.tags) && fallback.tags.includes('json_parse_failed'), 'fallback tags parse failure');
assert.strictEqual(typeof fallback.investmentScore, 'number', 'fallback keeps numeric score');

console.log('✅ deepseek JSON resilience test passed');
