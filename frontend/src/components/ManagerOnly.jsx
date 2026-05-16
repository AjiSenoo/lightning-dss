import { Navigate } from 'react-router-dom'
import { useAuth, useIsManager } from '../auth/AuthContext'

export default function ManagerOnly({ children }) {
  const { isLoading } = useAuth()
  const isManager = useIsManager()

  if (isLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center text-gray-400 text-sm">
        Memeriksa hak akses...
      </div>
    )
  }
  if (!isManager) {
    return <Navigate to="/" replace />
  }
  return children
}
