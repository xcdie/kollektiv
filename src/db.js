const fs = require('fs');
const path = require('path');
const { Worker } = require('node:worker_threads');
const Database = require('better-sqlite3');

const databaseUrl = process.env.DATABASE_URL;

function isPostgresUrl(value) {
  return typeof value === 'string' && /^postgres(?:ql)?:\/\//i.test(value);
}

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

  if (isPostgresUrl(databaseUrl)) {
    return null;
  }

  return path.resolve(__dirname, '..', databaseUrl);
}

function normalizeSqlForPostgres(rawSql) {
  if (!rawSql || typeof rawSql !== 'string') {
    return rawSql;
  }

  let sql = rawSql.trim();

  if (!sql) {
    return sql;
  }

  if (/^\s*PRAGMA\b/i.test(sql)) {
    return '';
  }

  sql = sql.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP');
  sql = sql.replace(/datetime\s*\(\s*'now'\s*,\s*\?\s*\)/gi, 'CURRENT_TIMESTAMP + (?::interval)');

  if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+/i.test(sql)) {
    sql = sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+/i, 'INSERT INTO ');
    if (!/\s+ON\s+CONFLICT\s+DO\s+NOTHING\s*$/i.test(sql)) {
      sql += ' ON CONFLICT DO NOTHING';
    }
  }

  let out = '';
  let inSingle = false;
  let inDouble = false;
  let parameterIndex = 0;

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];

    if (char === "'" && !inDouble) {
      inSingle = !inSingle;
      out += char;
      continue;
    }

    if (char === '"' && !inSingle) {
      inDouble = !inDouble;
      out += char;
      continue;
    }

    if (char === '?' && !inSingle && !inDouble) {
      parameterIndex += 1;
      out += `$${parameterIndex}`;
      continue;
    }

    out += char;
  }

  return out;
}

function createSqliteDb() {
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

  return db;
}

function createPostgresDb(connectionString) {
  const worker = new Worker(
    `
      const { parentPort, workerData } = require('node:worker_threads');
      const fs = require('fs');
      const path = require('path');
      const postgres = require('postgres');

      function normalizeSql(rawSql) {
        if (!rawSql || typeof rawSql !== 'string') {
          return rawSql;
        }

        let sql = rawSql.trim();

        if (!sql) {
          return sql;
        }

        if (/^\s*PRAGMA\b/i.test(sql)) {
          return '';
        }

        sql = sql.replace(/datetime\s*\(\s*'now'\s*\)/gi, 'CURRENT_TIMESTAMP');
        sql = sql.replace(/datetime\s*\(\s*'now'\s*,\s*\?\s*\)/gi, 'CURRENT_TIMESTAMP + (?::interval)');

        if (/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+/i.test(sql)) {
          sql = sql.replace(/^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+/i, 'INSERT INTO ');
          if (!/\s+ON\s+CONFLICT\s+DO\s+NOTHING\s*$/i.test(sql)) {
            sql += ' ON CONFLICT DO NOTHING';
          }
        }

        let out = '';
        let inSingle = false;
        let inDouble = false;
        let parameterIndex = 0;

        for (let i = 0; i < sql.length; i += 1) {
          const char = sql[i];

          if (char === "'" && !inDouble) {
            inSingle = !inSingle;
            out += char;
            continue;
          }

          if (char === '"' && !inSingle) {
            inDouble = !inDouble;
            out += char;
            continue;
          }

          if (char === '?' && !inSingle && !inDouble) {
            parameterIndex += 1;
            out += '$' + parameterIndex;
            continue;
          }

          out += char;
        }

        return out;
      }

      const sql = postgres(workerData.connectionString, {
        ssl: workerData.sslMode,
        max: 10,
        idle_timeout: 20,
        connection: { application_name: 'kollektiv' },
      });

      const schemaPath = workerData.schemaPath;
      const schemaSql = fs.readFileSync(schemaPath, 'utf8');
      const statements = schemaSql
        .split(';')
        .map((statement) => normalizeSql(statement))
        .filter((statement) => statement && statement.trim());

      (async () => {
        for (const statement of statements) {
          await sql.unsafe(statement);
        }

        parentPort.on('message', async (message) => {
          const { id, mode, statement, params = [], waitBuffer } = message;

          try {
            const normalized = normalizeSql(statement);
            const rows = normalized && normalized.trim() ? await sql.unsafe(normalized, params) : [];

            let result = null;

            if (mode === 'all') {
              result = Array.isArray(rows) ? rows : [];
            } else if (mode === 'get') {
              result = Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
            } else if (mode === 'run') {
              const count = rows && typeof rows.count === 'number' ? rows.count : 0;
              result = { changes: count, lastInsertRowid: null };
            }

            parentPort.postMessage({ id, ok: true, data: result });
          } catch (error) {
            parentPort.postMessage({
              id,
              ok: false,
              error: { message: error.message, stack: error.stack },
            });
          } finally {
            if (waitBuffer) {
              const view = new Int32Array(waitBuffer);
              Atomics.store(view, 0, 1);
              Atomics.notify(view, 0);
            }
          }
        });
      })();
    `,
    {
      eval: true,
      workerData: {
        connectionString,
        schemaPath: path.join(__dirname, 'schema.sql'),
        sslMode: /^postgresql/i.test(connectionString) ? 'require' : 'prefer',
      },
    }
  );

  const requests = new Map();
  let requestId = 0;

  worker.on('message', (message) => {
    const request = requests.get(message.id);
    if (!request) {
      return;
    }

    request.result = message;
    requests.delete(message.id);
  });

  function execute(mode, statement, params = []) {
    const id = requestId += 1;
    const waitBuffer = new SharedArrayBuffer(4);
    const waitView = new Int32Array(waitBuffer);
    const request = { result: null };

    requests.set(id, request);
    worker.postMessage({ id, mode, statement, params, waitBuffer }, [waitBuffer]);

    while (request.result === null) {
      Atomics.wait(waitView, 0, 0);
    }

    if (!request.result.ok) {
      const error = new Error(request.result.error?.message || 'Database query failed.');
      error.stack = request.result.error?.stack || error.stack;
      throw error;
    }

    return request.result.data;
  }

  function prepare(statement) {
    return {
      get(...params) {
        return execute('get', statement, params);
      },
      all(...params) {
        return execute('all', statement, params);
      },
      run(...params) {
        return execute('run', statement, params);
      },
    };
  }

  const db = {
    prepare,
    transaction(fn) {
      return fn(db);
    },
    one(statement, params = []) {
      return prepare(statement).get(...params);
    },
    many(statement, params = []) {
      return prepare(statement).all(...params);
    },
    run(statement, params = []) {
      return prepare(statement).run(...params);
    },
  };

  db.db = db;
  return db;
}

const db = isPostgresUrl(databaseUrl)
  ? createPostgresDb(databaseUrl)
  : createSqliteDb();

module.exports = db;