import { useState } from 'react'
import { Navigate, useNavigate, useLocation } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'

export default function Login() {
  const { user, login, isLoading } = useAuth()
  const navigate = useNavigate()
  const location = useLocation()
  const redirectTo = location.state?.from || '/dashboard'

  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!isLoading && user) {
    return <Navigate to={redirectTo} replace />
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setIsSubmitting(true)
    try {
      await login(username, password)
      navigate(redirectTo, { replace: true })
    } catch (err) {
      const detail = err?.response?.data?.detail
      setError(detail || 'Login gagal — periksa username/password')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden bg-gradient-to-br from-brand-900 via-brand-800 to-brand-950">
      {/* Decorative blurred lightning accent */}
      <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-accent-500/30 blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -left-40 w-[28rem] h-[28rem] rounded-full bg-brand-500/30 blur-3xl pointer-events-none" />

      {/* Subtle grid pattern */}
      <div
        className="absolute inset-0 opacity-[0.05] pointer-events-none"
        style={{
          backgroundImage:
            'linear-gradient(rgba(255,255,255,0.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.6) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      <div className="relative w-full max-w-md animate-fade-in-up">
        {/* Logo + tagline */}
        <div className="text-center mb-6 text-white">
          <div className="text-6xl mb-2 drop-shadow-[0_0_20px_rgba(251,191,36,0.5)]">⚡</div>
          <h1 className="text-3xl font-extrabold tracking-tight font-display">Lightning DSS</h1>
          <p className="text-sm text-brand-200 mt-1">Decision Support untuk Sistem Proteksi Petir</p>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-2xl p-8 animate-scale-in">
          <h2 className="text-base font-semibold text-gray-900 mb-1">Masuk ke akun Anda</h2>
          <p className="text-xs text-gray-500 mb-5">Gunakan kredensial yang diberikan administrator.</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Username</label>
              <input
                type="text"
                className="form-input"
                autoComplete="username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                autoFocus
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Password</label>
              <input
                type="password"
                className="form-input"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl px-3 py-2">
                {error}
              </div>
            )}

            <button
              type="submit"
              className="btn-primary w-full py-3 text-base shadow-brand-glow"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Memproses...' : 'Masuk'}
            </button>
          </form>

          <div className="mt-6 text-xs text-gray-400 border-t border-gray-100 pt-4">
            <p className="font-semibold text-gray-500 mb-2">Akun demo</p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-1">Pertamina Group</p>
                <p>Manajer — <code className="text-gray-600">manager / manager123</code></p>
                <p>Teknisi — <code className="text-gray-600">teknisi / teknisi123</code></p>
              </div>
              <div>
                <p className="text-[11px] uppercase tracking-wider text-gray-400 font-medium mb-1">PLN &amp; Institusi</p>
                <p>Manajer — <code className="text-gray-600">manager2 / manager456</code></p>
                <p>Teknisi — <code className="text-gray-600">teknisi2 / teknisi456</code></p>
              </div>
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-brand-200 mt-4">
          Sistem Pendukung Keputusan Berbasis Fuzzy untuk SPP-CBM
        </p>
      </div>
    </div>
  )
}
