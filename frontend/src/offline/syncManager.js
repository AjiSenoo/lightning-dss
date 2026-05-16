import client from '../api/client'
import { getDB, getPendingItems, updateQueueItem } from './db'

const SYNC_INTERVAL_MS = 30000
const MAX_RETRIES = 5

class SyncManager {
  constructor() {
    this._intervalId = null
    this._isSyncing = false
    this._onSyncComplete = null
    this._onResultUpdated = null
  }

  start({ onSyncComplete, onResultUpdated } = {}) {
    this._onSyncComplete = onSyncComplete
    this._onResultUpdated = onResultUpdated
    this._intervalId = setInterval(() => this.processQueue(), SYNC_INTERVAL_MS)
    this.processQueue()
  }

  stop() {
    if (this._intervalId) {
      clearInterval(this._intervalId)
      this._intervalId = null
    }
  }

  async processQueue() {
    if (this._isSyncing) return
    this._isSyncing = true

    try {
      const pending = await getPendingItems()
      if (pending.length === 0) {
        this._isSyncing = false
        return
      }

      const events = pending.filter((item) => item.type === 'event')
      const inspections = pending.filter((item) => item.type === 'inspection')
      let synced = 0

      for (const item of events) {
        const success = await this._syncItem(item)
        if (success) synced++
      }
      for (const item of inspections) {
        const success = await this._syncItem(item)
        if (success) synced++
      }

      if (this._onSyncComplete && synced > 0) {
        this._onSyncComplete(synced)
      }
    } catch (error) {
      console.error('Sync queue processing failed:', error)
    } finally {
      this._isSyncing = false
    }
  }

  async _syncItem(item) {
    if (item.retryCount >= MAX_RETRIES) {
      await updateQueueItem(item.id, { status: 'failed_permanent' })
      return false
    }

    try {
      let serverResult

      if (item.type === 'event') {
        const response = await client.post('/events/', item.payload)
        serverResult = response.data
        const db = await getDB()
        await db.put('events', serverResult)

        if (
          item.localResult &&
          serverResult.fuzzy_output_label !== item.localResult.label &&
          this._onResultUpdated
        ) {
          this._onResultUpdated({
            type: 'event',
            assetName: item.asset_nama || 'Unknown',
            localLabel: item.localResult.label,
            serverLabel: serverResult.fuzzy_output_label,
            serverScore: serverResult.fuzzy_output_score,
          })
        }
      }

      if (item.type === 'inspection') {
        const fd = new FormData()
        Object.entries(item.payload).forEach(([k, v]) => {
          if (v !== null && v !== undefined) fd.append(k, v)
        })
        if (item.photoBlobs) {
          item.photoBlobs.forEach((blob, i) => fd.append('photos', blob, `photo_${i + 1}.jpg`))
        }
        const response = await client.post('/inspections/', fd)
        serverResult = response.data
        if (serverResult.updated_asset) {
          const db = await getDB()
          await db.put('assets', serverResult.updated_asset)
        }
      }

      await updateQueueItem(item.id, { status: 'synced', syncedAt: Date.now() })
      return true
    } catch (error) {
      if (error.response) {
        if (error.response.status >= 400 && error.response.status < 500) {
          await updateQueueItem(item.id, {
            status: 'failed_permanent',
            error: JSON.stringify(error.response.data),
          })
        } else {
          await updateQueueItem(item.id, {
            status: 'pending',
            retryCount: (item.retryCount || 0) + 1,
          })
        }
      } else {
        await updateQueueItem(item.id, {
          status: 'pending',
          retryCount: (item.retryCount || 0) + 1,
        })
        throw error
      }
      return false
    }
  }
}

const syncManager = new SyncManager()
export default syncManager
