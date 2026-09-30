const path = require('path');
const Database = require('better-sqlite3');

const databaseUrl = process.env.DATABASE_URL;

function resolveDatabasePath() {
  if (!databaseUrl) {
    return path.join(__dirname, '..', 'data.db');
  }

  if (databaseUrl.startsWith('file:')) {
    const filePath = databaseUrl.slice(5);

    // Resolve relative SQLite paths from the project root
    if (!path.isAbsolute(filePath)) {
      return path.resolve(__dirname, '..', filePath);
    }

    return filePath;
  }

  // better-sqlite3 requires a SQLite file path,
  // not a PostgreSQL/MySQL connection URL.
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