import { openDB } from 'idb'

const DB_NAME = 'lightning-dss'
const DB_VERSION = 1

export async function getDB() {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('assets')) {
        db.createObjectStore('assets', { keyPath: 'asset_id' })
      }
      if (!db.objectStoreNames.contains('events')) {
        const eventStore = db.createObjectStore('events', { keyPath: 'event_id' })
        eventStore.createIndex('by_asset', 'asset', { unique: false })
      }
      if (!db.objectStoreNames.contains('inspections')) {
        const inspStore = db.createObjectStore('inspections', { keyPath: 'log_id' })
        inspStore.createIndex('by_asset', 'asset', { unique: false })
      }
      if (!db.objectStoreNames.contains('syncQueue')) {
        const queueStore = db.createObjectStore('syncQueue', {
          keyPath: 'id',
          autoIncrement: true,
        })
        queueStore.createIndex('by_status', 'status', { unique: false })
      }
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'key' })
      }
    },
  })
}

export async function getCachedAssets() {
  const db = await getDB()
  return db.getAll('assets')
}

export async function cacheAssets(assets) {
  const db = await getDB()
  const tx = db.transaction('assets', 'readwrite')
  for (const asset of assets) {
    await tx.store.put(asset)
  }
  await tx.done
  await db.put('metadata', { key: 'assets_cached_at', value: Date.now() })
}

export async function getCacheAge(storeName) {
  const db = await getDB()
  const meta = await db.get('metadata', `${storeName}_cached_at`)
  if (!meta) return Infinity
  return Date.now() - meta.value
}

export async function addToSyncQueue(item) {
  const db = await getDB()
  return db.add('syncQueue', {
    ...item,
    status: 'pending',
    retryCount: 0,
    createdAt: Date.now(),
  })
}

export async function getPendingItems() {
  const db = await getDB()
  const tx = db.transaction('syncQueue', 'readonly')
  const index = tx.store.index('by_status')
  return index.getAll('pending')
}

export async function updateQueueItem(id, updates) {
  const db = await getDB()
  const item = await db.get('syncQueue', id)
  if (item) {
    await db.put('syncQueue', { ...item, ...updates })
  }
}

export async function getPendingCount() {
  const db = await getDB()
  const tx = db.transaction('syncQueue', 'readonly')
  const index = tx.store.index('by_status')
  return index.count('pending')
}
