#!/usr/bin/env node

const assert = require('assert');

const {
    assertHtmlContentType,
    isPrivateAddress,
    parseImportUrl,
    readLimitedText,
} = require('../services/import');

function rejectsUrl(url, message) {
    assert.throws(() => parseImportUrl(url), /URL|HTTP|内网|过长|本机/, message);
}

async function main() {
    rejectsUrl('file:///etc/passwd', 'rejects file protocol');
    rejectsUrl('ftp://example.com/a.html', 'rejects non-http protocol');
    rejectsUrl('http://localhost:4000', 'rejects localhost');
    rejectsUrl('http://127.0.0.1:4000', 'rejects IPv4 loopback');
    rejectsUrl('http://10.0.0.5/a.html', 'rejects private IPv4');
    rejectsUrl('http://172.16.0.1/a.html', 'rejects private IPv4 range');
    rejectsUrl('http://192.168.1.1/a.html', 'rejects private IPv4 range');
    rejectsUrl('http://[::1]/a.html', 'rejects IPv6 loopback');
    rejectsUrl('http://internal/a.html', 'rejects single-label internal host');

    assert.strictEqual(parseImportUrl('https://example.com/a.html').hostname, 'example.com');
    assert.strictEqual(isPrivateAddress('8.8.8.8'), false, 'allows public IPv4');
    assert.strictEqual(isPrivateAddress('127.0.0.1'), true, 'detects loopback');
    assert.doesNotThrow(() => assertHtmlContentType('text/html; charset=utf-8'), 'allows html');
    assert.doesNotThrow(() => assertHtmlContentType('application/xhtml+xml'), 'allows xhtml');
    assert.throws(() => assertHtmlContentType('application/pdf'), /HTML/, 'rejects non-html');

    const small = new Response('ok', { headers: { 'content-type': 'text/html' } });
    assert.strictEqual(await readLimitedText(small, 10), 'ok', 'reads small response');

    const large = new Response('01234567890', { headers: { 'content-type': 'text/html' } });
    await assert.rejects(() => readLimitedText(large, 10), /过大/, 'rejects oversized response');

    console.log('✅ import security test passed');
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
