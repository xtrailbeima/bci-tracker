#!/usr/bin/env node

const assert = require('assert');

const { parseAIJsonResponse } = require('../services/ai_json');
const {
    fallbackArticleAnalysis,
    fallbackDailySummary,
    fallbackWeeklySummary,
    parseJsonResponse
} = require('../services/deepseek');
const { parseJSONResponse: parseGeminiJSONResponse } = require('../gemini');

assert.deepStrictEqual(parseJsonResponse('```json\n{"ok":true}\n```'), { ok: true }, 'parses fenced JSON');
assert.deepStrictEqual(parseAIJsonResponse('prefix {"ok":true} suffix'), { ok: true }, 'common parser extracts JSON object');

const originalError = console.error;
const capturedErrors = [];
try {
    console.error = (...args) => capturedErrors.push(args.join(' '));
    assert.throws(
        () => parseJsonResponse('{"summary":"secret-marker" "tags":[]}'),
        err => err.code === 'DEEPSEEK_JSON_PARSE_FAILED',
        'malformed JSON exposes a stable parse error code'
    );
    assert(!capturedErrors.join('\n').includes('secret-marker'), 'parse failure logs omit raw model text');
} finally {
    console.error = originalError;
}

try {
    console.error = () => {};
    assert.throws(
        () => parseGeminiJSONResponse('{"summary":"broken" "tags":[]}'),
        err => err.code === 'GEMINI_JSON_PARSE_FAILED',
        'Gemini parser uses stable parse error code'
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

const dailyFallback = fallbackDailySummary('DeepSeek 返回数据解析失败');
assert.strictEqual(dailyFallback.degraded, true, 'daily fallback marks degraded');
assert.strictEqual(dailyFallback.errorCode, 'DEEPSEEK_JSON_PARSE_FAILED', 'daily fallback keeps parse error code');
assert(Array.isArray(dailyFallback.highlights), 'daily fallback keeps highlights array');

const weeklyFallback = fallbackWeeklySummary('DeepSeek 返回数据解析失败');
assert.strictEqual(weeklyFallback.degraded, true, 'weekly fallback marks degraded');
assert.strictEqual(weeklyFallback.errorCode, 'DEEPSEEK_JSON_PARSE_FAILED', 'weekly fallback keeps parse error code');
assert(Array.isArray(weeklyFallback.milestones), 'weekly fallback keeps milestones array');

console.log('✅ deepseek JSON resilience test passed');
