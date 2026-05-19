import React, { useEffect } from 'react'
import { useStore } from './store'
import Sidebar from './components/Sidebar'
import LoginPage from './components/LoginPage'
import Dashboard from './components/Dashboard'
import GisMap from './components/GisMap'
import AssetRegistry from './components/AssetRegistry'
import SimulationStudio from './components/SimulationStudio'
import InvestmentPlanner from './components/InvestmentPlanner'
import ReportsPage from './components/ReportsPage'
import AdminPanel from './components/AdminPanel'
import ReliabilityAnalytics from './components/ReliabilityAnalytics'
import AlertsCenter from './components/AlertsCenter'

export default function App() {
  const { isAuthenticated, fetchMe, activeView, token } = useStore()

  useEffect(() => {
    if (token) {
      fetchMe()
    }
  }, [token])

  if (token && !isAuthenticated) {
    return (
      <div className="w-screen h-screen bg-zinc-950 flex flex-col justify-center items-center gap-3">
        <div className="w-8 h-8 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
        <span className="text-zinc-500 text-xs font-semibold tracking-wider">Syncing digital twin...</span>
      </div>
    )
  }

  if (!isAuthenticated) {
    return <LoginPage />
  }

  const renderView = () => {
    switch (activeView) {
      case 'dashboard':
        return <Dashboard />
      case 'map':
        return <GisMap />
      case 'assets':
        return <AssetRegistry />
      case 'simulation':
        return <SimulationStudio />
      case 'investment':
        return <InvestmentPlanner />
      case 'reliability':
        return <ReliabilityAnalytics />
      case 'alerts':
        return <AlertsCenter />
      case 'reports':
        return <ReportsPage />
      case 'admin':
        return <AdminPanel />
      default:
        return <Dashboard />
    }
  }

  return (
    <div className="w-screen h-screen flex bg-zinc-900 overflow-hidden font-sans antialiased text-zinc-300">
      <Sidebar />
      <main className="flex-1 min-w-0 h-full flex flex-col overflow-hidden relative">
        {renderView()}
      </main>
    </div>
  )
}
