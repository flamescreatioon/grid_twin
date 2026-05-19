import React, { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { AlertTriangle, Bell, CheckCircle2, Clock, DollarSign, RefreshCw, ShieldAlert, Wrench } from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const API_PREFIX = `${API_URL}/api/v1`

type Filter = 'all' | 'critical' | 'warning' | 'advisory'

export default function AlertsCenter() {
  const [data, setData] = useState<any | null>(null)
  const [filter, setFilter] = useState<Filter>('all')
  const [horizonDays, setHorizonDays] = useState(90)
  const [isLoading, setIsLoading] = useState(false)
  const [acknowledged, setAcknowledged] = useState<Record<string, boolean>>({})
  const [error, setError] = useState<string | null>(null)

  const loadAlerts = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await axios.get(`${API_PREFIX}/alerts`, {
        params: { horizon_days: horizonDays, limit: 40 }
      })
      setData(response.data)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load alerts.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadAlerts()
  }, [])

  const alerts = useMemo(() => {
    const items = data?.alerts || []
    return filter === 'all' ? items : items.filter((alert: any) => alert.severity === filter)
  }, [data, filter])

  const formatNaira = (num: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(num || 0)
  }

  const severityClass = (severity: string) => {
    if (severity === 'critical') return 'bg-red-500/10 text-red-400 border-red-500/25'
    if (severity === 'warning') return 'bg-orange-500/10 text-orange-400 border-orange-500/25'
    return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/25'
  }

  const severityIcon = (severity: string) => {
    if (severity === 'critical') return ShieldAlert
    if (severity === 'warning') return AlertTriangle
    return Bell
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 p-8 text-zinc-300">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Alerts, Notifications & Advice</h2>
          <p className="text-zinc-500 text-sm">Operational notices generated from outage probability, downtime exposure, and asset condition drivers.</p>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={horizonDays}
            onChange={(e) => setHorizonDays(Number(e.target.value))}
            className="bg-zinc-950 border border-zinc-800 rounded-lg py-2 px-3 text-xs text-white focus:outline-none"
          >
            <option value={30}>30 days</option>
            <option value={90}>90 days</option>
            <option value={180}>180 days</option>
            <option value={365}>365 days</option>
          </select>
          <button
            onClick={loadAlerts}
            disabled={isLoading}
            className="bg-green-500 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold text-xs py-2 px-4 rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-950/20 border border-red-900/40 rounded-xl text-red-400 text-xs font-semibold">
          {error}
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-8">
            <Summary label="Critical" value={data.summary.critical} tone="text-red-400" icon={ShieldAlert} />
            <Summary label="Warnings" value={data.summary.warning} tone="text-orange-400" icon={AlertTriangle} />
            <Summary label="Advisories" value={data.summary.advisory} tone="text-yellow-400" icon={Bell} />
            <Summary label="Customers at Risk" value={data.summary.customers_at_risk} tone="text-blue-400" icon={Clock} />
            <Summary label="Revenue at Risk" value={formatNaira(data.summary.revenue_at_risk_ngn)} tone="text-green-400" icon={DollarSign} />
          </div>

          <div className="flex flex-wrap gap-2 mb-5">
            {(['all', 'critical', 'warning', 'advisory'] as Filter[]).map((item) => (
              <button
                key={item}
                onClick={() => setFilter(item)}
                className={`px-3 py-2 rounded-lg border text-xs font-bold uppercase cursor-pointer ${filter === item ? 'bg-zinc-950 border-green-500/30 text-green-400' : 'bg-zinc-950 border-zinc-800 text-zinc-500 hover:text-zinc-300'}`}
              >
                {item}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
            {alerts.map((alert: any) => {
              const Icon = severityIcon(alert.severity)
              const isAcked = acknowledged[alert.id]
              return (
                <div key={alert.id} className={`bg-zinc-950 border rounded-xl p-5 ${isAcked ? 'border-zinc-800 opacity-60' : 'border-zinc-800/80'}`}>
                  <div className="flex justify-between items-start gap-4 mb-4">
                    <div className="flex gap-3">
                      <div className={`w-10 h-10 rounded-lg border flex items-center justify-center ${severityClass(alert.severity)}`}>
                        <Icon className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <span className={`px-2 py-0.5 rounded-full border text-[10px] uppercase font-bold ${severityClass(alert.severity)}`}>{alert.severity}</span>
                          <span className="text-[10px] text-zinc-500 uppercase font-mono">{alert.asset_type}</span>
                        </div>
                        <h3 className="text-sm font-bold text-white">{alert.title}</h3>
                        <p className="text-xs text-zinc-500 mt-1">{alert.message}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setAcknowledged((current) => ({ ...current, [alert.id]: !current[alert.id] }))}
                      className="text-zinc-500 hover:text-green-400 cursor-pointer"
                      title={isAcked ? 'Reopen' : 'Acknowledge'}
                    >
                      <CheckCircle2 className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-3 gap-3 text-xs mb-4">
                    <Detail label="Asset" value={alert.asset_code} />
                    <Detail label="Downtime" value={`${alert.impact.expected_downtime_hours}h`} />
                    <Detail label="Revenue" value={formatNaira(alert.impact.revenue_at_risk_ngn)} />
                  </div>

                  <div className="border-t border-zinc-900 pt-4 mb-4">
                    <h4 className="text-xs font-bold text-white mb-2">Likely Cause</h4>
                    <p className="text-xs text-zinc-400">{alert.likely_cause}</p>
                  </div>

                  <div className="border-t border-zinc-900 pt-4">
                    <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-green-400" />
                      Advice
                    </h4>
                    <div className="space-y-2">
                      {alert.advice.map((item: string, index: number) => (
                        <div key={index} className="bg-zinc-900 border border-zinc-850 rounded-lg p-3 text-xs text-zinc-300">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>

          {alerts.length === 0 && (
            <div className="h-64 flex flex-col justify-center items-center text-center border border-dashed border-zinc-800 rounded-xl text-zinc-500 text-xs">
              <Bell className="w-8 h-8 mb-3 text-zinc-700" />
              No alerts match this filter.
            </div>
          )}
        </>
      )}

      {isLoading && !data && (
        <div className="h-64 flex justify-center items-center">
          <div className="w-8 h-8 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
        </div>
      )}
    </div>
  )
}

function Summary({ label, value, tone, icon: Icon }: { label: string; value: any; tone: string; icon: any }) {
  return (
    <div className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-5">
      <div className="flex justify-between items-start">
        <span className="text-zinc-500 text-[10px] font-bold uppercase tracking-wider">{label}</span>
        <Icon className={`w-4 h-4 ${tone}`} />
      </div>
      <div className={`mt-4 text-xl font-bold font-mono ${tone}`}>{value}</div>
    </div>
  )
}

function Detail({ label, value }: { label: string; value: any }) {
  return (
    <div className="bg-zinc-900 border border-zinc-850 rounded-lg p-3 min-w-0">
      <span className="text-[10px] text-zinc-500 uppercase font-bold block">{label}</span>
      <span className="text-white font-mono font-bold mt-1 block truncate">{value}</span>
    </div>
  )
}
