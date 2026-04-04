import useNetworkStatus from '../hooks/useNetworkStatus'

export default function SyncIndicator() {
  const { isOnline, pendingCount } = useNetworkStatus()

  if (isOnline && pendingCount === 0) {
    return (
      <span className="text-green-500 text-sm flex items-center gap-1">
        <span>●</span>
        <span className="hidden sm:inline">Online</span>
      </span>
    )
  }

  if (!isOnline) {
    return (
      <span className="text-amber-500 text-sm flex items-center gap-1">
        <span className="animate-pulse">●</span>
        <span className="hidden sm:inline">Offline</span>
        {pendingCount > 0 && (
          <span className="bg-amber-500 text-white text-xs rounded-full px-1.5 py-0.5 ml-1">
            {pendingCount}
          </span>
        )}
      </span>
    )
  }

  return (
    <span className="text-blue-500 text-sm flex items-center gap-1">
      <span className="animate-spin inline-block">↻</span>
      <span className="hidden sm:inline">Sinkronisasi...</span>
      <span className="bg-blue-500 text-white text-xs rounded-full px-1.5 py-0.5 ml-1">
        {pendingCount}
      </span>
    </span>
  )
}
