import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import AssetPortfolio from './pages/AssetPortfolio'
import AssetDetail from './pages/AssetDetail'
import AssetTrash from './pages/AssetTrash'
import EventInput from './pages/EventInput'
import LogbookForm from './pages/LogbookForm'
import InspectionReport from './pages/InspectionReport'
import LaporanDetail from './pages/LaporanDetail'
import LaporanTrash from './pages/LaporanTrash'
import UserManagement from './pages/UserManagement'
import ManagerOnly from './components/ManagerOnly'
import { AuthProvider } from './auth/AuthContext'
import syncManager from './offline/syncManager'

export default function App() {
  useEffect(() => {
    syncManager.start({
      onSyncComplete: (count) => {
        if (count > 0) {
          console.log(`${count} data berhasil disinkronkan`)
        }
      },
      onResultUpdated: (info) => {
        console.log(`Hasil analisis diperbarui: ${info.serverLabel}`)
      },
    })
    return () => syncManager.stop()
  }, [])

  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route
            path="/"
            element={
              <ProtectedRoute>
                <Layout />
              </ProtectedRoute>
            }
          >
            <Route index element={<Dashboard />} />
            <Route path="assets" element={<AssetPortfolio />} />
            <Route path="assets/trash" element={<ManagerOnly><AssetTrash /></ManagerOnly>} />
            <Route path="assets/:id" element={<AssetDetail />} />
            <Route path="events/new" element={<EventInput />} />
            <Route path="inspections" element={<InspectionReport />} />
            <Route path="inspections/new" element={<LogbookForm />} />
            <Route path="inspections/trash" element={<ManagerOnly><LaporanTrash /></ManagerOnly>} />
            <Route path="inspections/:id" element={<LaporanDetail />} />
            <Route
              path="users"
              element={
                <ManagerOnly>
                  <UserManagement />
                </ManagerOnly>
              }
            />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Route>
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  )
}
