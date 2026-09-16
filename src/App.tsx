import { useEffect, useState } from "react"
import AdminDashboardPage from "./admin/pages/AdminDashboardPage"
import LoginPage from "./admin/pages/LoginPage"
import ProcurementDashboardPage from "./procurementusers/pages/ProcurementDashboardPage"
import UserDashboardPage from "./users/pages/UserDashboardPage"
import ToastHost from "./components/ToastHost"
import { useScheduleGuard } from "./hooks/useScheduleGuard"

type User = {
  username: string
  role: string
  token: string
  fullName?: string
  office?: string
}

function App() {
  const [user, setUser] = useState<User | null>(() => {
    try {
      const token = localStorage.getItem("token") || sessionStorage.getItem("token")
      const rawUser = localStorage.getItem("user") || sessionStorage.getItem("user")
      if (!token || !rawUser) return null

      const parsed = JSON.parse(rawUser) as { username?: string; role?: string; fullName?: string; office?: string } | null
      if (!parsed?.username || !parsed?.role) return null

      return {
        username: parsed.username,
        role: parsed.role,
        token,
        fullName: parsed.fullName,
        office: parsed.office,
      }
    } catch {
      return null
    }
  })

  function onLogout() {
    // Clear stored data
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    sessionStorage.removeItem('token')
    sessionStorage.removeItem('user')
    setUser(null)
  }

  // Auto-logout when outside working hours (does nothing for admins)
  useScheduleGuard(user?.role, onLogout)

  // Auto-logout on 401/403 from any apiFetch call (expired / invalid token)
  useEffect(() => {
    window.addEventListener('auth:logout', onLogout)
    return () => window.removeEventListener('auth:logout', onLogout)
  }, [onLogout])

  // If user is logged in
  if (user) {
    // Route based on role
    if (user.role === 'superadmin' || user.role === 'admin') {
      return (
        <>
          <ToastHost />
          <AdminDashboardPage onLogout={onLogout} />
        </>
      )
    }
    if (user.role === 'procurement') {
      return (
        <>
          <ToastHost />
          <ProcurementDashboardPage onLogout={onLogout} user={user} />
        </>
      )
    }
    // Regular users (staff, viewer, etc.)
    return (
      <>
        <ToastHost />
        <UserDashboardPage onLogout={onLogout} user={user} />
      </>
    )
  }

  return (
    <>
      <ToastHost />
      <LoginPage
        onLoginSuccess={({ username, role, token, fullName, office }) => {
          console.log('Logged in as:', username, 'Role:', role)
          const userData = { username, role, token, fullName, office }
          setUser(userData)
        }}
      />
    </>
  )
}

export default App
