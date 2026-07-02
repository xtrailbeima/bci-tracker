#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { candidateMatches, renderMatchingContext } = require('./prepare_matching_context');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bci-matching-'));
const projectsDir = path.join(tmp, 'knowledge_base', 'projects');
const eventsDir = path.join(tmp, 'external_events');
fs.mkdirSync(projectsDir, { recursive: true });
fs.mkdirSync(eventsDir, { recursive: true });

const eventPayload = {
    generatedAt: '2026-07-02T00:00:00.000Z',
    events: [
        {
            id: 'evt-flex-electrode',
            date: '2026-07-02',
            track: 'research',
            eventType: 'paper',
            title: 'Flexible electrode material shows lower tissue response',
            summary: 'New flexible electrode results may matter for chronic invasive BCI stability.',
            companies: [],
            technologyRoutes: ['flexible electrode', 'invasive BCI'],
            indications: ['motor impairment'],
            investmentSignal: 'positive',
            importanceScore: 78,
            confidence: 0.8,
            sources: [{ title: 'Sample', url: 'https://example.com', provider: 'Example' }],
        },
    ],
};
const eventsFile = path.join(eventsDir, '2026-07-02.json');
fs.writeFileSync(eventsFile, JSON.stringify(eventPayload, null, 2));

fs.writeFileSync(path.join(projectsDir, 'public_project.md'), `# Project: Flexible Public Project

\`\`\`yaml
projectName: "Flexible Public Project"
status: "watch"
stage: "preclinical"
technologyRoutes:
  - "flexible electrode"
  - "invasive BCI"
indications:
  - "motor impairment"
coreClaims:
  - "stable chronic recording"
teamSignals:
  - "neural engineering founder"
risks:
  - "manufacturing yield unclear"
openQuestions:
  - "Do they have 6+ month data?"
investmentThesis: "Could benefit from flexible electrode validation."
lastUpdated: "2026-07-02"
sensitivity: "public_like"
\`\`\`

## One-line Summary

Public profile summary.

## Technology Route

Flexible electrode route notes.

## Current View

- Why continue: relevant to chronic safety.
`);

fs.writeFileSync(path.join(projectsDir, 'high_sensitive_project.md'), `# Project: Sensitive Project

\`\`\`yaml
projectName: "Sensitive Project"
status: "active_dd"
stage: "seed"
technologyRoutes:
  - "flexible electrode"
indications:
  - "motor impairment"
coreClaims:
  - "redacted profile claim"
teamSignals:
  - "redacted team signal"
risks:
  - "redacted risk"
openQuestions:
  - "redacted question"
investmentThesis: "Redacted thesis for matching only."
lastUpdated: "2026-07-02"
sensitivity: "highly_sensitive"
\`\`\`

## One-line Summary

Redacted one-line profile.

## Current View

SECRET_BP_DETAIL_SHOULD_NOT_LEAK

## Linked Notes

- BP notes: SECRET_LINK_SHOULD_NOT_LEAK
`);

const markdown = renderMatchingContext({
    eventsFile,
    projectsDir,
    maxEvents: 10,
});

assert(markdown.includes('Local Matching Context - 2026-07-02'), 'context title is present');
assert(markdown.includes('aiApiCalled: false'), 'context records that no AI API was called');
assert(markdown.includes('bpOrInterviewFilesRead: false'), 'context records BP/interview boundary');
assert(markdown.includes('Flexible Public Project'), 'public project included');
assert(markdown.includes('Sensitive Project'), 'highly sensitive project metadata included');
assert(markdown.includes('Redacted one-line profile'), 'highly sensitive one-line summary included');
assert(!markdown.includes('SECRET_BP_DETAIL_SHOULD_NOT_LEAK'), 'highly sensitive body detail is excluded');
assert(!markdown.includes('SECRET_LINK_SHOULD_NOT_LEAK'), 'linked note detail is excluded');

const matches = candidateMatches(eventPayload.events, [
    {
        file: 'public_project.md',
        sensitivity: 'public_like',
        oneLine: 'Public profile summary.',
        metadata: {
            projectName: 'Flexible Public Project',
            technologyRoutes: ['flexible electrode', 'invasive BCI'],
            indications: ['motor impairment'],
            coreClaims: [],
            risks: [],
        },
    },
]);
assert.strictEqual(matches.length, 1, 'matching project is detected');
assert(matches[0].matchScore >= 5, 'route and indication overlap produce a strong heuristic score');

console.log('✅ local matching context test passed');
