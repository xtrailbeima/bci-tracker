#!/usr/bin/env node

const pkg = require('../package.json');
const lock = require('../package-lock.json');

function assert(condition, message) {
    if (!condition) {
        console.error(`❌ ${message}`);
        process.exit(1);
    }
}

function lockPackageName(lockPath) {
    return lockPath.replace(/^node_modules\//, '').replace(/^(@[^/]+\/[^/]+).*$/, '$1').replace(/^([^/]+).*$/, '$1');
}

const allowScripts = pkg.allowScripts || {};
const installScriptPackages = Object.entries(lock.packages || {})
    .filter(([lockPath, meta]) => lockPath && meta.hasInstallScript)
    .map(([lockPath, meta]) => `${lockPackageName(lockPath)}@${meta.version}`)
    .sort();

const allowed = Object.entries(allowScripts)
    .filter(([, value]) => value === true || value === false)
    .map(([name]) => name)
    .sort();

for (const entry of installScriptPackages) {
    assert(
        Object.prototype.hasOwnProperty.call(allowScripts, entry),
        `install script package is not reviewed in package.json allowScripts: ${entry}`
    );
}

for (const entry of allowed) {
    assert(
        installScriptPackages.includes(entry),
        `allowScripts entry no longer matches package-lock install scripts: ${entry}`
    );
}

console.log(`✅ install script policy covers ${installScriptPackages.length} package(s)`);
