import React, { useEffect, useState } from 'react'
import axios from 'axios'
import {
  AlertTriangle,
  Clock,
  DollarSign,
  ShieldAlert,
  Users,
  Activity,
  RefreshCw,
  Wrench
} from 'lucide-react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000'
const API_PREFIX = `${API_URL}/api/v1`

export default function ReliabilityAnalytics() {
  const [horizonDays, setHorizonDays] = useState(90)
  const [data, setData] = useState<any | null>(null)
  const [selected, setSelected] = useState<any | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const loadPredictions = async () => {
    setIsLoading(true)
    setError(null)
    try {
      const response = await axios.get(`${API_PREFIX}/reliability/predictions`, {
        params: { horizon_days: horizonDays, limit: 30 }
      })
      setData(response.data)
      setSelected(response.data.predictions?.[0] || null)
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Failed to load reliability predictions.')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadPredictions()
  }, [])

  const formatNaira = (num: number) => {
    return new Intl.NumberFormat('en-NG', { style: 'currency', currency: 'NGN', maximumFractionDigits: 0 }).format(num || 0)
  }

  const bandClass = (band: string) => {
    if (band === 'Critical') return 'bg-red-500/10 text-red-400 border-red-500/20'
    if (band === 'High') return 'bg-orange-500/10 text-orange-400 border-orange-500/20'
    if (band === 'Watch') return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20'
    return 'bg-green-500/10 text-green-400 border-green-500/20'
  }

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 p-8 text-zinc-300">
      <div className="flex flex-col md:flex-row justify-between items-start gap-4 mb-8 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Downtime & Outage Intelligence</h2>
          <p className="text-zinc-500 text-sm">Predict likely outages, expected downtime, customer exposure, and maintenance actions.</p>
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
            onClick={loadPredictions}
            disabled={isLoading}
            className="bg-green-500 hover:bg-green-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-950 font-bold text-xs py-2 px-4 rounded-lg flex items-center gap-2 cursor-pointer"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            Run Model
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-950/20 border border-red-900/40 rounded-xl text-red-400 text-xs font-semibold">
          {error}
        </div>
      )}

      {isLoading && !data ? (
        <div className="h-64 flex justify-center items-center">
          <div className="w-8 h-8 border-4 border-green-500/20 border-t-green-500 rounded-full animate-spin"></div>
        </div>
      ) : data ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-5 gap-5 mb-8">
            <Metric icon={ShieldAlert} label="Critical Assets" value={data.summary.critical_assets} tone="text-red-400" />
            <Metric icon={AlertTriangle} label="High Risk Assets" value={data.summary.high_assets} tone="text-orange-400" />
            <Metric icon={Clock} label="Expected Downtime" value={`${data.summary.expected_downtime_hours}h`} tone="text-blue-400" />
            <Metric icon={DollarSign} label="Revenue at Risk" value={formatNaira(data.summary.revenue_at_risk_ngn)} tone="text-green-400" />
            <Metric icon={Users} label="Customers at Risk" value={data.summary.customers_at_risk} tone="text-purple-400" />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6">
            <div className="xl:col-span-8 bg-zinc-950 border border-zinc-800 rounded-xl overflow-hidden">
              <div className="px-6 py-4 border-b border-zinc-900 flex justify-between items-center">
                <div>
                  <h3 className="text-sm font-bold text-white">Predicted Outage Priority List</h3>
                  <p className="text-[10px] text-zinc-500 mt-0.5 font-mono">{data.model_name} · {data.model_version}</p>
                </div>
                <span className="text-[10px] text-zinc-500 font-mono">{data.asset_count} assets evaluated</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-900 text-zinc-500 uppercase tracking-wider">
                      <th className="py-3 px-5">Asset</th>
                      <th className="py-3 px-5 text-center">Band</th>
                      <th className="py-3 px-5 text-right">Outage Prob.</th>
                      <th className="py-3 px-5 text-right">Downtime</th>
                      <th className="py-3 px-5 text-right">Customers</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.predictions.map((item: any) => (
                      <tr
                        key={`${item.asset_type}-${item.asset_id}`}
                        onClick={() => setSelected(item)}
                        className={`border-b border-zinc-900 hover:bg-zinc-900/30 cursor-pointer ${selected?.asset_id === item.asset_id && selected?.asset_type === item.asset_type ? 'bg-zinc-900/60' : ''}`}
                      >
                        <td className="py-4 px-5">
                          <div className="font-mono font-bold text-white">{item.code}</div>
                          <div className="text-zinc-500 mt-0.5">{item.name}</div>
                          <div className="text-[10px] text-zinc-600 uppercase mt-1">{item.asset_type}</div>
                        </td>
                        <td className="py-4 px-5 text-center">
                          <span className={`px-2 py-1 rounded-full border text-[10px] font-bold uppercase ${bandClass(item.risk_band)}`}>{item.risk_band}</span>
                        </td>
                        <td className="py-4 px-5 text-right font-mono font-bold text-white">{item.outage_probability_pct}%</td>
                        <td className="py-4 px-5 text-right font-mono text-blue-400">{item.expected_downtime_hours}h</td>
                        <td className="py-4 px-5 text-right font-mono text-zinc-400">{item.customers_at_risk}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="xl:col-span-4 bg-zinc-950 border border-zinc-800 rounded-xl p-6 h-fit">
              {selected ? (
                <div className="space-y-5">
                  <div>
                    <div className="flex justify-between items-start gap-4">
                      <div>
                        <h3 className="text-sm font-bold text-white">{selected.code}</h3>
                        <p className="text-xs text-zinc-500 mt-1">{selected.name}</p>
                      </div>
                      <span className={`px-2 py-1 rounded-full border text-[10px] font-bold uppercase ${bandClass(selected.risk_band)}`}>{selected.risk_band}</span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3 text-xs">
                    <Detail label="Energy Unserved" value={`${selected.expected_energy_unserved_kwh} kWh`} />
                    <Detail label="Revenue Risk" value={formatNaira(selected.revenue_at_risk_ngn)} />
                    <Detail label="Loading" value={`${selected.loading_pct}%`} />
                    <Detail label="Past Outages" value={selected.historical_outage_count} />
                  </div>

                  <div className="border-t border-zinc-900 pt-4">
                    <h4 className="text-xs font-bold text-white mb-2 flex items-center gap-2">
                      <Activity className="w-4 h-4 text-orange-400" />
                      Likely Cause
                    </h4>
                    <p className="text-xs text-zinc-400">{selected.dominant_cause}</p>
                  </div>

                  <div className="border-t border-zinc-900 pt-4">
                    <h4 className="text-xs font-bold text-white mb-3">Model Drivers</h4>
                    <div className="space-y-2 text-[11px] font-mono">
                      {Object.entries(selected.drivers).map(([key, value]) => (
                        <div key={key} className="flex justify-between border-b border-zinc-900 pb-1.5">
                          <span className="text-zinc-500">{key.replaceAll('_', ' ')}</span>
                          <span className="text-zinc-300 font-bold">{String(value)}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="border-t border-zinc-900 pt-4">
                    <h4 className="text-xs font-bold text-white mb-3 flex items-center gap-2">
                      <Wrench className="w-4 h-4 text-green-400" />
                      Recommended Actions
                    </h4>
                    <div className="space-y-2">
                      {selected.recommended_actions.map((action: string, index: number) => (
                        <div key={index} className="p-3 bg-zinc-900 border border-zinc-850 rounded-lg text-xs text-zinc-300">
                          {action}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-xs text-zinc-500">Select an asset prediction.</div>
              )}
            </div>
          </div>
        </>
      ) : (
        <div className="h-64 flex justify-center items-center text-zinc-500 text-xs">No reliability model output yet.</div>
      )}
    </div>
  )
}

function Metric({ icon: Icon, label, value, tone }: { icon: any; label: string; value: any; tone: string }) {
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
    <div className="bg-zinc-900 border border-zinc-850 rounded-lg p-3">
      <span className="text-[10px] text-zinc-500 uppercase font-bold block">{label}</span>
      <span className="text-white font-mono font-bold mt-1 block">{value}</span>
    </div>
  )
}
