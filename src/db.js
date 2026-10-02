const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const databaseUrl = process.env.DATABASE_URL;

function resolveDatabasePath() {
  const defaultPath = path.join(__dirname, '..', 'data.db');

  if (!databaseUrl) {
    return defaultPath;
  }

  if (databaseUrl.startsWith('file:')) {
    const filePath = databaseUrl.slice(5);

    if (!path.isAbsolute(filePath)) {
      return path.resolve(__dirname, '..', filePath);
    }

    return filePath;
  }

  if (
    databaseUrl.startsWith('postgres://') ||
    databaseUrl.startsWith('postgresql://') ||
    databaseUrl.startsWith('mysql://') ||
    databaseUrl.startsWith('mysql2://')
  ) {
    console.warn(
      'DATABASE_URL looks like a server database connection, but this project uses SQLite (better-sqlite3). Falling back to ./data.db for local persistence.'
    );
    return defaultPath;
  }

  return path.resolve(__dirname, '..', databaseUrl);
}

const db = new Database(resolveDatabasePath());

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

const userColumns = db.prepare('PRAGMA table_info(users)').all();
const userColumnNames = new Set(userColumns.map((column) => column.name));
const requiredUserColumns = [
  ['bio', 'TEXT NOT NULL DEFAULT ""'],
  ['location', 'TEXT NOT NULL DEFAULT ""'],
  ['field', 'TEXT NOT NULL DEFAULT ""'],
  ['experience_level', 'TEXT NOT NULL DEFAULT ""'],
  ['education', 'TEXT NOT NULL DEFAULT ""'],
  ['certifications', 'TEXT NOT NULL DEFAULT ""'],
  ['github_url', 'TEXT'],
  ['linkedin_url', 'TEXT'],
  ['website_url', 'TEXT'],
];

for (const [columnName, columnDefinition] of requiredUserColumns) {
  if (!userColumnNames.has(columnName)) {
    db.exec(`ALTER TABLE users ADD COLUMN ${columnName} ${columnDefinition}`);
  }
}

const opportunityColumns = db.prepare('PRAGMA table_info(opportunities)').all();
const opportunityColumnNames = new Set(opportunityColumns.map((column) => column.name));
if (!opportunityColumnNames.has('posted_by_user_id')) {
  db.exec('ALTER TABLE opportunities ADD COLUMN posted_by_user_id TEXT REFERENCES users(id) ON DELETE SET NULL');
}

const messageTable = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'messages'").get();
if (!messageTable) {
  db.exec(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY,
      from_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      to_user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      read_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX idx_messages_thread ON messages(from_user_id, to_user_id, created_at);
    CREATE INDEX idx_messages_recipient ON messages(to_user_id, created_at);
  `);
}

const originalTransaction = db.transaction.bind(db);

function transaction(fn) {
  return originalTransaction(fn);
}

function one(sql, params = []) {
  return db.prepare(sql).get(...params);
}

function many(sql, params = []) {
  return db.prepare(sql).all(...params);
}

function run(sql, params = []) {
  return db.prepare(sql).run(...params);
}

db.db = db;
db.transaction = transaction;
db.one = one;
db.many = many;
db.run = run;

module.exports = db;