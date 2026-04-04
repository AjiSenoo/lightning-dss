import { useState, useEffect, useCallback } from 'react'
import client from '../api/client'
import { getPendingCount } from '../offline/db'

const PING_INTERVAL_MS = 15000

export default function useNetworkStatus() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)
  const [lastSyncTime, setLastSyncTime] = useState(null)
  const [pendingCount, setPendingCount] = useState(0)

  const checkConnection = useCallback(async () => {
    try {
      await client.get('/health/', { timeout: 5000 })
      setIsOnline(true)
      setLastSyncTime(Date.now())
    } catch {
      setIsOnline(false)
    }
  }, [])

  const updatePendingCount = useCallback(async () => {
    const count = await getPendingCount()
    setPendingCount(count)
  }, [])

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true)
      checkConnection()
    }
    const handleOffline = () => setIsOnline(false)

    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)

    const intervalId = setInterval(() => {
      checkConnection()
      updatePendingCount()
    }, PING_INTERVAL_MS)

    checkConnection()
    updatePendingCount()

    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
      clearInterval(intervalId)
    }
  }, [checkConnection, updatePendingCount])

  return { isOnline, lastSyncTime, pendingCount }
}
