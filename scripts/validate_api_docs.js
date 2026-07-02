#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROUTE_MOUNTS = [
    ['routes/auth.js', '/api/auth'],
    ['routes/api.js', '/api'],
    ['routes/pubmed.js', '/api'],
    ['routes/arxiv.js', '/api'],
    ['routes/journals.js', '/api'],
    ['routes/news.js', '/api'],
    ['routes/youtube.js', '/api'],
];
const DOCS = ['AGENTS.md', 'REQUIREMENTS.md'];

function joinRoute(mount, routePath) {
    if (routePath === '/') return mount;
    return `${mount}${routePath}`.replace(/\/+/g, '/');
}

function getActualRoutes() {
    const routes = [];
    const pattern = /router\.(get|post|patch|delete|put)\(\s*['"`]([^'"`]+)['"`]/g;
    for (const [file, mount] of ROUTE_MOUNTS) {
        const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
        for (const match of code.matchAll(pattern)) {
            routes.push(`${match[1].toUpperCase()} ${joinRoute(mount, match[2])}`);
        }
    }
    return [...new Set(routes)].sort();
}

function getDocumentedRoutes(docFile) {
    const text = fs.readFileSync(path.join(ROOT, docFile), 'utf8');
    const routes = [];
    const pattern = /\|\s*(GET|POST|PATCH|DELETE|PUT)\s*\|\s*`(\/api[^`]+)`/g;
    for (const match of text.matchAll(pattern)) {
        routes.push(`${match[1]} ${match[2]}`);
    }
    return new Set(routes);
}

let failed = false;
const actual = getActualRoutes();

for (const docFile of DOCS) {
    const documented = getDocumentedRoutes(docFile);
    const missing = actual.filter(route => !documented.has(route));
    if (missing.length > 0) {
        failed = true;
        console.error(`❌ ${docFile} is missing API routes:`);
        for (const route of missing) console.error(`  - ${route}`);
    }
}

if (failed) process.exit(1);
console.log(`✅ API docs cover ${actual.length} routes in ${DOCS.join(', ')}`);
