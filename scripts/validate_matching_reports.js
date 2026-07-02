#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const REPORTS_DIR = path.join(ROOT, 'matching_reports');
const REQUIRED_SECTIONS = [
    'Executive Summary',
    'External Events Reviewed',
    'Project Matches',
    'Projects With No Material Match',
    'Follow-up Queue',
];
const REQUIRED_MATCH_FIELDS = [
    'Match strength',
    'Impact direction',
    'Why it matches',
    'Risk changes',
    'Next interview questions',
    'Recommended actions',
    'Human confirmation needed',
];

function fail(message) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
}

function getYamlBlock(markdown) {
    const match = markdown.match(/```yaml\n([\s\S]*?)```/);
    return match ? match[1] : '';
}

function hasYamlField(block, field) {
    return new RegExp(`^${field}:`, 'm').test(block);
}

function getYamlScalar(block, field) {
    const match = block.match(new RegExp(`^${field}:\\s*"?([^"\\n#]+)"?`, 'm'));
    return match ? match[1].trim() : '';
}

function reportFiles() {
    if (!fs.existsSync(REPORTS_DIR)) return [];
    return fs.readdirSync(REPORTS_DIR)
        .filter(name => /^\d{4}-\d{2}-\d{2}\.md$/.test(name))
        .map(name => path.join(REPORTS_DIR, name))
        .sort();
}

function validateReport(file) {
    const rel = path.relative(ROOT, file);
    const markdown = fs.readFileSync(file, 'utf8');
    const dateFromName = path.basename(file, '.md');
    const yaml = getYamlBlock(markdown);

    if (!markdown.startsWith(`# Deal Matching Report - ${dateFromName}`)) {
        fail(`${rel} must start with "# Deal Matching Report - ${dateFromName}"`);
    }

    if (!yaml) {
        fail(`${rel} missing yaml metadata block`);
    } else {
        for (const field of ['date', 'externalEventsFile', 'knowledgeScope', 'generatedBy', 'humanReviewed']) {
            if (!hasYamlField(yaml, field)) fail(`${rel} missing metadata field "${field}"`);
        }
        const date = getYamlScalar(yaml, 'date');
        if (date && date !== dateFromName) fail(`${rel} metadata date must match filename`);
        const eventsFile = getYamlScalar(yaml, 'externalEventsFile');
        if (eventsFile && !fs.existsSync(path.join(ROOT, eventsFile))) fail(`${rel} references missing ${eventsFile}`);
        const contextFile = getYamlScalar(yaml, 'matchingContextFile');
        if (contextFile && !fs.existsSync(path.join(ROOT, contextFile))) fail(`${rel} references missing ${contextFile}`);
    }

    for (const section of REQUIRED_SECTIONS) {
        if (!new RegExp(`^## ${escapeRegExp(section)}\\s*$`, 'm').test(markdown)) {
            fail(`${rel} missing section "${section}"`);
        }
    }

    for (const field of REQUIRED_MATCH_FIELDS) {
        if (!new RegExp(`^- ${escapeRegExp(field)}:`, 'm').test(markdown)) {
            fail(`${rel} missing project match field "${field}"`);
        }
    }
}

function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const files = reportFiles();
if (files.length === 0) {
    console.log('⚠️ No date-stamped matching reports found under matching_reports');
} else {
    files.forEach(validateReport);
    if (process.exitCode !== 1) console.log(`✅ ${files.length} matching report(s) valid`);
}
