import client from '../api/client'
import { getDB, getCachedAssets, cacheAssets, getCacheAge } from './db'

const STALE_THRESHOLD_MS = 60 * 60 * 1000 // 1 hour

class CacheStore {
  async getAssets() {
    try {
      const response = await client.get('/assets/?page_size=100')
      const assets = response.data.results || response.data
      await cacheAssets(assets)
      return { data: assets, isStale: false, cachedAt: Date.now() }
    } catch {
      const cached = await getCachedAssets()
      const age = await getCacheAge('assets')
      return {
        data: cached,
        isStale: age > STALE_THRESHOLD_MS,
        cachedAt: Date.now() - age,
      }
    }
  }

  async getAsset(assetId) {
    try {
      const response = await client.get(`/assets/${assetId}/`)
      const asset = response.data
      const db = await getDB()
      await db.put('assets', asset)
      return { data: asset, isStale: false }
    } catch {
      const db = await getDB()
      const cached = await db.get('assets', assetId)
      return { data: cached || null, isStale: true }
    }
  }

  async getDashboardSummary() {
    try {
      const response = await client.get('/dashboard/summary/')
      const summary = response.data
      const db = await getDB()
      await db.put('metadata', { key: 'dashboard_summary', value: summary })
      return { data: summary, isStale: false }
    } catch {
      const db = await getDB()
      const cached = await db.get('metadata', 'dashboard_summary')
      return { data: cached?.value || null, isStale: true }
    }
  }

  async getAssetHistory(assetId) {
    try {
      const response = await client.get(`/assets/${assetId}/history/`)
      return { data: response.data, isStale: false }
    } catch {
      return { data: [], isStale: true }
    }
  }

  async getDashboardMap() {
    try {
      const response = await client.get('/dashboard/map/')
      return { data: response.data, isStale: false }
    } catch {
      const cached = await getCachedAssets()
      return { data: cached, isStale: true }
    }
  }
}

const cacheStore = new CacheStore()
export default cacheStore
