const path = require('path');
const Database = require('better-sqlite3');

const databaseUrl = process.env.DATABASE_URL;

function resolveDatabasePath() {
  if (!databaseUrl) {
    return path.join(__dirname, '..', 'data.db');
  }

  if (databaseUrl.startsWith('file:')) {
    return databaseUrl.slice(5);
  }

  return databaseUrl;
}

const db = new Database(resolveDatabasePath());

db.pragma('foreign_keys = ON');
db.pragma('journal_mode = WAL');

function transaction(fn) {
  return db.transaction(fn)();
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

module.exports = {
  db,
  transaction,
  one,
  many,
  run
};