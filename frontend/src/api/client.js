import axios from 'axios'

const API_BASE = import.meta.env.VITE_API_URL || 'http://localhost:8000/api'
const ACCESS_KEY = 'lightning_access'
const REFRESH_KEY = 'lightning_refresh'

const client = axios.create({
  baseURL: API_BASE,
  timeout: 10000,
  headers: { 'Content-Type': 'application/json' },
})

// Request: attach Authorization header from localStorage on every call.
client.interceptors.request.use((config) => {
  const token = localStorage.getItem(ACCESS_KEY)
  if (token && !config.headers?.Authorization) {
    config.headers = config.headers || {}
    config.headers.Authorization = `Bearer ${token}`
  }
  // For file uploads (inspection photos), drop the instance-default JSON content type
  // so axios sets multipart/form-data with the correct boundary. Without this the
  // backend can't parse the upload and photos silently fail.
  if (typeof FormData !== 'undefined' && config.data instanceof FormData && config.headers) {
    delete config.headers['Content-Type']
  }
  return config
})

// Response: on 401, try a single refresh + retry. If refresh fails, clear tokens and redirect.
let refreshInFlight = null

client.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (!error.response) {
      console.warn('Network error — switching to offline mode')
      return Promise.reject(error)
    }

    const original = error.config || {}
    const isAuthCall = original.url?.includes('/auth/login/') || original.url?.includes('/auth/refresh/')
    if (error.response.status !== 401 || original._retried || isAuthCall) {
      return Promise.reject(error)
    }
    original._retried = true

    const refresh = localStorage.getItem(REFRESH_KEY)
    if (!refresh) {
      handleAuthFailure()
      return Promise.reject(error)
    }

    try {
      if (!refreshInFlight) {
        refreshInFlight = axios.post(`${API_BASE}/auth/refresh/`, { refresh })
      }
      const refreshRes = await refreshInFlight
      refreshInFlight = null
      const newAccess = refreshRes.data.access
      localStorage.setItem(ACCESS_KEY, newAccess)
      original.headers = original.headers || {}
      original.headers.Authorization = `Bearer ${newAccess}`
      return client(original)
    } catch (refreshErr) {
      refreshInFlight = null
      handleAuthFailure()
      return Promise.reject(refreshErr)
    }
  }
)

function handleAuthFailure() {
  localStorage.removeItem(ACCESS_KEY)
  localStorage.removeItem(REFRESH_KEY)
  // Avoid infinite redirect loop if already on /login
  if (window.location.pathname !== '/login') {
    window.location.assign('/login')
  }
}

export default client
