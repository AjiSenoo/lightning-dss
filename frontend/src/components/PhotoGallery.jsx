import { useState } from 'react'

export default function PhotoGallery({ photos }) {
  const [active, setActive] = useState(null)
  if (!photos || photos.length === 0) {
    return <p className="text-sm text-gray-400 italic">Tidak ada foto bukti.</p>
  }
  return (
    <>
      <div className="flex flex-wrap gap-2">
        {photos.map((p) => (
          <img
            key={p.photo_id}
            src={p.image}
            alt={p.caption || 'foto bukti'}
            className="w-24 h-24 object-cover rounded-lg border border-gray-200 cursor-pointer hover:opacity-90 transition-opacity"
            onClick={() => setActive(p)}
          />
        ))}
      </div>
      {active && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 flex items-center justify-center p-4 cursor-zoom-out animate-fade-in"
          onClick={() => setActive(null)}
        >
          <img
            src={active.image}
            alt={active.caption || ''}
            className="max-w-full max-h-full rounded-lg animate-scale-in"
          />
        </div>
      )}
    </>
  )
}
