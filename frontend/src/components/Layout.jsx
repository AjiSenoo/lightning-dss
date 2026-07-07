import { Outlet, NavLink, useNavigate } from 'react-router-dom'
import { useState, useEffect, useMemo } from 'react'
import OfflineBanner from './OfflineBanner'
import SyncIndicator from './SyncIndicator'
import HeaderClock from './HeaderClock'
import NotificationBell from './NotificationBell'
import OnboardingTour from './OnboardingTour'
import { buildTourSteps } from '../onboarding/tourSteps'
import { useAuth, useIsManager } from '../auth/AuthContext'

const BASE_NAV_ITEMS = [
  { to: '/dashboard', label: 'Dashboard', icon: '🏠', end: true, tourId: 'nav-dashboard' },
  { to: '/assets', label: 'Portofolio Aset', icon: '🏗️', end: true, tourId: 'nav-assets' },
  { to: '/inspections', label: 'Riwayat Inspeksi', icon: '📋', end: true, tourId: 'nav-inspections' },
  { to: '/events', label: 'Riwayat Sambaran', icon: '🌩️', end: true, tourId: 'nav-events' },
  { to: '/inspections/new', label: 'Input Logbook', icon: '✏️', tourId: 'nav-inspections-new' },
  { to: '/events/new', label: 'Input Kejadian', icon: '⚡', tourId: 'nav-events-new' },
]

const MANAGER_NAV_ITEMS = [
  { to: '/users', label: 'Manajemen Pengguna', icon: '👥', end: true, tourId: 'nav-users' },
  { to: '/inspections/trash', label: 'Tempat Sampah', icon: '🗑️', end: true, tourId: 'nav-trash' },
]

const TOUR_KEY = (id) => `lightning_tour_seen_v1_${id}`

function getInitials(user) {
  const source = user?.nama_lengkap || user?.username || '?'
  const parts = source.trim().split(/\s+/)
  const initials = parts.length > 1
    ? `${parts[0][0]}${parts[parts.length - 1][0]}`
    : source.slice(0, 2)
  return initials.toUpperCase()
}

export default function Layout() {
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [tourActive, setTourActive] = useState(false)
  const { user, logout } = useAuth()
  const isManager = useIsManager()
  const navigate = useNavigate()
  const navItems = isManager ? [...BASE_NAV_ITEMS, ...MANAGER_NAV_ITEMS] : BASE_NAV_ITEMS
  const tourSteps = useMemo(() => buildTourSteps({ isManager }), [isManager])

  // Auto-open the tour once, on a user's first login.
  useEffect(() => {
    if (!user?.id) return
    if (!localStorage.getItem(TOUR_KEY(user.id))) {
      setTourActive(true)
    }
  }, [user?.id])

  const startTour = () => setTourActive(true)

  const finishTour = () => {
    setTourActive(false)
    setSidebarOpen(false)
    if (user?.id) localStorage.setItem(TOUR_KEY(user.id), '1')
  }

  // On mobile the sidebar is off-canvas; open it while a nav step is active
  // so the highlighted menu item is visible.
  const handleTourStep = (step) => {
    if (typeof window === 'undefined') return
    if (window.innerWidth < 768 && step?.tourId?.startsWith('nav-')) {
      setSidebarOpen(true)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-screen flex flex-col">
      <OfflineBanner />

      {/* Top bar */}
      <header className="bg-gradient-to-r from-brand-900 via-brand-800 to-brand-700 text-white px-4 py-3 flex items-center justify-between shadow-lg z-20 border-b border-brand-950/50">
        <div className="flex items-center gap-3">
          <button
            className="md:hidden p-1.5 rounded-lg hover:bg-white/10 transition-colors"
            onClick={() => setSidebarOpen((v) => !v)}
            aria-label="Toggle sidebar"
          >
            ☰
          </button>
          <div className="flex items-center gap-2">
            <span className="text-2xl text-accent-400 drop-shadow-[0_0_8px_rgba(251,191,36,0.4)]">⚡</span>
            <div className="leading-tight">
              <p className="font-extrabold text-base tracking-tight font-display">Lightning DSS</p>
              <p className="text-[10px] uppercase tracking-wider text-brand-200 hidden sm:block">SPP-CBM</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <SyncIndicator />
          {user && (
            <>
              <HeaderClock />
              <button
                onClick={startTour}
                data-tour="help"
                className="w-7 h-7 rounded-full border border-white/25 hover:bg-white/10 transition-colors flex items-center justify-center text-sm font-semibold"
                title="Buka panduan penggunaan"
                aria-label="Buka panduan penggunaan"
              >
                ?
              </button>
              <NotificationBell />
              {/* Avatar + name + org */}
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-full bg-brand-600 ring-2 ring-white/10 flex items-center justify-center text-xs font-bold">
                  {getInitials(user)}
                </div>
                <div className="hidden sm:block leading-tight text-right">
                  <p className="text-sm font-medium">{user.nama_lengkap || user.username}</p>
                  <p className="text-[10px] text-brand-200">
                    {user.role}
                    {user.organization_nama && <> · {user.organization_nama}</>}
                  </p>
                </div>
              </div>
              <button
                onClick={handleLogout}
                className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                title="Keluar"
                aria-label="Keluar"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
              </button>
            </>
          )}
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside
          className={`${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          } md:translate-x-0 fixed md:static inset-y-0 left-0 z-10 w-60 bg-white border-r border-gray-100 flex flex-col transition-transform duration-200 pt-5`}
        >
          <p className="px-4 text-[10px] uppercase tracking-wider text-gray-400 font-semibold mb-2">Navigasi</p>
          <nav className="flex flex-col gap-0.5 px-3">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                data-tour={item.tourId}
                onClick={() => setSidebarOpen(false)}
                className={({ isActive }) =>
                  `relative flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-brand-50 text-brand-800 shadow-sm'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <span className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full bg-brand-600" />
                    )}
                    <span className="text-base ml-1">{item.icon}</span>
                    <span>{item.label}</span>
                  </>
                )}
              </NavLink>
            ))}
          </nav>

          <div className="mt-auto p-4 text-[10px] text-gray-400 border-t border-gray-100">
            <p>SPP-CBM Lightning DSS</p>
            <p className="mt-1">Mamdani fuzzy · IEC 62305</p>
          </div>
        </aside>

        {/* Backdrop for mobile */}
        {sidebarOpen && (
          <div
            className="fixed inset-0 bg-black/30 z-0 md:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Main content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6 bg-gray-50">
          <div className="max-w-7xl mx-auto animate-fade-in">
            <Outlet />
          </div>
        </main>
      </div>

      <OnboardingTour
        steps={tourSteps}
        active={tourActive}
        onFinish={finishTour}
        onStepChange={handleTourStep}
      />
    </div>
  )
}
