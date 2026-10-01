const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const databaseUrl = process.env.DATABASE_URL;

function resolveDatabasePath() {
  if (!databaseUrl) {
    return path.join(__dirname, '..', 'data.db');
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
    throw new Error(
      'DATABASE_URL is a server database connection URL, but this project is using better-sqlite3. Set DATABASE_URL to a SQLite file path such as file:./data.db.'
    );
  }

  return path.resolve(__dirname, '..', databaseUrl);
}

const db = new Database(resolveDatabasePath());

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

const schemaPath = path.join(__dirname, 'schema.sql');
const schemaSql = fs.readFileSync(schemaPath, 'utf8');
db.exec(schemaSql);

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