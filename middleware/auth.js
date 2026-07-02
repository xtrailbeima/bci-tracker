const { SESSION_COOKIE, getUserForToken } = require('../services/auth');

function parseCookies(header) {
    const cookies = {};
    for (const part of String(header || '').split(';')) {
        const [rawKey, ...rawValue] = part.trim().split('=');
        if (!rawKey) continue;
        cookies[rawKey] = decodeURIComponent(rawValue.join('=') || '');
    }
    return cookies;
}

function cookieOptions(req) {
    const secure = process.env.AUTH_COOKIE_SECURE === '1'
        || req.secure
        || req.headers['x-forwarded-proto'] === 'https';
    return [
        'Path=/',
        'HttpOnly',
        'SameSite=Lax',
        `Max-Age=${14 * 86400}`,
        secure ? 'Secure' : '',
    ].filter(Boolean).join('; ');
}

function clearCookieOptions(req) {
    return cookieOptions(req).replace(/Max-Age=\d+/, 'Max-Age=0');
}

function setSessionCookie(req, res, token) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=${encodeURIComponent(token)}; ${cookieOptions(req)}`);
}

function clearSessionCookie(req, res) {
    res.setHeader('Set-Cookie', `${SESSION_COOKIE}=; ${clearCookieOptions(req)}`);
}

function attachUser(req, res, next) {
    const cookies = parseCookies(req.headers.cookie);
    req.sessionToken = cookies[SESSION_COOKIE] || '';
    req.user = getUserForToken(req.sessionToken);
    next();
}

function requireAuth(req, res, next) {
    if (!req.user) {
        return res.status(401).json({ error: 'AUTH_REQUIRED', message: '请先登录' });
    }
    next();
}

function requireRole(...roles) {
    const allowed = new Set(roles.flat());
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({ error: 'AUTH_REQUIRED', message: '请先登录' });
        }
        if (!allowed.has(req.user.role)) {
            return res.status(403).json({ error: 'FORBIDDEN', message: '当前账号权限不足' });
        }
        next();
    };
}

module.exports = {
    attachUser,
    clearSessionCookie,
    parseCookies,
    requireAuth,
    requireRole,
    setSessionCookie,
};
