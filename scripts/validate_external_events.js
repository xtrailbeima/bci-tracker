#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const TRACKS = new Set(['research', 'industry', 'media', 'policy']);
const SIGNALS = new Set(['positive', 'neutral', 'negative', 'watch']);
const REQUIRED = [
    'id',
    'date',
    'track',
    'eventType',
    'title',
    'summary',
    'companies',
    'technologyRoutes',
    'indications',
    'investmentSignal',
    'importanceScore',
    'confidence',
    'sources',
];

function fail(message) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
}

function asEvents(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.events)) return payload.events;
    return null;
}

function validateEvent(event, index, file) {
    const label = `${file} event[${index}]`;
    for (const key of REQUIRED) {
        if (!(key in event)) fail(`${label} missing "${key}"`);
    }
    if (!TRACKS.has(event.track)) fail(`${label} has invalid track "${event.track}"`);
    if (!SIGNALS.has(event.investmentSignal)) fail(`${label} has invalid investmentSignal "${event.investmentSignal}"`);

    for (const key of ['companies', 'technologyRoutes', 'indications', 'sources']) {
        if (!Array.isArray(event[key])) fail(`${label} "${key}" must be an array`);
    }
    if (typeof event.importanceScore !== 'number' || event.importanceScore < 0 || event.importanceScore > 100) {
        fail(`${label} importanceScore must be 0-100`);
    }
    if (typeof event.confidence !== 'number' || event.confidence < 0 || event.confidence > 1) {
        fail(`${label} confidence must be 0-1`);
    }
    for (const key of ['id', 'date', 'eventType', 'title', 'summary']) {
        if (typeof event[key] !== 'string' || event[key].trim() === '') fail(`${label} "${key}" must be a non-empty string`);
    }
}

function validateFile(file) {
    const raw = fs.readFileSync(file, 'utf8');
    let payload;
    try {
        payload = JSON.parse(raw);
    } catch (err) {
        fail(`${file} is not valid JSON: ${err.message}`);
        return;
    }

    const events = asEvents(payload);
    if (!events) {
        fail(`${file} must be an array or an object with an events array`);
        return;
    }
    events.forEach((event, index) => validateEvent(event, index, file));
    if (process.exitCode !== 1) {
        console.log(`✅ ${file}: ${events.length} event(s) valid`);
    }
}

const files = process.argv.slice(2);
if (files.length === 0) {
    fail('Usage: node scripts/validate_external_events.js external_events/YYYY-MM-DD.json');
} else {
    for (const file of files) {
        validateFile(path.resolve(file));
    }
}
