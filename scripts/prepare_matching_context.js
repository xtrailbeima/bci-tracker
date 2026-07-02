#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const DEFAULT_PROJECTS_DIR = path.join(process.cwd(), 'knowledge_base', 'projects');
const DEFAULT_REPORTS_DIR = path.join(process.cwd(), 'matching_reports');

function parseArgs(argv = process.argv.slice(2)) {
    const args = {};
    for (let i = 0; i < argv.length; i += 1) {
        const arg = argv[i];
        if (arg === '--date') args.date = argv[++i];
        else if (arg === '--events') args.eventsFile = argv[++i];
        else if (arg === '--projects') args.projectsDir = argv[++i];
        else if (arg === '--out') args.outFile = argv[++i];
        else if (arg === '--max-events') args.maxEvents = parseInt(argv[++i], 10);
        else if (arg === '--help') args.help = true;
    }
    return args;
}

function usage() {
    return [
        'Usage:',
        '  npm run prepare:matching -- --date YYYY-MM-DD',
        '  node scripts/prepare_matching_context.js --events external_events/YYYY-MM-DD.json --out matching_reports/YYYY-MM-DD_context.md',
    ].join('\n');
}

function stripQuotes(value) {
    return String(value || '')
        .trim()
        .replace(/\s+#.*$/, '')
        .replace(/^"(.*)"$/, '$1')
        .replace(/^'(.*)'$/, '$1')
        .trim();
}

function getYamlBlock(markdown) {
    const match = markdown.match(/```yaml\n([\s\S]*?)```/);
    return match ? match[1] : '';
}

function parseYamlBlock(block) {
    const data = {};
    let currentKey = null;
    for (const rawLine of block.split(/\r?\n/)) {
        const line = rawLine.trimEnd();
        if (!line.trim()) continue;
        const itemMatch = line.match(/^\s*-\s+(.*)$/);
        if (itemMatch && currentKey) {
            if (!Array.isArray(data[currentKey])) data[currentKey] = [];
            data[currentKey].push(stripQuotes(itemMatch[1]));
            continue;
        }
        const fieldMatch = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
        if (fieldMatch) {
            currentKey = fieldMatch[1];
            const value = stripQuotes(fieldMatch[2]);
            data[currentKey] = value === '' ? [] : value;
        }
    }
    return data;
}

function extractSection(markdown, heading) {
    const escaped = heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const match = markdown.match(new RegExp(`## ${escaped}\\n([\\s\\S]*?)(\\n## |$)`));
    return match ? match[1].trim() : '';
}

function truncateText(text, max = 500) {
    const compact = String(text || '').replace(/\s+/g, ' ').trim();
    return compact.length > max ? `${compact.slice(0, max)}...` : compact;
}

function projectFiles(projectsDir = DEFAULT_PROJECTS_DIR) {
    if (!fs.existsSync(projectsDir)) return [];
    return fs.readdirSync(projectsDir)
        .filter(name => name.endsWith('.md') && name !== '_project_template.md')
        .map(name => path.join(projectsDir, name));
}

function readProjectProfile(file) {
    const markdown = fs.readFileSync(file, 'utf8');
    const metadata = parseYamlBlock(getYamlBlock(markdown));
    const sensitivity = metadata.sensitivity || 'confidential';
    const oneLine = extractSection(markdown, 'One-line Summary');
    const currentView = extractSection(markdown, 'Current View');
    const technologyRoute = extractSection(markdown, 'Technology Route');
    const commercialPath = extractSection(markdown, 'Commercial / Clinical Path');

    return {
        file,
        metadata,
        sensitivity,
        oneLine: truncateText(oneLine, 260),
        currentView: sensitivity === 'highly_sensitive' ? '' : truncateText(currentView, 520),
        technologyRoute: sensitivity === 'public_like' ? truncateText(technologyRoute, 360) : '',
        commercialPath: sensitivity === 'public_like' ? truncateText(commercialPath, 360) : '',
    };
}

function asEvents(payload) {
    if (Array.isArray(payload)) return payload;
    if (payload && Array.isArray(payload.events)) return payload.events;
    throw new Error('events file must be an array or an object with an events array');
}

function readEvents(eventsFile, maxEvents = 40) {
    const payload = JSON.parse(fs.readFileSync(eventsFile, 'utf8'));
    return asEvents(payload)
        .slice()
        .sort((a, b) => (b.importanceScore || 0) - (a.importanceScore || 0))
        .slice(0, maxEvents);
}

function normalizeList(value) {
    if (Array.isArray(value)) return value.map(String).filter(Boolean);
    if (!value) return [];
    return [String(value)];
}

function lowerSet(values) {
    return new Set(normalizeList(values).map(value => value.toLowerCase()));
}

function intersect(a, b) {
    const right = lowerSet(b);
    return normalizeList(a).filter(value => right.has(value.toLowerCase()));
}

function projectSearchText(project) {
    const metadata = project.metadata;
    return [
        metadata.projectName,
        metadata.investmentThesis,
        ...normalizeList(metadata.coreClaims),
        ...normalizeList(metadata.risks),
        project.oneLine,
    ].join(' ').toLowerCase();
}

function candidateMatches(events, projects) {
    const rows = [];
    for (const project of projects) {
        const metadata = project.metadata;
        const text = projectSearchText(project);
        for (const event of events) {
            const routeMatches = intersect(event.technologyRoutes, metadata.technologyRoutes);
            const indicationMatches = intersect(event.indications, metadata.indications);
            const companyMatches = normalizeList(event.companies).filter(company => text.includes(company.toLowerCase()));
            const titleHit = normalizeList(metadata.technologyRoutes)
                .some(route => `${event.title || ''} ${event.summary || ''}`.toLowerCase().includes(route.toLowerCase()));
            const score = routeMatches.length * 3 + indicationMatches.length * 2 + companyMatches.length * 4 + (titleHit ? 1 : 0);
            if (score > 0) {
                rows.push({
                    projectName: metadata.projectName || path.basename(project.file, '.md'),
                    sensitivity: project.sensitivity,
                    eventId: event.id,
                    eventTitle: event.title,
                    importanceScore: event.importanceScore || 0,
                    investmentSignal: event.investmentSignal || 'watch',
                    matchScore: score,
                    routeMatches,
                    indicationMatches,
                    companyMatches,
                });
            }
        }
    }
    return rows.sort((a, b) => b.matchScore - a.matchScore || b.importanceScore - a.importanceScore);
}

function mdEscape(value) {
    return String(value || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}

function renderList(values) {
    const list = normalizeList(values);
    return list.length ? list.join(', ') : 'none';
}

function renderMatchingContext({ eventsFile, projectsDir = DEFAULT_PROJECTS_DIR, maxEvents = 40 }) {
    const events = readEvents(eventsFile, maxEvents);
    const projects = projectFiles(projectsDir).map(readProjectProfile);
    const matches = candidateMatches(events, projects);
    const date = path.basename(eventsFile, '.json');

    const lines = [];
    lines.push(`# Local Matching Context - ${date}`);
    lines.push('');
    lines.push('```yaml');
    lines.push(`date: "${date}"`);
    lines.push(`externalEventsFile: "${path.relative(process.cwd(), eventsFile)}"`);
    lines.push(`projectsDir: "${path.relative(process.cwd(), projectsDir)}"`);
    lines.push('generatedBy: "scripts/prepare_matching_context.js"');
    lines.push('aiApiCalled: false');
    lines.push('bpOrInterviewFilesRead: false');
    lines.push('```');
    lines.push('');
    lines.push('## Safety Boundary');
    lines.push('');
    lines.push('- This file is a local Codex input packet, not an AI-generated investment conclusion.');
    lines.push('- It reads only `external_events/*.json` and Markdown project profiles under `knowledge_base/projects/`.');
    lines.push('- It does not read `knowledge_base/bp_notes/`, `knowledge_base/interviews/`, or meeting-note files.');
    lines.push('- `highly_sensitive` projects include only metadata and one-line summary fields.');
    lines.push('');
    lines.push('## External Events Reviewed');
    lines.push('');
    lines.push('| Event | Track | Importance | Signal | Companies | Routes | Sources |');
    lines.push('|---|---|---:|---|---|---|---:|');
    for (const event of events) {
        lines.push(`| ${mdEscape(event.title)} | ${mdEscape(event.track)} | ${event.importanceScore || 0} | ${mdEscape(event.investmentSignal)} | ${mdEscape(renderList(event.companies))} | ${mdEscape(renderList(event.technologyRoutes))} | ${normalizeList(event.sources).length} |`);
    }
    lines.push('');
    lines.push('## Project Profile Summaries');
    for (const project of projects) {
        const metadata = project.metadata;
        lines.push('');
        lines.push(`### ${metadata.projectName || path.basename(project.file, '.md')}`);
        lines.push('');
        lines.push(`- File: \`${path.relative(process.cwd(), project.file)}\``);
        lines.push(`- Sensitivity: \`${project.sensitivity}\``);
        lines.push(`- Status / stage: ${metadata.status || 'unknown'} / ${metadata.stage || 'unknown'}`);
        lines.push(`- Technology routes: ${renderList(metadata.technologyRoutes)}`);
        lines.push(`- Indications: ${renderList(metadata.indications)}`);
        lines.push(`- Investment thesis: ${metadata.investmentThesis || 'none'}`);
        if (project.oneLine) lines.push(`- One-line summary: ${project.oneLine}`);
        if (project.currentView) lines.push(`- Current view: ${project.currentView}`);
        if (project.technologyRoute) lines.push(`- Technology route notes: ${project.technologyRoute}`);
        if (project.commercialPath) lines.push(`- Commercial / clinical path notes: ${project.commercialPath}`);
    }
    lines.push('');
    lines.push('## Heuristic Candidate Matches');
    lines.push('');
    lines.push('| Project | Event | Match Score | Importance | Matched Routes | Matched Indications | Matched Companies | Needs Human Confirmation |');
    lines.push('|---|---|---:|---:|---|---|---|---|');
    for (const match of matches) {
        lines.push(`| ${mdEscape(match.projectName)} | ${mdEscape(match.eventTitle)} | ${match.matchScore} | ${match.importanceScore} | ${mdEscape(renderList(match.routeMatches))} | ${mdEscape(renderList(match.indicationMatches))} | ${mdEscape(renderList(match.companyMatches))} | yes |`);
    }
    if (matches.length === 0) {
        lines.push('| none | none | 0 | 0 | none | none | none | yes |');
    }
    lines.push('');
    lines.push('## Codex Analysis Prompt');
    lines.push('');
    lines.push('Use the events and project summaries above to write a deal matching report with: external event summary, affected projects, match strength, impact direction, risk changes, next interview questions, recommended actions, and human confirmation status. Do not read BP, interview, or meeting-note files unless the user explicitly asks.');
    lines.push('');
    return lines.join('\n');
}

function defaultEventsFile(date) {
    if (!date) throw new Error('missing --date or --events');
    return path.join(process.cwd(), 'external_events', `${date}.json`);
}

function main() {
    const args = parseArgs();
    if (args.help) {
        console.log(usage());
        return;
    }
    const eventsFile = path.resolve(args.eventsFile || defaultEventsFile(args.date));
    const date = args.date || path.basename(eventsFile, '.json');
    const projectsDir = path.resolve(args.projectsDir || DEFAULT_PROJECTS_DIR);
    const outFile = path.resolve(args.outFile || path.join(DEFAULT_REPORTS_DIR, `${date}_context.md`));
    const markdown = renderMatchingContext({
        eventsFile,
        projectsDir,
        maxEvents: Number.isInteger(args.maxEvents) ? args.maxEvents : 40,
    });
    fs.mkdirSync(path.dirname(outFile), { recursive: true });
    fs.writeFileSync(outFile, markdown);
    console.log(`✅ Matching context written: ${path.relative(process.cwd(), outFile)}`);
}

if (require.main === module) {
    try {
        main();
    } catch (err) {
        console.error(`❌ ${err.message}`);
        process.exit(1);
    }
}

module.exports = {
    parseYamlBlock,
    readProjectProfile,
    candidateMatches,
    renderMatchingContext,
};
