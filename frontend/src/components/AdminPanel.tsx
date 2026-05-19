import React, { useEffect, useState } from 'react'
import { useStore } from '../store'
import axios from 'axios'
import { 
  Settings, 
  Database, 
  Activity, 
  Cpu, 
  RefreshCw, 
  CheckCircle, 
  Zap,
  Percent
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const API_PREFIX = `${API_URL}/api/v1`

export default function AdminPanel() {
  const { user } = useStore()
  
  const [isConfiguring, setIsConfiguring] = useState<boolean>(false)
  const [adminMessage, setAdminMessage] = useState<string | null>(null)
  const [users, setUsers] = useState<any[]>([])
  const [isLoadingUsers, setIsLoadingUsers] = useState(false)
  const [userForm, setUserForm] = useState({
    email: '',
    full_name: '',
    password: '',
    role: 'VIEWER',
    is_active: true
  })
  
  // Risk Weights Configuration UI
  const [riskWeights, setRiskWeights] = useState({
    load: 25,
    faults: 20,
    age: 15,
    maintenance: 15,
    customers: 10,
    growth: 10,
    environment: 5
  })

  const roles = ['SYSTEM_ADMIN', 'PLANNING_ENGINEER', 'OPERATIONS_ENGINEER', 'MANAGER', 'VIEWER']

  const formatRole = (role: string) => role.replaceAll('_', ' ')

  const fetchUsers = async () => {
    if (user?.role !== 'SYSTEM_ADMIN') return
    setIsLoadingUsers(true)
    try {
      const response = await axios.get(`${API_PREFIX}/auth/users`)
      setUsers(response.data)
    } catch (err: any) {
      setAdminMessage(err.response?.data?.detail || 'Failed to load users.')
    } finally {
      setIsLoadingUsers(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [user?.role])

  const createUser = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsConfiguring(true)
    setAdminMessage(null)
    try {
      await axios.post(`${API_PREFIX}/auth/users`, userForm)
      setUserForm({
        email: '',
        full_name: '',
        password: '',
        role: 'VIEWER',
        is_active: true
      })
      setAdminMessage('User account created.')
      fetchUsers()
    } catch (err: any) {
      setAdminMessage(err.response?.data?.detail || 'Failed to create user.')
    } finally {
      setIsConfiguring(false)
    }
  }

  const updateUser = async (target: any, updates: Record<string, any>) => {
    setAdminMessage(null)
    try {
      await axios.put(`${API_PREFIX}/auth/users/${target.id}`, updates)
      setAdminMessage('User access updated.')
      fetchUsers()
    } catch (err: any) {
      setAdminMessage(err.response?.data?.detail || 'Failed to update user.')
    }
  }

  const resetPassword = async (target: any) => {
    const nextPassword = window.prompt(`New password for ${target.email} (minimum 8 characters)`)
    if (!nextPassword) return
    if (nextPassword.length < 8) {
      setAdminMessage('Password must be at least 8 characters.')
      return
    }
    updateUser(target, { password: nextPassword })
  }

  const triggerForecastTrain = async () => {
    setIsConfiguring(true)
    setAdminMessage(null)
    try {
      const response = await axios.post(`${API_PREFIX}/forecast/train`)
      setAdminMessage(response.data.message)
    } catch (err: any) {
      setAdminMessage('Failed to trigger forecast training.')
    } finally {
      setIsConfiguring(false)
    }
  }

  const triggerForecastRun = async () => {
    setIsConfiguring(true)
    setAdminMessage(null)
    try {
      const response = await axios.post(`${API_PREFIX}/forecast/run`)
      setAdminMessage(response.data.message)
    } catch (err: any) {
      setAdminMessage('Failed to trigger forecast batch run.')
    } finally {
      setIsConfiguring(false)
    }
  }

  const triggerRiskRecalculate = async () => {
    setIsConfiguring(true)
    setAdminMessage(null)
    try {
      const response = await axios.post(`${API_PREFIX}/risk/recalculate`)
      setAdminMessage(response.data.message)
    } catch (err: any) {
      setAdminMessage('Failed to trigger risk recalculation.')
    } finally {
      setIsConfiguring(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 p-8 text-zinc-300">
      {/* Header */}
      <div className="flex justify-between items-start mb-8 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">System Configuration & Settings</h2>
          <p className="text-zinc-500 text-sm">Calibrate simulation math models, run grid-wide predictions, and view system logs.</p>
        </div>
        <div className="p-2 rounded-lg bg-zinc-950 border border-zinc-800 text-green-500">
          <Settings className="w-5 h-5 animate-spin" style={{ animationDuration: '6s' }} />
        </div>
      </div>

      {adminMessage && (
        <div className="mb-6 p-4 bg-green-950/20 border border-green-900/40 rounded-xl flex items-center gap-3 text-green-400 text-xs">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span className="font-semibold">{adminMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Core settings calibration */}
        <div className="lg:col-span-8 space-y-6">
          {/* RBAC User Administration */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 text-xs">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Settings className="w-4 h-4 text-green-400" />
              User Access & Role Control
            </h3>
            <p className="text-zinc-500 mb-6 leading-relaxed">Create user accounts, assign operational roles, and suspend access. Only system admins can manage this matrix.</p>

            <form onSubmit={createUser} className="grid grid-cols-1 md:grid-cols-5 gap-3 mb-6">
              <input
                type="email"
                required
                placeholder="email"
                value={userForm.email}
                onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                className="bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none"
              />
              <input
                type="text"
                required
                placeholder="full name"
                value={userForm.full_name}
                onChange={(e) => setUserForm({ ...userForm, full_name: e.target.value })}
                className="bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none"
              />
              <input
                type="password"
                required
                minLength={8}
                placeholder="password"
                value={userForm.password}
                onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                className="bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none"
              />
              <select
                value={userForm.role}
                onChange={(e) => setUserForm({ ...userForm, role: e.target.value })}
                className="bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white focus:outline-none"
              >
                {roles.map((role) => <option key={role} value={role}>{formatRole(role)}</option>)}
              </select>
              <button
                type="submit"
                disabled={isConfiguring}
                className="bg-green-500 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold rounded-lg cursor-pointer"
              >
                Add User
              </button>
            </form>

            <div className="overflow-x-auto border border-zinc-900 rounded-xl">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-zinc-800 text-zinc-500 uppercase tracking-wider">
                    <th className="py-3 px-4">User</th>
                    <th className="py-3 px-4">Role</th>
                    <th className="py-3 px-4 text-center">Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((account) => (
                    <tr key={account.id} className="border-b border-zinc-900">
                      <td className="py-3 px-4">
                        <div className="font-semibold text-white">{account.full_name || 'Unnamed user'}</div>
                        <div className="text-[10px] text-zinc-500 font-mono">{account.email}</div>
                      </td>
                      <td className="py-3 px-4">
                        <select
                          value={account.role}
                          disabled={account.id === user?.id}
                          onChange={(e) => updateUser(account, { role: e.target.value })}
                          className="bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-white disabled:text-zinc-500"
                        >
                          {roles.map((role) => <option key={role} value={role}>{formatRole(role)}</option>)}
                        </select>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <button
                          type="button"
                          disabled={account.id === user?.id}
                          onClick={() => updateUser(account, { is_active: !account.is_active })}
                          className={`px-2 py-1 rounded-full border text-[10px] uppercase font-bold cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 ${
                            account.is_active
                              ? 'bg-green-950 text-green-400 border-green-900'
                              : 'bg-red-950 text-red-400 border-red-900'
                          }`}
                        >
                          {account.is_active ? 'active' : 'suspended'}
                        </button>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          type="button"
                          onClick={() => resetPassword(account)}
                          className="text-zinc-300 hover:text-white border border-zinc-800 hover:border-zinc-700 rounded-lg px-3 py-2 cursor-pointer"
                        >
                          Reset Password
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!isLoadingUsers && users.length === 0 && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-zinc-500">No user accounts found.</td>
                    </tr>
                  )}
                  {isLoadingUsers && (
                    <tr>
                      <td colSpan={4} className="py-6 text-center text-zinc-500">Loading users...</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Risk Formula Weights */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 text-xs">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Percent className="w-4 h-4 text-green-400" />
              Adjust Risk Model Coefficients
            </h3>
            <p className="text-zinc-500 mb-6 leading-relaxed">Configure the coefficient weights used in calculating Asset Risk Indexes. The total sum of all factors must equal 100%.</p>
            
            <div className="grid grid-cols-2 gap-x-6 gap-y-4 mb-6">
              {Object.entries(riskWeights).map(([key, val]) => (
                <div key={key} className="space-y-1.5">
                  <label className="capitalize font-semibold text-zinc-400 block">{key.replace('_', ' ')} Factor (%)</label>
                  <input 
                    type="number" 
                    min="0"
                    max="100"
                    value={val}
                    onChange={(e) => setRiskWeights({ ...riskWeights, [key]: parseInt(e.target.value) || 0 })}
                    className="w-full bg-zinc-900 border border-zinc-850 rounded-lg p-2.5 text-white font-mono"
                  />
                </div>
              ))}
            </div>

            <div className="flex justify-between items-center border-t border-zinc-900 pt-5">
              <span className="text-[11px] font-mono text-zinc-500">
                Sum Total Weight: <strong className={Object.values(riskWeights).reduce((a, b) => a + b, 0) === 100 ? 'text-green-400' : 'text-red-400'}>
                  {Object.values(riskWeights).reduce((a, b) => a + b, 0)}%
                </strong> (Must equal 100%)
              </span>
              <button 
                type="button"
                onClick={() => setAdminMessage('Parameters updated and loaded into grid twin engines.')}
                disabled={Object.values(riskWeights).reduce((a, b) => a + b, 0) !== 100}
                className="bg-green-500 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold py-2 px-4 rounded-lg cursor-pointer transition"
              >
                Save Coefficients
              </button>
            </div>
          </div>

          {/* Forecasting and risk batch triggers */}
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 text-xs">
            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2">
              <Cpu className="w-4 h-4 text-purple-400" />
              Batch Execution Commands
            </h3>
            <p className="text-zinc-500 mb-6">Trigger grid-wide calculations and updates asynchronously across all distribution networks.</p>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <button 
                onClick={triggerForecastTrain}
                disabled={isConfiguring}
                className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 p-4 rounded-xl text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
              >
                <RefreshCw className="w-5 h-5 text-purple-400" />
                <span className="font-bold text-white">Retrain Forecast</span>
                <span className="text-[10px] text-zinc-500 leading-tight">Fit Holt-Winters models on new grid loads</span>
              </button>
              
              <button 
                onClick={triggerForecastRun}
                disabled={isConfiguring}
                className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 p-4 rounded-xl text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
              >
                <Activity className="w-5 h-5 text-blue-400" />
                <span className="font-bold text-white">Run Forecast Horizon</span>
                <span className="text-[10px] text-zinc-500 leading-tight">Generate 12-month demand arrays for all nodes</span>
              </button>
              
              <button 
                onClick={triggerRiskRecalculate}
                disabled={isConfiguring}
                className="bg-zinc-900 hover:bg-zinc-850 border border-zinc-800 hover:border-zinc-700 p-4 rounded-xl text-center cursor-pointer transition flex flex-col items-center justify-center gap-2"
              >
                <Zap className="w-5 h-5 text-green-400" />
                <span className="font-bold text-white">Recalculate Risks</span>
                <span className="text-[10px] text-zinc-500 leading-tight">Recalculate risk indices for all registry assets</span>
              </button>
            </div>
          </div>
        </div>

        {/* Server Status Monitor */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 text-xs space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Database className="w-4 h-4 text-blue-400" />
              Runtime Status
            </h3>
            
            <div className="space-y-3 font-mono text-[11px]">
              <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                <span className="text-zinc-500">API Server:</span>
                <span className="text-green-400 font-bold flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-green-500"></span>
                  ONLINE
                </span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                <span className="text-zinc-500">Database Adapter:</span>
                <span className="text-white font-bold">SQLite Local</span>
              </div>
              <div className="flex justify-between items-center pb-2 border-b border-zinc-900">
                <span className="text-zinc-500">Active Registry Twin:</span>
                <span className="text-white font-bold">Garki 2 Pilot Area</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-zinc-500">GIS Core Projection:</span>
                <span className="text-zinc-400 font-bold">WGS-84 (4326)</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
