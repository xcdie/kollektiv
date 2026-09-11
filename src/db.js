const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

const DB_FILE = process.env.DATABASE_FILE || path.join(__dirname, '..', 'data.db');

// Ensure parent data storage folder structures exist explicitly before initializing connection
const dbDir = path.dirname(DB_FILE);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

const db = new Database(DB_FILE);

// Set foundational performance parameters safely
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// Read and build the core database structural baseline safely
const schemaPath = path.join(__dirname, 'schema.sql');
if (fs.existsSync(schemaPath)) {
  const schema = fs.readFileSync(schemaPath, 'utf8');
  db.exec(schema);
}

// Fixed Schema Migrations Map - Whitelisted structural tables and parameter keys
const schemaMigrations = {
  users: [
    ['avatar_url', 'TEXT'],
    ['goal', "TEXT NOT NULL DEFAULT ''"],
    ['target_role', "TEXT NOT NULL DEFAULT ''"],
    ['work_pref', "TEXT NOT NULL DEFAULT 'Remote'"],
    ['availability', "TEXT NOT NULL DEFAULT 'Open'"],
    ['is_guide', 'INTEGER NOT NULL DEFAULT 0'],
    ['guide_role', 'TEXT'],
    ['guide_focus', 'TEXT'],
  ],
  threads: [['image_url', 'TEXT']],
  replies: [['is_helpful', 'INTEGER NOT NULL DEFAULT 0']],
};

// SECURITY FIX: Strict structural lookup validation via predefined configuration mapping.
// PRAGMA dynamic parameters cannot accept typical bound variables (?, $val).
// Enforcing a strict static key match string validation prevents execution interception vectors.
const validTableNames = Object.keys(schemaMigrations);

for (const tableName of validTableNames) {
  const columns = schemaMigrations[tableName];
  
  // Safe table info lookup using verified table string whitelist
  const existingColumns = db.prepare(`PRAGMA table_info("${tableName}")`)
    .all()
    .map((column) => column.name);
    
  for (const [name, definition] of columns) {
    if (!existingColumns.includes(name)) {
      // Validate column properties to ensure safe execution parameters
      if (/^[a-z0-9_]+$/i.test(name)) {
        db.exec(`ALTER TABLE "${tableName}" ADD COLUMN "${name}" ${definition};`);
      } else {
        throw new Error(`Security Exception: Blocked dangerous dynamic migration string properties: ${name}`);
      }
    }
  }
}

module.exports = db;
