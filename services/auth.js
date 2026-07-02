const crypto = require('crypto');

const {
    countUsers,
    createUser,
    createSession,
    deleteExpiredSessions,
    deleteSession,
    getSessionByTokenHash,
    getUserByEmail,
    logAudit,
    touchSession,
    touchUserLogin,
} = require('../db');

const SESSION_COOKIE = 'bci_session';
const SESSION_DAYS = 14;
const ROLES = ['owner', 'operator', 'reader'];

function normalizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function isRole(role) {
    return ROLES.includes(role);
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
    return { passwordHash: hash, passwordSalt: salt };
}

function verifyPassword(password, user) {
    const { passwordHash } = hashPassword(password, user.passwordSalt);
    return crypto.timingSafeEqual(Buffer.from(passwordHash, 'hex'), Buffer.from(user.passwordHash, 'hex'));
}

function publicUser(user) {
    if (!user) return null;
    return {
        id: user.id || user.userId,
        email: user.email,
        name: user.name || '',
        role: user.role,
        active: Boolean(user.active),
    };
}

function sessionHash(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
}

function newSessionToken() {
    return crypto.randomBytes(32).toString('base64url');
}

function sessionExpiry() {
    return new Date(Date.now() + SESSION_DAYS * 86400000).toISOString();
}

function createLoginSession(user) {
    const token = newSessionToken();
    createSession({
        userId: user.id,
        tokenHash: sessionHash(token),
        expiresAt: sessionExpiry(),
    });
    touchUserLogin(user.id);
    return token;
}

async function authenticate(email, password) {
    const user = getUserByEmail(normalizeEmail(email));
    if (!user || !user.active) return null;
    if (!verifyPassword(password, user)) return null;
    return user;
}

function getUserForToken(token) {
    if (!token) return null;
    const row = getSessionByTokenHash(sessionHash(token));
    if (!row) return null;
    touchSession(row.tokenHash);
    return publicUser(row);
}

function revokeToken(token) {
    if (!token) return;
    deleteSession(sessionHash(token));
}

function createPasswordRecord(password) {
    if (String(password || '').length < 10) {
        throw new Error('密码至少需要 10 个字符');
    }
    return hashPassword(password);
}

function bootstrapOwnerFromEnv() {
    deleteExpiredSessions();
    if (countUsers() > 0) return false;

    const email = normalizeEmail(process.env.AUTH_OWNER_EMAIL || process.env.ADMIN_EMAIL);
    const password = process.env.AUTH_OWNER_PASSWORD || process.env.ADMIN_PASSWORD;
    if (!email || !password) {
        console.warn('⚠️ Auth enabled but no owner exists. Set AUTH_OWNER_EMAIL and AUTH_OWNER_PASSWORD to bootstrap the first owner.');
        return false;
    }

    const passwordRecord = createPasswordRecord(password);
    const result = createUser({
        email,
        name: process.env.AUTH_OWNER_NAME || 'Owner',
        role: 'owner',
        ...passwordRecord,
    });
    logAudit({
        user: { id: result.lastInsertRowid, email, role: 'owner' },
        action: 'auth.bootstrap_owner',
        target: email,
    });
    console.log(`🔐 Bootstrapped owner account: ${email}`);
    return true;
}

module.exports = {
    SESSION_COOKIE,
    ROLES,
    authenticate,
    bootstrapOwnerFromEnv,
    createLoginSession,
    createPasswordRecord,
    getUserForToken,
    isRole,
    publicUser,
    revokeToken,
};
