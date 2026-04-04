import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState } from 'react'
import OfflineBanner from './OfflineBanner'
import SyncIndicator from './SyncIndicator'

const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: '🏠', end: true },
  { to: '/assets', label: 'Portofolio Aset', icon: '🏗️' },
  { to: '/events/new', label: 'Input Kejadian', icon: '⚡' },
  { to: '/inspections/new', label: 'Logbook Inspeksi', icon: '📋' },
  { to: '/recommendations', label: 'Rekomendasi', icon: '📊' },
]

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)

  return (
    <div className="min-h-screen flex flex-col">
      <OfflineBanner />

      {/* Top bar */}
      <header className="bg-blue-700 text-white px-4 py-3 flex items-center justify-between shadow-md z-20">
        <div className="flex items-center gap-3">
          <button
            className="md:hidden p-1 rounded"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <span className="font-bold text-lg tracking-tight">⚡ Lightning DSS</span>
        </div>
        <div className="flex items-center gap-3">
          <SyncIndicator />
          <span className="text-xs bg-blue-600 px-2 py-1 rounded">Teknisi</span>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } md:translate-x-0 fixed md:static inset-y-0 left-0 z-10 w-64 bg-white border-r border-gray-200 flex flex-col transition-transform duration-200 pt-4`}
        >
          <nav className="flex flex-col gap-1 px-3">
            {NAV_ITEMS.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? 'bg-blue-50 text-blue-700 border border-blue-200'
                      : 'text-gray-600 hover:bg-gray-100'
                  }`
                }
              >
                <span className="text-lg">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </nav>
        </aside>

        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-0 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">
          <Outlet />
        </main>
      </div>
    </div>
  )
}
