const Database = require('better-sqlite3');
const path = require('path');

const DB_PATH = path.join(__dirname, 'bci-tracker.db');
const db = new Database(DB_PATH);

// Enable WAL mode for better concurrent read performance
db.pragma('journal_mode = WAL');

// ─── Schema ───────────────────────────────────────────────

db.exec(`
  CREATE TABLE IF NOT EXISTS articles (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    url         TEXT UNIQUE NOT NULL,
    title       TEXT NOT NULL,
    titleZh     TEXT DEFAULT '',
    authors     TEXT DEFAULT '',
    source      TEXT DEFAULT '',
    date        TEXT DEFAULT '',
    abstract    TEXT DEFAULT '',
    category    TEXT DEFAULT '',
    provider    TEXT DEFAULT '',
    importance  INTEGER DEFAULT 0,
    importanceLevel TEXT DEFAULT 'low',
    fetchedAt   TEXT DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_articles_category ON articles(category);
  CREATE INDEX IF NOT EXISTS idx_articles_provider ON articles(provider);
  CREATE INDEX IF NOT EXISTS idx_articles_date     ON articles(date DESC);
  CREATE INDEX IF NOT EXISTS idx_articles_importance ON articles(importance DESC);
`);

// ─── Prepared Statements ──────────────────────────────────

const upsertStmt = db.prepare(`
  INSERT INTO articles (url, title, titleZh, authors, source, date, abstract, category, provider, importance, importanceLevel, fetchedAt)
  VALUES (@url, @title, @titleZh, @authors, @source, @date, @abstract, @category, @provider, @importance, @importanceLevel, datetime('now'))
  ON CONFLICT(url) DO UPDATE SET
    title       = excluded.title,
    titleZh     = excluded.titleZh,
    authors     = excluded.authors,
    source      = excluded.source,
    date        = excluded.date,
    abstract    = excluded.abstract,
    importance  = excluded.importance,
    importanceLevel = excluded.importanceLevel
`);

// ─── Public API ───────────────────────────────────────────

function upsertArticle(item) {
    return upsertStmt.run({
        url: item.url || '',
        title: item.title || '',
        titleZh: item.titleZh || '',
        authors: item.authors || '',
        source: item.source || '',
        date: item.date || '',
        abstract: item.abstract || '',
        category: item.category || '',
        provider: item.provider || '',
        importance: item.importance || 0,
        importanceLevel: item.importanceLevel || 'low',
    });
}

function upsertMany(items) {
    const tx = db.transaction((list) => {
        for (const item of list) {
            if (item.url) upsertArticle(item);
        }
    });
    tx(items);
}

function searchArticles({ query, category, source, sort, page, limit } = {}) {
    const conditions = [];
    const params = {};

    if (category && category !== 'all') {
        conditions.push('category = @category');
        params.category = category;
    }

    if (source) {
        conditions.push('provider = @source');
        params.source = source;
    }

    if (query) {
        conditions.push('(title LIKE @q OR titleZh LIKE @q OR abstract LIKE @q OR authors LIKE @q)');
        params.q = `%${query}%`;
    }

    const where = conditions.length > 0 ? 'WHERE ' + conditions.join(' AND ') : '';
    const orderBy = sort === 'date'
        ? 'ORDER BY date DESC, importance DESC'
        : 'ORDER BY importance DESC, date DESC';

    const pg = Math.max(1, parseInt(page) || 1);
    const lim = Math.min(200, Math.max(1, parseInt(limit) || 50));
    const offset = (pg - 1) * lim;

    const countSQL = `SELECT COUNT(*) as total FROM articles ${where}`;
    const dataSQL = `SELECT * FROM articles ${where} ${orderBy} LIMIT @limit OFFSET @offset`;

    const total = db.prepare(countSQL).get({ ...params }).total;
    const items = db.prepare(dataSQL).all({ ...params, limit: lim, offset });

    return { items, total, page: pg, limit: lim, hasMore: offset + lim < total };
}

function getStats() {
    const total = db.prepare('SELECT COUNT(*) as count FROM articles').get().count;
    const journals = db.prepare("SELECT COUNT(*) as count FROM articles WHERE category = 'journal'").get().count;
    const preprints = db.prepare("SELECT COUNT(*) as count FROM articles WHERE category = 'preprint'").get().count;
    const news = db.prepare("SELECT COUNT(*) as count FROM articles WHERE category = 'news'").get().count;
    return { total, journals, preprints, news };
}

function getAllSources() {
    return db.prepare('SELECT DISTINCT provider FROM articles WHERE provider != "" ORDER BY provider').all()
        .map(r => r.provider);
}

module.exports = { upsertArticle, upsertMany, searchArticles, getStats, getAllSources };
