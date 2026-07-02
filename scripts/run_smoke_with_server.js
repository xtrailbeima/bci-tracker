#!/usr/bin/env node

const fs = require('fs');
const { spawn } = require('child_process');

const envFile = fs.existsSync('.env') ? parseEnvFile('.env') : {};
const port = process.env.PORT || envFile.PORT || '3000';
const host = process.env.HOST || envFile.HOST || '127.0.0.1';
const testHost = host === '0.0.0.0' || host === '::' ? '127.0.0.1' : host;
const baseUrl = process.env.TEST_URL || `http://${testHost}:${port}`;

function parseEnvFile(file) {
    const env = {};
    for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)\s*$/);
        if (!match) continue;
        env[match[1]] = match[2].replace(/^["']|["']$/g, '');
    }
    return env;
}

async function isReady() {
    try {
        const res = await fetch(`${baseUrl}/api/stats`, { signal: AbortSignal.timeout(1000) });
        return res.ok;
    } catch {
        return false;
    }
}

async function waitUntilReady(timeoutMs = 20000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        if (await isReady()) return;
        await new Promise(resolve => setTimeout(resolve, 500));
    }
    throw new Error(`Server did not become ready at ${baseUrl}`);
}

function runSmoke() {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, ['--env-file=.env', 'test/smoke.js'], {
            stdio: 'inherit',
            env: { ...process.env, TEST_URL: baseUrl, PORT: port },
        });
        child.on('exit', code => code === 0 ? resolve() : reject(new Error(`smoke exited ${code}`)));
        child.on('error', reject);
    });
}

async function stopServer(child) {
    if (!child || child.exitCode !== null) return;
    child.kill('SIGINT');
    await new Promise(resolve => child.once('exit', resolve));
}

async function main() {
    let server = null;
    const alreadyRunning = await isReady();
    if (!alreadyRunning) {
        server = spawn(process.execPath, ['--env-file=.env', 'server.js'], {
            stdio: ['ignore', 'inherit', 'inherit'],
            env: { ...process.env, HOST: host, PORT: port },
        });
        await waitUntilReady();
    }

    try {
        await runSmoke();
    } finally {
        await stopServer(server);
    }
}

main().catch(err => {
    console.error(`❌ ${err.message}`);
    process.exit(1);
});
