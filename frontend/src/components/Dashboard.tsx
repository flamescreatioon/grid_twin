import React from 'react'
import { useStore } from '../store'
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer, 
  PieChart, 
  Pie, 
  Cell, 
  Legend 
} from 'recharts'
import { 
  Zap, 
  AlertTriangle, 
  ShieldAlert, 
  TrendingUp, 
  Database,
  FileCheck2
} from 'lucide-react'

export default function Dashboard() {
  const { substations, feeders, transformers, highRiskAssets } = useStore()

  // Calculate statistics
  const totalSubs = substations.length
  const totalFeeders = feeders.length
  const totalTxs = transformers.length
  
  const overloadedTxs = transformers.filter(t => t.loading_percentage > 100.0)
  const highRiskTxs = transformers.filter(t => t.risk_score >= 70.0)
  const criticalFeeders = feeders.filter(f => f.risk_score >= 70.0)
  
  // Calculate loading status distributions for Pie Chart
  const loadDistribution = [
    { name: 'Healthy (0-70%)', value: 0, color: '#22c55e' },
    { name: 'Watch (71-90%)', value: 0, color: '#eab308' },
    { name: 'Near Limit (91-100%)', value: 0, color: '#f97316' },
    { name: 'Overloaded (101-120%)', value: 0, color: '#ef4444' },
    { name: 'Critical (>120%)', value: 0, color: '#991b1b' }
  ]

  transformers.forEach(t => {
    const pct = t.loading_percentage
    if (pct <= 70.0) loadDistribution[0].value++
    else if (pct <= 90.0) loadDistribution[1].value++
    else if (pct <= 100.0) loadDistribution[2].value++
    else if (pct <= 120.0) loadDistribution[3].value++
    else loadDistribution[4].value++
  })

  // Feeder loading comparison chart data
  const feederChartData = feeders.map(f => {
    // Count transformers under this feeder
    const feederTxs = transformers.filter(t => t.feeder_id === f.id)
    const feederOverloadedCount = feederTxs.filter(t => t.loading_percentage > 100.0).length
    return {
      name: f.name.replace('F5 - ', '').replace('F4 - ', '').replace('F3 - ', '').replace('F2 - ', '').replace('F1 - ', ''),
      'Capacity (MW)': f.rated_capacity_mw,
      'Peak Load (MW)': f.peak_load_mw,
      'Overloaded TXs': feederOverloadedCount,
      'Risk Score': f.risk_score
    }
  })

  const stats = [
    { name: 'Substations', value: totalSubs, icon: Database, color: 'text-blue-500', bg: 'bg-blue-500/10' },
    { name: 'Active Feeders', value: totalFeeders, icon: Zap, color: 'text-green-500', bg: 'bg-green-500/10' },
    { name: 'Distribution Transformers', value: totalTxs, icon: Database, color: 'text-purple-500', bg: 'bg-purple-500/10' },
    { name: 'Overloaded Assets', value: overloadedTxs.length, icon: AlertTriangle, color: 'text-orange-500', bg: 'bg-orange-500/10' },
    { name: 'High Risk (Score ≥ 70)', value: highRiskTxs.length + criticalFeeders.length, icon: ShieldAlert, color: 'text-red-500', bg: 'bg-red-500/10' },
    { name: 'Data Quality Score', value: '88.5%', icon: FileCheck2, color: 'text-emerald-500', bg: 'bg-emerald-500/10' }
  ]

  return (
    <div className="flex-1 overflow-y-auto bg-zinc-900 p-8 text-zinc-300">
      {/* Page Header */}
      <div className="flex justify-between items-center mb-8 border-b border-zinc-800 pb-4">
        <div>
          <h2 className="text-2xl font-bold text-white tracking-tight">Executive Overview</h2>
          <p className="text-zinc-500 text-sm">Real-time status and risk metrics for the Abuja Garki 2 (GK2) pilot grid twin.</p>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20 text-green-400 text-xs font-semibold">
          <span className="w-2 h-2 rounded-full bg-green-500 animate-ping"></span>
          GRID SYNC ACTIVE
        </div>
      </div>

      {/* Grid Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-5 mb-8">
        {stats.map((st, i) => {
          const Icon = st.icon
          return (
            <div key={i} className="bg-zinc-950 border border-zinc-800/80 rounded-xl p-5 hover:border-zinc-700 transition duration-200 shadow-sm flex flex-col justify-between">
              <div className="flex justify-between items-start">
                <span className="text-zinc-500 text-xs font-medium uppercase tracking-wider">{st.name}</span>
                <div className={`p-2 rounded-lg ${st.bg} ${st.color}`}>
                  <Icon className="w-4 h-4" />
                </div>
              </div>
              <div className="mt-4">
                <span className="text-2xl font-bold text-white tracking-tight">{st.value}</span>
              </div>
            </div>
          )
        })}
      </div>

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-8">
        {/* Feeder Load vs Capacity (Bar Chart) */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 lg:col-span-8 min-w-0">
          <div className="flex justify-between items-center mb-6">
            <h3 className="text-base font-bold text-white">Feeder Capacity vs Peak Demand (MW)</h3>
            <span className="text-xs text-zinc-500 font-medium">AEDC 11kV Feeder Outlets</span>
          </div>
          <div className="h-80 min-h-80 min-w-0 w-full">
            <ResponsiveContainer width="100%" height={320} minWidth={0}>
              <BarChart data={feederChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#27272a" />
                <XAxis dataKey="name" stroke="#71717a" fontSize={11} />
                <YAxis stroke="#71717a" fontSize={11} />
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px' }}
                  labelStyle={{ color: '#fff', fontWeight: 'bold' }}
                />
                <Legend verticalAlign="top" height={36} wrapperStyle={{ fontSize: '12px' }} />
                <Bar dataKey="Capacity (MW)" fill="#27272a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Peak Load (MW)" fill="#22c55e" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Transformer loading status distribution (Pie Chart) */}
        <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6 lg:col-span-4 min-w-0">
          <h3 className="text-base font-bold text-white mb-6">Asset Loading Classifications</h3>
          <div className="h-64 min-h-64 min-w-0 w-full flex justify-center items-center">
            <ResponsiveContainer width="100%" height={256} minWidth={0}>
              <PieChart>
                <Pie
                  data={loadDistribution.filter(d => d.value > 0)}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {loadDistribution.filter(d => d.value > 0).map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip 
                  contentStyle={{ backgroundColor: '#09090b', borderColor: '#27272a', borderRadius: '8px', color: '#fff' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="space-y-1.5 mt-2">
            {loadDistribution.map((d, i) => (
              <div key={i} className="flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: d.color }}></span>
                  <span className="text-zinc-400 font-medium">{d.name}</span>
                </div>
                <span className="text-white font-bold">{d.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* High-Risk Table Overview */}
      <div className="bg-zinc-950 border border-zinc-800 rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <div>
            <h3 className="text-base font-bold text-white">Critical High-Risk Grid Nodes</h3>
            <p className="text-xs text-zinc-500 mt-1">Registry assets flagged for maintenance gap, overloading, or high frequency of faults.</p>
          </div>
          <span className="px-3 py-1 bg-red-500/10 border border-red-500/20 rounded-lg text-xs font-semibold text-red-400">
            Immediate Intervention Needed
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-500 font-medium">
                <th className="py-3 px-4">Asset Code</th>
                <th className="py-3 px-4">Asset Name</th>
                <th className="py-3 px-4">Rating</th>
                <th className="py-3 px-4 text-center">Peak Load</th>
                <th className="py-3 px-4 text-center">Loading %</th>
                <th className="py-3 px-4 text-right">Risk Score</th>
                <th className="py-3 px-4 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {transformers.filter(t => t.risk_score >= 70.0).slice(0, 5).map((t, idx) => (
                <tr key={idx} className="border-b border-zinc-900 hover:bg-zinc-900/20 transition duration-150">
                  <td className="py-3 px-4 font-mono text-xs font-semibold text-white">{t.code}</td>
                  <td className="py-3 px-4 text-zinc-300 font-medium">{t.name}</td>
                  <td className="py-3 px-4 text-zinc-400 font-mono text-xs">{t.rating_kva} kVA</td>
                  <td className="py-3 px-4 text-center text-zinc-400 font-mono text-xs">{t.peak_load_kva} kVA</td>
                  <td className="py-3 px-4 text-center">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold font-mono ${
                      t.loading_percentage > 100 
                        ? 'bg-red-500/10 text-red-400 border border-red-500/20' 
                        : 'bg-orange-500/10 text-orange-400 border border-orange-500/20'
                    }`}>
                      {t.loading_percentage}%
                    </span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="text-red-500 font-bold font-mono">{t.risk_score}</span>
                  </td>
                  <td className="py-3 px-4 text-right">
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-red-950 text-red-400 border border-red-900 uppercase">
                      {t.status}
                    </span>
                  </td>
                </tr>
              ))}
              {transformers.filter(t => t.risk_score >= 70.0).length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-zinc-500">
                    No critical risk assets found. All assets operating within parameters.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
