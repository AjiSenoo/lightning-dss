import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import Layout from './components/Layout'
import Dashboard from './pages/Dashboard'
import AssetPortfolio from './pages/AssetPortfolio'
import AssetDetail from './pages/AssetDetail'
import EventInput from './pages/EventInput'
import LogbookForm from './pages/LogbookForm'
import Recommendation from './pages/Recommendation'
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
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="assets" element={<AssetPortfolio />} />
          <Route path="assets/:id" element={<AssetDetail />} />
          <Route path="events/new" element={<EventInput />} />
          <Route path="inspections/new" element={<LogbookForm />} />
          <Route path="recommendations" element={<Recommendation />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
