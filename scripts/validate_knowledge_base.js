#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const PROJECTS_DIR = path.join(process.cwd(), 'knowledge_base', 'projects');
const REQUIRED_FIELDS = [
    'projectName',
    'status',
    'stage',
    'technologyRoutes',
    'indications',
    'coreClaims',
    'teamSignals',
    'risks',
    'openQuestions',
    'investmentThesis',
    'lastUpdated',
    'sensitivity',
];
const SENSITIVITY = new Set(['public_like', 'confidential', 'highly_sensitive']);

function fail(message) {
    console.error(`❌ ${message}`);
    process.exitCode = 1;
}

function getYamlBlock(markdown) {
    const match = markdown.match(/```yaml\n([\s\S]*?)```/);
    return match ? match[1] : '';
}

function hasField(block, field) {
    return new RegExp(`^${field}:`, 'm').test(block);
}

function getScalar(block, field) {
    const match = block.match(new RegExp(`^${field}:\\s*"?([^"\\n#]+)"?`, 'm'));
    return match ? match[1].trim() : '';
}

function projectFiles() {
    if (!fs.existsSync(PROJECTS_DIR)) return [];
    return fs.readdirSync(PROJECTS_DIR)
        .filter(name => name.endsWith('.md') && name !== '_project_template.md')
        .map(name => path.join(PROJECTS_DIR, name));
}

function validateProject(file) {
    const markdown = fs.readFileSync(file, 'utf8');
    const yaml = getYamlBlock(markdown);
    const rel = path.relative(process.cwd(), file);
    if (!yaml) {
        fail(`${rel} missing yaml metadata block`);
        return;
    }
    for (const field of REQUIRED_FIELDS) {
        if (!hasField(yaml, field)) fail(`${rel} missing "${field}"`);
    }
    const sensitivity = getScalar(yaml, 'sensitivity');
    if (sensitivity && !SENSITIVITY.has(sensitivity)) {
        fail(`${rel} has invalid sensitivity "${sensitivity}"`);
    }
}

const files = projectFiles();
if (files.length === 0) {
    console.log('⚠️ No project profiles found under knowledge_base/projects');
} else {
    files.forEach(validateProject);
    if (process.exitCode !== 1) console.log(`✅ ${files.length} project profile(s) valid`);
}
