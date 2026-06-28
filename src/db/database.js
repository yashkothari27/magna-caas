const initSqlJs = require("sql.js");
const path      = require("path");
const fs        = require("fs");
const config    = require("../config");

const sqlWasmPath = require.resolve("sql.js/dist/sql-wasm.wasm");

const resolvedPath = path.resolve(config.dbPath);
const dbPath = process.env.VERCEL
  ? path.join("/tmp", path.basename(resolvedPath))
  : resolvedPath;

let SQL = null;
let db  = null;

const Database = {
  async init() {
    if (db) return db;

    SQL = await initSqlJs({
      locateFile: (file) => file === "sql-wasm.wasm" ? sqlWasmPath : file,
    });

    fs.mkdirSync(path.dirname(dbPath), { recursive: true });

    let data;
    try {
      if (fs.existsSync(dbPath)) {
        data = fs.readFileSync(dbPath);
      }
    } catch (err) {
      console.warn("Could not read database file:", err.message);
    }

    db = new SQL.Database(data);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id                    INTEGER PRIMARY KEY AUTOINCREMENT,
        email                 TEXT    UNIQUE NOT NULL,
        password_hash         TEXT    NOT NULL,
        full_name             TEXT    NOT NULL,
        role                  TEXT    NOT NULL DEFAULT 'pending',
        oem_tenant            TEXT    DEFAULT 'magna',
        wallet_address        TEXT    UNIQUE,
        encrypted_private_key TEXT,
        wallet_iv             TEXT,
        wallet_auth_tag       TEXT,
        created_at            TEXT    DEFAULT (datetime('now')),
        updated_at            TEXT    DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_users_email          ON users(email);
      CREATE INDEX IF NOT EXISTS idx_users_wallet_address ON users(wallet_address);
      CREATE INDEX IF NOT EXISTS idx_users_role           ON users(role);

      CREATE TABLE IF NOT EXISTS vehicle_events (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        event_id     TEXT    UNIQUE NOT NULL,
        event_type   TEXT    NOT NULL,
        vehicle_vin  TEXT,
        oem_tenant   TEXT,
        filename     TEXT,
        submitted_by INTEGER NOT NULL,
        submitted_at TEXT    DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_events_vehicle_vin  ON vehicle_events(vehicle_vin);
      CREATE INDEX IF NOT EXISTS idx_events_oem_tenant   ON vehicle_events(oem_tenant);
      CREATE INDEX IF NOT EXISTS idx_events_submitted_by ON vehicle_events(submitted_by);

      CREATE TABLE IF NOT EXISTS api_keys (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        key_prefix    TEXT    NOT NULL,
        key_hash      TEXT    UNIQUE NOT NULL,
        partner_name  TEXT    NOT NULL,
        partner_type  TEXT    NOT NULL,
        oem_scope     TEXT,
        scopes        TEXT    NOT NULL,
        rate_limit    INTEGER DEFAULT 60,
        created_by    INTEGER,
        created_at    TEXT    DEFAULT (datetime('now')),
        last_used_at  TEXT,
        revoked_at    TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_api_keys_key_hash ON api_keys(key_hash);
      CREATE INDEX IF NOT EXISTS idx_api_keys_partner   ON api_keys(partner_name);
    `);

    this.save();
    return db;
  },

  save() {
    if (db) {
      const data   = db.export();
      const buffer = Buffer.from(data);
      fs.writeFileSync(dbPath, buffer);
    }
  },

  exec(sql) {
    if (!db) throw new Error("Database not initialized");
    db.run(sql);
    this.save();
  },

  prepare(sql) {
    if (!db) throw new Error("Database not initialized");
    return new PreparedStatement(db, sql);
  },

  pragma() {},

  close() {
    if (db) {
      this.save();
      db.close();
    }
  },
};

class PreparedStatement {
  constructor(db, sql) {
    this.db  = db;
    this.sql = sql;
  }

  run(...params) {
    this.db.run(this.sql, params);
    Database.save();
    return { changes: this.db.getRowsModified(), lastInsertRowid: this.db.exec("SELECT last_insert_rowid() as id")[0]?.values[0]?.[0] };
  }

  get(...params) {
    const stmt = this.db.prepare(this.sql);
    stmt.bind(params);
    if (stmt.step()) {
      const row = stmt.getAsObject();
      stmt.free();
      return row;
    }
    stmt.free();
    return undefined;
  }

  all(...params) {
    const stmt = this.db.prepare(this.sql);
    stmt.bind(params);
    const result = [];
    while (stmt.step()) {
      result.push(stmt.getAsObject());
    }
    stmt.free();
    return result;
  }
}

module.exports = Database;
