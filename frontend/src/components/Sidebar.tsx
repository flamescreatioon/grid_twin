import React from 'react'
import { useStore } from '../store'
import { 
  LayoutDashboard, 
  Map, 
  Database, 
  Activity, 
  TrendingUp, 
  FileText, 
  Settings, 
  LogOut, 
  Zap,
  ShieldAlert,
  Bell
} from 'lucide-react'

export default function Sidebar() {
  const { user, activeView, setActiveView, logout } = useStore()

  const navItems = [
    { id: 'dashboard', name: 'Dashboard', icon: LayoutDashboard, roles: ['*'] },
    { id: 'map', name: 'GIS Network Map', icon: Map, roles: ['*'] },
    { id: 'assets', name: 'Asset Registry', icon: Database, roles: ['*'] },
    { id: 'simulation', name: 'Simulation Studio', icon: Activity, roles: ['SYSTEM_ADMIN', 'PLANNING_ENGINEER', 'OPERATIONS_ENGINEER'] },
    { id: 'reliability', name: 'Downtime Intelligence', icon: ShieldAlert, roles: ['SYSTEM_ADMIN', 'PLANNING_ENGINEER', 'OPERATIONS_ENGINEER', 'MANAGER'] },
    { id: 'alerts', name: 'Alerts & Advice', icon: Bell, roles: ['SYSTEM_ADMIN', 'PLANNING_ENGINEER', 'OPERATIONS_ENGINEER', 'MANAGER'] },
    { id: 'investment', name: 'Investment Planner', icon: TrendingUp, roles: ['SYSTEM_ADMIN', 'PLANNING_ENGINEER', 'MANAGER'] },
    { id: 'reports', name: 'Reports & Exports', icon: FileText, roles: ['*'] },
    { id: 'admin', name: 'System Settings', icon: Settings, roles: ['SYSTEM_ADMIN'] },
  ]

  const userRole = user?.role || 'VIEWER'
  const allowedItems = navItems.filter(item => 
    item.roles.includes('*') || item.roles.includes(userRole)
  )

  const formatRole = (role: string) => {
    return role.replace('_', ' ')
  }

  return (
    <aside className="w-64 h-screen bg-zinc-950 border-r border-zinc-800 text-zinc-300 flex flex-col justify-between shrink-0">
      {/* Brand Header */}
      <div className="p-6 border-b border-zinc-900 flex items-center gap-3">
        <div className="w-10 h-10 rounded-lg bg-green-500/10 border border-green-500/20 flex items-center justify-center text-green-500 shadow-[0_0_15px_rgba(34,197,94,0.15)]">
          <Zap className="w-6 h-6 animate-pulse" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-white tracking-tight leading-none">GridTwin</h1>
          <span className="text-[10px] text-zinc-500 font-medium uppercase tracking-wider">Nigeria • AEDC</span>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-4 py-6 space-y-1.5 overflow-y-auto">
        {allowedItems.map((item) => {
          const Icon = item.icon
          const isActive = activeView === item.id
          return (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-sm font-medium transition-all duration-200 cursor-pointer ${
                isActive 
                  ? 'bg-green-500/10 text-green-400 border border-green-500/20 shadow-[0_0_12px_rgba(34,197,94,0.06)]' 
                  : 'hover:bg-zinc-900/60 text-zinc-400 hover:text-zinc-200 border border-transparent'
              }`}
            >
              <Icon className={`w-4 h-4 ${isActive ? 'text-green-400' : 'text-zinc-400'}`} />
              {item.name}
            </button>
          )
        })}
      </nav>

      {/* User Information and Log Out */}
      <div className="p-4 border-t border-zinc-900 bg-zinc-950">
        <div className="flex items-center gap-3 px-3 py-3 rounded-lg bg-zinc-900/40 border border-zinc-800/40 mb-3">
          <div className="w-8 h-8 rounded-full bg-zinc-800 flex items-center justify-center text-sm font-bold text-green-400 border border-zinc-700">
            {user?.full_name ? user.full_name.charAt(0) : 'U'}
          </div>
          <div className="overflow-hidden">
            <p className="text-sm font-semibold text-white truncate leading-tight">{user?.full_name || 'User Profile'}</p>
            <p className="text-[10px] text-zinc-500 font-medium truncate uppercase tracking-wider">{formatRole(userRole)}</p>
          </div>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-medium text-red-400 hover:bg-red-500/5 hover:text-red-300 border border-transparent hover:border-red-500/10 transition-all duration-200 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          Log Out
        </button>
      </div>
    </aside>
  )
}
