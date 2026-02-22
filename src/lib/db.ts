import Database from 'better-sqlite3'
import path from 'path'
import fs from 'fs'
import type { Provider, Profile, LogEntry } from '@/types'

const DB_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DB_DIR, 'admiral.db')

// Persist DB instance across HMR in development
const globalForDb = globalThis as unknown as { __admiralDb?: Database.Database }

export function getDb(): Database.Database {
  if (globalForDb.__admiralDb) return globalForDb.__admiralDb

  fs.mkdirSync(DB_DIR, { recursive: true })
  const db = new Database(DB_PATH)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  migrate(db)
  globalForDb.__admiralDb = db
  return db
}

function migrate(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS providers (
      id TEXT PRIMARY KEY,
      api_key TEXT DEFAULT '',
      base_url TEXT DEFAULT '',
      status TEXT DEFAULT 'unknown'
    );

    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      username TEXT,
      password TEXT,
      empire TEXT DEFAULT '',
      player_id TEXT,
      provider TEXT,
      model TEXT,
      directive TEXT DEFAULT '',
      connection_mode TEXT DEFAULT 'http',
      server_url TEXT DEFAULT 'https://game.spacemolt.com',
      autoconnect INTEGER DEFAULT 1,
      enabled INTEGER DEFAULT 1,
      created_at TEXT DEFAULT (datetime('now')),
      updated_at TEXT DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS log_entries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      profile_id TEXT NOT NULL,
      timestamp TEXT DEFAULT (datetime('now')),
      type TEXT NOT NULL,
      summary TEXT,
      detail TEXT,
      FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_log_profile ON log_entries(profile_id, id);
  `)

  // Migrations: add columns that may be missing from older databases
  const profileCols = db.pragma('table_info(profiles)') as Array<{ name: string }>
  if (!profileCols.some(c => c.name === 'todo')) {
    db.exec("ALTER TABLE profiles ADD COLUMN todo TEXT DEFAULT ''")
  }

  // Seed default providers
  const defaultProviders = [
    'anthropic', 'openai', 'groq', 'google', 'xai',
    'mistral', 'openrouter', 'ollama', 'lmstudio',
  ]
  const upsert = db.prepare(
    'INSERT OR IGNORE INTO providers (id) VALUES (?)'
  )
  for (const p of defaultProviders) {
    upsert.run(p)
  }
}

// ─── Provider CRUD ─────────────────────────────────────────

export function listProviders(): Provider[] {
  return getDb().prepare('SELECT * FROM providers ORDER BY id').all() as Provider[]
}

export function getProvider(id: string): Provider | undefined {
  return getDb().prepare('SELECT * FROM providers WHERE id = ?').get(id) as Provider | undefined
}

export function upsertProvider(id: string, apiKey: string, baseUrl: string, status: string): void {
  getDb().prepare(
    `INSERT INTO providers (id, api_key, base_url, status)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET api_key = ?, base_url = ?, status = ?`
  ).run(id, apiKey, baseUrl, status, apiKey, baseUrl, status)
}

// ─── Profile CRUD ──────────────────────────────────────────

function rowToProfile(row: Record<string, unknown>): Profile {
  return {
    ...row,
    autoconnect: !!row.autoconnect,
    enabled: !!row.enabled,
  } as Profile
}

export function listProfiles(): Profile[] {
  const rows = getDb().prepare('SELECT * FROM profiles ORDER BY created_at').all() as Record<string, unknown>[]
  return rows.map(rowToProfile)
}

export function getProfile(id: string): Profile | undefined {
  const row = getDb().prepare('SELECT * FROM profiles WHERE id = ?').get(id) as Record<string, unknown> | undefined
  return row ? rowToProfile(row) : undefined
}

export function createProfile(profile: Omit<Profile, 'created_at' | 'updated_at'>): Profile {
  getDb().prepare(
    `INSERT INTO profiles (id, name, username, password, empire, player_id, provider, model, directive, todo, connection_mode, server_url, autoconnect, enabled)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    profile.id, profile.name, profile.username, profile.password,
    profile.empire, profile.player_id, profile.provider, profile.model,
    profile.directive, profile.todo || '', profile.connection_mode, profile.server_url,
    profile.autoconnect ? 1 : 0, profile.enabled ? 1 : 0,
  )
  return getProfile(profile.id)!
}

export function updateProfile(id: string, updates: Partial<Profile>): Profile | undefined {
  const allowed = [
    'name', 'username', 'password', 'empire', 'player_id',
    'provider', 'model', 'directive', 'connection_mode', 'server_url',
    'autoconnect', 'enabled', 'todo',
  ]
  const sets: string[] = []
  const vals: unknown[] = []

  for (const key of allowed) {
    if (key in updates) {
      sets.push(`${key} = ?`)
      let val = (updates as Record<string, unknown>)[key]
      if (key === 'autoconnect' || key === 'enabled') val = val ? 1 : 0
      vals.push(val)
    }
  }

  if (sets.length === 0) return getProfile(id)

  sets.push("updated_at = datetime('now')")
  vals.push(id)

  getDb().prepare(`UPDATE profiles SET ${sets.join(', ')} WHERE id = ?`).run(...vals)
  return getProfile(id)
}

export function deleteProfile(id: string): void {
  getDb().prepare('DELETE FROM profiles WHERE id = ?').run(id)
}

// ─── Log CRUD ──────────────────────────────────────────────

export function addLogEntry(profileId: string, type: string, summary: string, detail?: string): number {
  const result = getDb().prepare(
    'INSERT INTO log_entries (profile_id, type, summary, detail) VALUES (?, ?, ?, ?)'
  ).run(profileId, type, summary, detail ?? null)
  return result.lastInsertRowid as number
}

export function getLogEntries(profileId: string, afterId?: number, limit: number = 100): LogEntry[] {
  if (afterId) {
    return getDb().prepare(
      'SELECT * FROM log_entries WHERE profile_id = ? AND id > ? ORDER BY id LIMIT ?'
    ).all(profileId, afterId, limit) as LogEntry[]
  }
  return getDb().prepare(
    'SELECT * FROM log_entries WHERE profile_id = ? ORDER BY id DESC LIMIT ?'
  ).all(profileId, limit) as LogEntry[]
}

export function clearLogs(profileId: string): void {
  getDb().prepare('DELETE FROM log_entries WHERE profile_id = ?').run(profileId)
}
