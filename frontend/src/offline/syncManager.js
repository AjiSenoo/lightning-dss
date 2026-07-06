import client from '../api/client'
import { getDB, getPendingItems, updateQueueItem, removeCachedAsset } from './db'

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

      // Process events/inspections first (they may create the asset context), then the
      // asset/component mutations. All queued types drain in one pass.
      const order = { event: 0, inspection: 1, maintenance: 2, asset_edit: 3, asset_replace: 4, asset_delete: 5 }
      const sorted = [...pending].sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9))
      let synced = 0
      for (const item of sorted) {
        const success = await this._syncItem(item)
        if (success) synced++
      }

      if (synced > 0) {
        if (this._onSyncComplete) this._onSyncComplete(synced)
        // Let mounted pages (Dashboard/Portfolio/Detail) refetch after the queue drains.
        if (typeof window !== 'undefined') window.dispatchEvent(new Event('sync:done'))
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

      if (item.type === 'maintenance') {
        await client.post('/maintenance-actions/', item.payload)
      }

      if (item.type === 'asset_edit') {
        const response = await client.put(`/assets/${item.assetId}/`, item.payload)
        const db = await getDB()
        await db.put('assets', response.data)
      }

      if (item.type === 'asset_replace') {
        const response = await client.post(`/assets/${item.assetId}/replace/`, item.payload)
        await removeCachedAsset(item.assetId)   // old asset is now soft-deleted
        const db = await getDB()
        if (response.data?.asset_id) await db.put('assets', response.data)
      }

      if (item.type === 'asset_delete') {
        await client.delete(`/assets/${item.assetId}/`)
        await removeCachedAsset(item.assetId)
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
