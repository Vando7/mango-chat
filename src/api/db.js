let SQL
let db
let initPromise = null

const DB_NAME = 'chat-app-db'
const DB_FILE = 'chat-app-db.sqlite'

// Bump this whenever the schema changes. On init we read PRAGMA user_version
// from the persisted db; if it's lower than SCHEMA_VERSION, every table is
// dropped and recreated. We don't migrate — chat history is disposable.
const SCHEMA_VERSION = 5

let wasmBlobUrl = null

async function doInit() {
  if (!wasmBlobUrl) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10000)
    try {
      const response = await fetch('/sql-wasm-browser.wasm', { signal: controller.signal })
      clearTimeout(timeout)
      if (!response.ok) throw new Error(`WASM fetch failed: ${response.status}`)
      const arrayBuffer = await response.arrayBuffer()
      const blob = new Blob([arrayBuffer], { type: 'application/wasm' })
      wasmBlobUrl = URL.createObjectURL(blob)
    } catch (e) {
      clearTimeout(timeout)
      throw new Error(`Failed to load WASM: ${e.message}`, { cause: e })
    }
  }

  const { default: initSqlJs } = await import('sql.js')
  SQL = await initSqlJs({ locateFile: () => wasmBlobUrl })

  const dbBuffer = await loadFromIndexedDB(DB_FILE)
  let needsBump = false
  if (dbBuffer) {
    const candidate = new SQL.Database(dbBuffer)
    const versionRows = candidate.exec('PRAGMA user_version')
    const currentVersion = versionRows[0]?.values?.[0]?.[0] ?? 0
    if (currentVersion < SCHEMA_VERSION) {
      // Discard the persisted blob entirely instead of trying to migrate in
      // place — chat history is disposable and a partial-migration state has
      // bitten us before. Also wipes the IDB record so a stale snapshot
      // can't be re-read on the next load.
      candidate.close?.()
      await deleteFromIndexedDB(DB_FILE)
      db = new SQL.Database()
      needsBump = true
    } else {
      db = candidate
    }
  } else {
    db = new SQL.Database()
    needsBump = true
  }

  if (needsBump) {
    db.run(`PRAGMA user_version = ${SCHEMA_VERSION}`)
  }

  db.run(`
    CREATE TABLE IF NOT EXISTS chats (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)
  db.run(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id TEXT NOT NULL,
      position INTEGER NOT NULL,
      version INTEGER NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      images TEXT,
      reasoning TEXT,
      model TEXT,
      is_active INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      UNIQUE (chat_id, position, version),
      FOREIGN KEY (chat_id) REFERENCES chats(id)
    )
  `)
  db.run('CREATE INDEX IF NOT EXISTS idx_messages_chat_pos ON messages(chat_id, position)')
  db.run(`
    CREATE TABLE IF NOT EXISTS presets (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    )
  `)

  if (needsBump) persist()

  return db
}

function initDatabase() {
  if (!initPromise) {
    initPromise = doInit().catch((e) => {
      initPromise = null
      throw e
    })
  }
  return initPromise
}

function saveToIndexedDB(key, data) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const idb = request.result
      const tx = idb.transaction('store', 'readwrite')
      const store = tx.objectStore('store')
      store.put({ key, data }, key)
      tx.oncomplete = () => resolve()
    }
    request.onupgradeneeded = () => {
      request.result.createObjectStore('store')
    }
  })
}

function deleteFromIndexedDB(key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('store')
    }
    request.onsuccess = () => {
      const idb = request.result
      if (!idb.objectStoreNames.contains('store')) {
        resolve()
        return
      }
      const tx = idb.transaction('store', 'readwrite')
      const store = tx.objectStore('store')
      store.delete(key)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    }
  })
}

function loadFromIndexedDB(key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onupgradeneeded = () => {
      request.result.createObjectStore('store')
    }
    request.onsuccess = () => {
      const idb = request.result
      if (!idb.objectStoreNames.contains('store')) {
        resolve(null)
        return
      }
      const tx = idb.transaction('store', 'readonly')
      const store = tx.objectStore('store')
      const get = store.get(key)
      get.onsuccess = () => {
        const result = get.result
        if (result && result.data) {
          resolve(new Uint8Array(result.data))
        } else {
          resolve(null)
        }
      }
      get.onerror = () => reject(get.error)
    }
  })
}

function persist() {
  const data = db.export()
  saveToIndexedDB(DB_FILE, data)
}

export function getChats() {
  const rows = db.exec('SELECT id, title, created_at, updated_at FROM chats ORDER BY updated_at DESC')
  if (rows.length === 0) return []
  return rows[0].values.map((row) => ({
    id: row[0],
    title: row[1],
    created_at: row[2],
    updated_at: row[3],
  }))
}

// Images are stored as a JSON-encoded array of data URLs in the `images`
// TEXT column (NULL when no images attached). Empty array round-trips as NULL.
const encodeImages = (images) => {
  if (!images || images.length === 0) return null
  return JSON.stringify(images)
}
const decodeImages = (raw) => {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// Returns { versions, active } where:
//   versions[position] is an array of { role, content, images, reasoning, model, version, created_at }
//   active[position]   is the version index currently marked is_active=1
export function getMessageVersions(chatId) {
  const rows = db.exec(
    `SELECT position, version, role, content, images, reasoning, model, is_active, created_at
     FROM messages WHERE chat_id = ? ORDER BY position ASC, version ASC`,
    [chatId]
  )
  const versions = []
  const active = []
  if (rows.length === 0) return { versions, active }
  for (const row of rows[0].values) {
    const [position, version, role, content, images, reasoning, model, isActive, createdAt] = row
    if (!versions[position]) versions[position] = []
    versions[position][version] = {
      role,
      content,
      images: decodeImages(images),
      reasoning: reasoning || null,
      model: model || null,
      version,
      created_at: createdAt,
    }
    if (isActive) active[position] = version
  }
  for (let p = 0; p < versions.length; p++) {
    if (versions[p] && active[p] === undefined) {
      active[p] = versions[p].length - 1
    }
  }
  return { versions, active }
}

export function saveChat(id, title) {
  const now = Date.now()
  db.run(
    'INSERT OR REPLACE INTO chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [id, title, now, now]
  )
  persist()
}

// Append a brand new message at the next position (version 0, active).
// `images` should be an array of data URL strings (or null/empty).
// Returns { position, version }.
export function appendMessage(chatId, role, content, images, reasoning, model) {
  const rows = db.exec('SELECT MAX(position) FROM messages WHERE chat_id = ?', [chatId])
  const maxPos = rows[0]?.values?.[0]?.[0]
  const position = (maxPos === null || maxPos === undefined) ? 0 : maxPos + 1
  const now = Date.now()
  db.run(
    `INSERT INTO messages (chat_id, position, version, role, content, images, reasoning, model, is_active, created_at)
     VALUES (?, ?, 0, ?, ?, ?, ?, ?, 1, ?)`,
    [chatId, position, role, content || '', encodeImages(images), reasoning || null, model || null, now]
  )
  db.run('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId])
  persist()
  return { position, version: 0 }
}

// Add a new version at an existing position; mark it active and deactivate
// any prior versions at that position. Returns the new version index.
export function addNewVersion(chatId, position, role, content, images, reasoning, model) {
  const rows = db.exec(
    'SELECT MAX(version) FROM messages WHERE chat_id = ? AND position = ?',
    [chatId, position]
  )
  const maxV = rows[0]?.values?.[0]?.[0]
  const version = (maxV === null || maxV === undefined) ? 0 : maxV + 1
  const now = Date.now()
  db.run('UPDATE messages SET is_active = 0 WHERE chat_id = ? AND position = ?', [chatId, position])
  db.run(
    `INSERT INTO messages (chat_id, position, version, role, content, images, reasoning, model, is_active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [chatId, position, version, role, content || '', encodeImages(images), reasoning || null, model || null, now]
  )
  db.run('UPDATE chats SET updated_at = ? WHERE id = ?', [now, chatId])
  persist()
  return { position, version }
}

// Update content + reasoning on an existing version (used when streaming
// finishes — we don't persist on every chunk).
export function updateMessageVersion(chatId, position, version, content, reasoning) {
  db.run(
    'UPDATE messages SET content = ?, reasoning = ? WHERE chat_id = ? AND position = ? AND version = ?',
    [content || '', reasoning || null, chatId, position, version]
  )
  db.run('UPDATE chats SET updated_at = ? WHERE id = ?', [Date.now(), chatId])
  persist()
}

// Flip is_active to a different version at the given position.
export function setActiveVersion(chatId, position, version) {
  db.run('UPDATE messages SET is_active = 0 WHERE chat_id = ? AND position = ?', [chatId, position])
  db.run(
    'UPDATE messages SET is_active = 1 WHERE chat_id = ? AND position = ? AND version = ?',
    [chatId, position, version]
  )
  db.run('UPDATE chats SET updated_at = ? WHERE id = ?', [Date.now(), chatId])
  persist()
}

// Delete every message at the given position and beyond. Used by the
// per-message delete button — the tail is always discarded because it was
// generated as a continuation of the deleted message.
export function deleteFromPosition(chatId, position) {
  db.run('DELETE FROM messages WHERE chat_id = ? AND position >= ?', [chatId, position])
  db.run('UPDATE chats SET updated_at = ? WHERE id = ?', [Date.now(), chatId])
  persist()
}

export function updateChatTitle(id, newTitle) {
  db.run('UPDATE chats SET title = ?, updated_at = ? WHERE id = ?', [newTitle, Date.now(), id])
  persist()
}

export function deleteChat(id) {
  db.run('DELETE FROM messages WHERE chat_id = ?', [id])
  db.run('DELETE FROM chats WHERE id = ?', [id])
  persist()
}

export function clearDatabase() {
  db.run('DELETE FROM messages')
  db.run('DELETE FROM chats')
  persist()
}

// ---- Presets (system prompts) -------------------------------------------
// Stored separately from chats; the active preset id lives in localStorage
// and is prepended as a {role:'system'} message at index 0 of each request.
export function listPresets() {
  const rows = db.exec(
    'SELECT id, name, content, created_at, updated_at FROM presets ORDER BY updated_at DESC'
  )
  if (rows.length === 0) return []
  return rows[0].values.map((r) => ({
    id: r[0], name: r[1], content: r[2], created_at: r[3], updated_at: r[4],
  }))
}

export function createPreset(name, content) {
  const id = 'preset-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8)
  const now = Date.now()
  db.run(
    'INSERT INTO presets (id, name, content, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
    [id, name, content, now, now]
  )
  persist()
  return { id, name, content, created_at: now, updated_at: now }
}

export function updatePreset(id, name, content) {
  db.run(
    'UPDATE presets SET name = ?, content = ?, updated_at = ? WHERE id = ?',
    [name, content, Date.now(), id]
  )
  persist()
}

export function deletePreset(id) {
  db.run('DELETE FROM presets WHERE id = ?', [id])
  persist()
}

export { initDatabase, persist }
