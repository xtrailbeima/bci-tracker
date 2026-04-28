// ─── Security Headers ─────────────────────────────────────
function securityHeaders(req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    next();
}

// ─── Rate Limiter ─────────────────────────────────────────
const rateLimitMap = new Map();

function rateLimit(windowMs = 60000, maxRequests = 30) {
    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        const record = rateLimitMap.get(key) || { count: 0, resetAt: now + windowMs };
        if (now > record.resetAt) {
            record.count = 0;
            record.resetAt = now + windowMs;
        }
        record.count++;
        rateLimitMap.set(key, record);
        if (record.count > maxRequests) {
            return res.status(429).json({ error: 'Too many requests. Please try again later.' });
        }
        next();
    };
}

// Clean up rate limit map periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap) {
        if (now > record.resetAt) rateLimitMap.delete(key);
    }
}, 300000);

// ─── Global Error Handler ─────────────────────────────────
function errorHandler(err, req, res, next) {
    console.error('❌ Unhandled error:', err.message);
    res.status(err.status || 500).json({
        error: process.env.NODE_ENV === 'production' ? 'Internal server error' : err.message
    });
}

module.exports = { securityHeaders, rateLimit, errorHandler };
