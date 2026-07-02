function cleanJsonText(rawText) {
    let cleaned = String(rawText || '')
        .replace(/```json\n?/g, '')
        .replace(/```\n?/g, '')
        .trim();

    cleaned = cleaned.replace(/(\"url\":\s*\"[^\"\n]+)\n/g, '$1",\n');
    cleaned = cleaned.replace(/(\"[^\"]+\":\s*\"[^\"\n]+)(\n\s*(\}|\]))/g, '$1"$2');
    cleaned = cleaned.replace(/[\u0000-\u0009\u000B-\u001F]+/g, '');

    const jsonStart = cleaned.indexOf('{');
    const jsonEnd = cleaned.lastIndexOf('}');
    if (jsonStart !== -1 && jsonEnd !== -1) {
        cleaned = cleaned.substring(jsonStart, jsonEnd + 1);
    }

    return cleaned;
}

function parseAIJsonResponse(rawText, {
    provider = 'AI',
    errorCode = 'AI_JSON_PARSE_FAILED',
    userMessage = `${provider} 返回数据解析失败`,
} = {}) {
    try {
        return JSON.parse(rawText);
    } catch {
        // Repair below.
    }

    const cleaned = cleanJsonText(rawText);
    try {
        return JSON.parse(cleaned);
    } catch (repairErr) {
        console.error(`${provider} JSON parse failed: ${repairErr.message}; rawLength=${String(rawText || '').length}`);
        const err = new Error(userMessage);
        err.code = errorCode;
        err.provider = provider;
        throw err;
    }
}

module.exports = {
    cleanJsonText,
    parseAIJsonResponse,
};
