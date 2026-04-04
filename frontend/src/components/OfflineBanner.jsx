import useNetworkStatus from '../hooks/useNetworkStatus'

export default function OfflineBanner() {
  const { isOnline, pendingCount } = useNetworkStatus()

  if (isOnline) return null

  const isUrgent = pendingCount > 5

  return (
    <div
      className={`w-full py-2 px-4 text-sm font-medium text-center ${
        isUrgent ? 'bg-red-500 text-white' : 'bg-amber-400 text-black'
      }`}
    >
      {isUrgent
        ? `Mode Offline — ${pendingCount} data menunggu sinkronisasi`
        : pendingCount > 0
        ? `Mode Offline — ${pendingCount} data menunggu sinkronisasi`
        : 'Mode Offline — data akan disinkronkan saat online'}
    </div>
  )
}
