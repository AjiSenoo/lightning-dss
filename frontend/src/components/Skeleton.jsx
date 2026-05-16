export function SkeletonLine({ className = '' }) {
  return <div className={`skeleton h-3 ${className}`} />
}

export function SkeletonCard({ className = '' }) {
  return (
    <div className={`card space-y-3 ${className}`}>
      <SkeletonLine className="w-2/3" />
      <SkeletonLine className="w-1/2 h-2" />
      <SkeletonLine className="w-full h-2" />
      <SkeletonLine className="w-5/6 h-2" />
    </div>
  )
}

export function SkeletonStat() {
  return (
    <div className="card space-y-3">
      <SkeletonLine className="w-1/3 h-2" />
      <SkeletonLine className="w-1/2 h-6" />
      <SkeletonLine className="w-2/3 h-2" />
    </div>
  )
}

export function SkeletonRow() {
  return (
    <div className="flex items-center gap-3 py-3 border-b last:border-b-0">
      <div className="skeleton w-10 h-10 rounded-full" />
      <div className="flex-1 space-y-2">
        <SkeletonLine className="w-1/3 h-3" />
        <SkeletonLine className="w-1/2 h-2" />
      </div>
    </div>
  )
}

export function SkeletonTable({ rows = 5 }) {
  return (
    <div className="card">
      <SkeletonLine className="w-1/4 h-3 mb-4" />
      {Array.from({ length: rows }).map((_, i) => <SkeletonRow key={i} />)}
    </div>
  )
}

export default SkeletonCard
