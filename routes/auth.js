const express = require('express');

const { rateLimit } = require('../middleware/security');
const { clearSessionCookie, requireAuth, requireRole, setSessionCookie } = require('../middleware/auth');
const {
    ROLES,
    authenticate,
    createLoginSession,
    createPasswordRecord,
    publicUser,
    revokeToken,
} = require('../services/auth');
const {
    countUsers,
    createUser,
    getUserByEmail,
    getUserById,
    listAuditLogs,
    listUsers,
    logAudit,
    updateUser,
} = require('../db');

const router = express.Router();

function cleanEmail(value) {
    return String(value || '').trim().toLowerCase();
}

function cleanName(value) {
    return String(value || '').trim().slice(0, 100).replace(/[<>"'&]/g, '');
}

function cleanRole(value) {
    return ROLES.includes(value) ? value : 'reader';
}

function audit(req, action, target, metadata) {
    logAudit({ user: req.user, action, target, metadata, ip: req.ip });
}

router.get('/me', (req, res) => {
    if (!req.user) {
        return res.status(401).json({
            error: 'AUTH_REQUIRED',
            message: '请先登录',
            setupRequired: countUsers() === 0,
        });
    }
    res.json({ user: req.user });
});

router.post('/login', rateLimit(60000, 8), async (req, res) => {
    const { email, password } = req.body || {};
    if (!email || !password) {
        return res.status(400).json({ error: 'EMAIL_PASSWORD_REQUIRED', message: '请输入邮箱和密码' });
    }

    const user = await authenticate(email, password);
    if (!user) {
        logAudit({
            user: null,
            action: 'auth.login_failed',
            target: cleanEmail(email),
            ip: req.ip,
        });
        return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: '邮箱或密码不正确' });
    }

    const token = createLoginSession(user);
    setSessionCookie(req, res, token);
    logAudit({
        user: publicUser(user),
        action: 'auth.login',
        target: user.email,
        ip: req.ip,
    });
    res.json({ user: publicUser(user) });
});

router.post('/logout', requireAuth, (req, res) => {
    revokeToken(req.sessionToken);
    clearSessionCookie(req, res);
    audit(req, 'auth.logout', req.user.email);
    res.json({ ok: true });
});

router.post('/change-password', requireAuth, (req, res) => {
    try {
        const { password } = req.body || {};
        const user = getUserById(req.user.id);
        if (!user) return res.status(404).json({ error: 'USER_NOT_FOUND', message: '用户不存在' });
        updateUser(req.user.id, createPasswordRecord(password));
        audit(req, 'auth.change_password', req.user.email);
        res.json({ ok: true });
    } catch (err) {
        res.status(400).json({ error: 'PASSWORD_INVALID', message: err.message });
    }
});

router.get('/users', requireRole('owner'), (req, res) => {
    res.json({ users: listUsers() });
});

router.post('/users', requireRole('owner'), (req, res) => {
    try {
        const { email, name, role, password } = req.body || {};
        const safeEmail = cleanEmail(email);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(safeEmail)) {
            return res.status(400).json({ error: 'EMAIL_INVALID', message: '请提供有效邮箱' });
        }
        if (getUserByEmail(safeEmail)) {
            return res.status(409).json({ error: 'USER_EXISTS', message: '该邮箱已存在' });
        }
        const passwordRecord = createPasswordRecord(password);
        const result = createUser({
            email: safeEmail,
            name: cleanName(name),
            role: cleanRole(role),
            ...passwordRecord,
        });
        audit(req, 'auth.create_user', safeEmail, { role: cleanRole(role) });
        const user = getUserById(result.lastInsertRowid);
        res.status(201).json({ user: publicUser(user) });
    } catch (err) {
        res.status(400).json({ error: 'USER_CREATE_FAILED', message: err.message });
    }
});

router.patch('/users/:id', requireRole('owner'), (req, res) => {
    try {
        const id = parseInt(req.params.id, 10);
        const current = getUserById(id);
        if (!current) return res.status(404).json({ error: 'USER_NOT_FOUND', message: '用户不存在' });

        const fields = {};
        if ('email' in req.body) fields.email = cleanEmail(req.body.email);
        if ('name' in req.body) fields.name = cleanName(req.body.name);
        if ('role' in req.body) fields.role = cleanRole(req.body.role);
        if ('active' in req.body) fields.active = Boolean(req.body.active);
        if (req.body.password) Object.assign(fields, createPasswordRecord(req.body.password));

        const updated = updateUser(id, fields);
        audit(req, 'auth.update_user', updated.email, {
            changedRole: 'role' in fields,
            changedActive: 'active' in fields,
            changedPassword: Boolean(req.body.password),
        });
        res.json({ user: publicUser(updated) });
    } catch (err) {
        res.status(400).json({ error: 'USER_UPDATE_FAILED', message: err.message });
    }
});

router.get('/audit', requireRole('owner'), (req, res) => {
    res.json({ logs: listAuditLogs({ limit: req.query.limit }) });
});

module.exports = router;
