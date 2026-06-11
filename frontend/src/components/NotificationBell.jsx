import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import client from '../api/client'
import { timeAgo } from '../utils/constants'

const VERB_LABELS = {
  create:           'membuat laporan baru di',
  update:           'mengedit laporan di',
  amend:            'mengamandemen laporan di',
  delete:           'memindah laporan ke Tempat Sampah di',
  restore:          'memulihkan laporan dari Tempat Sampah di',
  lightning:        'Kejadian petir baru tercatat di',
  stale_asset:      'Aset belum diinspeksi:',
  verify:               'memverifikasi laporan di',
  request_revision:    'meminta revisi laporan di',
  revoke_verification: 'mencabut verifikasi laporan di',
  asset_create:     'menambahkan aset baru:',
  asset_update:     'mengedit aset:',
  asset_delete:     'memindah aset ke Tempat Sampah:',
  asset_restore:    'memulihkan aset dari Tempat Sampah:',
  component_eol_warning: 'Komponen mendekati masa pakai:',
  component_eol_urgent:  'Komponen hampir habis masa pakai:',
}

// System-generated notifications have no actor — render label + target only.
const NO_ACTOR_VERBS = ['lightning', 'stale_asset', 'component_eol_warning', 'component_eol_urgent']

function renderText(notif) {
  const label = VERB_LABELS[notif.verb] || notif.verb
  const target = notif.target_label || ''
  if (NO_ACTOR_VERBS.includes(notif.verb)) {
    return `${label} ${target}`
  }
  const actor = notif.actor_nama || notif.actor_username || 'Seseorang'
  return `${actor} ${label} ${target}`
}

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0)
  const [notifications, setNotifications] = useState([])
  const [isOpen, setIsOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const dropdownRef = useRef(null)
  const navigate = useNavigate()

  const fetchCount = useCallback(async () => {
    try {
      const res = await client.get('/notifications/unread_count/')
      setUnreadCount(res.data.count)
    } catch {
      // silently fail — bell badge just stays stale
    }
  }, [])

  useEffect(() => {
    fetchCount()
    const id = setInterval(fetchCount, 30_000)
    return () => clearInterval(id)
  }, [fetchCount])

  useEffect(() => {
    if (!isOpen) return
    setLoading(true)
    client.get('/notifications/?page=1')
      .then((res) => setNotifications(res.data.results ?? res.data))
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [isOpen])

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [isOpen])

  async function handleClickNotif(notif) {
    try {
      await client.post(`/notifications/${notif.notif_id}/mark_read/`)
      setUnreadCount((c) => Math.max(0, c - (notif.read_at ? 0 : 1)))
      setNotifications((prev) =>
        prev.map((n) => n.notif_id === notif.notif_id ? { ...n, read_at: new Date().toISOString() } : n)
      )
    } catch {
      // navigate anyway
    }
    setIsOpen(false)
    navigate(notif.link_url)
  }

  async function handleMarkAllRead() {
    try {
      await client.post('/notifications/mark_all_read/')
      setUnreadCount(0)
      setNotifications((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? new Date().toISOString() })))
    } catch {
      // ignore
    }
  }

  const badgeLabel = unreadCount > 9 ? '9+' : String(unreadCount)

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="relative p-1.5 rounded-lg hover:bg-white/10 transition-colors"
        aria-label="Notifikasi"
      >
        <svg className="w-5 h-5 text-brand-100" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
          <path strokeLinecap="round" strokeLinejoin="round"
            d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6 6 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
        </svg>
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[1.1rem] h-[1.1rem] flex items-center justify-center
            bg-accent-500 text-white text-[10px] font-bold rounded-full px-0.5 leading-none">
            {badgeLabel}
          </span>
        )}
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-80 bg-white rounded-2xl shadow-2xl ring-1 ring-gray-100 z-50 flex flex-col max-h-[26rem]">
          <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
            <span className="text-sm font-semibold text-gray-900">Notifikasi</span>
            {unreadCount > 0 && (
              <button onClick={handleMarkAllRead}
                className="text-xs text-brand-600 hover:text-brand-800 font-medium">
                Tandai semua dibaca
              </button>
            )}
          </div>

          <div className="overflow-y-auto flex-1">
            {loading && (
              <p className="text-xs text-gray-400 px-4 py-6 text-center">Memuat…</p>
            )}
            {!loading && notifications.length === 0 && (
              <p className="text-xs text-gray-400 px-4 py-6 text-center">Tidak ada notifikasi</p>
            )}
            {!loading && notifications.map((n) => {
              const unread = !n.read_at
              return (
                <button key={n.notif_id} onClick={() => handleClickNotif(n)}
                  className={`w-full text-left px-4 py-3 flex gap-3 hover:bg-gray-50 transition-colors border-b border-gray-50 last:border-0
                    ${unread ? 'bg-brand-50/40' : ''}`}>
                  {unread && (
                    <span className="mt-1.5 shrink-0 w-2 h-2 rounded-full bg-brand-500" />
                  )}
                  {!unread && <span className="mt-1.5 shrink-0 w-2 h-2" />}
                  <div className="min-w-0">
                    <p className="text-xs text-gray-800 leading-snug line-clamp-2">{renderText(n)}</p>
                    <p className="text-[11px] text-gray-400 mt-0.5">{timeAgo(n.created_at)}</p>
                  </div>
                </button>
              )
            })}
          </div>

          <div className="px-4 py-2 border-t border-gray-100">
            <button onClick={() => setIsOpen(false)}
              className="text-xs text-gray-400 hover:text-gray-600">
              Tutup
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
