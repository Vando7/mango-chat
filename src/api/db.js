let SQL
let db
let dbReady = false

const DB_NAME = 'chat-app-db'
const DB_FILE = 'chat-app-db.sqlite'

// Import the WASM file as a blob URL for sql.js
let wasmBlobUrl = null

async function initDatabase() {
  if (dbReady) return db

  // Load WASM file
  if (!wasmBlobUrl) {
    const response = await fetch('/sql-wasm-browser.wasm')
    const arrayBuffer = await response.arrayBuffer()
    const blob = new Blob([arrayBuffer], { type: 'application/wasm' })
    wasmBlobUrl = URL.createObjectURL(blob)
  }

  const { default: initSqlJs } = await import('sql.js')
  SQL = await initSqlJs({
    locateFile: (filename) => wasmBlobUrl,
  })

  // Load from IndexedDB
  const dbBuffer = await loadFromIndexedDB(DB_FILE)
  if (dbBuffer) {
    db = new SQL.Database(dbBuffer)
  } else {
    db = new SQL.Database()
  }

  // Create tables if they don't exist
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
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      image TEXT,
      reasoning TEXT,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (chat_id) REFERENCES chats(id)
    )
  `)

  dbReady = true
  return db
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

function loadFromIndexedDB(key) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const idb = request.result
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
    }
  })
}

function persist() {
  const data = db.export()
  saveToIndexedDB(DB_FILE, data)
}

export function getChats() {
  const rows = db.exec('SELECT id, title, created_at, updated_at FROM chats ORDER BY updated_at DESC')
  return rows[0].values.map((row) => ({
    id: row[0],
    title: row[1],
    created_at: row[2],
    updated_at: row[3],
  }))
}

export function getMessages(chatId) {
  const rows = db.exec(
    'SELECT id, role, content, image, reasoning, created_at FROM messages WHERE chat_id = ? ORDER BY id ASC',
    [chatId]
  )
  if (rows.length === 0) return []
  return rows[0].values.map((row) => ({
    id: row[0],
    role: row[1],
    content: row[2],
    image: row[3] || null,
    reasoning: row[4] || null,
    created_at: row[5],
  }))
}

export function saveChat(id, title) {
  const now = Date.now()
  db.run(
    'INSERT OR REPLACE INTO chats (id, title, created_at, updated_at) VALUES (?, ?, ?, ?)',
    [id, title, now, now]
  )
  persist()
}

export function saveMessage(chatId, role, content, image, reasoning) {
  db.run(
    'INSERT INTO messages (chat_id, role, content, image, reasoning, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    [chatId, role, content, image || null, reasoning || null, Date.now()]
  )
  // Also update the chat's updated_at
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

export { initDatabase, persist }
