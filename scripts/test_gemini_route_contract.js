#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');

function read(file) {
    return fs.readFileSync(path.join(ROOT, file), 'utf8');
}

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ ${message}`);
        process.exit(1);
    }
}

const server = read('server.js');
const apiRoutes = read('routes/api.js');
const app = read('public/app.js');
const requirements = read('REQUIREMENTS.md');
const agents = read('AGENTS.md');

assert(
    requirements.includes('Gemini 保留为实验模块') && requirements.includes('不接入生产路由'),
    'REQUIREMENTS.md documents Gemini as an experimental non-production module'
);

assert(
    agents.includes('Gemini 实验模块') && agents.includes('当前未接入主路由'),
    'AGENTS.md documents Gemini as not mounted on the main routes'
);

assert(!/require\(['"`]\.\/gemini['"`]\)/.test(server), 'server.js does not import gemini.js');
assert(!/gemini/i.test(server), 'server.js does not mention Gemini in route mounting');
assert(!/require\(['"`]\.\.\/gemini['"`]\)/.test(apiRoutes), 'routes/api.js does not import gemini.js');
assert(!/gemini/i.test(apiRoutes), 'routes/api.js exposes no Gemini route or handler');
assert(!/gemini/i.test(app), 'public/app.js has no Gemini entry point');

console.log('✅ Gemini route contract test passed');
